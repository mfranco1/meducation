from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from meducation_api.repositories.question_bank import (
    JsonQuestionBankRepository,
    Question,
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


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.bank = JsonQuestionBankRepository(config.bank_path)
        yield
        app.state.bank = None

    app = FastAPI(title="Meducation Content API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_methods=["GET", "HEAD"],
        allow_headers=["If-None-Match", "If-Match", "Content-Type"],
    )

    def repository(request: Request) -> JsonQuestionBankRepository:
        bank = getattr(request.app.state, "bank", None)
        if bank is None:
            raise HTTPException(status_code=503, detail={"code": "content_not_ready"})
        return bank

    def content_response(
        payload: dict[str, Any],
        bank: JsonQuestionBankRepository,
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
        return JSONResponse(content=payload, headers=headers)

    @app.get("/health/live", include_in_schema=False)
    def live() -> dict[str, str]:
        return {"status": "live"}

    @app.get("/health/ready", include_in_schema=False)
    def ready(request: Request) -> dict[str, str]:
        if getattr(request.app.state, "bank", None) is None:
            raise HTTPException(status_code=503, detail={"code": "content_not_ready"})
        return {"status": "ready"}

    @app.get("/api/v1/subjects", response_model=SubjectCatalogResponse)
    def list_subjects(request: Request, revision: str | None = None) -> Response:
        bank = repository(request)
        return content_response(
            {
                "revision": bank.revision,
                "subjects": [
                    {
                        **item.model_dump(),
                        "quizCount": bank.subject_quiz_summary(item.id)[0],
                        "quizIds": bank.subject_quiz_summary(item.id)[1],
                    }
                    for item in bank.list_subjects()
                ],
            },
            bank,
            request,
            revision,
        )

    @app.get("/api/v1/subjects/{subject_id}/quizzes", response_model=QuizCatalogResponse)
    def list_quizzes(subject_id: str, request: Request, revision: str | None = None) -> Response:
        bank = repository(request)
        if not any(subject.id == subject_id for subject in bank.list_subjects()):
            raise HTTPException(status_code=404, detail={"code": "subject_not_found"})
        quizzes = [
            {
                **quiz.model_dump(),
                "questionCount": count,
                "questionIds": bank.list_question_ids(quiz.id),
            }
            for quiz, count in bank.list_quizzes(subject_id)
        ]
        return content_response(
            {"revision": bank.revision, "quizzes": quizzes}, bank, request, revision
        )

    @app.get("/api/v1/quizzes/{quiz_id}", response_model=QuizDetailResponse)
    def get_quiz(quiz_id: str, request: Request, revision: str | None = None) -> Response:
        bank = repository(request)
        found = bank.get_quiz(quiz_id)
        if found is None:
            raise HTTPException(status_code=404, detail={"code": "quiz_not_found"})
        quiz, count = found
        payload = {
            "revision": bank.revision,
            "quiz": {
                **quiz.model_dump(),
                "questionCount": count,
                "questionIds": bank.list_question_ids(quiz_id),
            },
        }
        return content_response(payload, bank, request, revision)

    @app.get(
        "/api/v1/quizzes/{quiz_id}/questions",
        response_model=QuestionListResponse,
        response_model_exclude_unset=True,
    )
    def list_questions(quiz_id: str, request: Request, revision: str | None = None) -> Response:
        bank = repository(request)
        if bank.get_quiz(quiz_id) is None:
            raise HTTPException(status_code=404, detail={"code": "quiz_not_found"})
        questions = [item.model_dump(exclude_unset=True) for item in bank.list_questions(quiz_id)]
        return content_response(
            {"revision": bank.revision, "questions": questions}, bank, request, revision
        )

    return app


app = create_app()
