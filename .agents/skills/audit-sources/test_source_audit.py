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


def test_groups_join_wordings_by_doi_or_by_title_and_year():
    doi = "Doe J, Roe A. A Trial of Rest. *J Med*. 2021;1:3-4. doi:10.1/X."
    by_org = "Rest Society. A trial of rest. *J Med*. 2021. doi:10.1/x"
    book = "World Health Organization. *Rest: A Handbook*. World Health Organization; 2020."
    rows = [{"kind": "q", "id": f"q{n}", "version": 1, "subject": "Surgery", "sources": c} for n, c in enumerate([FULL, FULL, doi, by_org, book, book.replace("2020", "2024"), book + " Sec. 2.", SITE])]
    assert sa.groups(sa.audit(rows)) == [[(2, FULL), (1, by_org), (1, doi)]]
    assert sa.groups(sa.audit(rows), "Pediatrics") == []


def test_check_compares_a_doi_record_and_matches_verified_ledger_entries(tmp_path, monkeypatch, capsys):
    record = {
        "author": [{"family": "Doé", "given": "J"}],
        "title": ["A Trial of <i>Rest</i>"],
        "container-title": ["Journal of Medicine"],
        "issued": {"date-parts": [[2020, 12, 1]]},
        "published-print": {"date-parts": [[2021]]},
    }
    cited = FULL + " doi:10.1/x"
    assert sa.crossref_verdict(cited, record) == {"verdict": "real", "by": "crossref"}
    wrong = sa.crossref_verdict("Roe A. A trial of rest. *Lancet*. 2019;1:3. doi:10.1/x", record)
    assert wrong["verdict"] == "mismatch" and wrong["fields"] == ["author", "journal", "year"]
    assert sa.crossref_verdict(cited, None)["fields"] == ["doi"]

    book = "World Health Organization. *Rest: A Handbook*. World Health Organization; 2020."
    ledger, out = tmp_path / "ledger.json", tmp_path / "existence.json"
    sa.dump(ledger, [{"title": "Rest: a handbook", "year": "2020", "status": "verified"}, {"title": "Nelson Textbook of Pediatrics", "year": "2024", "status": "blocked"}])
    sa.dump(out, {SITE: {"verdict": "not found"}})
    monkeypatch.setattr(sa, "crossref", lambda doi: record if doi == "10.1/x" else None)
    sa.check(sa.audit([{"kind": "q", "id": "q1", "version": 1, "subject": "Surgery", "sources": f"{cited}; {book}; {SHORT}; {SITE}"}]), out, ledger)
    assert sa.load(out) == {SITE: {"verdict": "not found"}, cited: {"verdict": "real", "by": "crossref"}, book: {"verdict": "real", "by": "ledger"}}
    assert "    1  no verdict" in capsys.readouterr().out


def test_check_finds_articles_without_a_doi_by_title_and_labels_in_openfda(tmp_path, monkeypatch):
    record = {"DOI": "10.1/x", "author": [{"family": "Doe"}], "title": ["A trial of rest"], "container-title": ["Journal of Medicine"], "issued": {"date-parts": [[2021]]}}
    other = record | {"DOI": "10.1/y", "title": ["A trial of exercise"]}
    by_society = "Rest Society. A trial of rest. *J Med*. 2021."
    unknown = "Doe J. A trial of sleep. *J Med*. 2021."
    label = "Acme Inc. *Restora (restium) tablets prescribing information*. Acme Inc; 2024."
    revised = label.replace("2024", "2019")
    found = {"set_id": "s1", "openfda": {"brand_name": ["RESTORA"]}, "description": "Restium tablet"}
    monkeypatch.setattr(sa, "crossref_search", lambda c: [other, record])
    monkeypatch.setattr(sa, "openfda", lambda field, name, labeler, year: [{"set_id": "s0"}, found] if (field, labeler, year) == ("brand_name", "Acme Inc", "2024") else [])
    out = tmp_path / "existence.json"
    rows = [{"kind": "q", "id": "q1", "version": 1, "subject": "Surgery", "sources": "; ".join([FULL, by_society, unknown, label, revised])}]
    sa.check(sa.audit(rows), out, tmp_path / "ledger.json")
    verdicts = sa.load(out)
    assert verdicts[FULL] == {"verdict": "real", "by": "crossref-title", "doi": "10.1/x"}
    assert (verdicts[by_society]["verdict"], verdicts[by_society]["fields"], verdicts[by_society]["doi"]) == ("mismatch", ["author"], "10.1/x")
    assert verdicts[label] == {"verdict": "real", "by": "openfda", "set_id": "s1"}
    assert unknown not in verdicts and revised not in verdicts
