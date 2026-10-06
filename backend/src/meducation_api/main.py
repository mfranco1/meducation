from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import cast

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from meducation_api.repositories.question_bank import (
    Flashcard,
    FlashcardCatalogRepository,
    FlashcardDeck,
    FlashcardSubjectSummary,
    JsonFlashcardCatalogRepository,
    JsonQuestionBankRepository,
    Question,
    QuestionBankRepository,
    Quiz,
    Subject,
)
from meducation_api.settings import Settings


class SubjectSummary(Subject):
    quizCount: int
    quizIds: list[str]


class SubjectCatalogResponse(BaseModel):
    revision: str
    subjects: list[SubjectSummary]


class CatalogQuiz(Quiz):
    questionCount: int
    questionIds: list[str]


class QuizCatalogResponse(BaseModel):
    revision: str
    quizzes: list[CatalogQuiz]


class QuizDetailResponse(BaseModel):
    revision: str
    quiz: CatalogQuiz


class QuestionListResponse(BaseModel):
    revision: str
    questions: list[Question]


class FlashcardSubjectListResponse(BaseModel):
    revision: str
    subjects: list[FlashcardSubjectSummary]


class FlashcardDeckSummary(FlashcardDeck):
    cardCount: int
    cardIds: list[str]


class FlashcardCatalogResponse(BaseModel):
    revision: str
    decks: list[FlashcardDeckSummary]


class FlashcardListResponse(BaseModel):
    revision: str
    cards: list[Flashcard]


def create_app(
    settings: Settings | None = None,
    repository_factory: Callable[[Path], QuestionBankRepository] = JsonQuestionBankRepository,
    flashcard_repository_factory: Callable[[Path, list[Subject]], FlashcardCatalogRepository] = JsonFlashcardCatalogRepository,
) -> FastAPI:
    config = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.bank = repository_factory(config.bank_path)
        app.state.subjects = app.state.bank.list_subjects()
        app.state.flashcards = flashcard_repository_factory(config.flashcard_bank_path, app.state.subjects)
        yield
        app.state.bank = None
        app.state.subjects = None
        app.state.flashcards = None

    app = FastAPI(title="Meducation Content API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_methods=["GET", "HEAD"],
        allow_headers=["If-None-Match", "If-Match", "Content-Type"],
    )

    def repository(request: Request) -> QuestionBankRepository:
        bank = getattr(request.app.state, "bank", None)
        if bank is None:
            raise HTTPException(status_code=503, detail={"code": "content_not_ready"})
        return cast(QuestionBankRepository, bank)

    def flashcard_repository(request: Request) -> FlashcardCatalogRepository:
        bank = getattr(request.app.state, "flashcards", None)
        if bank is None:
            raise HTTPException(status_code=503, detail={"code": "content_not_ready"})
        return cast(FlashcardCatalogRepository, bank)

    def content_response(
        build_payload: Callable[[], BaseModel],
        bank: QuestionBankRepository | FlashcardCatalogRepository,
        request: Request,
        revision: str | None,
    ) -> Response:
        etag = f'"{bank.revision}"'
        if revision is not None and revision != bank.revision:
            raise HTTPException(status_code=409, detail={"code": "content_revision_changed"})
        if request.headers.get("if-match") not in (None, etag):
            raise HTTPException(status_code=409, detail={"code": "content_revision_changed"})
        headers = {"ETag": etag, "Cache-Control": "no-cache"}
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=headers)
        return JSONResponse(content=build_payload().model_dump(exclude_unset=True), headers=headers)

    def subject_catalog(bank: QuestionBankRepository, bank_subjects: list[Subject]) -> SubjectCatalogResponse:
        summaries: list[SubjectSummary] = []
        for subject in bank_subjects:
            count, ids = bank.subject_quiz_summary(subject.id)
            summaries.append(SubjectSummary(**subject.model_dump(), quizCount=count, quizIds=ids))
        return SubjectCatalogResponse(revision=bank.revision, subjects=summaries)

    def flashcard_subject_catalog(bank: FlashcardCatalogRepository) -> FlashcardSubjectListResponse:
        return FlashcardSubjectListResponse(revision=bank.revision, subjects=bank.list_subjects())

    def catalog_quiz(bank: QuestionBankRepository, quiz: Quiz, count: int) -> CatalogQuiz:
        return CatalogQuiz(
            **quiz.model_dump(),
            questionCount=count,
            questionIds=bank.list_question_ids(quiz.id),
        )

    @app.get("/health/live", include_in_schema=False)
    def live() -> dict[str, str]:
        return {"status": "live"}

    @app.get("/health/ready", include_in_schema=False)
    def ready(request: Request) -> dict[str, str]:
        if getattr(request.app.state, "bank", None) is None or getattr(request.app.state, "flashcards", None) is None:
            raise HTTPException(status_code=503, detail={"code": "content_not_ready"})
        return {"status": "ready"}

    @app.get("/api/v1/subjects", response_model=SubjectCatalogResponse)
    def list_subjects(request: Request, revision: str | None = None) -> Response:
        bank = repository(request)
        return content_response(lambda: subject_catalog(bank, request.app.state.subjects), bank, request, revision)

    @app.get("/api/v1/flashcards/subjects", response_model=FlashcardSubjectListResponse)
    def list_flashcard_subjects(request: Request, revision: str | None = None) -> Response:
        bank = flashcard_repository(request)
        return content_response(lambda: flashcard_subject_catalog(bank), bank, request, revision)

    @app.get("/api/v1/flashcards/subjects/{subject_id}/catalog", response_model=FlashcardCatalogResponse)
    def list_flashcard_catalog(subject_id: str, request: Request, revision: str | None = None) -> Response:
        bank = flashcard_repository(request)
        if not bank.has_subject(subject_id):
            raise HTTPException(status_code=404, detail={"code": "subject_not_found"})

        def build_catalog() -> FlashcardCatalogResponse:
            decks = bank.list_catalog(subject_id)
            return FlashcardCatalogResponse(
                revision=bank.revision,
                decks=[FlashcardDeckSummary(**deck.model_dump(exclude_none=True), cardCount=count, cardIds=[card.id for card in bank.list_cards(deck.id)]) for deck, count in decks],
            )

        return content_response(build_catalog, bank, request, revision)

    @app.get("/api/v1/flashcards/decks/{deck_id}/cards", response_model=FlashcardListResponse)
    def list_flashcard_cards(deck_id: str, request: Request, revision: str | None = None) -> Response:
        bank = flashcard_repository(request)
        if not bank.has_deck(deck_id):
            raise HTTPException(status_code=404, detail={"code": "deck_not_found"})
        return content_response(
            lambda: FlashcardListResponse(revision=bank.revision, cards=bank.list_cards(deck_id)),
            bank, request, revision,
        )

    @app.get("/api/v1/subjects/{subject_id}/quizzes", response_model=QuizCatalogResponse)
    def list_quizzes(subject_id: str, request: Request, revision: str | None = None) -> Response:
        bank = repository(request)
        if not bank.has_subject(subject_id):
            raise HTTPException(status_code=404, detail={"code": "subject_not_found"})
        return content_response(
            lambda: QuizCatalogResponse(
                revision=bank.revision,
                quizzes=[catalog_quiz(bank, quiz, count) for quiz, count in bank.list_quizzes(subject_id)],
            ),
            bank, request, revision,
        )

    @app.get("/api/v1/quizzes/{quiz_id}", response_model=QuizDetailResponse)
    def get_quiz(quiz_id: str, request: Request, revision: str | None = None) -> Response:
        bank = repository(request)
        found = bank.get_quiz(quiz_id)
        if found is None:
            raise HTTPException(status_code=404, detail={"code": "quiz_not_found"})
        quiz, count = found
        return content_response(
            lambda: QuizDetailResponse(revision=bank.revision, quiz=catalog_quiz(bank, quiz, count)),
            bank, request, revision,
        )

    @app.get(
        "/api/v1/quizzes/{quiz_id}/questions",
        response_model=QuestionListResponse,
        response_model_exclude_unset=True,
    )
    def list_questions(quiz_id: str, request: Request, revision: str | None = None) -> Response:
        bank = repository(request)
        if bank.get_quiz(quiz_id) is None:
            raise HTTPException(status_code=404, detail={"code": "quiz_not_found"})
        return content_response(
            lambda: QuestionListResponse(revision=bank.revision, questions=bank.list_questions(quiz_id)),
            bank, request, revision,
        )

    return app


app = create_app()
