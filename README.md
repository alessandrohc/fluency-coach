# Fluency Coach

A local-first AMR English speaking coach for recovering spoken fluency for technical interviews.

It runs locally with Docker Compose, stores AMR progress in SQLite, records audio in the browser, sends it to a FastAPI backend, transcribes it with OpenAI Whisper, and asks GPT for retention-focused feedback.

## Features

- AMR flow: written activation, speaking reps, retention, and spaced review
- Persistent SQLite database for per-question progress
- Browser audio recording and upload during retention
- OpenAI Whisper transcription
- GPT retention evaluation comparing spoken recall against the written answer
- AI follow-up interview questions
- Multiple rounds per session
- Vocabulary recovery suggestions
- Legacy JSON session endpoints are still available
- No authentication

## Requirements

- Docker
- Docker Compose
- OpenAI API key

## Setup

1. Create your environment file:

```bash
cp .env.example .env
```

2. Edit `.env` and set:

```bash
OPENAI_API_KEY=sk-your-openai-api-key
```

3. Start the app:

```bash
docker compose up
```

4. Open:

```text
http://localhost:3000
```

The API is available at:

```text
http://localhost:8001
```

FastAPI docs are available at:

```text
http://localhost:8001/docs
```

## Local Data

AMR progress is saved in:

```text
data/amr.sqlite3
```

Legacy practice sessions are still saved as JSON files in:

```text
data/sessions/
```

The SQLite database contains question state, written answers, speaking reps, retention transcripts/evaluations, and review dates.

## Architecture

```text
.
├── backend
│   ├── app
│   │   ├── data
│   │   │   └── amr_questions.json
│   │   ├── services
│   │   │   ├── feedback.py
│   │   │   ├── persistence.py
│   │   │   └── transcription.py
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend
│   ├── app
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib
│   │   └── types.ts
│   ├── Dockerfile
│   ├── next.config.js
│   ├── package.json
│   └── tsconfig.json
├── data
│   ├── amr.sqlite3
│   └── sessions
├── docker-compose.yml
└── .env.example
```

## Notes

- The app is for personal local use and intentionally has no auth.
- The frontend calls the backend from the browser using `NEXT_PUBLIC_API_BASE_URL`.
- The default host ports are `3000` for the frontend and `8001` for the backend. Override them with `FRONTEND_PORT` and `BACKEND_PORT` in `.env`.
- Audio recording uses the browser `MediaRecorder` API, so use a modern browser and allow microphone access.
- If your browser produces a non-WebM format, the backend still forwards the uploaded file to the OpenAI transcription API with the uploaded content type and filename.
