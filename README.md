# English Practice — AI Interview Tutor

A focused practice app for a Spanish native prepping for English web-dev
interviews. Pick a question, write an answer, get a structured review:
**grammar**, **vocabulary**, **clarity**, **naturalness** — plus a list of
specific corrections and a polished rewrite. Every exchange is saved as
JSON and is browsable from the history view.

## What it does

1. **Pick a question** — interview prompts: "Tell me about yourself",
   "Biggest weakness", "Biggest strength", "Why this company", "Where do
   you see yourself in 5 years", "Tell me about a project", "Tell me
   about a challenge", "Any questions for me", plus a freeform
   "Custom prompt" option.
2. **Write your answer** — big text area, submit.
3. **Get AI feedback** — the model scores the answer on four axes, lists
   each correction with a short explanation, rewrites the whole answer in
   natural interview English, and gives tips for next time.
4. **Browse history** — every exchange is saved to `sessions/` and is
   browsable from the UI.

## Tech

- **Frontend:** vanilla HTML / CSS / JS — no framework, no build step.
  Warm dark theme with a rust/amber accent, Fraunces + JetBrains Mono.
- **Backend:** Node.js + Express.
- **AI:** the official OpenAI SDK (`openai`) pointed at MiniMax's
  OpenAI-compatible endpoint (`https://api.minimax.io/v1`), calling
  `MiniMax-M2.5-highspeed` for feedback. The shared tutor system prompt
  is sent on every request and responses use JSON mode
  (`response_format: json_object`); since the model may emit `<think>`
  blocks, the server strips them and code fences before parsing the
  JSON.

## Running it

Requirements: Node.js 20+ (for the native `--env-file` flag) and a
MiniMax API key.

```bash
# 1. Install dependencies
npm install

# 2. Provide your API key
cp .env.example .env        # then edit .env and set MINIMAX_API_KEY

# 3. Start (npm scripts load .env automatically via --env-file)
npm start
```

Then open **http://localhost:3001**.

> The npm `start`/`dev` scripts run `node --env-file=.env server.js`,
> so the `.env` file is loaded automatically. The server reads
> `process.env.MINIMAX_API_KEY` and refuses to start without it. If you
> run `node server.js` directly, export the variable in your shell
> first.

## Project structure

```
english-practice/
├── server.js          # Express server: /api/feedback, /api/history
├── categories.js      # Hardcoded prompt bank
├── package.json
├── .env.example       # MINIMAX_API_KEY=your_key_here
├── public/
│   ├── index.html     # Single-page app
│   ├── style.css      # Warm dark + rust/amber theme
│   └── app.js         # All client logic (dependency-free)
└── sessions/          # Saved exchanges as JSON (created automatically)
```

## API endpoints

| Method | Route               | Purpose                                  |
| ------ | ------------------- | ---------------------------------------- |
| GET    | `/api/categories`   | List available prompts                   |
| POST   | `/api/feedback`     | Score an answer, return + save feedback  |
| GET    | `/api/history`      | List saved exchanges                     |
| GET    | `/api/history/:id`  | Fetch one saved exchange                 |

## Notes

- The API key is **only** read from the environment — it is never
  hardcoded or sent to the browser.
- The `sessions/` folder is created automatically on first run.
- The prompt bank in `categories.js` is easy to extend — add entries
  to the `CATEGORIES` array.
