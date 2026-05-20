import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


class SessionStore:
    def __init__(self, data_dir: Path) -> None:
        self.sessions_dir = data_dir / "sessions"
        self.sessions_dir.mkdir(parents=True, exist_ok=True)

    def create_session(self, initial_question: str) -> dict[str, Any]:
        now = self._now()
        return {
            "id": str(uuid4()),
            "created_at": now,
            "updated_at": now,
            "initial_question": initial_question,
            "rounds": [],
        }

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        path = self._path(session_id)
        if not path.exists():
            return None

        return json.loads(path.read_text())

    def append_round(self, session: dict[str, Any], round_data: dict[str, Any]) -> dict[str, Any]:
        session["rounds"].append(round_data)
        session["updated_at"] = self._now()
        self.save(session)
        return session

    def save(self, session: dict[str, Any]) -> None:
        self._path(session["id"]).write_text(json.dumps(session, indent=2, ensure_ascii=False))

    def list_sessions(self) -> list[dict[str, Any]]:
        sessions = []
        for path in sorted(self.sessions_dir.glob("*.json"), reverse=True):
            data = json.loads(path.read_text())
            sessions.append(
                {
                    "id": data["id"],
                    "created_at": data["created_at"],
                    "updated_at": data["updated_at"],
                    "initial_question": data.get("initial_question", ""),
                    "round_count": len(data.get("rounds", [])),
                }
            )
        return sessions

    def _path(self, session_id: str) -> Path:
        return self.sessions_dir / f"{session_id}.json"

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

