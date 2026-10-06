from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


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
        self._subjects_by_id = {subject.id: subject for subject in self.bank.subjects}
        self._quizzes_by_id = {quiz.id: quiz for quiz in self.bank.quizzes}
        serialized = json.dumps(self.raw, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
        self._revision = f"sha256-{hashlib.sha256(serialized.encode('utf-8')).hexdigest()}"

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
        return self._revision

    def subject_quiz_summary(self, subject_id: str) -> tuple[int, list[str]]:
        quizzes = self._quizzes_by_subject.get(subject_id, [])
        return len(quizzes), [quiz.id for quiz, _ in quizzes]

    def list_subjects(self) -> list[Subject]:
        return list(self.bank.subjects)

    def has_subject(self, subject_id: str) -> bool:
        return subject_id in self._subjects_by_id

    def list_quizzes(self, subject_id: str) -> list[tuple[Quiz, int]]:
        return list(self._quizzes_by_subject.get(subject_id, []))

    def get_quiz(self, quiz_id: str) -> tuple[Quiz, int] | None:
        quiz = self._quizzes_by_id.get(quiz_id)
        return (quiz, len(self._questions_by_quiz[quiz_id])) if quiz is not None else None

    def list_questions(self, quiz_id: str) -> list[Question]:
        return list(self._questions_by_quiz.get(quiz_id, []))

    def list_question_ids(self, quiz_id: str) -> list[str]:
        return [question.id for question in self._questions_by_quiz.get(quiz_id, [])]


class FlashcardTopic(StoredModel):
    id: str
    subjectId: str
    name: str


class FlashcardDeck(StoredModel):
    id: str
    topicId: str
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
    topics: list[FlashcardTopic]
    decks: list[FlashcardDeck]
    cards: list[Flashcard]

    @model_validator(mode="after")
    def validate_relationships(self) -> FlashcardBank:
        if self.schemaVersion != 1:
            raise ValueError(f"Unsupported flashcard bank schema version: {self.schemaVersion}")
        Bank._unique_ids("topic", [item.id for item in self.topics])
        Bank._unique_ids("deck", [item.id for item in self.decks])
        Bank._unique_ids("flashcard", [item.id for item in self.cards])
        for prefix, records in (("t", self.topics), ("d", self.decks), ("f", self.cards)):
            if any(re.fullmatch(rf"{prefix}[a-zA-Z0-9-]+", item.id) is None for item in records):
                raise ValueError(f"Flashcard IDs must use the {prefix} prefix.")
        if any(not item.name.strip() for item in self.topics):
            raise ValueError("Topic names must not be empty.")
        if any(not item.name.strip() for item in self.decks):
            raise ValueError("Deck names must not be empty.")
        if any(not item.front.strip() or not item.back.strip() for item in self.cards):
            raise ValueError("Flashcard faces must not be empty.")
        topic_ids = {item.id for item in self.topics}
        deck_ids = {item.id for item in self.decks}
        if any(item.topicId not in topic_ids for item in self.decks):
            raise ValueError("A deck references an unknown topic.")
        if any(item.deckId not in deck_ids for item in self.cards):
            raise ValueError("A flashcard references an unknown deck.")
        return self


class FlashcardSubjectSummary(Subject):
    topicCount: int
    deckCount: int
    deckIds: list[str]


class FlashcardCatalogRepository(Protocol):
    @property
    def revision(self) -> str: ...

    def has_subject(self, subject_id: str) -> bool: ...

    def list_subjects(self) -> list[FlashcardSubjectSummary]: ...

    def list_catalog(self, subject_id: str) -> tuple[list[FlashcardTopic], list[tuple[FlashcardDeck, int]]]: ...

    def has_deck(self, deck_id: str) -> bool: ...

    def list_cards(self, deck_id: str) -> list[Flashcard]: ...


class JsonFlashcardCatalogRepository:
    def __init__(self, path: Path, subjects: list[Subject]):
        self.path = path
        self.subjects = subjects
        self.raw: dict[str, Any]
        self.bank: FlashcardBank
        self._load()
        subject_ids = {subject.id for subject in subjects}
        if any(topic.subjectId not in subject_ids for topic in self.bank.topics):
            raise RuntimeError("Canonical flashcard bank references a subject missing from the question bank.")
        self._topics_by_subject: dict[str, list[FlashcardTopic]] = {item.id: [] for item in subjects}
        for topic in self.bank.topics:
            self._topics_by_subject[topic.subjectId].append(topic)
        self._decks_by_topic: dict[str, list[tuple[FlashcardDeck, int]]] = {item.id: [] for item in self.bank.topics}
        self._deck_by_id: dict[str, FlashcardDeck] = {}
        self._cards_by_deck: dict[str, list[Flashcard]] = {item.id: [] for item in self.bank.decks}
        for card in self.bank.cards:
            self._cards_by_deck[card.deckId].append(card)
        for deck in self.bank.decks:
            self._decks_by_topic[deck.topicId].append((deck, len(self._cards_by_deck[deck.id])))
            self._deck_by_id[deck.id] = deck
        self._subjects_by_id = {subject.id: subject for subject in subjects}
        serialized = json.dumps(self.raw, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
        subject_serialized = json.dumps(
            [subject.model_dump() for subject in subjects],
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
        revision_payload = f"flashcards-v1\n{subject_serialized}\n{serialized}"
        self._revision = f"sha256-{hashlib.sha256(revision_payload.encode('utf-8')).hexdigest()}"

    def _load(self) -> None:
        try:
            with self.path.open(encoding="utf-8") as source:
                raw = json.load(source)
            bank = FlashcardBank.model_validate(raw)
        except (OSError, json.JSONDecodeError, ValidationError, ValueError) as error:
            raise RuntimeError(f"Canonical flashcard bank could not be loaded: {error}") from error
        self.raw = raw
        self.bank = bank

    @property
    def revision(self) -> str:
        return self._revision

    def has_subject(self, subject_id: str) -> bool:
        return subject_id in self._subjects_by_id

    def list_subjects(self) -> list[FlashcardSubjectSummary]:
        return [FlashcardSubjectSummary(
            **subject.model_dump(),
            topicCount=len(self._topics_by_subject[subject.id]),
            deckCount=sum(len(self._decks_by_topic[topic.id]) for topic in self._topics_by_subject[subject.id]),
            deckIds=[deck.id for topic in self._topics_by_subject[subject.id] for deck, _ in self._decks_by_topic[topic.id]],
        ) for subject in self.subjects]

    def list_catalog(self, subject_id: str) -> tuple[list[FlashcardTopic], list[tuple[FlashcardDeck, int]]]:
        topics = list(self._topics_by_subject.get(subject_id, []))
        decks = [deck for topic in topics for deck in self._decks_by_topic[topic.id]]
        return topics, decks

    def has_deck(self, deck_id: str) -> bool:
        return deck_id in self._deck_by_id

    def list_cards(self, deck_id: str) -> list[Flashcard]:
        return list(self._cards_by_deck.get(deck_id, []))
