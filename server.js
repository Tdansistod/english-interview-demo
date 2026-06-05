"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const OpenAI = require("openai");

const { CATEGORIES } = require("./categories");

const PORT = process.env.PORT || 3001;
// MiniMax is OpenAI-compatible. Defaults below can be overridden via .env.
const BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const MODEL = process.env.MINIMAX_MODEL || "MiniMax-M3";
const FAST_MODEL = process.env.MINIMAX_FAST_MODEL || "MiniMax-M2.5-highspeed";
const API_KEY = process.env.MINIMAX_API_KEY;
const SESSIONS_DIR = path.join(__dirname, "sessions");

// Demo mode = rate limiting is active. Detected per-request: localhost = unrestricted dev mode;
// any other host (Railway, real domain, tunnel) = demo mode.
const isDemo = (req) =>
  req && req.get("host") &&
  !req.get("host").includes("localhost") &&
  !req.get("host").includes("127.0.0.1");

// --- Boot checks -----------------------------------------------------------

if (!API_KEY) {
  console.error(
    "\n[english-practice] MINIMAX_API_KEY is not set.\n" +
      "Copy .env.example to .env and add your key, or export it in your shell:\n" +
      "  export MINIMAX_API_KEY=your_key_here\n",
  );
  process.exit(1);
}

// Create the sessions folder if it doesn't exist.
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- Prompts ---------------------------------------------------------------

// Stable system prompt sent on every feedback request. Focused on a Spanish
// native practicing for US/Canada web-dev job interviews.
const SYSTEM_PROMPT = `You are an expert English tutor helping a Spanish native practice for technical job interviews. Focus on: grammar errors common to Spanish speakers, unnatural phrasing, word choice, clarity. Be specific, not vague. Always provide a corrected version of the sentence.`;

// Response format. The model returns scores 1-5 on four axes plus a list of
// specific corrections and a full improved version of the answer.
const FEEDBACK_FORMAT = `Respond with ONLY a single JSON object (no prose, no markdown fences) in exactly this shape:
{
  "scores": {
    "grammar": <integer 1-5>,
    "vocabulary": <integer 1-5>,
    "clarity": <integer 1-5>,
    "naturalness": <integer 1-5>
  },
  "overall": <integer 1-5>,
  "corrections": [
    { "original": "<the problematic phrase as the user wrote it>", "corrected": "<the fixed version>", "explanation": "<one short sentence — why this is better, in plain English>" }
  ],
  "improved_version": "<the user's full answer rewritten in natural, polished interview English — keep the speaker's voice but fix grammar, word choice, and flow>",
  "tips": ["<one short, actionable tip for next time>", "..."]
}`;

// --- Helpers ---------------------------------------------------------------

// MiniMax-M3 is a reasoning model: it may prefix the answer with a
// <think>...</think> block and/or wrap the JSON in ```json fences. This pulls
// the first valid JSON object out of whatever the model returned.
function extractJson(raw) {
  if (typeof raw !== "string") {
    throw new Error("Model returned no text content.");
  }

  // Drop any reasoning block.
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Strip a single surrounding markdown code fence if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    text = fence[1].trim();
  }

  // Fast path: the whole thing is JSON.
  try {
    return JSON.parse(text);
  } catch {
    // Fall through to brace-scanning.
  }

  // Slow path: find the first balanced {...} object in the text.
  const start = text.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') {
        inStr = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return JSON.parse(text.slice(start, i + 1));
        }
      }
    }
  }

  throw new Error("Could not parse JSON from model response.");
}

function messageContent(completion) {
  const choice = completion.choices && completion.choices[0];
  return choice && choice.message ? choice.message.content : "";
}

function safeSessionPath(id) {
  // Only allow our own generated ids: digits + lowercase letters + dashes.
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  return path.join(SESSIONS_DIR, `${id}.json`);
}

function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 3;
  return Math.max(1, Math.min(5, Math.round(x)));
}

function normalizeFeedback(parsed) {
  // Defensive normalization — the model is usually well-behaved but the
  // response can occasionally miss a field. Coerce to the shape the UI expects.
  const s = parsed && parsed.scores ? parsed.scores : {};
  return {
    scores: {
      grammar: clampScore(s.grammar),
      vocabulary: clampScore(s.vocabulary),
      clarity: clampScore(s.clarity),
      naturalness: clampScore(s.naturalness),
    },
    overall: clampScore(parsed && parsed.overall),
    corrections: Array.isArray(parsed && parsed.corrections)
      ? parsed.corrections
          .map((c) => ({
            original: String(c && c.original ? c.original : ""),
            corrected: String(c && c.corrected ? c.corrected : ""),
            explanation: String(c && c.explanation ? c.explanation : ""),
          }))
          .filter((c) => c.original || c.corrected)
      : [],
    improved_version: String(
      (parsed && parsed.improved_version) || "",
    ),
    tips: Array.isArray(parsed && parsed.tips)
      ? parsed.tips.map((t) => String(t)).filter(Boolean)
      : [],
  };
}

// --- API: metadata ---------------------------------------------------------

app.get("/api/categories", (req, res) => {
  res.json({
    categories: CATEGORIES.map(({ id, label, custom }) => ({
      id,
      label,
      custom: !!custom,
    })),
  });
});

// --- Rate limiter ----------------------------------------------------------
//
// In-memory per-IP rate limit, no external dependencies. Applied to the
// AI-calling endpoint (/api/feedback) so a runaway client
// or a bored script-kiddie can't burn through API credits. Keeps a rolling
// 60s window of timestamps per IP; rejects with 429 when the window is full.

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;
const rateBuckets = new Map();

function getClientIp(req) {
  return (
    req.ip ||
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    (req.connection && req.connection.remoteAddress) ||
    "unknown"
  );
}

function rateLimit(req, res, next) {
  if (!isDemo(req)) return next();
  const ip = getClientIp(req);
  const now = Date.now();
  const recent = (rateBuckets.get(ip) || []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );

  if (recent.length >= RATE_MAX) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000);
    res.set("Retry-After", String(Math.max(retryAfter, 1)));
    return res.status(429).json({
      error:
        "Whoa, easy on the gas! You're sending requests too quickly. " +
        "Please wait a moment and try again.",
    });
  }

  recent.push(now);
  rateBuckets.set(ip, recent);
  next();
}

// --- API: feedback + save --------------------------------------------------

app.post("/api/feedback", rateLimit, async (req, res) => {
  const { category, prompt, answer } = req.body || {};

  if (typeof category !== "string" || !category.trim()) {
    return res.status(400).json({ error: "Missing category id." });
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "Missing prompt." });
  }
  const ans = (answer || "").toString().trim();
  if (!ans) {
    return res.status(400).json({ error: "Please write an answer first." });
  }

  const userPrompt = `INTERVIEW PROMPT:
${prompt}

CANDIDATE'S ANSWER (English, may contain grammar / vocabulary errors):
${ans}

Evaluate the candidate's English on four axes (1-5): grammar, vocabulary, clarity, naturalness. Then list every specific correction with a short explanation, write an improved version of the whole answer in natural interview English, and give a few short tips for next time. Be specific — Spanish-native patterns to watch: subject-verb agreement, false friends, missing articles (a/the), incorrect prepositions, literal translations, tense mismatches, missing third-person -s, adjective order, run-on sentences.

${FEEDBACK_FORMAT}`;

  try {
    const completion = await client.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const parsed = extractJson(messageContent(completion));
    const feedback = normalizeFeedback(parsed);

    const id =
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

    const record = {
      sessionId: id,
      category,
      prompt: prompt.trim(),
      answer: ans,
      createdAt: new Date().toISOString(),
      feedback,
    };

    // Persist the session as JSON.
    const filePath = safeSessionPath(record.sessionId);
    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
    }

    res.json(record);
  } catch (err) {
    console.error("[feedback] error:", err.message || err);
    res
      .status(502)
      .json({ error: "Feedback failed. Check the server logs and your API key." });
  }
});

// --- API: history ----------------------------------------------------------

app.get("/api/history", (req, res) => {
  try {
    const files = fs
      .readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith(".json"));

    const list = files
      .map((f) => {
        try {
          const data = JSON.parse(
            fs.readFileSync(path.join(SESSIONS_DIR, f), "utf8"),
          );
          const cat = CATEGORIES.find((c) => c.id === data.category);
          return {
            sessionId: data.sessionId,
            category: data.category,
            categoryLabel: cat ? cat.label : data.category,
            prompt: data.prompt,
            createdAt: data.createdAt,
            overall: data.feedback ? data.feedback.overall : null,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    res.json({ sessions: list });
  } catch (err) {
    console.error("[history] error:", err.message || err);
    res.status(500).json({ error: "Could not read history." });
  }
});

app.get("/api/history/:id", (req, res) => {
  const filePath = safeSessionPath(req.params.id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Session not found." });
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json(data);
  } catch (err) {
    console.error("[history/:id] error:", err.message || err);
    res.status(500).json({ error: "Could not read session." });
  }
});

// --- Start -----------------------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `\n[english-practice] running at http://localhost:${PORT}\n` +
      `  model: ${FAST_MODEL}\n  base:  ${BASE_URL}\n  sessions: ${SESSIONS_DIR}\n`,
  );
});
