"""Parity refuses routine or mismatched databases before opening a connection."""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy import make_url

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.db.parity import verify_parity
from meducation_api.db.transfer import CapturedPair
from meducation_api.settings import Settings


@pytest.mark.parametrize(
    "database,reader",
    [
        ("meducation", "meducation"),
        ("meducation_verify_copy", "other"),
    ],
)
def test_parity_target_guard_does_not_connect(database, reader):
    engine = MagicMock()
    engine.url = make_url(
        f"postgresql+psycopg://meducation_operator:fixture-password@127.0.0.1:5433/{database}?sslmode=disable"
    )
    settings = Settings(
        _env_file=None,
        content_source="postgres",
        database_environment="local",
        database_url=f"postgresql+psycopg://meducation_reader:fixture-reader-password@127.0.0.1:5433/{reader}?sslmode=disable",
    )
    pair = CapturedPair("{}", "{}", "a" * 64, "b" * 64, 0)
    with pytest.raises(ContentDatabaseError):
        verify_parity(engine, settings, pair, uuid4())
    engine.connect.assert_not_called()
