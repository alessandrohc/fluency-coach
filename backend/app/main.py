import json
import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

from app.services.feedback import FeedbackService
from app.services.persistence import SessionStore
from app.services.transcription import TranscriptionService


DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
QUESTIONS_FILE = Path(os.getenv("QUESTIONS_FILE", "/app/app/data/amr_questions.json"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
OPENAI_CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")

app = FastAPI(title="Fluency Coach API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
store = SessionStore(DATA_DIR)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/questions")
def questions() -> list[dict[str, Any]]:
    return json.loads(QUESTIONS_FILE.read_text())


@app.get("/sessions")
def sessions() -> list[dict[str, Any]]:
    return store.list_sessions()


@app.get("/sessions/{session_id}")
def session(session_id: str) -> dict[str, Any]:
    data = store.get_session(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Session not found")
    return data


@app.post("/practice-round")
async def practice_round(
    audio: UploadFile = File(...),
    question: str = Form(...),
    session_id: str | None = Form(default=None),
) -> dict[str, Any]:
    if client is None:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    session_data = store.get_session(session_id) if session_id else None
    if session_id and not session_data:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session_data:
        session_data = store.create_session(question)

    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(await audio.read())

    try:
        transcript = TranscriptionService(client, OPENAI_TRANSCRIPTION_MODEL).transcribe(temp_path)
        if not transcript:
            raise HTTPException(status_code=400, detail="No speech could be transcribed")

        feedback = FeedbackService(client, OPENAI_CHAT_MODEL).analyze(
            question=question,
            transcript=transcript,
            previous_rounds=session_data.get("rounds", []),
        )

        round_data = {
            "round": len(session_data.get("rounds", [])) + 1,
            "question": question,
            "transcript": transcript,
            "feedback": feedback,
            "follow_up_questions": feedback.get("follow_up_questions", []),
        }
        updated_session = store.append_round(session_data, round_data)

        return {
            "session_id": updated_session["id"],
            "round": round_data["round"],
            "question": question,
            "transcript": transcript,
            "feedback": feedback,
            "follow_up_questions": round_data["follow_up_questions"],
            "session": updated_session,
        }
    finally:
        temp_path.unlink(missing_ok=True)
