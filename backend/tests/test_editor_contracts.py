"""Optional wire fields are omitted; null cannot silently normalize a command."""

from uuid import uuid4

import pytest

from meducation_api.admin.contracts import Export, Reservation, parse_contract
from meducation_api.auth.oidc import AuthError


def reservation():
    return {
        "operationId": str(uuid4()),
        "expected": {"draftRevision": "1", "publicationSequence": "0"},
        "reason": "Create a reviewed subject",
        "counts": {"s": 1},
        "intent": {"slots": [{"kind": "s", "count": 1}]},
    }


def test_subject_parent_must_be_omitted_instead_of_normalizing_explicit_null():
    value = reservation()
    assert parse_contract(Reservation, value) == value
    value["intent"]["slots"][0]["parentId"] = None
    with pytest.raises(AuthError) as error:
        parse_contract(Reservation, value)
    assert error.value.status == 400


def test_draft_export_does_not_accept_an_explicit_null_release_selector():
    value = {
        "target": "draft",
        "draftRevision": "1",
        "expected": {"draftRevision": "1", "publicationSequence": "0"},
    }
    assert parse_contract(Export, value) == value
    value["releaseId"] = None
    with pytest.raises(AuthError) as error:
        parse_contract(Export, value)
    assert error.value.code == "invalid_admin_envelope"
