"""Paired content views; application routes share one view per complete response."""

from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Protocol, Self
from uuid import UUID

from meducation_api.repositories.question_bank import (
    FlashcardCatalogRepository,
    QuestionBankRepository,
)


@dataclass(frozen=True)
class ContentView:
    questions: QuestionBankRepository
    flashcards: FlashcardCatalogRepository
    release_id: UUID | None = None
    publication_sequence: int = 0


class ContentSource(Protocol):
    def __enter__(self) -> Self: ...
    def __exit__(self, *args: object) -> None: ...
    def view(self) -> AbstractContextManager[ContentView]: ...
