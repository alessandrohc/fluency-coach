# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local-first, single-user English speaking coach built around the **AMR method** (Ativação → Musculação → Retenção, i.e. Activation → Muscle reps → Retention) for a senior Brazilian engineer recovering spoken fluency for international interviews. FastAPI backend + Next.js frontend, wired together with Docker Compose. No auth — personal local use only.

The UI and all AMR coaching feedback are in **Brazilian Portuguese**; only the answers the user writes/speaks are in English. Keep this split when touching user-facing strings.

## Commands

Everything runs through Docker Compose (`docker compose up`); the frontend dev server and backend hot-reload from mounted source.

- `docker compose up` — start both services. Frontend at `:3000`, backend at `:8001`, FastAPI docs at `:8001/docs`. Override ports with `FRONTEND_PORT` / `BACKEND_PORT` in `.env`.
- `cp .env.example .env` then set `OPENAI_API_KEY` — required before anything that hits OpenAI (transcription, feedback) will work; without it those endpoints return HTTP 500.
- Backend deps: `backend/requirements.txt`. Frontend deps: `frontend/package.json`.
- `cd frontend && npm run lint` — Next.js lint. `npm run build` — production build / type check.

There is **no test suite** and no Python linter configured. Don't assume `pytest`/`ruff` exist.

## Architecture

### Two parallel, mostly independent systems

1. **AMR trainer (primary)** — `/amr/*` endpoints, persisted in **SQLite** at `data/amr.sqlite3` via `AMRStore`. This is what the frontend (`frontend/app/page.tsx`) actually drives.
2. **Legacy practice sessions** — `/sessions` and `/practice-round`, persisted as **JSON files** in `data/sessions/*.json` via `SessionStore`. Still wired up (`FeedbackService.analyze`, `Feedback`/`PracticeResponse` types) but the current UI does not use them. Treat as legacy unless asked otherwise.

### Questions are config, progress is data — they're decoupled

- Questions live in `backend/app/data/amr_questions.json` as categories (`id`, `group`, `title`, `questions[]`). They are **never written to the DB**.
- `_flatten_questions()` in `main.py` expands them at request time into individual questions with a **derived id of `"{category_id}:{index}"`** (1-based index), plus a computed `track` (`leadership` if group starts with "leadership", else `ic`) and `block`.
- `AMRStore` keys progress rows by that derived id. **Consequence:** reordering or inserting questions in `amr_questions.json` shifts the indices and silently orphans/misattributes existing progress. Append, don't reorder.

### The AMR state machine

State per question (`question_progress.state`): `NEW → MUSCLE → RETENTION → RETAINED`, with spaced review looping `RETAINED ⇄ RETENTION`.

- `NEW` → save written answer (`save_activation`) → `MUSCLE`. Saving activation **wipes** prior reps and retention attempts for that question.
- `MUSCLE` → log read-aloud reps tagged `travei` (got stuck) or `fluiu` (flowed) → `advance_to_retention`.
- `RETENTION` → `retention-text` (paste transcript) or `retention-audio` (record → Whisper transcription) runs `FeedbackService.evaluate_retention`, comparing spoken recall against the saved written answer → `mark_retained`.
- `RETAINED` → `review` with `travei` (drops back to `RETENTION`) or `fluiu` (reschedules). Spaced gaps are hardcoded in `persistence.py`: `REVIEW_GAP_DAYS = 3` (first), `REVIEW_GAP_DAYS_2 = 7` (subsequent).

**Gating is frontend-only.** E.g. the "3+ reps and last was `fluiu`" rule before advancing to retention (`canAdvance` in `page.tsx`) is not enforced by the backend — the endpoints will transition regardless. Add backend checks if you need a hard guarantee.

### "Today's session" logic is duplicated

The daily plan (AQUECIMENTO/ATIVACAO/MUSCULACAO/RETENCAO picks) is computed **twice**: server-side in `_build_today()` (`main.py`) and again client-side in the `Today` component (`page.tsx`). The frontend ignores the server's `today` field and recomputes. If you change the selection rules, change **both** or they'll diverge.

### OpenAI integration

- `TranscriptionService` (`transcription.py`) — Whisper, model from `OPENAI_TRANSCRIPTION_MODEL` (default `whisper-1`). Uploaded audio is written to a temp file and forwarded with its original suffix.
- `FeedbackService` (`feedback.py`) — chat model from `OPENAI_CHAT_MODEL` (default `gpt-4o-mini`), `response_format=json_object`. Two distinct prompts with **different output shapes and languages**:
  - `analyze()` — legacy practice rounds, English system prompt, returns scores + rewrite + follow-ups.
  - `evaluate_retention()` — AMR, **pt-BR** system prompt, returns `{substancia, vocabulario, hesitacao, foco_proxima_rep}`. The frontend `RetentionAttempt.ev` type and `EvalCard` expect exactly this pt-BR shape.

The shared OpenAI `client` is `None` when no key is set; endpoints that need it raise 500.

### Data persistence notes

- `data/` is bind-mounted into the backend container at `/app/data`. `data/amr.sqlite3` and `data/sessions/*.json` are gitignored.
- `DELETE /amr/progress` wipes all AMR progress (reps, retention, question_progress) — full reset.
