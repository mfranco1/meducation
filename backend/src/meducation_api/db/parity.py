"""Read-only selected-release parity against captured inputs in disposable databases."""

import hashlib
import json
from typing import Any
from uuid import UUID

from sqlalchemy import Engine

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.transfer import CapturedPair, _ordered, reconstruct_release
from meducation_api.settings import Settings


def expected_responses(pair: CapturedPair) -> dict[str, dict[str, Any]]:
    """Derive contract expectations without running a second content backend.

    Do not reuse PostgreSQL repositories/response builders as the oracle: a shared
    projection defect could pass on both sides. These are operator verification
    inputs, never an application content source.
    """
    q, f = json.loads(pair.quiz_artifact), json.loads(pair.flashcard_artifact)
    quiz_revision = "sha256-" + hashlib.sha256(pair.quiz_artifact.encode()).hexdigest()
    subjects_text = json.dumps(
        [{key: subject[key] for key in ("id", "name", "accent")} for subject in q["subjects"]],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    flashcard_revision = (
        "sha256-"
        + hashlib.sha256(
            ("flashcards-v2\n" + subjects_text + "\n" + pair.flashcard_artifact).encode()
        ).hexdigest()
    )
    quizzes, decks = [], []
    for quiz in q["quizzes"]:
        ids = [item["id"] for item in q["questions"] if item["quizId"] == quiz["id"]]
        quizzes.append({**quiz, "questionCount": len(ids), "questionIds": ids})
    for deck in f["decks"]:
        ids = [card["id"] for card in f["cards"] if card["deckId"] == deck["id"]]
        decks.append({**deck, "cardCount": len(ids), "cardIds": ids})
    quiz_subjects, flashcard_subjects = [], []
    routes: dict[str, dict[str, Any]] = {}
    for subject in q["subjects"]:
        subject_quizzes = [quiz for quiz in quizzes if quiz["subjectId"] == subject["id"]]
        subject_decks = [deck for deck in decks if deck["subjectId"] == subject["id"]]
        quiz_subjects.append(
            {
                **subject,
                "quizCount": len(subject_quizzes),
                "quizIds": [quiz["id"] for quiz in subject_quizzes],
            }
        )
        flashcard_subjects.append(
            {
                **subject,
                "deckCount": len(subject_decks),
                "deckIds": [deck["id"] for deck in subject_decks],
                "emptyDeckIds": [deck["id"] for deck in subject_decks if not deck["cardCount"]],
            }
        )
        routes[f"/api/v1/subjects/{subject['id']}/quizzes"] = {
            "revision": quiz_revision,
            "quizzes": subject_quizzes,
        }
        routes[f"/api/v1/flashcards/subjects/{subject['id']}/catalog"] = {
            "revision": flashcard_revision,
            "decks": subject_decks,
        }
    routes["/api/v1/subjects"] = {"revision": quiz_revision, "subjects": quiz_subjects}
    routes["/api/v1/flashcards/subjects"] = {
        "revision": flashcard_revision,
        "subjects": flashcard_subjects,
    }
    for quiz in quizzes:
        routes[f"/api/v1/quizzes/{quiz['id']}"] = {"revision": quiz_revision, "quiz": quiz}
        routes[f"/api/v1/quizzes/{quiz['id']}/questions"] = {
            "revision": quiz_revision,
            "questions": [item for item in q["questions"] if item["quizId"] == quiz["id"]],
        }
    for deck in decks:
        routes[f"/api/v1/flashcards/decks/{deck['id']}/cards"] = {
            "revision": flashcard_revision,
            "cards": [card for card in f["cards"] if card["deckId"] == deck["id"]],
        }
    return routes


def verify_parity(
    engine: Engine, settings: Settings, pair: CapturedPair, release_id: UUID
) -> dict[str, Any]:
    if (
        settings.content_source != "postgres"
        or settings.database_environment != "local"
        or engine.url.host not in ("127.0.0.1", "localhost", "::1", "postgres")
        or not (engine.url.database or "").startswith("meducation_verify_")
    ):
        raise ContentDatabaseError(
            "Parity requires PostgreSQL and an explicitly disposable meducation_verify_ database."
        )
    if settings.database_url is None:
        raise ContentDatabaseError("Parity requires the separate reader URL.")
    from sqlalchemy import make_url

    reader = make_url(settings.database_url.get_secret_value())
    if (reader.host, reader.port, reader.database) != (
        engine.url.host,
        engine.url.port,
        engine.url.database,
    ):
        raise ContentDatabaseError(
            "Parity reader and operator must select the same disposable database."
        )
    try:
        from fastapi.testclient import TestClient
    except ImportError:
        raise ContentDatabaseError(
            "Parity requires the development TestClient dependencies."
        ) from None

    from meducation_api.main import create_app

    with engine.connect() as connection:
        qt, ft, manifest = reconstruct_release(connection, release_id)
    q, f = json.loads(pair.quiz_artifact), json.loads(pair.flashcard_artifact)
    _ordered(json.loads(qt), q, "$.quiz")
    _ordered(json.loads(ft), f, "$.flashcard")
    if qt != pair.quiz_artifact or ft != pair.flashcard_artifact:
        raise ContentDatabaseError("Captured artifact bytes differ from reconstruction.")
    routes = expected_responses(pair)
    actual = create_app(settings)
    with TestClient(actual) as candidate:
        for route, wanted in routes.items():
            got = candidate.get(route)
            if got.status_code != 200:
                raise ContentDatabaseError(f"API status differs at {route}.")
            _ordered(got.json(), wanted, route + "$")
            etag = f'"{wanted["revision"]}"'
            if got.headers.get("etag") != etag or got.headers.get("cache-control") != "no-cache":
                raise ContentDatabaseError(f"API headers differ at {route}.")
            for headers, status in (
                ({"If-None-Match": etag}, 304),
                ({"If-Match": '"stale"'}, 409),
            ):
                if candidate.get(route, headers=headers).status_code != status:
                    raise ContentDatabaseError(f"API conditional status differs at {route}.")
        if actual.state.source.runtime.engine.pool.checkedout() != 0:
            raise ContentDatabaseError("Parity leaked reader connections.")
    return {
        "result": "pass",
        "sourceSha256": pair.source_hashes,
        "releaseId": str(release_id),
        "revisions": manifest["revisions"],
        "routesChecked": len(routes),
        "counts": {name: len(q[name]) for name in ("subjects", "quizzes", "questions")}
        | {name: len(f[name]) for name in ("decks", "cards")},
        "checks": [
            "all reconstructed typed fields/optional presence/string/array order",
            "both exact serialized artifacts and revision hashes",
            "all learner catalogs/bodies/counts/membership and ETag/304/409",
            "reader connection cleanup",
        ],
    }
