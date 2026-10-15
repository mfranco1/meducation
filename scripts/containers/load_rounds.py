"""Synchronized real HTTP learner launches; safe, bounded measurement output."""

import collections
import concurrent.futures
import json
import math
import random
import threading
import time
import urllib.error
import urllib.request

CONCURRENCY = 20
DEADLINE = 60
SEED = 50420


def request(origin, path, *, revision=None, method="GET", deadline=None):
    timeout = min(15, deadline - time.monotonic()) if deadline else 15
    if timeout <= 0:
        raise TimeoutError("Load round deadline exceeded")
    headers = {"If-Match": '"' + revision + '"'} if revision else {}
    req = urllib.request.Request(origin + path, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, json.load(response), response.headers.get("ETag")
    except urllib.error.HTTPError as error:
        return error.code, json.load(error), error.headers.get("ETag")


def run_round(
    origin,
    name,
    banks,
    *,
    cold=False,
    transition=None,
    expected=None,
    transition_after="catalog",
    progress=None,
):
    request(origin, "/fixture/reset/" + ("cold" if cold else "warm"), method="POST")
    progress = progress if progress is not None else {}
    progress.update(name=name, status="running", deadline_seconds=DEADLINE)
    start = threading.Barrier(CONCURRENCY)
    catalogs = threading.Barrier(CONCURRENCY + 1) if transition else None
    resume = threading.Event()
    kinds = ["quiz", "flashcard"] * (CONCURRENCY // 2)
    random.Random(SEED).shuffle(kinds)
    statuses = collections.Counter()
    status_lock = threading.Lock()
    deadline = time.monotonic() + DEADLINE

    def launch(kind):
        start.wait(timeout=max(0.01, deadline - time.monotonic()))
        began = time.monotonic()
        revision = None

        def get(path):
            status, payload, etag = request(
                origin, path, revision=revision, deadline=deadline
            )
            with status_lock:
                statuses[str(status)] += 1
                progress["http_statuses"] = dict(statuses)
            if status in (409, 503):
                assert status == expected, (name, status)
                code = (
                    "content_revision_changed"
                    if status == 409
                    else "content_unavailable"
                )
                assert payload == {"detail": {"code": code}}
                return None
            assert status == 200, (name, status)
            if revision:
                assert payload["revision"] == revision
            assert etag == '"' + payload["revision"] + '"'
            return payload

        prefix = "/api/v1" + ("/flashcards" if kind == "flashcard" else "")
        catalog = get(prefix + "/subjects")
        assert catalog is not None
        revision = catalog["revision"]
        bank = banks[kind]
        subject = catalog["subjects"][0]
        assert subject["id"] == bank["subjects"][0]["id"]

        def checkpoint():
            catalogs.wait(timeout=max(0.01, deadline - time.monotonic()))
            assert resume.wait(timeout=max(0.01, deadline - time.monotonic()))

        if catalogs and transition_after == "catalog":
            checkpoint()
        member = get(
            prefix
            + "/subjects/"
            + subject["id"]
            + ("/catalog" if kind == "flashcard" else "/quizzes")
        )
        if member is None:
            return {
                "kind": kind,
                "outcome": str(expected),
                "seconds": time.monotonic() - began,
            }
        members_key, bodies_key, ids_key = (
            ("decks", "cards", "cardIds")
            if kind == "flashcard"
            else ("quizzes", "questions", "questionIds")
        )
        parent = member[members_key][0]
        assert parent["id"] == bank[members_key][0]["id"]
        wanted = [
            row
            for row in bank[bodies_key]
            if row["deckId" if kind == "flashcard" else "quizId"] == parent["id"]
        ]
        assert parent[ids_key] == [row["id"] for row in wanted]
        assert parent["cardCount" if kind == "flashcard" else "questionCount"] == len(
            wanted
        )
        if kind == "quiz":
            assert subject["quizIds"] == [row["id"] for row in bank["quizzes"]]
        else:
            assert subject["deckIds"] == [row["id"] for row in bank["decks"]]
        if catalogs and transition_after == "membership":
            checkpoint()
        body = get(
            prefix
            + ("/decks/" if kind == "flashcard" else "/quizzes/")
            + parent["id"]
            + "/"
            + bodies_key
        )
        if body is None:
            return {
                "kind": kind,
                "outcome": str(expected),
                "seconds": time.monotonic() - began,
            }
        assert body[bodies_key] == wanted, (
            "Body content differs from the pinned fixture"
        )
        return {"kind": kind, "outcome": "success", "seconds": time.monotonic() - began}

    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = [executor.submit(launch, kind) for kind in kinds]
        try:
            if catalogs:
                catalogs.wait(timeout=max(0.01, deadline - time.monotonic()))
                transition()
                resume.set()
            results = [
                future.result(timeout=max(0.01, deadline - time.monotonic()))
                for future in futures
            ]
        finally:
            resume.set()
            if catalogs:
                catalogs.abort()
    assert time.monotonic() <= deadline, "Load round exceeded 60 seconds"
    stats = request(origin, "/fixture/stats")[1]
    progress["instrumentation"] = stats
    assert stats["pool_checked_out"] == stats["checked_out"] == 0, stats
    assert 0 < stats["peak_checked_out"] <= stats["pool_size"] == 2, stats
    assert stats["pool_overflow"] <= 0 and stats["max_overflow"] == 0, stats
    assert stats["pool_admission_failures"] == 0, stats
    assert stats["catalog_cache_entries"] <= 2, stats
    assert stats["http_requests"] == sum(statuses.values()), stats
    outcomes = collections.Counter(row["outcome"] for row in results)
    assert outcomes == {str(expected) if expected else "success": CONCURRENCY}, outcomes
    times = sorted(
        row["seconds"] * 1000 for row in results if row["outcome"] == "success"
    )
    latency = (
        {
            "p50": times[math.ceil(len(times) * 0.5) - 1],
            "p95": times[math.ceil(len(times) * 0.95) - 1],
            "max": max(times),
        }
        if times
        else None
    )
    progress["status"] = "pass"
    return {
        "name": name,
        "concurrency": CONCURRENCY,
        "deadline_seconds": DEADLINE,
        "success_latency_ms": latency,
        "elapsed_seconds": DEADLINE - (deadline - time.monotonic()),
        "unexpected_errors": 0,
        "timeouts": 0,
        "http_statuses": dict(statuses),
        "outcomes": dict(outcomes),
        "instrumentation": stats,
        "launches": results,
    }
