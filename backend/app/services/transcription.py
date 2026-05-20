from pathlib import Path

from openai import OpenAI


class TranscriptionService:
    def __init__(self, client: OpenAI, model: str) -> None:
        self.client = client
        self.model = model

    def transcribe(self, audio_path: Path) -> str:
        with audio_path.open("rb") as audio_file:
            result = self.client.audio.transcriptions.create(
                model=self.model,
                file=audio_file,
                response_format="text",
            )

        if isinstance(result, str):
            return result.strip()

        text = getattr(result, "text", "")
        return text.strip()

