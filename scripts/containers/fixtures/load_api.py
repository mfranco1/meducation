"""Mounted only in the disposable load fixture; never included in the API image."""

import json
import logging
from threading import Lock

import uvicorn
from fastapi import Request
from meducation_api.main import create_app
from meducation_api.repositories.postgres import PostgresContentSource
from sqlalchemy import event

lock = Lock()
counts = {}
checked_out = set()
source = None


def source_factory(settings):
    global source
    source = PostgresContentSource(settings)
    engine = source.runtime.engine

    @event.listens_for(engine, "connect")
    def connected(*args):
        with lock:
            counts["connections_established"] = (
                counts.get("connections_established", 0) + 1
            )

    @event.listens_for(engine, "before_cursor_execute")
    def statement(*args):
        with lock:
            counts["sql_statements"] = counts.get("sql_statements", 0) + 1

    @event.listens_for(engine, "checkout")
    def checkout(connection, record, proxy):
        with lock:
            counts["checkouts"] = counts.get("checkouts", 0) + 1
            checked_out.add(id(record))
            counts["checked_out"] = len(checked_out)
            counts["peak_checked_out"] = max(
                counts.get("peak_checked_out", 0), counts["checked_out"]
            )

    @event.listens_for(engine, "checkin")
    def checkin(connection, record):
        with lock:
            # Failed pre-pings/connects can check in without a successful checkout.
            checked_out.discard(id(record))
            counts["checked_out"] = len(checked_out)

    ping = engine.dialect.do_ping

    def measured_ping(connection):
        with lock:
            counts["pre_pings"] = counts.get("pre_pings", 0) + 1
        return ping(connection)

    engine.dialect.do_ping = measured_ping
    return source


app = create_app(source_factory=source_factory)


@app.middleware("http")
async def admission_counts(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        with lock:
            counts["http_requests"] = counts.get("http_requests", 0) + 1
            if response.status_code == 503:
                # Read the request's safe dependency result from operational events
                # via the dedicated logging handler below, not exception text.
                counts["unavailable"] = counts.get("unavailable", 0) + 1
    return response


# Only safe fixed event fields are counted, never retained raw logs.
class Admissions(logging.Handler):
    def emit(self, record):
        try:
            payload = json.loads(record.getMessage())
        except (ValueError, TypeError):
            return
        if payload.get("failure_category") == "pool_timeout":
            with lock:
                counts["pool_admission_failures"] = (
                    counts.get("pool_admission_failures", 0) + 1
                )


logging.getLogger("meducation.operations").addHandler(Admissions())


@app.post("/fixture/reset/{mode}")
def reset(mode: str):
    assert mode in ("cold", "warm")
    engine = source.runtime.engine
    assert engine.pool.checkedout() == 0
    assert not checked_out
    if mode == "cold":
        with source._lock:
            source._catalogs.clear()
        engine.dispose()
    with lock:
        counts.clear()
        counts.update(checked_out=0, peak_checked_out=0, pool_admission_failures=0)
    return {"mode": mode}


@app.get("/fixture/stats")
def stats():
    with lock:
        return {
            **counts,
            "pool_checked_out": source.runtime.engine.pool.checkedout(),
            "pool_size": source.runtime.engine.pool.size(),
            "pool_overflow": source.runtime.engine.pool.overflow(),
            "max_overflow": source.runtime.engine.pool._max_overflow,
            "catalog_cache_entries": len(source._catalogs),
        }


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        workers=1,
        access_log=False,
        proxy_headers=False,
        timeout_graceful_shutdown=10,
    )
