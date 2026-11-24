import importlib.util
import json
import sys
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "deck_work", Path(__file__).with_name("deck_work.py")
)
dw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dw)

TOPIC = "Neonatology"


def card(i: int, **extra) -> dict:
    return {
        "id": f"f{i}",
        "version": 2,
        "front": f"Front {i}",
        "back": f"Back {i}",
    } | extra


def setup(tmp: Path) -> Path:
    work = tmp / "subject"
    (work / "neonatology").mkdir(parents=True)
    (work / "obstetrics").mkdir()
    outline = {
        "subject": {"id": "s", "name": "Pediatrics"},
        "topics": [
            {
                "id": "t1",
                "name": TOPIC,
                "questionCount": 40,
                "subtopics": {"Neonatal Jaundice": 10, "Respiratory Distress": 5},
                "decks": [
                    {
                        "id": "d1",
                        "name": "Jaundice",
                        "description": "Bilirubin.",
                        "cards": [card(1, sources="Src."), card(2, back="Old\nback")],
                    },
                    {"id": "d2", "name": "Feeding", "cards": [card(3)]},
                ],
            },
            {"id": "t2", "name": "Empty", "questionCount": 0},
        ],
    }
    plan = {
        "topics": [
            {
                "name": TOPIC,
                "decks": [
                    {
                        "name": "Jaundice",
                        "description": "Bilirubin.",
                        "add": 2,
                        "audit": True,
                        "pages": "2",
                    },
                    {"name": "Sepsis", "description": "New deck.", "add": 1},
                ],
            },
            {"name": "Obstetrics", "decks": [{"name": "Labor", "add": 1}]},
        ]
    }
    (work / "outline.json").write_text(json.dumps(outline))
    (work / "plan.json").write_text(json.dumps(plan))
    (work / "src").mkdir()
    (work / "src" / "main.txt").write_text("page one\fpage two\fpage three")
    (work / "obstetrics" / "cards-1.json").write_text(
        json.dumps({"cards": [{"front": "Staged  front", "back": "Staged back"}]})
    )
    return work


def run(work: Path, *args: str, capsys) -> str:
    sys.argv = [
        "deck_work.py",
        "--work",
        str(work),
        "--ledger",
        str(work / "ledger.json"),
        *args,
    ]
    dw.main()
    return capsys.readouterr().out


def fail(work: Path, *args: str, capsys) -> str:
    with pytest.raises(SystemExit) as exit_info:
        run(work, *args, capsys=capsys)
    return str(exit_info.value)


def write(path: Path, data) -> None:
    path.write_text(json.dumps(data))


def test_coverage_flags_thin_topics_small_decks_and_subtopic_gaps(tmp_path, capsys):
    work = setup(tmp_path)
    out = run(work, "coverage", capsys=capsys)
    assert f"{TOPIC}: 2 decks, 3 cards, 40 questions THIN" in out
    assert "  Jaundice: 2 cards SMALL" in out
    assert "Empty: 0 decks, 0 cards, 0 questions NO-DECKS" in out
    out = run(work, "coverage", TOPIC, capsys=capsys)
    assert "Heuristic" in out
    assert "subtopic Respiratory Distress: 5 questions, 0 cards GAP?" in out
    assert "subtopic Neonatal Jaundice: 10 questions, 0 cards GAP?" in out


def test_brief_writes_fronts_and_a_brief_per_deck_with_cards_to_add(tmp_path, capsys):
    work = setup(tmp_path)
    assert run(work, "brief", TOPIC, capsys=capsys).strip() == "2 briefs"
    fronts = (work / "fronts.txt").read_text()
    assert (
        "## Neonatology › Jaundice\n- Front 1 | Back 1\n- Front 2 | Old back" in fronts
    )
    assert "## (unstaged) Obstetrics › Labor\n- Staged front | Staged back" in fronts
    first = json.loads((work / "neonatology" / "brief-1.json").read_text())
    assert first["existingCards"] == 2 and first["deck"]["add"] == 2
    assert first["quizSubtopics"]["Neonatal Jaundice"] == 10
    assert first["otherDecks"] == [
        {"name": "Feeding", "description": ""},
        {"name": "Sepsis", "description": "New deck."},
    ]
    assert (
        work / "neonatology" / "source-1.txt"
    ).read_text() == "=== page 2 ===\npage two\n"
    assert first["sourcePages"].endswith("source-1.txt")
    second = json.loads((work / "neonatology" / "brief-2.json").read_text())
    assert second["existingCards"] == 0 and second["sourcePages"] == ""
    assert second["outputs"]["cards"].endswith("cards-2.json")


def test_review_input_lists_audited_cards_first_then_new_cards(tmp_path, capsys):
    work = setup(tmp_path)
    folder = work / "neonatology"
    write(
        folder / "cards-1.json",
        {
            "cards": [
                {"front": "N1", "back": "B1"},
                {"front": "N2", "back": "B2", "sources": "S."},
            ]
        },
    )
    (folder / "review-input-9.json").write_text("[]")
    (folder / "review-1.json").write_text("[]")
    out = run(work, "review-input", TOPIC, capsys=capsys)
    assert "review-input-1.json: 2 existing, 2 new" in out
    rows = json.loads((folder / "review-input-1.json").read_text())
    assert [r["ref"] for r in rows] == ["f1", "f2", "new-1", "new-2"]
    assert rows[0]["sources"] == "Src." and "sources" not in rows[1]
    assert (
        not (folder / "review-input-2.json").exists()
        and not (folder / "review-input-9.json").exists()
        and not (folder / "review-1.json").exists()
    )


def staged(work: Path, capsys) -> Path:
    folder = work / "neonatology"
    write(
        folder / "cards-1.json",
        {"cards": [{"front": "N1", "back": "B1"}, {"front": "N2", "back": "B2"}]},
    )
    write(folder / "cards-2.json", {"cards": [{"front": "S1", "back": "B"}]})
    run(work, "review-input", TOPIC, capsys=capsys)
    return folder


def test_build_applies_reviews_and_summarises_fact_changes(tmp_path, capsys):
    work = setup(tmp_path)
    folder = staged(work, capsys)
    write(
        folder / "review-1.json",
        [
            {
                "ref": "f1",
                "severity": "outdated",
                "edits": {"back": "New 1", "front": "Front 1", "sources": "Law."},
                "reason": "Law changed.",
            },
            {
                "ref": "f2",
                "severity": "format",
                "edits": {"back": "Old\nback"},
                "reason": "Same.",
            },
            {
                "ref": "new-1",
                "severity": "unclear",
                "edits": {"front": "N1 fixed"},
                "reason": "Vague.",
            },
            {
                "ref": "new-2",
                "severity": "duplicate",
                "drop": True,
                "reason": "Same as f1.",
            },
        ],
    )
    write(
        folder / "review-2.json",
        [{"ref": "new-1", "severity": "inaccurate", "drop": True, "reason": "Wrong."}],
    )
    write(folder / "sources-review-1.json", [{"source": "Law."}])
    summary = json.loads(run(work, "build", TOPIC, capsys=capsys))
    assert summary["newCards"] == {"Jaundice": 1}
    assert (summary["edits"], summary["deletes"], summary["dropped"]) == (1, 0, 2)
    assert [(f["ref"], f["severity"], f["sources"]) for f in summary["factChanges"]] == [
        ("f1", "outdated", "Law."),
        ("new-1", "inaccurate", ""),
    ]
    stage = json.loads((folder / "stage.json").read_text())
    assert stage["edits"] == [{"id": "f1", "version": 2, "back": "New 1", "sources": "Law."}]
    assert "deletes" not in stage
    assert [d["name"] for d in stage["topics"][0]["decks"]] == ["Jaundice"]
    assert stage["topics"][0]["decks"][0]["cards"] == [
        {"front": "N1 fixed", "back": "B1"}
    ]


def test_build_deletes_existing_cards_and_clears_sources(tmp_path, capsys):
    work = setup(tmp_path)
    folder = staged(work, capsys)
    write(
        folder / "review-1.json",
        [
            {"ref": "f2", "severity": "inaccurate", "drop": True, "reason": "Wrong."},
            {
                "ref": "f1",
                "severity": "format",
                "edits": {"sources": ""},
                "reason": "Unsourced.",
            },
        ],
    )
    write(folder / "review-2.json", [])
    write(folder / "sources-review-1.json", [{"source": "Law."}])
    summary = json.loads(run(work, "build", TOPIC, capsys=capsys))
    stage = json.loads((folder / "stage.json").read_text())
    assert stage["deletes"] == [{"id": "f2", "version": 2}]
    assert stage["edits"] == [{"id": "f1", "version": 2, "sources": ""}]
    assert summary["newCards"] == {"Jaundice": 2, "Sepsis": 1}
    assert {f["ref"] for f in summary["factChanges"]} == {"f2", "f1"}


def test_build_refuses_bad_reviews_and_writes_nothing(tmp_path, capsys):
    work = setup(tmp_path)
    folder = staged(work, capsys)
    assert "review-1.json is missing" in fail(work, "build", TOPIC, capsys=capsys)
    write(
        folder / "review-1.json",
        [
            {
                "ref": "zzz",
                "severity": "unclear",
                "edits": {"front": "x"},
                "reason": "r",
            },
            {"ref": "f1", "severity": "bad", "edits": {"answer": "x"}, "reason": "r"},
            {"ref": "new-1", "severity": "format", "edits": {}, "reason": "r"},
        ],
    )
    write(folder / "review-2.json", [])
    message = fail(work, "build", TOPIC, capsys=capsys)
    assert (
        "zzz" in message
        and "severity must be" in message
        and "edit keys" in message
        and "needs edits or drop" in message
        and "no document checks recorded" in message
    )
    assert not (folder / "stage.json").exists()


def test_build_says_when_nothing_remains(tmp_path, capsys):
    work = setup(tmp_path)
    folder = staged(work, capsys)
    for n, refs in ((1, ["new-1", "new-2"]), (2, ["new-1"])):
        write(
            folder / f"review-{n}.json",
            [
                {"ref": r, "severity": "duplicate", "drop": True, "reason": "r"}
                for r in refs
            ],
        )
    write(folder / "sources-review-1.json", [{"source": "Src."}])
    assert "Nothing to stage" in fail(work, "build", TOPIC, capsys=capsys)


def test_prompt_renders_whole_tokens(tmp_path, capsys, monkeypatch):
    work = setup(tmp_path)
    (work / "notes.md").write_text("Use POGS.")
    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "writer.md").write_text(
        "Topic TOPICNAME. Brief BRIEF. Out CARDS. Notes: NOTES. TOPICNAMES stays. Scratch SCRATCH"
    )
    monkeypatch.setattr(dw, "PROMPTS", tmp_path / "prompts")
    assert "does not exist" in fail(
        work, "prompt", "writer", TOPIC, "--n", "1", capsys=capsys
    )
    run(work, "brief", TOPIC, capsys=capsys)
    assert "exactly one --n" in fail(work, "prompt", "writer", TOPIC, capsys=capsys)
    path = Path(run(work, "prompt", "writer", TOPIC, "--n", "1", capsys=capsys).strip())
    text = path.read_text()
    root = (work / "neonatology").resolve()
    assert (
        f"Topic {TOPIC}. Brief {root}/brief-1.json. Out {root}/cards-1.json. Notes: Use POGS."
        in text
    )
    assert "TOPICNAMES stays" in text and f"{root}/scratch/writer-1/" in text


def test_gate_assembles_the_batch_from_cards_files(tmp_path, capsys):
    work = setup(tmp_path)
    write(
        work / "neonatology" / "cards-2.json", {"cards": [{"front": "S1", "back": "B"}]}
    )
    batch = dw.assemble_batch(dw.Work(work, work / "ledger.json", TOPIC))
    assert batch == {
        "topics": [
            {
                "name": TOPIC,
                "decks": [
                    {
                        "name": "Sepsis",
                        "description": "New deck.",
                        "cards": [{"front": "S1", "back": "B"}],
                    }
                ],
            }
        ]
    }
