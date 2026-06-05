# English Practice — AI Interview Tutor

An AI-powered English interview practice tool built for Spanish-speaking developers preparing for web-dev jobs in the US and Canada. Pick a question, write your answer, and get specific feedback on grammar, vocabulary, clarity, and naturalness — plus a polished rewrite of what you should have said.

## What it does

Practicing interview English with a generic chatbot produces vague feedback. This tool is tuned for the exact failure modes Spanish natives hit in technical interviews: subject-verb agreement, false friends, missing articles, preposition errors, literal translations, tense mismatches, missing third-person `-s`, adjective order, and run-on sentences.

For every answer you write, the tutor returns:

- **Four scored axes** (1–5): grammar, vocabulary, clarity, naturalness — plus an overall score
- **Specific corrections** with the original phrase, the fix, and a one-line explanation
- **An improved version** of your full answer in natural interview English
- **Actionable tips** for the next round

## Features

- **Curated question bank** — eight common interview prompts (Tell me about yourself, biggest weakness, biggest strength, why this company, where do you see yourself in 5 years, a project you're proud of, a technical challenge, do you have any questions for me) plus a custom-prompt mode for anything else
- **Persisted history** — every session is saved locally as JSON; browse, revisit, and review past answers from the UI
- **Reasoning-model safe** — handles `<think>` blocks and markdown fences that MiniMax-M3 occasionally wraps around its JSON output
- **Demo-mode rate limiting** — per-IP rolling 60-second window (5 requests max) auto-enabled whenever the app is served from anything other than localhost, so a public deployment won't burn through API credits
- **No build step** — vanilla HTML/CSS/JS frontend, Express backend, OpenAI-compatible client

## Tech stack

- **Backend:** Node.js, Express
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **AI:** Any OpenAI-compatible provider (MiniMax, OpenAI, Groq, etc.) via the official `openai` SDK
- **Storage:** Local JSON files in `sessions/`

## Setup

```bash
git clone <this-repo>
cd english-practice
npm install
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY (any OpenAI-compatible provider: MiniMax, OpenAI, Groq, etc.)
npm run dev
```

Then open <http://localhost:3001>.

### Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | — | Any OpenAI-compatible API key (MiniMax, OpenAI, Groq, etc.) |
| `MINIMAX_BASE_URL` | No | `https://api.minimax.io/v1` | Override the API base URL |
| `MINIMAX_MODEL` | No | `MiniMax-M3` | Reasoning model |
| `MINIMAX_FAST_MODEL` | No | `MiniMax-M2.5-highspeed` | Model used for feedback calls |
| `PORT` | No | `3001` | HTTP port |

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/categories` | List of question categories |
| `POST` | `/api/feedback` | Submit an answer, receive scored feedback |
| `GET` | `/api/history` | List of past sessions |
| `GET` | `/api/history/:id` | Fetch a single past session |

## Project structure

```
english-practice/
├── server.js          # Express app, AI feedback pipeline, rate limiter
├── categories.js      # Question bank
├── public/
│   ├── index.html     # Single-page UI
│   ├── app.js         # Frontend logic
│   └── style.css      # Styling
├── sessions/          # Persisted session JSON
└── .env.example       # Config template
```

## License

MIT
