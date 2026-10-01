from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


class StoredModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Subject(StoredModel):
    id: str
    name: str
    accent: str


class Quiz(StoredModel):
    id: str
    subjectId: str
    name: str


class Choice(StoredModel):
    id: str
    text: str


class Question(StoredModel):
    id: str
    quizId: str
    stem: str
    choices: list[Choice]
    answer: str | None = None
    verifiedAnswer: str | None = None
    answerNote: str | None = None
    rationale: str
    rationaleMeta: dict[str, Any] | None = None
    choiceExplanations: dict[str, str] | None = None
    pearls: list[str] | None = None
    metadata: dict[str, Any] | None = None


class Bank(StoredModel):
    schemaVersion: int = Field(strict=True)
    subjects: list[Subject]
    quizzes: list[Quiz]
    questions: list[Question]

    @model_validator(mode="after")
    def validate_relationships(self) -> Bank:
        if self.schemaVersion != 4:
            raise ValueError(f"Unsupported question bank schema version: {self.schemaVersion}")
        self._unique_ids("subject", [item.id for item in self.subjects])
        self._unique_ids("quiz", [item.id for item in self.quizzes])
        self._unique_ids("question", [item.id for item in self.questions])
        if any(re.fullmatch(r"s[1-9]\d*", item.id) is None for item in self.subjects):
            raise ValueError("Subject IDs must use the compact s-number format.")
        if any(re.fullmatch(r"q[1-9]\d*", item.id) is None for item in self.quizzes):
            raise ValueError("Quiz IDs must use the compact q-number format.")
        if any(re.fullmatch(r"i[1-9]\d*", item.id) is None for item in self.questions):
            raise ValueError("Question IDs must use the compact i-number format.")
        subject_ids = {item.id for item in self.subjects}
        quiz_ids = {item.id for item in self.quizzes}
        if any(item.subjectId not in subject_ids for item in self.quizzes):
            raise ValueError("A quiz references an unknown subject.")
        if any(item.quizId not in quiz_ids for item in self.questions):
            raise ValueError("A question references an unknown quiz.")
        question_counts = {quiz_id: 0 for quiz_id in quiz_ids}
        closed_quiz_ids: set[str] = set()
        current_quiz_id: str | None = None
        for question in self.questions:
            if current_quiz_id is not None and current_quiz_id != question.quizId:
                closed_quiz_ids.add(current_quiz_id)
            if question.quizId in closed_quiz_ids:
                raise ValueError("Questions for each quiz must be contiguous in canonical order.")
            current_quiz_id = question.quizId
            question_counts[question.quizId] += 1
            if not question.stem.strip() or not question.rationale.strip():
                raise ValueError(f"Question {question.id} has an empty stem or rationale.")
            if len(question.choices) < 2 or any(
                not choice.text.strip() for choice in question.choices
            ):
                raise ValueError(
                    f"Question {question.id} must have at least two non-empty choices."
                )
            if any(re.fullmatch(r"[A-Z]", choice.id) is None for choice in question.choices):
                raise ValueError(f"Question {question.id} has a choice ID outside the A-Z range.")
            self._unique_ids(
                f"choice in question {question.id}", [item.id for item in question.choices]
            )
            choice_ids = {item.id for item in question.choices}
            answer = question.verifiedAnswer or question.answer
            if answer is None or answer not in choice_ids:
                raise ValueError(f"Question {question.id} has no valid resolved answer.")
            if question.answer is not None and question.answer not in choice_ids:
                raise ValueError(f"Question {question.id} has an unknown provided answer.")
            if question.verifiedAnswer is not None and question.verifiedAnswer not in choice_ids:
                raise ValueError(f"Question {question.id} has an unknown verified answer.")
            if question.choiceExplanations and not set(question.choiceExplanations).issubset(
                choice_ids
            ):
                raise ValueError(
                    f"Question {question.id} has an explanation for an unknown choice."
                )
            meta = question.rationaleMeta or {}
            if meta.get("provenance") == "ai_draft_reviewed" and not (
                meta.get("reviewedAt") and meta.get("reviewNote")
            ):
                raise ValueError(
                    f"Question {question.id} has incomplete reviewed-draft provenance."
                )
            metadata = question.metadata
            if metadata:
                if "discipline" in metadata or metadata.get("difficulty") == "unknown":
                    raise ValueError(
                        f"Question {question.id} stores redundant or default metadata."
                    )
                if not any(bool(value) for value in metadata.values()):
                    raise ValueError(f"Question {question.id} stores an empty metadata object.")
        if any(count == 0 for count in question_counts.values()):
            raise ValueError("Every quiz must contain at least one question.")
        return self

    @staticmethod
    def _unique_ids(kind: str, values: list[str]) -> None:
        if len(values) != len(set(values)):
            raise ValueError(f"Duplicate {kind} IDs are not allowed.")


class QuestionBankRepository(Protocol):
    @property
    def revision(self) -> str: ...

    def list_subjects(self) -> list[Subject]: ...

    def list_quizzes(self, subject_id: str) -> list[tuple[Quiz, int]]: ...

    def get_quiz(self, quiz_id: str) -> tuple[Quiz, int] | None: ...

    def list_questions(self, quiz_id: str) -> list[Question]: ...

    def list_question_ids(self, quiz_id: str) -> list[str]: ...


class JsonQuestionBankRepository:
    def __init__(self, path: Path):
        self.path = path
        self.bank: Bank
        self.raw: dict[str, Any]
        self._load()
        self._questions_by_quiz: dict[str, list[Question]] = {
            quiz.id: [] for quiz in self.bank.quizzes
        }
        for question in self.bank.questions:
            self._questions_by_quiz[question.quizId].append(question)
        self._quizzes_by_subject: dict[str, list[tuple[Quiz, int]]] = {
            subject.id: [] for subject in self.bank.subjects
        }
        for quiz in self.bank.quizzes:
            self._quizzes_by_subject[quiz.subjectId].append(
                (quiz, len(self._questions_by_quiz[quiz.id]))
            )

    def _load(self) -> None:
        try:
            with self.path.open(encoding="utf-8") as source:
                raw = json.load(source)
            bank = Bank.model_validate(raw)
        except (OSError, json.JSONDecodeError, ValidationError, ValueError) as error:
            raise RuntimeError(f"Canonical question bank could not be loaded: {error}") from error
        self.raw = raw
        self.bank = bank

    @property
    def revision(self) -> str:
        serialized = json.dumps(self.raw, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
        digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        return f"sha256-{digest}"

    def list_subjects(self) -> list[Subject]:
        return list(self.bank.subjects)

    def list_quizzes(self, subject_id: str) -> list[tuple[Quiz, int]]:
        return list(self._quizzes_by_subject.get(subject_id, []))

    def get_quiz(self, quiz_id: str) -> tuple[Quiz, int] | None:
        for quiz in self.bank.quizzes:
            if quiz.id == quiz_id:
                return quiz, len(self._questions_by_quiz[quiz_id])
        return None

    def list_questions(self, quiz_id: str) -> list[Question]:
        return list(self._questions_by_quiz.get(quiz_id, []))

    def list_question_ids(self, quiz_id: str) -> list[str]:
        return [question.id for question in self._questions_by_quiz.get(quiz_id, [])]
