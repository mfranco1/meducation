"""Deterministic bookkeeping for the write-flashcards workflow.

Usage: python3 -I deck_work.py --work WORK <command> [TOPIC] [options]

WORK (var/flashcard-work/<subject-slug>) holds outline.json, plan.json, optional notes.md,
fronts.txt and src/main.txt; each topic has its own folder (WORK/<topic-slug>/) with briefs,
writer output (cards-<n>.json), review files and stage.json under fixed names. Deck number <n>
is the deck's 1-based position in its topic's plan entry. Shared helpers and the source ledger
path are in .agents/shared/authoring.py. Run `--help` on a command for its options.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "shared"))
from authoring import (  # noqa: E402
    LEDGER,
    REPO,
    SEP,
    clean_work,
    dump,
    load,
    merge_ledger,
    notes,
    numbered,
    page_text,
    render_prompt,
    slug,
)

SEVERITIES = {"inaccurate", "outdated", "unclear", "duplicate", "format"}
EDIT_KEYS = {"front", "back", "sources"}
GENERIC = {"disorders", "diseases", "management", "clinical", "principles", "general"}
PROMPTS = Path(__file__).resolve().parent / "prompts"


class Work:
    def __init__(self, root: Path, ledger: Path, topic: str = ""):
        self.root, self.ledger, self.topic = root, ledger, topic
        self.dir = root / slug(topic)

    @property
    def outline(self) -> dict:
        return load(self.root / "outline.json")

    @property
    def plan(self) -> dict:
        return load(self.root / "plan.json")

    def plan_topic(self) -> dict:
        for t in self.plan["topics"]:
            if t["name"] == self.topic:
                return t
        sys.exit(f"{self.topic} is not in the plan.")

    def outline_topic(self, name: str | None = None) -> dict:
        name = name or self.topic
        return next((t for t in self.outline["topics"] if t["name"] == name), {})

    def outline_deck(self, deck: str) -> dict:
        return next(
            (d for d in self.outline_topic().get("decks", []) if d["name"] == deck), {}
        )

    def numbered(self, pattern: str) -> list[Path]:
        return numbered(self.dir, pattern)


def flat(text: str) -> str:
    return " ".join(text.split())


def cards_in(path: Path) -> list[dict]:
    data = load(path)
    if not isinstance(data, dict) or not isinstance(data.get("cards"), list):
        sys.exit(f'{path} must be {{"cards": [...]}}.')
    return data["cards"]


def cmd_coverage(work: Work, args) -> None:
    """Per topic: decks, cards, questionCount, flags (no decks, THIN = fewer cards than half the questions; deck under 15 or over 80 cards). With TOPIC, also each quiz subtopic with the number of the topic's cards mentioning a distinctive word of its name (heuristic, GAP? at 0)."""
    topics = [work.outline_topic()] if work.topic else work.outline["topics"]
    if work.topic and not topics[0]:
        sys.exit(f"{work.topic} is not in the outline.")
    if work.topic:
        print(
            "Heuristic: a subtopic counts a card when its front or back contains a distinctive word (5+ letters) of the subtopic name."
        )
    for t in topics:
        decks = t.get("decks", [])
        total = sum(len(d["cards"]) for d in decks)
        questions = t.get("questionCount", 0)
        flag = " NO-DECKS" if not decks else " THIN" if total < questions / 2 else ""
        print(
            f"{t['name']}: {len(decks)} decks, {total} cards, {questions} questions{flag}"
        )
        for d in decks:
            n = len(d["cards"])
            print(
                f"  {d['name']}: {n} cards"
                + (" SMALL" if n < 15 else " LARGE" if n > 80 else "")
            )
        if work.topic:
            for sub, count in t.get("subtopics", {}).items():
                words = [
                    w for w in re.findall(r"[a-z]{5,}", sub.lower()) if w not in GENERIC
                ]
                hits = (
                    sum(
                        1
                        for d in decks
                        for c in d["cards"]
                        if any(w in f"{c['front']} {c['back']}".lower() for w in words)
                    )
                    if words
                    else 0
                )
                print(
                    f"  subtopic {sub}: {count} questions, {hits} cards"
                    + (" GAP?" if not hits else "")
                )


def write_fronts(work: Work) -> None:
    lines = []
    for t in work.outline["topics"]:
        for d in t.get("decks", []):
            lines.append(f"## {t['name']}{SEP}{d['name']}")
            lines += [
                f"- {flat(c['front'])} | {flat(c['back'])[:200]}" for c in d["cards"]
            ]
    plan = {slug(t["name"]): t for t in work.plan["topics"]}
    for folder in sorted(p for p in work.root.iterdir() if p.is_dir() and p.name in plan):
        for path in numbered(folder, "cards-*.json"):
            deck = plan[folder.name]["decks"][int(path.stem.rsplit("-", 1)[1]) - 1]
            lines.append(
                f"## (unstaged) {plan[folder.name]['name']}{SEP}{deck['name']}"
            )
            lines += [
                f"- {flat(c['front'])} | {flat(c['back'])[:200]}"
                for c in cards_in(path)
            ]
    (work.root / "fronts.txt").write_text("\n".join(lines) + "\n", "utf-8")


def cmd_brief(work: Work, args) -> None:
    """Rewrite WORK/fronts.txt (every card of the subject, plus the unstaged cards in every topic folder) and write brief-<n>.json (with source-<n>.txt from pages) for each plan deck with add > 0."""
    topic = work.plan_topic()
    write_fronts(work)
    out = work.outline_topic()
    known = {d["name"]: d.get("description", "") for d in out.get("decks", [])}
    briefed = 0
    for n, deck in enumerate(topic["decks"], 1):
        if not deck.get("add"):
            continue
        briefed += 1
        pages = page_text(work.root, deck.get("pages", ""))
        if pages:
            (work.dir / f"source-{n}.txt").parent.mkdir(parents=True, exist_ok=True)
            (work.dir / f"source-{n}.txt").write_text(pages, "utf-8")
        others = dict(known) | {
            d["name"]: d.get("description", "") for d in topic["decks"]
        }
        dump(
            work.dir / f"brief-{n}.json",
            {
                "topic": {
                    "name": topic["name"],
                    "description": topic.get("description")
                    or out.get("description", ""),
                },
                "deck": deck,
                "existingCards": len(work.outline_deck(deck["name"]).get("cards", [])),
                "quizSubtopics": out.get("subtopics", {}),
                "otherDecks": [
                    {"name": k, "description": v}
                    for k, v in others.items()
                    if k != deck["name"]
                ],
                "fronts": str(work.root.resolve() / "fronts.txt"),
                "sourceLedger": str(work.ledger.resolve()),
                "sourcePages": str((work.dir / f"source-{n}.txt").resolve())
                if pages
                else "",
                "outputs": {
                    k: str((work.dir / f"{k}-{n}.json").resolve())
                    for k in ("cards", "sources", "unverified")
                },
            },
        )
    print(f"{briefed} briefs")


ROLES = ("writer", "reviewer")


def cmd_prompt(work: Work, args) -> None:
    """Render prompts/<role>.md for ROLE (writer, reviewer) into TOPICDIR/prompt-<role>-<n>.md and print its path. Needs exactly one --n; writer needs its brief, reviewer its review input."""
    if not args.n or len(args.n) != 1:
        sys.exit(f"{args.role} needs exactly one --n.")
    n, root, folder = args.n[0], work.root.resolve(), work.dir.resolve()
    tag = f"{args.role}-{n}"
    needs = f"brief-{n}.json" if args.role == "writer" else f"review-input-{n}.json"
    if not (folder / needs).exists():
        sys.exit(f"{folder / needs} does not exist.")
    scratch = folder / "scratch" / tag
    scratch.mkdir(parents=True, exist_ok=True)
    subs = {
        "REPO": str(REPO),
        "WORK": str(root),
        "TOPICDIR": str(folder),
        "TOPICNAME": work.topic,
        "SCRATCH": str(scratch) + "/",
        "NOTES": notes(root / "notes.md", folder / "notes.md"),
    }
    if args.role == "writer":
        subs |= {"BRIEF": str(folder / needs), "CARDS": str(folder / f"cards-{n}.json")}
    else:
        subs |= {
            "INPUT": str(folder / needs),
            "OUTPUT": str(folder / f"review-{n}.json"),
            "SOURCES": str(folder / f"sources-review-{n}.json"),
        }
    render_prompt(PROMPTS / f"{args.role}.md", subs, folder / f"prompt-{tag}.md")


def assemble_batch(work: Work) -> dict:
    topic = work.plan_topic()
    decks = []
    for path in work.numbered("cards-*.json"):
        plan_deck = topic["decks"][int(path.stem.rsplit("-", 1)[1]) - 1]
        decks.append(
            {"name": plan_deck["name"]}
            | (
                {"description": plan_deck["description"]}
                if plan_deck.get("description")
                else {}
            )
            | {"cards": cards_in(path)}
        )
    if not decks:
        sys.exit("No cards-<n>.json files.")
    return {
        "topics": [
            {"name": topic["name"]}
            | (
                {"description": topic["description"]}
                if topic.get("description")
                else {}
            )
            | {"decks": decks}
        ]
    }


def cmd_gate(work: Work, args) -> None:
    """Run the batch report (npm run report:flashcard-batch). Without --batch, first assemble TOPICDIR/batch.json from every cards-<n>.json; with --batch, check that file in the topic folder."""
    if args.batch:
        batch = work.dir.resolve() / args.batch
    else:
        batch = work.dir.resolve() / "batch.json"
        dump(batch, assemble_batch(work))
    root = work.root.resolve()
    cmd = [
        "npm",
        "run",
        "-s",
        "report:flashcard-batch",
        "--",
        str(batch),
        "--outline",
        str(root / "outline.json"),
        "--plan",
        str(root / "plan.json"),
        "--topic",
        work.topic,
    ]
    sys.exit(subprocess.run(cmd, cwd=REPO, check=False).returncode)


def cmd_review_input(work: Work, args) -> None:
    """For each plan deck write review-input-<n>.json: [{ref, front, back, sources?}]. New cards from cards-<n>.json get ref new-<i>; with audit: true the deck's existing cards come first, ref = card id. Decks with nothing to review are skipped. Earlier review inputs and reviews are deleted, so build never applies a stale review."""
    for stale in work.numbered("review-input-*.json") + work.numbered("review-[0-9]*.json"):
        stale.unlink()
    for n, deck in enumerate(work.plan_topic()["decks"], 1):
        rows = []
        if deck.get("audit"):
            rows += [
                {"ref": c["id"]}
                | {k: c[k] for k in ("front", "back", "sources") if c.get(k)}
                for c in work.outline_deck(deck["name"]).get("cards", [])
            ]
        existing = len(rows)
        path = work.dir / f"cards-{n}.json"
        if path.exists():
            rows += [
                {"ref": f"new-{i}"}
                | {k: c[k] for k in ("front", "back", "sources") if c.get(k)}
                for i, c in enumerate(cards_in(path), 1)
            ]
        if rows:
            dump(work.dir / f"review-input-{n}.json", rows)
            print(
                f"review-input-{n}.json: {existing} existing, {len(rows) - existing} new"
            )


def cmd_build(work: Work, args) -> None:
    """Apply review-<n>.json to the cards and write TOPICDIR/stage.json (new decks and cards, edits and deletes of existing cards). A review is [{ref, severity, edits: {front?, back?, sources?}, drop?, reason}]; unlisted cards are accepted. Prints a JSON summary whose factChanges give each fact change's reason and sources."""
    topic = work.plan_topic()
    problems, decks = [], []
    for path in work.numbered("review-input-*.json"):
        n = int(path.stem.rsplit("-", 1)[1])
        review_path = work.dir / f"review-{n}.json"
        if not review_path.exists():
            sys.exit(f"{review_path} is missing; run the reviewer for deck {n}.")
        rows, review = load(path), load(review_path)
        refs = {r["ref"] for r in rows}
        checks = work.dir / f"sources-review-{n}.json"
        if any(not r.startswith("new-") for r in refs) and not (
            checks.exists() and load(checks)
        ):
            problems.append(
                f"{checks.name}: no document checks recorded for existing cards; send reviewer {n} back to verify them on the web."
            )
        seen = set()
        for i, e in enumerate(review, 1):
            where = f"{review_path.name} entry {i} ({e.get('ref')})"
            if e.get("ref") not in refs:
                problems.append(f"{where}: ref is not in {path.name}.")
            if e.get("ref") in seen:
                problems.append(f"{where}: ref is listed twice.")
            seen.add(e.get("ref"))
            if e.get("severity") not in SEVERITIES:
                problems.append(
                    f"{where}: severity must be one of {', '.join(sorted(SEVERITIES))}."
                )
            edits = e.get("edits") or {}
            if set(edits) - EDIT_KEYS:
                problems.append(f"{where}: edit keys must be front, back or sources.")
            if not edits and not e.get("drop"):
                problems.append(f"{where}: needs edits or drop.")
            for k, v in edits.items():
                if k in EDIT_KEYS and (
                    not isinstance(v, str) or (k != "sources" and not v.strip())
                ):
                    problems.append(
                        f"{where}: {k} must be {'a string' if k == 'sources' else 'non-blank text'}."
                    )
        decks.append((n, rows, review))
    if problems:
        sys.exit("Review problems:\n" + "\n".join(f"- {p}" for p in problems))

    new_decks, edits, deletes, dropped, facts, new_counts = [], [], [], 0, [], {}
    for n, rows, review in decks:
        deck = topic["decks"][n - 1]
        current = {c["id"]: c for c in work.outline_deck(deck["name"]).get("cards", [])}
        cards = {
            r["ref"]: {k: r[k] for k in ("front", "back", "sources") if k in r}
            for r in rows
            if r["ref"].startswith("new-")
        }
        cited = {r["ref"]: r.get("sources", "") for r in rows}
        for e in review:
            ref, edit = e["ref"], e.get("edits") or {}
            fact = {
                "ref": ref,
                "deck": deck["name"],
                "severity": e["severity"],
                "reason": e["reason"],
                "sources": edit.get("sources", cited[ref]),
            }
            if ref in cards:
                if e.get("drop"):
                    del cards[ref]
                    dropped += 1
                else:
                    cards[ref].update(edit)
                    if not cards[ref].get("sources"):
                        cards[ref].pop("sources", None)
                if e["severity"] in ("inaccurate", "outdated"):
                    facts.append(fact)
                continue
            card = current[ref]
            if e.get("drop"):
                deletes.append({"id": ref, "version": card["version"]})
                facts.append(fact)
                continue
            changed = {k: v for k, v in edit.items() if v != card.get(k, "")}
            if changed:
                edits.append({"id": ref, "version": card["version"]} | changed)
            if changed or e["severity"] in ("inaccurate", "outdated"):
                facts.append(fact)
        if cards:
            new_counts[deck["name"]] = len(cards)
            new_decks.append(
                {"name": deck["name"]}
                | (
                    {"description": deck["description"]}
                    if deck.get("description")
                    else {}
                )
                | {"cards": list(cards.values())}
            )
    stage = {}
    if new_decks:
        stage["topics"] = [
            {"name": topic["name"]}
            | (
                {"description": topic["description"]}
                if topic.get("description")
                else {}
            )
            | {"decks": new_decks}
        ]
    if edits:
        stage["edits"] = edits
    if deletes:
        stage["deletes"] = deletes
    if not stage:
        sys.exit("Nothing to stage: no new cards, edits or deletes remain.")
    dump(work.dir / "stage.json", stage)
    print(
        json.dumps(
            {
                "newCards": new_counts,
                "edits": len(edits),
                "deletes": len(deletes),
                "dropped": dropped,
                "factChanges": facts,
            },
            ensure_ascii=False,
            indent=1,
        )
    )


def cmd_ledger(work: Work, args) -> None:
    """Merge every topic's sources-<n>.json into the shared source ledger."""
    merge_ledger(work.ledger, work.root)


def cmd_clean(work: Work, args) -> None:
    """Merge the ledger, then delete everything in WORK."""
    clean_work(work.ledger, work.root, set())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--ledger", type=Path, default=LEDGER)
    sub = parser.add_subparsers(dest="command", required=True)
    for name, fn in [
        ("coverage", cmd_coverage),
        ("brief", cmd_brief),
        ("prompt", cmd_prompt),
        ("gate", cmd_gate),
        ("review-input", cmd_review_input),
        ("build", cmd_build),
        ("ledger", cmd_ledger),
        ("clean", cmd_clean),
    ]:
        p = sub.add_parser(name, help=fn.__doc__, description=fn.__doc__)
        if name == "prompt":
            p.add_argument("role", choices=ROLES)
        p.add_argument(
            "topic",
            nargs="?" if name in ("coverage", "ledger", "clean") else None,
            default="",
        )
        if name == "prompt":
            p.add_argument("--n", nargs="+", type=int)
        if name == "gate":
            p.add_argument("--batch")
        p.set_defaults(fn=fn)
    args = parser.parse_args()
    args.fn(Work(args.work, args.ledger, args.topic), args)


if __name__ == "__main__":
    main()
