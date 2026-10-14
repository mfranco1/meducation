"""Verified-editor orchestration; private SQL is guarded and bound, never arbitrary DML."""

import hashlib
import json
from typing import Any
from uuid import UUID

from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.auth.oidc import AuthError
from meducation_api.auth.store import Principal, SessionStore
from meducation_api.content_policy import PairedContentValidator, ValidatedPair

ERRORS = {
    "P4010": (401, "session_expired"),
    "P4030": (403, "editor_denied"),
    "P4031": (403, "fresh_auth_required"),
    "P4040": (404, "target_unavailable"),
    "P4090": (409, "draft_or_publication_stale"),
    "P4091": (409, "operation_reused"),
    "P4092": (409, "undo_stale"),
    "P4093": (409, "draft_base_stale"),
    "P4094": (409, "draft_uninitialized"),
    "P4220": (422, "reservation_required"),
}


def encoded(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def documents(pair: dict[str, Any]) -> tuple[str, str]:
    if set(pair) != {"quizzes", "flashcards"}:
        raise AuthError(400, "invalid_admin_envelope")
    return tuple(
        json.dumps(pair[k], ensure_ascii=False, allow_nan=False, indent=2) + "\n"
        for k in ("quizzes", "flashcards")
    )  # type: ignore[return-value]


def digests(q: str, f: str, revisions: dict[str, Any]) -> dict[str, Any]:
    return {
        "quizSha256": hashlib.sha256(q.encode()).hexdigest(),
        "flashcardSha256": hashlib.sha256(f.encode()).hexdigest(),
        "quizRevision": revisions["quiz_revision"],
        "flashcardRevision": revisions["flashcard_revision"],
    }


def wire_result(value: dict[str, Any]) -> dict[str, Any]:
    names = {
        "draft_revision": "draftRevision",
        "publication_sequence": "publicationSequence",
        "release_id": "releaseId",
        "quiz_revision": "quizRevision",
        "flashcard_revision": "flashcardRevision",
    }
    return {
        names.get(k, k): str(v) if k in ("draft_revision", "publication_sequence") else v
        for k, v in value.items()
    }


def snapshot(raw: dict[str, Any], pair: dict[str, str]) -> dict[str, Any]:
    q, f = pair["quizDocument"], pair["flashcardDocument"]
    pub = raw["publishedDigests"]
    return {
        "contractVersion": 1,
        "pair": {"quizzes": json.loads(q), "flashcards": json.loads(f)},
        "draft": {
            "revision": raw["revision"],
            "baseReleaseId": raw["baseReleaseId"],
            "basePublicationSequence": raw["baseSequence"],
            "digests": digests(q, f, raw["digests"]),
        },
        "publication": {
            "releaseId": raw["releaseId"],
            "sequence": raw["sequence"],
            "digests": None
            if pub is None
            else {
                "quizRevision": pub["quiz_revision"],
                "flashcardRevision": pub["flashcard_revision"],
            },
        },
        "undo": raw["undo"],
        "capabilities": {
            "reserve": True,
            "preview": True,
            "save": True,
            "undo": raw["undo"]["available"],
            "reset": raw["releaseId"] is not None,
            "publish": raw["baseSequence"] == raw["sequence"]
            and raw["baseReleaseId"] == raw["releaseId"],
            "activate": True,
            "export": True,
            "requiresFreshAuthentication": [
                "bulkDestructiveSave",
                "bulkDestructiveUndo",
                "reset",
                "publish",
                "activate",
                "export",
            ],
        },
    }


def impact(before: dict[str, str], after: ValidatedPair) -> dict[str, Any]:
    old = [json.loads(before["quizDocument"]), json.loads(before["flashcardDocument"])]
    new = [json.loads(after.quiz_artifact), json.loads(after.flashcard_artifact)]
    ids: dict[str, list[str]] = {"created": [], "updated": [], "deleted": []}
    counts: dict[str, Any] = {}
    for index, collections in ((0, ("subjects", "quizzes", "questions")), (1, ("decks", "cards"))):
        for collection in collections:
            prior = {r["id"]: (i, r) for i, r in enumerate(old[index][collection])}
            current = {r["id"]: (i, r) for i, r in enumerate(new[index][collection])}
            created = [id for id in current if id not in prior]
            deleted = [id for id in prior if id not in current]
            updated = [id for id in current if id in prior and current[id] != prior[id]]
            counts[collection] = {
                "before": len(prior),
                "after": len(current),
                "created": len(created),
                "updated": len(updated),
                "deleted": len(deleted),
            }
            for kind, values in (("created", created), ("updated", updated), ("deleted", deleted)):
                ids[kind].extend(values)
    return {
        "counts": counts,
        "affectedIds": {k: v[:100] for k, v in ids.items()},
        "totalAffected": {k: len(v) for k, v in ids.items()},
        "truncated": any(len(v) > 100 for v in ids.values()),
        "requiresFreshAuthentication": len(ids["deleted"]) > 1,
    }


class EditorService:
    def __init__(
        self,
        engine: Engine,
        store: SessionStore,
        principal: Principal,
        validator: PairedContentValidator | None = None,
    ):
        self.engine = engine
        self.store = store
        self.principal = principal
        self.validator = validator or PairedContentValidator()

    def _call(self, expression: str, values: dict[str, Any], *, mutation: bool = False) -> Any:
        self.store.recheck(self.principal)
        parameters = {
            "session": self.principal.token_hash,
            "epoch": self.store.config.policy_epoch,
            "who": self.principal.actor,
            **values,
        }
        try:
            with self.engine.begin() if mutation else self.engine.connect() as c:
                c.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
                c.exec_driver_sql("SET LOCAL statement_timeout = '120s'")
                return c.execute(text(expression), parameters).scalar_one()
        except SQLAlchemyError as error:
            state = getattr(getattr(error, "orig", None), "sqlstate", None)
            status, code = ERRORS.get(str(state), (503, "authoring_unavailable"))
            raise AuthError(status, code) from None

    def read(self, kind: str, arg: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._call(
            "SELECT content.editor_read(:session,:epoch,:who,:kind,CAST(:arg AS jsonb))",
            {"kind": kind, "arg": encoded(arg or {})},
        )  # type: ignore[no-any-return]

    def context(self) -> dict[str, Any]:
        value = self.read("context")
        if value["revision"] == "0":
            raise AuthError(409, "draft_uninitialized")
        return value

    @staticmethod
    def expected(ctx: dict[str, Any], command: dict[str, Any]) -> None:
        if (
            ctx["revision"] != command["expected"]["draftRevision"]
            or ctx["sequence"] != command["expected"]["publicationSequence"]
        ):
            raise AuthError(409, "draft_or_publication_stale")

    def load(self) -> dict[str, Any]:
        ctx = self.context()
        return snapshot(ctx, ctx)

    @staticmethod
    def normalized(command: dict[str, Any]) -> dict[str, Any]:
        value = {k: v for k, v in command.items() if k != "operationId"}
        if "pair" in value:
            q, f = documents(value.pop("pair"))
            value.update(quizDocument=q, flashcardDocument=f)
            value["reservationIds"] = sorted(value["reservationIds"])
            value["intent"] = {
                "reservations": sorted(
                    value["intent"]["reservations"], key=lambda b: b["reservationId"]
                )
            }
        return value

    def replay(self, action: str, command: dict[str, Any]) -> dict[str, Any] | None:
        normalized = self.normalized(command)
        return self._call(
            "SELECT content.editor_replay(:session,:epoch,:who,:op,:action,CAST(:request AS jsonb))",
            {"op": UUID(command["operationId"]), "action": action, "request": encoded(normalized)},
        )  # type: ignore[no-any-return]

    def _preview(
        self, action: str, command: dict[str, Any], *, release_id: str | None = None
    ) -> tuple[dict[str, Any], ValidatedPair, str, dict[str, Any]]:
        ctx = self.context()
        self.expected(ctx, command)
        if action == "save":
            pair = self.validator.validate(command["pair"])
            # This read-only command also checks reservation ownership/destination at preview.
            self._call(
                "SELECT content.editor_check_creates(:session,:epoch,:who,:q,:f,CAST(:ids AS uuid[]),CAST(:intent AS jsonb),:draft,:publication)",
                {
                    "q": pair.quiz_artifact,
                    "f": pair.flashcard_artifact,
                    "ids": [UUID(v) for v in command["reservationIds"]],
                    "intent": encoded(command["intent"]),
                    "draft": int(ctx["revision"]),
                    "publication": int(ctx["sequence"]),
                },
            )
        elif action == "publish":
            if ctx["baseSequence"] != ctx["sequence"] or ctx["baseReleaseId"] != ctx["releaseId"]:
                raise AuthError(409, "draft_base_stale")
            pair = self.validator.documents(ctx["quizDocument"], ctx["flashcardDocument"])
        else:
            selected = self.read("release", {"releaseId": release_id})
            pair = self.validator.documents(selected["quizDocument"], selected["flashcardDocument"])
        fp = hashlib.sha256(
            encoded(
                [
                    "meducation-editor-preview-v1",
                    action,
                    self.principal.actor,
                    command["reason"],
                    ctx["revision"],
                    ctx["sequence"],
                    ctx["baseReleaseId"],
                    ctx["baseSequence"],
                    ctx["releaseId"],
                    pair.quiz_artifact,
                    pair.flashcard_artifact,
                    pair.policy_version,
                    sorted(command.get("reservationIds", [])),
                    command.get("intent"),
                    release_id,
                ]
            ).encode()
        ).hexdigest()
        if action in ("publish", "activate"):
            before = (
                self.read("release", {"releaseId": ctx["releaseId"]})
                if ctx["releaseId"]
                else {
                    "quizDocument": '{"subjects":[],"quizzes":[],"questions":[]}',
                    "flashcardDocument": '{"decks":[],"cards":[]}',
                }
            )
        else:
            before = ctx
        review = impact(before, pair)
        return ctx, pair, fp, review

    def preview(
        self, action: str, command: dict[str, Any], *, release_id: str | None = None
    ) -> dict[str, Any]:
        _, pair, fp, review = self._preview(action, command, release_id=release_id)
        return {
            "previewFingerprint": fp,
            "validation": {"policyVersion": pair.policy_version, "warnings": pair.warnings},
            "digests": {
                "quizSha256": hashlib.sha256(pair.quiz_artifact.encode()).hexdigest(),
                "flashcardSha256": hashlib.sha256(pair.flashcard_artifact.encode()).hexdigest(),
            },
            **review,
        }

    def mutate(
        self, action: str, command: dict[str, Any], *, release_id: str | None = None
    ) -> dict[str, Any]:
        if release_id:
            command = {**command, "releaseId": release_id}
        result = self.replay(action, command)
        if result is None:
            normalized = self.normalized(command)
            if action in ("save", "publish", "activate"):
                ctx, pair, fp, review = self._preview(
                    action if action != "activate" else "activate", command, release_id=release_id
                )
                if fp != command["previewFingerprint"]:
                    raise AuthError(409, "preview_stale")
                normalized.update(
                    quizDocument=pair.quiz_artifact, flashcardDocument=pair.flashcard_artifact
                )
                self.store.recheck(
                    self.principal,
                    fresh=action in ("publish", "activate")
                    or review["requiresFreshAuthentication"],
                )
                version = pair.policy_version
            elif action in ("undo", "reset"):
                ctx = self.context()
                self.expected(ctx, command)
                if action == "reset" and ctx["releaseId"] is None:
                    raise AuthError(409, "publication_required")
                selected = (
                    self.read("undoPair", {"targetRevision": command["targetRevision"]})
                    if action == "undo"
                    else self.read("release", {"releaseId": ctx["releaseId"]})
                )
                pair = self.validator.documents(
                    selected["quizDocument"], selected["flashcardDocument"]
                )
                self.store.recheck(
                    self.principal,
                    fresh=action == "reset" or impact(ctx, pair)["requiresFreshAuthentication"],
                )
                normalized.update(
                    quizDocument=pair.quiz_artifact, flashcardDocument=pair.flashcard_artifact
                )
                version = pair.policy_version
            else:
                version = 1
            result = self._call(
                "SELECT content.editor_apply(:session,:epoch,:who,:op,:action,CAST(:request AS jsonb),:policy)",
                {
                    "op": UUID(command["operationId"]),
                    "action": action,
                    "request": encoded(normalized),
                    "policy": version,
                },
                mutation=True,
            )
        response = {"operationId": command["operationId"], "result": wire_result(result["result"])}
        if "snapshot" in result:
            pair_docs = self.read("operationPair", {"operationId": command["operationId"]})
            response["snapshot"] = snapshot(result["snapshot"], pair_docs)
        return response
