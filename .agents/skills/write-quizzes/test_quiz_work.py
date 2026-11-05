import json
import subprocess
import sys
from pathlib import Path

TOOL = Path(__file__).with_name("quiz_work.py")
TOPIC, QUIZ = "Nephrology", "Glomerular Disease"


def item(n: int, answer: str = "A") -> dict:
    return {
        "stem": f"Stem number {n}?",
        "choices": [f"c{n}a", f"c{n}b", f"c{n}c", f"c{n}d"],
        "answer": answer,
        "rationale": "Because.",
        "pearls": ["Pearl."],
        "metadata": {"subtopic": "S"},
    }


def ref(n: int) -> str:
    return f"{TOPIC} › {QUIZ} › {n}"


def setup(tmp: Path, count: int = 12) -> Path:
    topic_dir = tmp / "subject" / "nephrology"
    topic_dir.mkdir(parents=True)
    keys = "ABCD" * (count // 4 + 1)
    batch = {
        "topics": [
            {
                "name": TOPIC,
                "quizzes": [
                    {
                        "name": QUIZ,
                        "items": [item(n, keys[n - 1]) for n in range(1, count + 1)],
                    }
                ],
            }
        ]
    }
    (topic_dir / "batch.json").write_text(json.dumps(batch))
    (tmp / "subject" / "blueprint.json").write_text(
        json.dumps(
            {"topics": [{"name": TOPIC, "quizzes": [{"name": QUIZ, "target": count}]}]}
        )
    )
    return topic_dir


def run(tmp: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-I", str(TOOL), "--work", str(tmp / "subject"), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def answer(
    topic_dir: Path, round_name: str, answers: list[str], defensible: dict | None = None
) -> None:
    rows = json.loads((topic_dir / "blind" / round_name / "items-1.json").read_text())
    out = [
        {
            "ref": r["ref"],
            "answer": a,
            "defensible": (defensible or {}).get(i + 1, []),
            "note": "",
        }
        for i, (r, a) in enumerate(zip(rows, answers))
    ]
    (topic_dir / "blind" / round_name / "answers-1.json").write_text(json.dumps(out))


def keys(topic_dir: Path, name: str = "batch.json") -> list[str]:
    batch = json.loads((topic_dir / name).read_text())
    return [i["answer"] for i in batch["topics"][0]["quizzes"][0]["items"]]


def test_check_blind_refuses_answers_shifted_by_one_item(tmp_path):
    topic_dir = setup(tmp_path)
    assert (
        run(
            tmp_path, "blind", TOPIC, "--batch", "batch.json", "--round", "r1"
        ).returncode
        == 0
    )
    k = keys(topic_dir)
    answer(topic_dir, "r1", [k[0]] + k[:-1])  # each answer belongs to the previous item
    result = run(tmp_path, "check-blind", TOPIC, "--round", "r1")
    assert result.returncode != 0
    assert "misaligned, rerun this file" in result.stderr


def test_triage_escalates_blind_disagreements_not_writer_unverified_facts(tmp_path):
    topic_dir = setup(tmp_path)
    run(tmp_path, "blind", TOPIC, "--batch", "batch.json", "--round", "r1")
    k = keys(topic_dir)
    k_blind = list(k)
    k_blind[2] = "D" if k[2] != "D" else "A"
    answer(topic_dir, "r1", k_blind)
    (topic_dir / "unverified-1.json").write_text(
        json.dumps([{"item": 5, "fact": "IPNA 2022 threshold"}])
    )
    assert run(tmp_path, "check-blind", TOPIC, "--round", "r1").returncode == 0
    assert (
        run(
            tmp_path, "triage", TOPIC, "--batch", "batch.json", "--round", "r1"
        ).returncode
        == 0
    )
    escalated = {
        e["ref"] for e in json.loads((topic_dir / "escalated.json").read_text())
    }
    assert escalated == {ref(3)}


def test_route_standards_keeps_self_evident_corrections_and_routes_drops_and_accuracy_edits(
    tmp_path,
):
    topic_dir = setup(tmp_path)
    (topic_dir / "escalated.json").write_text("[]")
    (topic_dir / "review-standards.json").write_text(
        json.dumps(
            [
                {
                    "ref": ref(1),
                    "severity": "flaw",
                    "edits": {"rationale": "Better."},
                    "reason": "format",
                },
                {
                    "ref": ref(2),
                    "severity": "inaccurate",
                    "edits": {"rationale": "Changed fact."},
                    "reason": "dose",
                },
                {"ref": ref(3), "drop": True, "reason": "repeats item 4"},
                {
                    "ref": ref(4),
                    "severity": "correction",
                    "edits": {"rationale": "Fixed arithmetic."},
                    "reason": "math",
                },
            ]
        )
    )
    (topic_dir / "standards-escalate.json").write_text(
        json.dumps([{"ref": ref(6), "reason": "near-duplicate of item 7"}])
    )
    assert (
        run(tmp_path, "route-standards", TOPIC, "--batch", "batch.json").returncode == 0
    )
    assert [
        e["ref"] for e in json.loads((topic_dir / "review-standards.json").read_text())
    ] == [ref(1), ref(4)]
    assert [
        e["ref"] for e in json.loads((topic_dir / "escalated.json").read_text())
    ] == [ref(2)]
    assert {r["ref"] for r in json.loads((topic_dir / "replace.json").read_text())} == {
        ref(3),
        ref(6),
    }


def test_apply_refuses_a_drop_that_leaves_the_quiz_undersized(tmp_path):
    topic_dir = setup(tmp_path)
    (topic_dir / "review.json").write_text(json.dumps([{"ref": ref(1), "drop": True}]))
    result = run(
        tmp_path,
        "apply",
        TOPIC,
        "--batch",
        "batch.json",
        "--output",
        "out.json",
        "--min",
        "12",
        "review.json",
    )
    assert result.returncode != 0
    assert "replace instead" in result.stderr


def test_apply_defaults_the_minimum_to_the_quiz_target(tmp_path):
    topic_dir = setup(tmp_path)
    (topic_dir / "review.json").write_text(json.dumps([{"ref": ref(1), "drop": True}]))
    args = ["apply", TOPIC, "--batch", "batch.json", "--output", "out.json"]
    result = run(tmp_path, *args, "review.json")
    assert "leaves fewer than 12" in result.stderr


def test_accept_marks_a_recheck_disagreement_ready(tmp_path):
    topic_dir = setup(tmp_path)
    run(tmp_path, "blind", TOPIC, "--batch", "batch.json", "--round", "r1")
    k = keys(topic_dir)
    k[1] = "D" if k[1] != "D" else "A"
    answer(topic_dir, "r1", k)
    run(tmp_path, "check-blind", TOPIC, "--round", "r1")
    assert run(tmp_path, "ready", TOPIC, "--batch", "batch.json").returncode != 0
    assert run(tmp_path, "accept", TOPIC, "--batch", "batch.json", ref(2)).returncode == 0
    assert run(tmp_path, "ready", TOPIC, "--batch", "batch.json").returncode == 0


def test_slices_adds_unstaged_stems_and_source_pages(tmp_path):
    setup(tmp_path)
    work = tmp_path / "subject"
    (work / "blueprint.json").write_text(
        json.dumps(
            {
                "topics": [
                    {"name": TOPIC, "quizzes": [{"name": QUIZ, "target": 12}]},
                    {"name": "Renal", "quizzes": [{"name": "AKI", "pages": "2-3"}]},
                ]
            }
        )
    )
    (work / "outline.json").write_text(
        json.dumps(
            {"topics": [{"name": TOPIC, "quizzes": [{"name": QUIZ, "stems": ["Stem number 1?"]}]}]}
        )
    )
    (work / "src").mkdir()
    (work / "src" / "main.txt").write_text("one\ftwo\fthree\ffour")
    assert run(tmp_path, "slices", "Renal").returncode == 0
    stems = (work / "stems.txt").read_text()
    assert "## (unstaged) Nephrology › Glomerular Disease" in stems
    assert stems.count("Stem number 1?") == 1 and "Stem number 2?" in stems
    source = (work / "renal" / "source-1.txt").read_text()
    assert "two" in source and "three" in source and "four" not in source
    brief = json.loads((work / "renal" / "brief-1.json").read_text())
    assert brief["sourcePages"].endswith("source-1.txt")


def test_ready_flags_an_item_edited_after_its_blind_solve(tmp_path):
    topic_dir = setup(tmp_path)
    run(tmp_path, "blind", TOPIC, "--batch", "batch.json", "--round", "r1")
    answer(topic_dir, "r1", keys(topic_dir))
    run(tmp_path, "check-blind", TOPIC, "--round", "r1")
    assert run(tmp_path, "ready", TOPIC, "--batch", "batch.json").returncode == 0
    (topic_dir / "edit.json").write_text(
        json.dumps([{"ref": ref(4), "edits": {"stem": "A rewritten stem?"}}])
    )
    assert (
        run(
            tmp_path,
            "apply",
            TOPIC,
            "--batch",
            "batch.json",
            "--output",
            "final.json",
            "--min",
            "1",
            "edit.json",
        ).returncode
        == 0
    )
    result = run(tmp_path, "ready", TOPIC, "--batch", "final.json")
    assert result.returncode != 0
    assert ref(4) in result.stderr and ref(5) not in result.stderr


def test_clean_keeps_the_blueprint_and_merges_the_shared_ledger(tmp_path):
    topic_dir = setup(tmp_path)
    (topic_dir / "sources-1.json").write_text(
        json.dumps(
            [
                {
                    "title": "KDIGO AKI",
                    "year": "2012",
                    "status": "verified",
                    "facts": ["Stages"],
                }
            ]
        )
    )
    (tmp_path / "subject" / "stems.txt").write_text("stems")
    assert run(tmp_path, "clean").returncode == 0
    assert [p.name for p in (tmp_path / "subject").iterdir()] == ["blueprint.json"]
    assert (
        json.loads((tmp_path / "sources.json").read_text())[0]["title"] == "KDIGO AKI"
    )


def test_concurrent_ledger_runs_for_two_subjects_keep_both_entries(tmp_path):
    for subject in ("alpha", "beta"):
        topic = tmp_path / subject / "topic"
        topic.mkdir(parents=True)
        (topic / "sources-1.json").write_text(
            json.dumps([{"title": f"{subject} guideline", "year": "2024", "status": "verified"}])
        )
    procs = [
        subprocess.Popen(
            [sys.executable, "-I", str(TOOL), "--work", str(tmp_path / s), "ledger"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        for _ in range(5)
        for s in ("alpha", "beta")
    ]
    assert all(p.wait() == 0 for p in procs)
    titles = {e["title"] for e in json.loads((tmp_path / "sources.json").read_text())}
    assert titles == {"alpha guideline", "beta guideline"}
