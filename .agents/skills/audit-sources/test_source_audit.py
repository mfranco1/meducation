import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import source_audit as sa  # noqa: E402

FULL = "Doe J. A trial of rest. *J Med*. 2021;1(2):3-4."
SHORT = "Nelson Textbook of Pediatrics (2024)."
SITE = "Gout. *StatPearls*. StatPearls Publishing; 2005."
ROWS = [
    {"kind": "q", "id": "q1", "version": 3, "subject": "Pediatrics", "sources": f"{SHORT}; {FULL}"},
    {"kind": "q", "id": "q2", "version": 1, "subject": "Surgery", "sources": f"{SHORT}\n{SITE}"},
    {"kind": "f", "id": "f1", "version": 2, "subject": "Pediatrics", "sources": SITE},
    {"kind": "f", "id": "f2", "version": 1, "subject": "Pediatrics", "sources": None},
]


def test_audit_counts_classes_and_flags_and_lists_by_use_and_subject():
    cites = sa.audit(ROWS)
    assert {c: (e["class"], e["flags"]) for c, e in cites.items()} == {SHORT: ("L", []), FULL: ("P", []), SITE: ("P", ["refsite", "pre2010"])}
    text = sa.summary(ROWS, cites)
    assert "questions with sources 2 of 2; cards 1 of 2" in text
    assert "class L: 2 citations, 1 distinct" in text and "flag refsite: 2 citations, 1 distinct" in text
    assert sa.listing(cites, "L") == [(2, SHORT)] and sa.listing(cites, "L", "ped") == [(1, SHORT)]
    assert sa.listing(cites, "refsite", "Surgery") == [(1, SITE)]


def test_plan_replaces_drops_and_dedupes_per_subject_and_refuses_changed_items():
    cites = sa.audit(ROWS)
    rows = [dict(r, version=9) if r["id"] == "q2" else r for r in ROWS]
    batches, refused, unknown = sa.plan(rows, cites, {SHORT: FULL, SITE: None, FULL: "KEEP: fine", "Gone (2020).": None})
    assert batches == {
        "Pediatrics": {
            "q": [{"id": "q1", "version": 3, "rationaleMeta": {"sources": FULL}}],
            "f": [{"id": "f1", "version": 2, "sources": ""}],
        }
    }
    assert refused == ["q2"] and unknown == ["Gone (2020)."]
