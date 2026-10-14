"""Independent journal integrity, retention admission and atomic filesystem boundaries."""

from uuid import uuid4

import pytest
from sqlalchemy import URL, create_engine

from meducation_api.db.allocation_fence import (
    KINDS,
    append_record,
    digest,
    encode,
    issue_range,
    journal_locks,
    read_journal,
)
from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.migrate import migration_head


def record(generation=1, previous=None, lineage=None, floor=1):
    return {
        "version": 1,
        "lineage": str(lineage or uuid4()),
        "generation": generation,
        "previous": previous,
        "schemaHead": migration_head(),
        "recovery": False,
        "floors": dict.fromkeys(KINDS, floor),
        "ceilings": dict.fromkeys(KINDS, floor + 10),
    }


def test_journal_chain_uses_canonical_exact_bytes_and_never_overwrites(tmp_path):
    first = record()
    second = record(2, digest(first), first["lineage"], floor=11)
    append_record(tmp_path, first)
    append_record(tmp_path, second)
    assert read_journal(tmp_path) == [first, second]
    path = tmp_path / "00000000000000000001.json"
    assert path.stat().st_mode & 0o777 == 0o600
    with pytest.raises(FileExistsError):
        append_record(tmp_path, first)
    assert path.read_bytes() == encode(first)


@pytest.mark.parametrize(
    "fault",
    [
        "missing",
        "truncated",
        "duplicate",
        "parent",
        "rewind",
        "lineage",
        "lineage-type",
        "bool",
        "extra",
        "symlink",
    ],
)
def test_journal_refuses_incomplete_or_ambiguous_evidence(tmp_path, fault):
    first = record()
    second = record(2, digest(first), first["lineage"], floor=11)
    append_record(tmp_path, first)
    if fault == "parent":
        second["previous"] = "0" * 64
    elif fault == "rewind":
        second["floors"]["i"] = 2
    elif fault == "lineage":
        second["lineage"] = str(uuid4())
    elif fault == "lineage-type":
        second["lineage"] = 99
    elif fault == "bool":
        second["generation"] = True
    elif fault == "extra":
        second["unknown"] = "private"
    if fault == "bool":
        (tmp_path / "00000000000000000002.json").write_bytes(encode(second))
    else:
        append_record(tmp_path, second)
    path = tmp_path / "00000000000000000001.json"
    if fault == "missing":
        path.unlink()
    elif fault == "truncated":
        path.write_bytes(b"{")
    elif fault == "duplicate":
        path.write_bytes(encode(first).replace(b'"version":1', b'"version":1,"version":1'))
    elif fault == "symlink":
        raw = path.read_bytes()
        path.unlink()
        outside = tmp_path.parent / "outside-record.json"
        outside.write_bytes(raw)
        path.symlink_to(outside)
    with pytest.raises((ContentDatabaseError, ValueError)):
        read_journal(tmp_path)


def test_journal_lock_and_destination_protection(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir(mode=0o700)
    b.mkdir(mode=0o700)
    with (
        journal_locks(a, b),
        pytest.raises(ContentDatabaseError, match="lock"),
        journal_locks(a, b),
    ):
        pass
    with pytest.raises(ContentDatabaseError, match="distinct"), journal_locks(a, a):
        pass
    b.chmod(0o755)
    with pytest.raises(ContentDatabaseError, match="private"), journal_locks(a, b):
        pass


def test_rehearsal_cannot_admit_a_routine_database_or_substitute_for_retention(tmp_path):
    engine = create_engine(
        URL.create("postgresql+psycopg", host="127.0.0.1", database="meducation")
    )
    try:
        args = {
            "primary": tmp_path,
            "independent": tmp_path,
            "size": 10,
            "reason": "Boundary fixture",
            "recovery": False,
        }
        with pytest.raises(ContentDatabaseError, match="isolated"):
            issue_range(engine, **args, rehearsal=True)
        with pytest.raises(ContentDatabaseError, match="off-device"):
            issue_range(engine, **args)
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "host,database",
    [("db.example.com", "meducation_authority"), ("127.0.0.1", "meducation_test_content")],
)
def test_local_only_retention_refuses_other_targets_before_connecting(tmp_path, host, database):
    engine = create_engine(URL.create("postgresql+psycopg", host=host, database=database))
    try:
        with pytest.raises(ContentDatabaseError, match="designated loopback authority"):
            issue_range(
                engine,
                primary=tmp_path,
                independent=tmp_path,
                size=10,
                recovery=False,
                reason="local-only",
                local_copy_only=True,
            )
    finally:
        engine.dispose()


def test_retention_policy_cannot_combine_local_and_offdevice_attestations(tmp_path):
    engine = create_engine(
        URL.create("postgresql+psycopg", host="127.0.0.1", database="meducation_authority")
    )
    try:
        with pytest.raises(ContentDatabaseError, match="exactly one"):
            issue_range(
                engine,
                primary=tmp_path,
                independent=tmp_path,
                size=10,
                recovery=False,
                reason="local-only",
                local_copy_only=True,
                independent_copy_confirmed=True,
            )
    finally:
        engine.dispose()


def test_authority_import_cli_requires_explicit_review_before_connecting(monkeypatch, capsys):
    from types import SimpleNamespace

    from pydantic import SecretStr

    from meducation_api.db import cli

    url = "postgresql+psycopg://meducation_operator:private-placeholder@127.0.0.1:5433/meducation_authority?sslmode=disable"
    monkeypatch.setattr(
        "sys.argv",
        [
            "meducation-db",
            "import-pair",
            "--quiz-file",
            "q.json",
            "--flashcard-file",
            "f.json",
            "--repository",
            ".",
            "--operation-id",
            str(uuid4()),
            "--actor",
            "operator",
            "--reason",
            "review",
        ],
    )
    monkeypatch.setattr(cli, "capture_pair", lambda *a, **kw: object())
    monkeypatch.setattr(
        cli,
        "Settings",
        lambda: SimpleNamespace(database_environment="local", operator_database_url=SecretStr(url)),
    )
    monkeypatch.setattr(
        cli,
        "create_database_engine",
        lambda *a, **kw: pytest.fail("Unreviewed import attempted a connection"),
    )
    with pytest.raises(SystemExit):
        cli.main()
    error = capsys.readouterr().err
    assert "--reviewed-recovery-import" in error
    assert "private-placeholder" not in error
