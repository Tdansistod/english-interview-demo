"use strict";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  categories: [], // [{ id, label, custom }]
  category: null, // { id, label, custom, prompt }
  prompt: "",
  feedback: null,
  loading: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showView(id) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  $(`#view-${id}`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Setup view
// ---------------------------------------------------------------------------
async function initSetup() {
  try {
    const { categories } = await api("/api/categories");
    state.categories = categories;
    const grid = $("#category-grid");
    grid.innerHTML = "";
    categories.forEach((cat, i) => {
      const chip = el("button", "chip", cat.label);
      chip.dataset.catId = cat.id;
      if (i === 0) {
        chip.classList.add("active");
        state.category = cat;
        toggleCustomPrompt();
      }
      chip.addEventListener("click", () => {
        $$("#category-grid .chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.category = cat;
        toggleCustomPrompt();
      });
      grid.appendChild(chip);
    });
  } catch (err) {
    $("#category-grid").innerHTML =
      `<p class="empty-state">Could not load categories: ${escapeHtml(err.message)}</p>`;
  }
}

function toggleCustomPrompt() {
  const wrap = $("#custom-prompt-wrap");
  if (state.category && state.category.custom) {
    wrap.classList.remove("hidden");
  } else {
    wrap.classList.add("hidden");
  }
}

// ---------------------------------------------------------------------------
// Start practice
// ---------------------------------------------------------------------------
function startPractice() {
  if (!state.category) {
    alert("Pick a question first.");
    return;
  }
  let prompt;
  if (state.category.custom) {
    prompt = $("#custom-prompt").value.trim();
    if (!prompt) {
      alert("Type your custom prompt first.");
      $("#custom-prompt").focus();
      return;
    }
  } else {
    const def = state.categories.find((c) => c.id === state.category.id);
    // The full prompt lives on the server; we look it up by id in /api/categories
    // payload only carries id/label/custom. So we keep a small map.
    prompt = PROMPT_MAP[state.category.id] || state.category.label;
  }
  state.prompt = prompt;
  state.feedback = null;

  $("#prompt-text").textContent = prompt;
  const input = $("#answer-input");
  input.value = "";
  input.disabled = false;
  input.focus();
  $("#feedback-panel").classList.add("hidden");
  $("#feedback-panel").innerHTML = "";
  $("#practice-loading").classList.add("hidden");
  $("#submit-btn").disabled = false;

  showView("practice");
}

// The categories endpoint only ships id/label/custom to the browser. We
// duplicate the canonical prompts here so the practice view can show the
// exact question text without an extra round-trip. The server still has
// authoritative prompts in categories.js.
const PROMPT_MAP = {
  "about-yourself": "Tell me about yourself.",
  weakness: "What's your biggest weakness as a developer?",
  strength: "What's your biggest strength as a developer?",
  "why-company": "Why do you want to work at our company?",
  "five-years": "Where do you see yourself in 5 years?",
  project:
    "Tell me about a project you're proud of. What did you build and what was your role?",
  challenge:
    "Tell me about a technical challenge you faced and how you solved it.",
  questions: "Do you have any questions for me?",
};

// ---------------------------------------------------------------------------
// Submit answer
// ---------------------------------------------------------------------------
async function submitAnswer() {
  const input = $("#answer-input");
  const answer = input.value.trim();
  if (!answer) {
    alert("Write an answer first.");
    input.focus();
    return;
  }
  if (!state.category) {
    alert("Pick a question first.");
    return;
  }

  input.disabled = true;
  $("#submit-btn").disabled = true;
  $("#practice-loading").classList.remove("hidden");
  $("#feedback-panel").classList.add("hidden");
  $("#feedback-panel").innerHTML = "";

  try {
    const record = await api("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: state.category.id,
        prompt: state.prompt,
        answer,
      }),
    });
    state.feedback = record.feedback;
    renderFeedback(record.feedback);
  } catch (err) {
    $("#practice-loading").classList.add("hidden");
    alert(err.message);
    input.disabled = false;
    $("#submit-btn").disabled = false;
  }
}

function renderFeedback(fb) {
  $("#practice-loading").classList.add("hidden");
  const panel = $("#feedback-panel");
  panel.innerHTML = "";

  // Score grid (per axis)
  const scoreGrid = el("div", "score-grid");
  const axes = [
    ["grammar", "Grammar"],
    ["vocabulary", "Vocabulary"],
    ["clarity", "Clarity"],
    ["naturalness", "Naturalness"],
  ];
  axes.forEach(([key, label]) => {
    const cell = el("div", `score-cell s${fb.scores[key]}`);
    cell.appendChild(el("span", "sc-label", label));
    cell.appendChild(el("span", "sc-value", String(fb.scores[key])));
    scoreGrid.appendChild(cell);
  });
  panel.appendChild(scoreGrid);

  // Overall row
  const overall = el("div", "overall-row");
  const badge = el("div", `overall-badge s${fb.overall}`);
  badge.textContent = String(fb.overall);
  const labelBlock = el("div");
  labelBlock.appendChild(el("div", "overall-label", "Overall"));
  labelBlock.appendChild(
    el("div", null, overallText(fb.overall)),
  );
  overall.appendChild(badge);
  overall.appendChild(labelBlock);
  panel.appendChild(overall);

  // Corrections block
  const corrBlock = el("div", "block corrections");
  corrBlock.appendChild(el("h3", null, "Corrections"));
  if (fb.corrections.length === 0) {
    corrBlock.appendChild(
      el("p", "empty-corrections", "No corrections — solid English."),
    );
  } else {
    const ul = el("ul");
    fb.corrections.forEach((c) => {
      const li = el("li", "correction");
      li.appendChild(el("div", "c-original", c.original));
      li.appendChild(el("div", "c-corrected", c.corrected));
      if (c.explanation) {
        li.appendChild(el("div", "c-explain", c.explanation));
      }
      ul.appendChild(li);
    });
    corrBlock.appendChild(ul);
  }
  panel.appendChild(corrBlock);

  // Improved version
  if (fb.improved_version) {
    const impBlock = el("div", "block improved");
    impBlock.appendChild(el("h3", null, "Improved version"));
    impBlock.appendChild(el("div", "improved-text", fb.improved_version));
    panel.appendChild(impBlock);
  }

  // Tips
  if (fb.tips && fb.tips.length) {
    const tipsBlock = el("div", "block tips");
    tipsBlock.appendChild(el("h3", null, "Tips for next time"));
    const ul = el("ul");
    fb.tips.forEach((t) => ul.appendChild(el("li", null, t)));
    tipsBlock.appendChild(ul);
    panel.appendChild(tipsBlock);
  }

  // "Try again" button — re-enable input so the user can rewrite their answer.
  const actions = el("div", "practice-actions");
  const back = el("button", "ghost-btn", "← Change question");
  back.addEventListener("click", () => showView("setup"));
  const again = el("button", "primary-btn", "Try again with a new answer");
  again.addEventListener("click", () => {
    input.disabled = false;
    input.value = "";
    input.focus();
    $("#submit-btn").disabled = false;
    panel.classList.add("hidden");
    panel.innerHTML = "";
    state.feedback = null;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  actions.appendChild(back);
  actions.appendChild(again);
  panel.appendChild(actions);

  panel.classList.remove("hidden");
}

function overallText(score) {
  if (score >= 5) return "Native-level — ready for the real thing.";
  if (score === 4) return "Strong — minor polish needed.";
  if (score === 3) return "Workable — clear room to improve.";
  if (score === 2) return "Needs work — focus on the corrections above.";
  return "Significant issues — rewrite and try again.";
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
async function openHistory() {
  showView("history");
  const list = $("#history-list");
  list.innerHTML = `<div class="loading centered"><span class="spinner"></span> Loading…</div>`;

  try {
    const { sessions } = await api("/api/history");
    list.innerHTML = "";
    if (!sessions.length) {
      list.appendChild(
        el("p", "empty-state", "No past sessions yet. Go practice one."),
      );
      return;
    }
    sessions.forEach((s) => {
      const item = el("div", "history-item");

      const left = el("div", "hi-left");
      left.appendChild(el("div", "hi-cat", s.categoryLabel));
      left.appendChild(el("div", "hi-prompt", s.prompt));
      const date = new Date(s.createdAt).toLocaleString();
      left.appendChild(el("div", "hi-sub", date));
      item.appendChild(left);

      const right = el("div", "hi-right");
      if (s.overall != null) {
        right.appendChild(el("div", "hi-score", String(s.overall)));
      }
      item.appendChild(right);

      item.addEventListener("click", () => loadPastSession(s.sessionId));
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Could not load history: ${escapeHtml(err.message)}</p>`;
  }
}

async function loadPastSession(id) {
  try {
    const record = await api(`/api/history/${id}`);
    showView("detail");

    $("#detail-title").textContent = record.prompt;
    const cat = state.categories.find((c) => c.id === record.category);
    $("#detail-category").textContent = cat ? cat.label : record.category;
    $("#detail-date").textContent = new Date(record.createdAt).toLocaleString();
    const o = record.feedback ? record.feedback.overall : null;
    const overallTag = $("#detail-overall");
    overallTag.textContent = o != null ? `Overall ${o}/5` : "Overall —";
    overallTag.className = "tag score";

    $("#detail-original").textContent = record.answer;

    const wrap = $("#detail-feedback");
    wrap.innerHTML = "";
    // Reuse the same renderer — but skip the "try again" actions row.
    const fb = record.feedback;
    if (!fb) {
      wrap.appendChild(
        el("p", "empty-state", "No feedback stored for this session."),
      );
      return;
    }

    const scoreGrid = el("div", "score-grid");
    [
      ["grammar", "Grammar"],
      ["vocabulary", "Vocabulary"],
      ["clarity", "Clarity"],
      ["naturalness", "Naturalness"],
    ].forEach(([key, label]) => {
      const cell = el("div", `score-cell s${fb.scores[key]}`);
      cell.appendChild(el("span", "sc-label", label));
      cell.appendChild(el("span", "sc-value", String(fb.scores[key])));
      scoreGrid.appendChild(cell);
    });
    wrap.appendChild(scoreGrid);

    const overall = el("div", "overall-row");
    const badge = el("div", `overall-badge s${fb.overall}`);
    badge.textContent = String(fb.overall);
    const labelBlock = el("div");
    labelBlock.appendChild(el("div", "overall-label", "Overall"));
    labelBlock.appendChild(el("div", null, overallText(fb.overall)));
    overall.appendChild(badge);
    overall.appendChild(labelBlock);
    wrap.appendChild(overall);

    const corrBlock = el("div", "block corrections");
    corrBlock.appendChild(el("h3", null, "Corrections"));
    if (!fb.corrections.length) {
      corrBlock.appendChild(
        el("p", "empty-corrections", "No corrections — solid English."),
      );
    } else {
      const ul = el("ul");
      fb.corrections.forEach((c) => {
        const li = el("li", "correction");
        li.appendChild(el("div", "c-original", c.original));
        li.appendChild(el("div", "c-corrected", c.corrected));
        if (c.explanation) li.appendChild(el("div", "c-explain", c.explanation));
        ul.appendChild(li);
      });
      corrBlock.appendChild(ul);
    }
    wrap.appendChild(corrBlock);

    if (fb.improved_version) {
      const impBlock = el("div", "block improved");
      impBlock.appendChild(el("h3", null, "Improved version"));
      impBlock.appendChild(el("div", "improved-text", fb.improved_version));
      wrap.appendChild(impBlock);
    }

    if (fb.tips && fb.tips.length) {
      const tipsBlock = el("div", "block tips");
      tipsBlock.appendChild(el("h3", null, "Tips for next time"));
      const ul = el("ul");
      fb.tips.forEach((t) => ul.appendChild(el("li", null, t)));
      tipsBlock.appendChild(ul);
      wrap.appendChild(tipsBlock);
    }
  } catch (err) {
    alert(err.message);
  }
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
function init() {
  initSetup();
  $("#start-btn").addEventListener("click", startPractice);
  $("#submit-btn").addEventListener("click", submitAnswer);
  $("#back-btn").addEventListener("click", () => showView("setup"));
  $("#history-btn").addEventListener("click", openHistory);
  $("#back-from-history").addEventListener("click", () => showView("setup"));
  $("#back-from-detail").addEventListener("click", openHistory);

  // Ctrl/Cmd+Enter submits
  $("#answer-input").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      if (!$("#submit-btn").disabled) submitAnswer();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
