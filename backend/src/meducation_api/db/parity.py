"""Read-only selected-release parity against captured inputs in disposable databases."""

import json
import tempfile
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import Engine

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.transfer import CapturedPair, _ordered, reconstruct_release
from meducation_api.settings import Settings


def verify_parity(
    engine: Engine, settings: Settings, pair: CapturedPair, release_id: UUID
) -> dict[str, Any]:
    if (
        settings.database_environment != "local"
        or engine.url.host not in ("127.0.0.1", "localhost", "::1", "postgres")
        or not (engine.url.database or "").startswith("meducation_verify_")
    ):
        raise ContentDatabaseError(
            "Parity requires an explicitly disposable meducation_verify_ database."
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
    routes = ["/api/v1/subjects", "/api/v1/flashcards/subjects"]
    for subject in q["subjects"]:
        routes.extend(
            [
                f"/api/v1/subjects/{subject['id']}/quizzes",
                f"/api/v1/flashcards/subjects/{subject['id']}/catalog",
            ]
        )
    for quiz in q["quizzes"]:
        routes.extend([f"/api/v1/quizzes/{quiz['id']}", f"/api/v1/quizzes/{quiz['id']}/questions"])
    routes.extend(f"/api/v1/flashcards/decks/{deck['id']}/cards" for deck in f["decks"])
    with tempfile.TemporaryDirectory(prefix="meducation-parity-") as folder:
        qp, fp = Path(folder) / "q.json", Path(folder) / "f.json"
        qp.write_text(pair.quiz_artifact)
        fp.write_text(pair.flashcard_artifact)
        reference = create_app(
            settings.model_copy(
                update={"content_source": "json", "bank_path": qp, "flashcard_bank_path": fp}
            )
        )
        actual = create_app(settings)
        with TestClient(reference) as expected, TestClient(actual) as candidate:
            for route in routes:
                wanted, got = expected.get(route), candidate.get(route)
                if wanted.status_code != 200 or got.status_code != 200:
                    raise ContentDatabaseError(f"API status differs at {route}.")
                _ordered(got.json(), wanted.json(), route + "$")
                if (
                    got.headers.get("etag") != wanted.headers.get("etag")
                    or got.headers.get("cache-control") != "no-cache"
                ):
                    raise ContentDatabaseError(f"API headers differ at {route}.")
                for headers, status in (
                    ({"If-None-Match": wanted.headers["etag"]}, 304),
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
