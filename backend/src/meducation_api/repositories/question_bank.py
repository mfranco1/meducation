from __future__ import annotations

import re
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StoredModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_null(cls, value: Any) -> Any:
        if isinstance(value, dict) and any(item is None for item in value.values()):
            raise ValueError("Optional stored fields must be omitted, not null.")
        return value


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


class RationaleMetadata(StoredModel):
    sources: str | None = None
    answerReviewNote: str | None = None
    provenance: Literal["source_migrated", "ai_draft_reviewed"] | None = None
    reviewedAt: str | None = None
    reviewNote: str | None = None


class QuestionMetadata(StoredModel):
    topic: str | None = None
    subtopic: str | None = None
    system: str | None = None
    difficulty: Literal["easy", "medium", "hard"] | None = None
    questionType: str | None = None
    tags: list[str] | None = None


class Question(StoredModel):
    id: str
    quizId: str
    stem: str
    choices: list[Choice]
    answer: str | None = None
    verifiedAnswer: str | None = None
    answerNote: str | None = None
    rationale: str
    rationaleMeta: RationaleMetadata | None = None
    choiceExplanations: dict[str, str] | None = None
    pearls: list[str] | None = None
    metadata: QuestionMetadata | None = None


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
        if any(not item.name.strip() for item in self.subjects):
            raise ValueError("Subject names must not be empty.")
        if any(not item.name.strip() for item in self.quizzes):
            raise ValueError("Quiz names must not be empty.")
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
            meta = question.rationaleMeta
            if meta is not None and meta.provenance == "ai_draft_reviewed" and not (
                meta.reviewedAt and meta.reviewNote
            ):
                raise ValueError(
                    f"Question {question.id} has incomplete reviewed-draft provenance."
                )
            metadata = question.metadata
            if metadata is not None and not any(
                bool(value) for value in metadata.model_dump(exclude_none=True).values()
            ):
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

    def has_subject(self, subject_id: str) -> bool: ...

    def subject_quiz_summary(self, subject_id: str) -> tuple[int, list[str]]: ...

    def list_quizzes(self, subject_id: str) -> list[tuple[Quiz, int]]: ...

    def get_quiz(self, quiz_id: str) -> tuple[Quiz, int] | None: ...

    def list_questions(self, quiz_id: str) -> list[Question]: ...

    def list_question_ids(self, quiz_id: str) -> list[str]: ...


class FlashcardDeck(StoredModel):
    id: str
    subjectId: str
    name: str
    description: str | None = None


class Flashcard(StoredModel):
    id: str
    deckId: str
    front: str
    back: str
    sources: str | None = None
    reviewNote: str | None = None


class FlashcardBank(StoredModel):
    schemaVersion: int = Field(strict=True)
    decks: list[FlashcardDeck]
    cards: list[Flashcard]

    @model_validator(mode="after")
    def validate_relationships(self) -> FlashcardBank:
        if self.schemaVersion != 2:
            raise ValueError(f"Unsupported flashcard bank schema version: {self.schemaVersion}")
        Bank._unique_ids("deck", [item.id for item in self.decks])
        Bank._unique_ids("flashcard", [item.id for item in self.cards])
        for prefix, records in (("d", self.decks), ("f", self.cards)):
            if any(re.fullmatch(rf"{prefix}[a-zA-Z0-9-]+", item.id) is None for item in records):
                raise ValueError(f"Flashcard IDs must use the {prefix} prefix.")
        if any(not item.name.strip() for item in self.decks):
            raise ValueError("Deck names must not be empty.")
        if any(not item.front.strip() or not item.back.strip() for item in self.cards):
            raise ValueError("Flashcard faces must not be empty.")
        deck_ids = {item.id for item in self.decks}
        if any(item.deckId not in deck_ids for item in self.cards):
            raise ValueError("A flashcard references an unknown deck.")
        return self


class FlashcardSubjectSummary(Subject):
    deckCount: int
    deckIds: list[str]
    emptyDeckIds: list[str]


class FlashcardCatalogRepository(Protocol):
    @property
    def revision(self) -> str: ...

    def has_subject(self, subject_id: str) -> bool: ...

    def list_subjects(self) -> list[FlashcardSubjectSummary]: ...

    def list_catalog(self, subject_id: str) -> list[tuple[FlashcardDeck, int]]: ...

    def has_deck(self, deck_id: str) -> bool: ...

    def list_cards(self, deck_id: str) -> list[Flashcard]: ...
