import json
from typing import Any

from openai import OpenAI


class FeedbackService:
    def __init__(self, client: OpenAI, model: str) -> None:
        self.client = client
        self.model = model

    def analyze(self, question: str, transcript: str, previous_rounds: list[dict[str, Any]]) -> dict[str, Any]:
        history = [
            {
                "question": item.get("question"),
                "transcript": item.get("transcript"),
                "follow_up_questions": item.get("follow_up_questions", []),
            }
            for item in previous_rounds[-3:]
        ]

        response = self.client.chat.completions.create(
            model=self.model,
            temperature=0.5,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an English Fluency Coach specialized in helping experienced "
                        "software engineers recover spoken fluency after years without practice.\n\n"

                        "The user already understands English well, but struggles with:\n"
                        "- mentally translating from Portuguese to English\n"
                        "- hesitation during speech\n"
                        "- forgetting words while speaking\n"
                        "- overthinking grammar\n"
                        "- losing speaking rhythm and fluency\n\n"

                        "IMPORTANT:\n"
                        "The goal is NOT perfect grammar.\n"
                        "The goal is:\n"
                        "- fluent communication\n"
                        "- continuous speaking\n"
                        "- faster thinking in English\n"
                        "- confidence during interviews\n"
                        "- recovering automatic speech\n\n"

                        "You are operating in RECOVERY MODE.\n\n"

                        "CORE BEHAVIOR RULES:\n"
                        "1. Prioritize fluency over correctness.\n"
                        "2. Do NOT over-correct small grammar mistakes.\n"
                        "3. Avoid acting like a strict English teacher.\n"
                        "4. Focus on helping the user communicate naturally.\n"
                        "5. Encourage simpler sentence structures.\n"
                        "6. Help reduce mental translation.\n"
                        "7. Optimize feedback for spoken English.\n"
                        "8. Keep feedback concise, practical, and supportive.\n"
                        "9. Focus heavily on technical interviews and software engineering communication.\n"
                        "10. The user is allowed to have a Brazilian accent.\n\n"

                        "When analyzing responses:\n"
                        "- Identify hesitation patterns.\n"
                        "- Detect overly complicated phrasing.\n"
                        "- Detect literal Portuguese-to-English translation patterns.\n"
                        "- Suggest simpler and more natural spoken alternatives.\n"
                        "- Prioritize communication clarity and speaking flow.\n"
                        "- Encourage reusable interview speech chunks.\n\n"

                        "IMPORTANT:\n"
                        "Do NOT generate robotic or overly formal rewrites.\n"
                        "The rewritten answer should sound natural, conversational, and easy to say aloud.\n\n"

                        "Return ONLY valid JSON."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "question": question,
                            "transcript": transcript,
                            "recent_rounds": history,
                            "analysis_goals": {
                                "focus": [
                                    "spoken fluency",
                                    "hesitation reduction",
                                    "natural interview communication",
                                    "mental translation detection",
                                    "vocabulary recovery",
                                    "thinking directly in English",
                                ],
                                "avoid": [
                                    "excessive grammar correction",
                                    "overly formal English",
                                    "academic explanations",
                                    "robotic rewrites",
                                ],
                            },
                            "required_json_shape": {
                                "summary": (
                                    "short supportive fluency-focused assessment"
                                ),
                                "fluency_score": "integer 1-10",
                                "clarity_score": "integer 1-10",
                                "interview_readiness_score": "integer 1-10",
                                "hesitation_signals": [
                                    "moments where the user likely paused, translated mentally, or overthought"
                                ],
                                "strengths": [
                                    "2-4 concise communication strengths"
                                ],
                                "improvements": [
                                    "2-4 concrete speaking improvements focused on fluency"
                                ],
                                "mental_translation_patterns": [
                                    {
                                        "original": "literal or unnatural phrase",
                                        "why_it_sounds_unusual": (
                                            "short explanation in Portuguese"
                                        ),
                                        "more_natural_options": [
                                            "simpler spoken alternatives"
                                        ],
                                    }
                                ],
                                "vocabulary_recovery": [
                                    {
                                        "idea": (
                                            "what the speaker tried to express"
                                        ),
                                        "better_phrases": [
                                            "natural reusable interview chunks"
                                        ],
                                    }
                                ],
                                "suggested_rewrite": (
                                    "natural spoken version optimized for fluency and confidence"
                                ),
                                "follow_up_questions": [
                                    "3 short natural technical interview follow-up questions"
                                ],
                                "coach_feedback": [
                                    "short motivational speaking-oriented coaching feedback"
                                ],
                            },
                        }
                    ),
                },
            ],
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)

        return {
            "summary": parsed.get("summary", ""),
            "fluency_score": int(parsed.get("fluency_score", 0) or 0),
            "clarity_score": int(parsed.get("clarity_score", 0) or 0),
            "interview_readiness_score": int(parsed.get("interview_readiness_score", 0) or 0),
            "strengths": parsed.get("strengths", []),
            "improvements": parsed.get("improvements", []),
            "vocabulary_recovery": parsed.get("vocabulary_recovery", []),
            "suggested_rewrite": parsed.get("suggested_rewrite", ""),
            "follow_up_questions": parsed.get("follow_up_questions", []),
        }

    def evaluate_retention(self, question: str, written_answer: str, transcript: str) -> dict[str, Any]:
        response = self.client.chat.completions.create(
            model=self.model,
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Você é o avaliador AMR de um dev senior brasileiro voltando a falar "
                        "inglês para screenings internacionais. O gargalo é retrieval ativo e "
                        "fluência, não conhecimento e não gramática.\n\n"
                        "Compare a fala de retenção com a resposta escrita que ele treinou. "
                        "Não corrija gramática. Não seja professor de vírgula. Foque em: "
                        "substância recuperada, vocabulário/estruturas que voltaram, pontos "
                        "que ele simplificou ou evitou, e hesitação visível no transcript.\n\n"
                        "Responda em pt-BR. Retorne somente JSON válido."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "pergunta": question,
                            "resposta_escrita_de_referencia": written_answer,
                            "transcricao_da_fala_de_retencao": transcript,
                            "required_json_shape": {
                                "substancia": {
                                    "nota": "integer 0-5",
                                    "comentario": "manteve os pontos-chave sem a muleta? o que colapsou?",
                                },
                                "vocabulario": {
                                    "alcancado": ["palavras/estruturas boas recuperadas na fala"],
                                    "evitado_ou_simplificado": ["onde fugiu ou simplificou vs a v1"],
                                    "comentario": "comentário curto em pt-BR",
                                },
                                "hesitacao": {
                                    "densidade": "baixa|média|alta",
                                    "exemplos": ["fillers, reinícios ou repetições no transcript"],
                                    "comentario": "comentário curto em pt-BR",
                                },
                                "foco_proxima_rep": "uma coisa concreta e acionável para a próxima tentativa",
                            },
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)

        return {
            "substancia": parsed.get("substancia", {}),
            "vocabulario": parsed.get("vocabulario", {}),
            "hesitacao": parsed.get("hesitacao", {}),
            "foco_proxima_rep": parsed.get("foco_proxima_rep", ""),
        }
