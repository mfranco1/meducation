import json
import subprocess
import sys
from pathlib import Path

TOOL = Path(__file__).with_name("authoring.py")
MERGE = "import sys; sys.path.insert(0, sys.argv[1]); import authoring; authoring.merge_ledger(*map(authoring.Path, sys.argv[2:]))"


def merge(ledger: Path, work: Path) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-I", "-c", MERGE, str(TOOL.parent), str(ledger), str(work)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


def test_merge_ledger_folds_a_url_across_titles_and_compacts_existing_duplicates(tmp_path):
    ledger = tmp_path / "ledger.json"
    row = {"title": "KDIGO AKI", "year": "2012", "url": "https://www.example.org/kdigo/", "status": "blocked", "facts": ["a"]}
    same = {**row, "title": "Other title", "url": "HTTP://example.org/kdigo", "status": "verified", "facts": ["a", "b"]}
    other_year = {**row, "year": "2024", "facts": ["c"]}
    write(tmp_path / "work" / "topic" / "sources-1.json", [row, same, other_year])
    write(ledger, [{**row, "title": "Third", "facts": ["z"]}, {**row, "title": "Fourth", "facts": ["y"]}])
    assert merge(ledger, tmp_path / "work").wait() == 0
    entries = {e["year"]: e for e in json.loads(ledger.read_text())}
    assert len(entries) == 2
    assert entries["2012"]["status"] == "verified" and entries["2012"]["title"] == "Third"
    assert sorted(entries["2012"]["facts"]) == ["a", "b", "y", "z"]
    assert entries["2024"]["facts"] == ["c"]


def test_merge_ledger_drops_non_citable_sources(tmp_path):
    ledger = tmp_path / "ledger.json"
    keep = {"title": "KDIGO AKI", "year": "2012", "url": "https://kdigo.org/aki", "status": "verified", "facts": ["a"]}
    site = {**keep, "title": "Hyponatremia", "url": "https://www.msdmanuals.com/professional/hyponatremia"}
    review = {**keep, "title": "SVC syndrome review (Cureus 2022)", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/"}
    write(ledger, [keep, site])
    write(tmp_path / "work" / "topic" / "sources-1.json", [review])
    assert merge(ledger, tmp_path / "work").wait() == 0
    assert [e["title"] for e in json.loads(ledger.read_text())] == ["KDIGO AKI"]


def test_concurrent_merges_from_two_work_dirs_keep_both_entries(tmp_path):
    ledger = tmp_path / "ledger.json"
    for work in ("quizzes", "flashcards"):
        write(tmp_path / work / "topic" / "sources-1.json", [{"title": f"{work} guideline", "year": "2024", "status": "verified"}])
    procs = [merge(ledger, tmp_path / work) for _ in range(5) for work in ("quizzes", "flashcards")]
    assert all(p.wait() == 0 for p in procs)
    assert {e["title"] for e in json.loads(ledger.read_text())} == {"quizzes guideline", "flashcards guideline"}


def test_find_sources_prints_entries_matching_every_term_newest_first(tmp_path):
    ledger = tmp_path / "ledger.json"
    write(
        ledger,
        [
            {"title": "KDIGO AKI", "year": "2012", "url": "u1", "status": "verified", "facts": ["Stages by creatinine"]},
            {"title": "KDIGO CKD", "year": "2024", "url": "u2", "status": "verified", "facts": ["Refer below eGFR 30"]},
            {"title": "ESC hypertension", "year": "2024", "url": "u3", "status": "blocked", "facts": []},
        ],
    )

    def find(*terms: str) -> str:
        cmd = [sys.executable, "-I", str(TOOL), "find-sources", *terms, "--ledger", str(ledger)]
        return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout

    out = find("kdigo", "creatinine")
    assert "KDIGO AKI" in out and "Stages by creatinine" in out and "CKD" not in out
    out = find("KDIGO")
    assert out.index("KDIGO CKD") < out.index("KDIGO AKI")
    assert find("nothing") == "No matching sources.\n"


def test_saved_copy_is_listed_with_its_ledger_entry(tmp_path):
    ledger = tmp_path / "ledger.json"
    write(ledger, [{"title": "KDIGO AKI", "year": "2012", "url": "http://example.org/kdigo", "status": "verified", "facts": []}])
    page = tmp_path / "page.html"
    body = "<p>Stage 3: creatinine 3.0 times baseline &amp; urine output below 0.3 mL/kg/h.</p>" * 20
    page.write_text(f"<html><head><title>x</title><script>var hidden = 1;</script></head><body>{body}</body></html>")

    def run(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-I", str(TOOL), *args, "--ledger", str(ledger)], capture_output=True, text=True, check=False)

    saved = run("save-source", "https://www.example.org/kdigo/", "--from", str(page))
    assert saved.returncode == 0, saved.stderr
    text = Path(saved.stdout.split(" (")[0]).read_text()
    assert "baseline & urine output below 0.3 mL/kg/h" in text and "hidden" not in text
    assert "saved " in run("find-sources", "KDIGO").stdout

    page.write_text("<html><body>Just a moment...</body></html>")
    assert run("save-source", "https://example.org/other", "--from", str(page)).returncode != 0
