import json
import re
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


def test_check_blind_refuses_answers_shifted_partway_through_the_file(tmp_path):
    topic_dir = setup(tmp_path, count=20)
    run(tmp_path, "blind", TOPIC, "--batch", "batch.json", "--round", "r1")
    k = keys(topic_dir)
    answer(topic_dir, "r1", k[:12] + k[11:19])  # items 13 to 20 slid by one
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


def test_triage_escalates_unverified_facts_when_a_quiz_has_more_than_five(tmp_path):
    topic_dir = setup(tmp_path, count=60)
    run(tmp_path, "blind", TOPIC, "--batch", "batch.json", "--round", "r1")
    answer(topic_dir, "r1", keys(topic_dir))
    (topic_dir / "brief-1.json").write_text(json.dumps({"quiz": {"name": QUIZ}}))
    (topic_dir / "unverified-1.json").write_text(
        json.dumps([{"item": n, "fact": f"fact {n}"} for n in range(1, 7)])
    )
    assert run(tmp_path, "check-blind", TOPIC, "--round", "r1").returncode == 0
    run(tmp_path, "triage", TOPIC, "--batch", "batch.json", "--round", "r1")
    escalated = json.loads((topic_dir / "escalated.json").read_text())
    assert [e["ref"] for e in escalated] == [ref(n) for n in range(1, 7)]
    assert escalated[0]["reasons"] == ["Writer could not verify: fact 1"]


def test_triage_escalates_unverified_facts_above_one_per_ten_items(tmp_path):
    topic_dir = setup(tmp_path)  # 12 items: a top-up quiz
    run(tmp_path, "blind", TOPIC, "--batch", "batch.json", "--round", "r1")
    answer(topic_dir, "r1", keys(topic_dir))
    (topic_dir / "brief-1.json").write_text(json.dumps({"quiz": {"name": QUIZ}}))
    (topic_dir / "unverified-1.json").write_text(
        json.dumps([{"item": n, "fact": f"fact {n}"} for n in (2, 4)])
    )
    assert run(tmp_path, "check-blind", TOPIC, "--round", "r1").returncode == 0
    run(tmp_path, "triage", TOPIC, "--batch", "batch.json", "--round", "r1")
    escalated = json.loads((topic_dir / "escalated.json").read_text())
    assert [e["ref"] for e in escalated] == [ref(2), ref(4)]


def test_route_standards_keeps_self_evident_corrections_and_routes_drops_and_accuracy_edits(
    tmp_path,
):
    topic_dir = setup(tmp_path)
    (topic_dir / "escalated.json").write_text(
        json.dumps([{"ref": ref(5), "reasons": ["Blind note: unclear"]}])
    )
    (topic_dir / "standards-input-1.json").write_text(
        json.dumps([{"ref": ref(n)} for n in range(1, 7)])
    )
    (topic_dir / "review-standards-1.json").write_text(
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
                {
                    "ref": ref(5),
                    "severity": "flaw",
                    "edits": {"pearls": ["New."]},
                    "reason": "pearl",
                },
            ]
        )
    )
    (topic_dir / "standards-escalate-1.json").write_text(
        json.dumps([{"ref": ref(6), "reason": "near-duplicate of item 7"}])
    )
    assert (
        run(tmp_path, "route-standards", TOPIC).returncode == 0
    )
    assert [
        e["ref"] for e in json.loads((topic_dir / "review-standards.json").read_text())
    ] == [ref(1), ref(4)]
    assert [
        (e["ref"], e["proposed"])
        for e in json.loads((topic_dir / "escalated.json").read_text())
    ] == [(ref(5), {"pearls": ["New."]}), (ref(2), {"rationale": "Changed fact."})]
    drops = json.loads((topic_dir / "review-drops.json").read_text())
    assert {r["ref"] for r in drops} == {ref(3), ref(6)} and all(r["drop"] for r in drops)


def test_route_standards_refuses_a_quiz_without_its_review(tmp_path):
    topic_dir = setup(tmp_path)
    (topic_dir / "escalated.json").write_text("[]")
    (topic_dir / "standards-input-1.json").write_text("[]")
    result = run(tmp_path, "route-standards", TOPIC)
    assert result.returncode != 0
    assert "review-standards-1.json is missing" in result.stderr


def test_route_standards_refuses_refs_outside_the_quiz_input(tmp_path):
    topic_dir = setup(tmp_path)
    (topic_dir / "escalated.json").write_text("[]")
    (topic_dir / "standards-input-1.json").write_text(json.dumps([{"ref": ref(1)}, {"ref": ref(3)}]))
    (topic_dir / "review-standards-1.json").write_text(
        json.dumps([{"ref": ref(2), "severity": "flaw", "edits": {}, "reason": "x"}])
    )
    (topic_dir / "standards-escalate-1.json").write_text("[]")
    result = run(tmp_path, "route-standards", TOPIC)
    assert result.returncode != 0
    assert ref(2) in result.stderr


def test_apply_moves_drops_to_the_backlog_and_clean_waits_for_it(tmp_path):
    topic_dir = setup(tmp_path)
    (topic_dir / "review.json").write_text(
        json.dumps(
            [
                {"ref": ref(1), "drop": True, "reason": "near-duplicate of item 4"},
                {"ref": ref(3), "edits": {"stem": "New stem?"}},
            ]
        )
    )
    args = ["apply", TOPIC, "--batch", "batch.json", "--output", "out.json", "review.json"]
    assert run(tmp_path, *args).returncode == 0
    assert len(keys(topic_dir, "out.json")) == 11
    # The rewritten item moved up one place when item 1 was dropped.
    assert json.loads((topic_dir / "rewritten-out.json").read_text()) == [ref(2)]
    (topic_dir / "out.json").unlink()
    assert run(tmp_path, *args).returncode == 0  # a rerun doesn't list the item twice
    backlog = json.loads((tmp_path / "subject" / "replace-backlog.json").read_text())
    assert [(b["quiz"], b["stem"], b["reason"]) for b in backlog] == [
        (QUIZ, "Stem number 1?", "near-duplicate of item 4")
    ]
    assert f"1 {TOPIC} › {QUIZ}" in run(tmp_path, "backlog").stdout
    result = run(tmp_path, "clean")
    assert result.returncode != 0 and "await replacement" in result.stderr
    assert run(tmp_path, "backlog", "--clear").returncode == 0
    assert run(tmp_path, "clean").returncode == 0


def test_backlog_clear_keeps_dropped_replacements_with_the_earlier_reason(tmp_path):
    setup(tmp_path)
    work = tmp_path / "subject"
    old = {"topic": TOPIC, "quiz": QUIZ, "stem": "Old stem?", "reason": "duplicate of item 2."}
    new = {"topic": TOPIC, "quiz": QUIZ, "stem": "Stem number 1?", "reason": "duplicate of item 5."}
    filled = {**old, "quiz": "Other", "stem": "Filled stem?"}
    (work / "replace-backlog.json").write_text(json.dumps([old, filled, new]))
    (work / "replacements").mkdir()
    batch = {"topics": [{"name": TOPIC, "quizzes": [{"name": QUIZ, "items": [item(1)]}]}]}
    (work / "replacements" / "batch.json").write_text(json.dumps(batch))
    assert run(tmp_path, "backlog", "--clear").returncode == 0
    backlog = json.loads((work / "replace-backlog.json").read_text())
    assert [(b["stem"], b["reason"]) for b in backlog] == [
        ("Stem number 1?", "duplicate of item 5. Earlier drop in this slot: duplicate of item 2.")
    ]


def test_apply_refuses_a_choices_edit_without_answer(tmp_path):
    topic_dir = setup(tmp_path)
    (topic_dir / "review.json").write_text(
        json.dumps([{"ref": ref(1), "edits": {"choices": ["w", "x", "y", "z"]}}])
    )
    args = ["apply", TOPIC, "--batch", "batch.json", "--output", "out.json"]
    result = run(tmp_path, *args, "review.json")
    assert result.returncode != 0
    assert "must also send answer" in result.stderr


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


def test_blind_names_rounds_in_order_and_later_commands_follow_the_latest(tmp_path):
    topic_dir = setup(tmp_path)
    (topic_dir / "escalated.json").write_text(json.dumps([{"ref": ref(1), "reasons": ["x"]}]))
    assert "round initial, batch batch.json" in run(tmp_path, "blind", TOPIC).stdout
    answer(topic_dir, "initial", keys(topic_dir))
    assert run(tmp_path, "check-blind", TOPIC).returncode == 0
    result = run(tmp_path, "judge-input", TOPIC)
    assert "round initial" in result.stdout and "review-judgment-initial.json" in result.stdout
    assert [r["ref"] for r in json.loads((topic_dir / "judgment-input-initial.json").read_text())] == [ref(1)]
    result = run(tmp_path, "blind", TOPIC)  # a recheck needs the rewritten refs
    assert result.returncode != 0 and "rewritten-batch.json is missing" in result.stderr
    (topic_dir / "rewritten-batch.json").write_text(json.dumps([ref(2), ref(4)]))
    assert "round recheck-1" in run(tmp_path, "blind", TOPIC).stdout
    assert "round recheck-2" in run(tmp_path, "blind", TOPIC, "--refs", "rewritten-batch.json").stdout
    assert json.loads((topic_dir / "blind" / "rounds.json").read_text()) == ["initial", "recheck-1", "recheck-2"]
    rows = json.loads((topic_dir / "blind" / "recheck-1" / "items-1.json").read_text())
    assert [r["ref"] for r in rows] == [ref(2), ref(4)]
    answer(topic_dir, "recheck-2", [keys(topic_dir)[1], "A" if keys(topic_dir)[3] != "A" else "B"])
    assert "round recheck-2" in run(tmp_path, "check-blind", TOPIC).stdout
    result = run(tmp_path, "judge-input", TOPIC)
    assert result.returncode == 0
    rows = json.loads((topic_dir / "judgment-input-recheck-2.json").read_text())
    assert [r["ref"] for r in rows] == [ref(4)]


def test_prompt_fills_paths_and_notes_and_leaves_no_placeholders(tmp_path):
    topic_dir = setup(tmp_path)
    work = tmp_path / "subject"
    (work / "notes.md").write_text("Subject note.")
    (topic_dir / "notes.md").write_text("Topic note.")
    (topic_dir / "brief-2.json").write_text("{}")
    run(tmp_path, "blind", TOPIC)
    words = r"\b(WORK|TOPICDIR|TOPICNAME|BRIEF|BATCH|ROUND|INPUTS|REPO|FILES|SCRATCH|SUBJECT_NOTES)\b"
    result = run(tmp_path, "prompt", "writer", TOPIC, "--n", "2")
    out = Path(result.stdout.strip())
    assert out == topic_dir.resolve() / "prompt-writer-2.md"
    text = out.read_text()
    assert str(topic_dir.resolve() / "brief-2.json") in text and not re.search(words, text)
    assert "Subject note." in text and "Topic note." in text
    assert (topic_dir / "scratch" / "writer-2").is_dir()
    out = Path(run(tmp_path, "prompt", "blind", TOPIC).stdout.strip())
    text = out.read_text()
    assert str(topic_dir.resolve() / "blind" / "initial" / "items-1.json") in text
    assert not re.search(words, text)
    assert "items-1.json" in Path(run(tmp_path, "prompt", "blind", TOPIC, "--n", "1").stdout.strip()).read_text()
    text = Path(run(tmp_path, "prompt", "judge", TOPIC).stdout.strip()).read_text()
    assert str(topic_dir.resolve() / "batch.json") in text and not re.search(words, text)
    out = Path(run(tmp_path, "prompt", "replace").stdout.strip())
    assert out == (work / "replacements" / "prompt-replace.md").resolve() and not re.search(words, out.read_text())
    assert run(tmp_path, "prompt", "writer", TOPIC, "--n", "9").returncode != 0
    assert run(tmp_path, "prompt", "judge").returncode != 0


def test_similar_lists_a_near_duplicate_staged_stem_but_not_an_unrelated_one(tmp_path):
    topic_dir = setup(tmp_path, count=2)
    batch = json.loads((topic_dir / "batch.json").read_text())
    items = batch["topics"][0]["quizzes"][0]["items"]
    items[0]["stem"] = "A 45-year-old man has nephrotic syndrome with minimal change disease. Which drug is first line?"
    items[0]["choices"][0] = "Prednisone"
    items[1]["stem"] = "Which vitamin deficiency causes scurvy?"
    (topic_dir / "batch.json").write_text(json.dumps(batch))
    (tmp_path / "subject" / "stems.txt").write_text(
        "## Nephrology › Other\n"
        "- Minimal change disease causes nephrotic syndrome; which drug is first line, prednisone?\n"
        "- Which structure forms the blood-brain barrier?\n"
    )
    out = run(tmp_path, "similar", TOPIC).stdout
    assert ref(1) in out and "Nephrology › Other: Minimal change" in out
    assert ref(2) not in out and "blood-brain" not in out
    assert "1 of 2 items" in out


def test_backlog_clear_moves_replacements_aside_and_backlog_shows_the_hard_share(tmp_path):
    setup(tmp_path)
    work = tmp_path / "subject"
    row = {"topic": TOPIC, "quiz": QUIZ, "stem": "Gone?", "reason": "dup"}
    (work / "replace-backlog.json").write_text(json.dumps([row]))
    outline = {"topics": [{"name": TOPIC, "quizzes": [{"name": QUIZ, "questionCount": 10, "difficulty": {"hard": 3}}]}]}
    (work / "outline.json").write_text(json.dumps(outline))
    assert f"1 {TOPIC} › {QUIZ} (hard 3/10 staged)" in run(tmp_path, "backlog").stdout
    (work / "replacements-1").mkdir()
    (work / "replacements").mkdir()
    (work / "replacements" / "sources-1.json").write_text("[]")
    assert "replacements-2" in run(tmp_path, "backlog", "--clear").stdout
    assert not (work / "replacements").exists()
    assert (work / "replacements-2" / "sources-1.json").exists()


def test_slices_adds_unstaged_stems_and_source_pages(tmp_path):
    setup(tmp_path)
    work = tmp_path / "subject"
    (work / "blueprint.json").write_text(
        json.dumps(
            {
                "topics": [
                    {"name": TOPIC, "quizzes": [{"name": QUIZ, "target": 12, "description": "d", "subtopics": {"A": 1}}]},
                    {
                        "name": "Renal",
                        "quizzes": [
                            {"name": "AKI", "pages": "2-3"},
                            {"name": "CKD", "description": "d", "subtopics": {"B": 1}, "excludes": ["x"]},
                        ],
                    },
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
    others = {p["quiz"]: p for p in brief["otherPlannedQuizzes"]}
    assert set(others[QUIZ]) == {"topic", "quiz", "subtopics"}
    assert set(others["CKD"]) == {"topic", "quiz", "description", "subtopics", "excludes"}


def test_slices_briefs_only_the_new_items_of_a_top_up(tmp_path):
    setup(tmp_path)
    work = tmp_path / "subject"
    quiz = {"name": QUIZ, "target": 3, "subtopics": {"A": 2, "B": 1}, "add": {"target": 1, "subtopics": {"B": 1}}}
    full = {"name": "Full", "target": 1, "subtopics": {"C": 1}}
    (work / "blueprint.json").write_text(json.dumps({"topics": [{"name": TOPIC, "quizzes": [quiz, full]}]}))
    staged = [{"name": QUIZ, "stems": ["S1?", "S2?"]}, {"name": "Full", "stems": ["S3?"]}]
    (work / "outline.json").write_text(json.dumps({"topics": [{"name": TOPIC, "quizzes": staged}]}))
    assert run(tmp_path, "slices", TOPIC).returncode == 0
    brief = json.loads(next(work.glob("*/brief-1.json")).read_text())["quiz"]
    assert (brief["target"], brief["subtopics"], brief["staged"]) == (1, {"B": 1}, 2)
    assert "add" not in brief
    assert not list(work.glob("*/brief-2.json"))


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


def test_ledger_merges_a_url_across_titles_and_compacts_existing_duplicates(tmp_path):
    topic_dir = setup(tmp_path)
    row = {"title": "KDIGO AKI", "year": "2012", "url": "https://www.example.org/kdigo/", "status": "blocked", "facts": ["a"]}
    same = {**row, "title": "Other title", "url": "HTTP://example.org/kdigo", "status": "verified", "facts": ["a", "b"]}
    other_year = {**row, "year": "2024", "facts": ["c"]}
    (topic_dir / "sources-1.json").write_text(json.dumps([row, same, other_year]))
    (tmp_path / "sources.json").write_text(json.dumps([{**row, "title": "Third", "facts": ["z"]}, {**row, "title": "Fourth", "facts": ["y"]}]))
    assert run(tmp_path, "ledger").returncode == 0
    entries = {e["year"]: e for e in json.loads((tmp_path / "sources.json").read_text())}
    assert len(entries) == 2
    assert entries["2012"]["status"] == "verified" and entries["2012"]["title"] == "Third"
    assert sorted(entries["2012"]["facts"]) == ["a", "b", "y", "z"]
    assert entries["2024"]["facts"] == ["c"]


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


def test_apply_leaves_out_a_quiz_that_its_drops_empty(tmp_path):
    topic_dir = setup(tmp_path, count=1)
    (topic_dir / "review.json").write_text(json.dumps([{"ref": ref(1), "drop": True, "reason": "dup"}]))
    args = ["apply", TOPIC, "--batch", "batch.json", "--output", "out.json", "review.json"]
    assert run(tmp_path, *args).returncode == 0
    assert json.loads((topic_dir / "out.json").read_text())["topics"] == []


def test_ledger_find_prints_entries_matching_every_term_newest_first(tmp_path):
    setup(tmp_path)
    (tmp_path / "sources.json").write_text(
        json.dumps(
            [
                {"title": "KDIGO AKI", "year": "2012", "url": "u1", "status": "verified", "facts": ["Stages by creatinine"]},
                {"title": "KDIGO CKD", "year": "2024", "url": "u2", "status": "verified", "facts": ["Refer below eGFR 30"]},
                {"title": "ESC hypertension", "year": "2024", "url": "u3", "status": "blocked", "facts": []},
            ]
        )
    )
    out = run(tmp_path, "ledger", "--find", "kdigo", "creatinine").stdout
    assert "KDIGO AKI" in out and "Stages by creatinine" in out and "CKD" not in out
    out = run(tmp_path, "ledger", "--find", "KDIGO").stdout
    assert out.index("KDIGO CKD") < out.index("KDIGO AKI")
