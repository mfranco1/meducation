"""Paired content views; application routes share one view per complete response."""

from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, Self
from uuid import UUID

from meducation_api.repositories.question_bank import (
    FlashcardCatalogRepository,
    QuestionBankRepository,
    Subject,
)
from meducation_api.settings import Settings


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


class JsonContentSource:
    def __init__(
        self,
        settings: Settings,
        questions: Callable[[Path], QuestionBankRepository],
        flashcards: Callable[[Path, list[Subject]], FlashcardCatalogRepository],
    ):
        self.settings = settings
        self.question_factory = questions
        self.flashcard_factory = flashcards
        self._view: ContentView | None = None

    def __enter__(self) -> Self:
        bank = self.question_factory(self.settings.bank_path)
        self._view = ContentView(
            bank, self.flashcard_factory(self.settings.flashcard_bank_path, bank.list_subjects())
        )
        return self

    def __exit__(self, *args: object) -> None:
        self._view = None

    @contextmanager
    def view(self) -> Iterator[ContentView]:
        if self._view is None:
            raise RuntimeError("JSON content source is not initialized.")
        yield self._view
