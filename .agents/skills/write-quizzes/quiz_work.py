"""Deterministic bookkeeping for the write-quizzes workflow.

Usage: python3 -I quiz_work.py --work WORK <command> TOPIC [options]

WORK (var/quiz-work/<subject-slug>) holds blueprint.json, outline.json,
stems.txt, replace-backlog.json, optional notes.md and src/main.txt; each topic has its own
folder (WORK/<topic-slug>/) with briefs, batches, blind rounds (blind/rounds.json lists them
in order) and review files under fixed names. The source ledger is shared by all subjects:
WORK/../sources.json. Blind rounds default to the next one (initial, recheck-1, ...) and later
commands default to the latest round. `prompt` renders a role's prompt template, `similar`
lists lexical near-duplicates, `gate` runs the batch report. Run `--help` on a command for
its options.
"""

import argparse
import fcntl
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

SEP = " › "
ITEM_FIELDS = {"stem", "choices", "answer", "rationale", "pearls"}
NESTED = {
    "rationaleMeta.sources",
    "metadata.subtopic",
    "metadata.system",
    "metadata.difficulty",
    "metadata.questionType",
}
STANDARDS_SEVERITIES = {"flaw", "metadata", "correction"}
UNVERIFIED_LIMIT = 5  # a quiz with more unverified facts, or more than 1 per 10 items, sends those items to judgment
STATUS_RANK = {"verified": 3, "summary-only": 2, "unconfirmed": 1, "blocked": 0}


def load(path: Path):
    return json.loads(path.read_text("utf-8"))


def dump(path: Path, data) -> None:
    """Write via a temp file so a concurrent reader never sees a partial file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    os.replace(tmp, path)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def items_of(batch):
    for topic in batch["topics"]:
        for quiz in topic["quizzes"]:
            for n, item in enumerate(quiz["items"], 1):
                yield (
                    SEP.join((topic["name"], quiz["name"], str(n))),
                    quiz["name"],
                    item,
                )


def content_hash(item) -> str:
    """What the blind solver sees plus the key; rationale edits don't need a new solve."""
    text = json.dumps(
        [item["stem"], item["choices"], item["answer"]], ensure_ascii=False
    )
    return hashlib.sha256(text.encode()).hexdigest()[:16]


class Work:
    def __init__(self, root: Path, topic: str):
        self.root, self.topic = root, topic
        self.dir = root / slug(topic)

    def blueprint_topic(self):
        for topic in load(self.root / "blueprint.json")["topics"]:
            if topic["name"] == self.topic:
                return topic
        sys.exit(f"{self.topic} is not in the blueprint.")

    @property
    def ledger(self) -> Path:
        return self.root.parent / "sources.json"

    @property
    def backlog_path(self) -> Path:
        return self.root / "replace-backlog.json"

    def backlog(self) -> list:
        return load(self.backlog_path) if self.backlog_path.exists() else []

    def batch(self, name: str):
        return load(self.dir / name)

    def rounds(self) -> list:
        path = self.dir / "blind" / "rounds.json"
        return load(path) if path.exists() else []

    def use_round(self, args) -> None:
        """Default --round to the latest round and --batch to that round's batch."""
        args.round = args.round or (self.rounds() or sys.exit("No blind round yet; run blind first."))[-1]
        meta = load(self.dir / "blind" / args.round / "meta.json")
        args.batch = getattr(args, "batch", None) or meta["batch"]

    def log(self):
        path = self.dir / "blind-log.json"
        return load(path) if path.exists() else {"solved": {}, "judged": []}


def unstaged_batches(work: Work):
    """Each other topic folder's latest batch: reviewed.json, else batch.json, else batch-<n>.json."""
    for folder in sorted(p for p in work.root.iterdir() if p.is_dir()):
        if folder == work.dir:
            continue
        for name in ("reviewed.json", "batch.json"):
            if (folder / name).exists():
                yield load(folder / name)
                break
        else:
            yield from (load(p) for p in sorted(folder.glob("batch-*.json")))


def page_text(work: Work, pages: str) -> str | None:
    """Pages "10-12, 15" of WORK/src/main.txt, where page N is the Nth form-feed chunk."""
    source = work.root / "src" / "main.txt"
    if not pages or not source.exists():
        return None
    chunks = source.read_text("utf-8").split("\f")
    out = []
    for part in str(pages).split(","):
        first, _, last = part.strip().partition("-")
        for n in range(int(first), int(last or first) + 1):
            if 1 <= n <= len(chunks):
                out.append(f"=== page {n} ===\n{chunks[n - 1].strip()}")
    return "\n\n".join(out) + "\n"


def cmd_slices(work: Work, args) -> None:
    """One brief per blueprint quiz (with source-<n>.txt from src/main.txt), and WORK/stems.txt
    from the outline plus the unstaged batches in other topic folders."""
    topic = work.blueprint_topic()
    outline = load(work.root / "outline.json")
    lines, staged = [], set()
    for t in outline["topics"]:
        for q in t.get("quizzes", []):
            lines.append(f"## {t['name']}{SEP}{q['name']}")
            lines += [f"- {stem}" for stem in q.get("stems", [])]
            staged.update(q.get("stems", []))
    for batch in unstaged_batches(work):
        for t in batch["topics"]:
            for q in t["quizzes"]:
                stems = [i["stem"] for i in q["items"] if i["stem"] not in staged]
                if stems:
                    lines.append(f"## (unstaged) {t['name']}{SEP}{q['name']}")
                    lines += [f"- {stem}" for stem in stems]
    (work.root / "stems.txt").write_text("\n".join(lines) + "\n", "utf-8")
    plan = [
        {
            "topic": t["name"],
            "quiz": q["name"],
            "description": q.get("description", ""),
            "subtopics": list(q.get("subtopics", {})),
            "excludes": q.get("excludes", []),
        }
        for t in load(work.root / "blueprint.json")["topics"]
        for q in t["quizzes"]
    ]
    counts = {(t["name"], q["name"]): len(q.get("stems", [])) for t in outline["topics"] for q in t.get("quizzes", [])}
    briefed = 0
    for n, quiz in enumerate(topic["quizzes"], 1):
        if "add" not in quiz and counts.get((topic["name"], quiz["name"])):
            continue  # staged and not being topped up
        briefed += 1
        if "add" in quiz:  # a top-up of a staged quiz: brief only the new items
            staged = counts.get((topic["name"], quiz["name"]), 0)
            quiz = {k: v for k, v in quiz.items() if k != "add"} | quiz["add"] | {"staged": staged}
        pages = page_text(work, quiz.get("pages", ""))
        if pages:
            work.dir.mkdir(exist_ok=True)
            (work.dir / f"source-{n}.txt").write_text(pages, "utf-8")
        dump(
            work.dir / f"brief-{n}.json",
            {
                "topic": {
                    "name": topic["name"],
                    "description": topic.get("description", ""),
                },
                "quiz": quiz,
                "otherPlannedQuizzes": [
                    p if p["topic"] == topic["name"] else {k: p[k] for k in ("topic", "quiz", "subtopics")}
                    for p in plan
                    if p["quiz"] != quiz["name"]
                ],
                "stagedStems": str(work.root / "stems.txt"),
                "sourceLedger": str(work.ledger),
                "sourcePages": str(work.dir / f"source-{n}.txt") if pages else "",
                "outputs": {
                    "batch": str(work.dir / f"batch-{n}.json"),
                    "unverified": str(work.dir / f"unverified-{n}.json"),
                    "sources": str(work.dir / f"sources-{n}.json"),
                },
            },
        )
    print(f"{briefed} briefs in {work.dir}")


def cmd_merge(work: Work, args) -> None:
    out = {"topics": []}
    for path in sorted(
        work.dir.glob("batch-*.json"), key=lambda p: int(p.stem.split("-")[1])
    ):
        for topic in load(path)["topics"]:
            target = next(
                (t for t in out["topics"] if t["name"] == topic["name"]), None
            )
            if target is None:
                target = {**topic, "quizzes": []}
                out["topics"].append(target)
            for quiz in topic["quizzes"]:
                existing = next(
                    (q for q in target["quizzes"] if q["name"] == quiz["name"]), None
                )
                if existing:
                    existing["items"] += quiz["items"]
                else:
                    target["quizzes"].append(quiz)
    dump(work.dir / "batch.json", out)
    print(f"{sum(1 for _ in items_of(out))} items in {work.dir / 'batch.json'}")


def cmd_blind(work: Work, args) -> None:
    """Per-quiz blind files for a round; the round remembers which batch it solves.
    --round defaults to initial, then recheck-<k>; a recheck defaults --refs to rewritten-<batch>.json."""
    rounds = work.rounds()
    rechecks = [int(m[1]) for r in rounds if (m := re.fullmatch(r"recheck-(\d+)", r))]
    name = args.round or ("initial" if not rounds else f"recheck-{max(rechecks, default=0) + 1}")
    if name.startswith("recheck") and not args.refs:
        args.refs = f"rewritten-{Path(args.batch).stem}.json"
        if not (work.dir / args.refs).exists():
            sys.exit(f"{args.refs} is missing; run apply first or pass --refs.")
    batch = work.batch(args.batch)
    refs = set(load(work.dir / args.refs)) if args.refs else None
    round_dir = work.dir / "blind" / name
    if round_dir.exists():
        sys.exit(f"{round_dir} already exists; pick a new round name.")
    files: dict[str, list] = {}
    for ref, quiz, item in items_of(batch):
        if refs is None or ref in refs:
            files.setdefault(quiz, []).append(
                {
                    "ref": ref,
                    "stem": item["stem"],
                    "choices": dict(zip("ABCD", item["choices"])),
                }
            )
    for n, rows in enumerate(files.values(), 1):
        dump(round_dir / f"items-{n}.json", rows)
    dump(round_dir / "meta.json", {"batch": args.batch, "files": len(files)})
    dump(work.dir / "blind" / "rounds.json", rounds + [name])
    print(
        f"round {name}, batch {args.batch}: {sum(map(len, files.values()))} items in {len(files)} files under {round_dir}"
    )


def agreement(rows, keys, offset: int) -> float:
    pairs = [
        (rows[i]["answer"], keys[i + offset])
        for i in range(len(rows))
        if 0 <= i + offset < len(keys)
    ]
    return sum(a == k for a, k in pairs) / (len(pairs) or 1)


def shifted_run(rows, keys) -> int:
    """Most wrong answers in one stretch where every answer is a neighbor item's key."""
    best = 0
    for offset in (-1, 1):
        run = 0
        for i, row in enumerate(rows):
            j = i + offset
            if 0 <= j < len(keys) and row["answer"] == keys[j]:
                run += row["answer"] != keys[i]
            else:
                run = 0
            best = max(best, run)
    return best


def cmd_check_blind(work: Work, args) -> None:
    """Validate a round's answer files, refuse misaligned ones, and log clean solves.
    --round defaults to the latest round."""
    work.use_round(args)
    round_dir = work.dir / "blind" / args.round
    meta = load(round_dir / "meta.json")
    batch = {ref: item for ref, _, item in items_of(work.batch(meta["batch"]))}
    log, errors, report = work.log(), [], []
    for n in range(1, meta["files"] + 1):
        items = load(round_dir / f"items-{n}.json")
        path = round_dir / f"answers-{n}.json"
        if not path.exists():
            errors.append(f"{path.name}: missing.")
            continue
        answers = {row.get("ref"): row for row in load(path)}
        order = [i["ref"] for i in items]
        problems = [
            f"{path.name}: no answer for {r}." for r in order if r not in answers
        ]
        problems += [
            f"{path.name}: unknown ref {r}."
            for r in answers
            if r not in batch or r not in order
        ]
        problems += [
            f"{path.name}: {r} answer {a.get('answer')!r} is not A to D."
            for r, a in answers.items()
            if a.get("answer") not in ("A", "B", "C", "D")
        ]
        if problems:
            errors += problems
            continue
        rows = [answers[r] for r in order]
        keys = [batch[r]["answer"] for r in order]
        direct = agreement(rows, keys, 0)
        shifted = max(agreement(rows, keys, -1), agreement(rows, keys, 1))
        if len(rows) >= 10 and (
            direct < 0.5 or shifted > direct or shifted_run(rows, keys) >= 5
        ):
            errors.append(
                f"{path.name}: misaligned, rerun this file (agreement {direct:.0%}, shifted {shifted:.0%})."
            )
            continue
        report.append(f"{path.name}: {len(rows)} answers, agreement {direct:.0%}")
        for r, row in zip(order, rows):
            clean = row["answer"] == batch[r]["answer"] and not row.get("defensible")
            log["solved"].setdefault(r, []).append(
                {
                    "hash": content_hash(batch[r]),
                    "round": args.round,
                    "answer": row["answer"],
                    "defensible": row.get("defensible", []),
                    "note": row.get("note", ""),
                    "clean": clean,
                }
            )
    if errors:
        sys.exit("\n".join(errors))
    dump(work.dir / "blind-log.json", log)
    print("\n".join([f"round {args.round}", *report]))


def latest(log, ref, round_name):
    return next(
        (s for s in reversed(log["solved"].get(ref, [])) if s["round"] == round_name),
        None,
    )


def cmd_triage(work: Work, args) -> None:
    """Split items into the standards pass (one file per quiz) and the escalated set.
    --round defaults to the latest round, --batch to that round's batch."""
    work.use_round(args)
    batch = work.batch(args.batch)
    log = work.log()
    sizes: dict[str, int] = {}
    topic_of: dict[str, str] = {}
    for ref, quiz, _ in items_of(batch):
        sizes[quiz] = sizes.get(quiz, 0) + 1
        topic_of[quiz] = ref.split(SEP)[0]
    unverified = {}
    for path in sorted(work.dir.glob("unverified-*.json")):
        rows, brief = load(path), path.with_name(path.name.replace("unverified", "brief"))
        if brief.exists():
            quiz = load(brief)["quiz"]["name"]
            rows = [{**row, "quiz": quiz} for row in rows]
            size = sizes.get(quiz, 0)
        else:  # a replacement batch spans quizzes; each row names its quiz
            size = sum(sizes.values())
        if len(rows) > min(UNVERIFIED_LIMIT, size // 10):
            for row in rows:
                ref = SEP.join((topic_of[row["quiz"]], row["quiz"], str(row["item"])))
                unverified[ref] = row["fact"]
    standards: dict[str, list] = {}
    escalated = []
    for ref, quiz, item in items_of(batch):
        solve = latest(log, ref, args.round)
        if solve is None:
            sys.exit(
                f"{ref} has no answer in round {args.round}; run check-blind first."
            )
        why = []
        if solve["answer"] != item["answer"]:
            why.append(
                f"Blind answer {solve['answer']} differs from key {item['answer']}."
            )
        if solve["defensible"]:
            why.append(
                f"Blind solver found {', '.join(solve['defensible'])} defensible."
            )
        if solve["note"]:
            why.append(f"Blind note: {solve['note']}")
        if ref in unverified:
            why.append(f"Writer could not verify: {unverified[ref]}")
        if why:
            escalated.append({"ref": ref, "reasons": why})
        else:
            standards.setdefault(quiz, []).append({"ref": ref, **item})
    for old in work.dir.glob("standards-input-*.json"):
        old.unlink()
    for n, rows in enumerate(standards.values(), 1):
        dump(work.dir / f"standards-input-{n}.json", rows)
    dump(work.dir / "escalated.json", escalated)
    print(
        f"round {args.round}, batch {args.batch}: "
        f"{sum(map(len, standards.values()))} to the standards pass in {len(standards)} files, "
        f"{len(escalated)} escalated"
    )


def cmd_route_standards(work: Work, args) -> None:
    """Merge the per-quiz standards reviews. Keep only flaw, metadata and correction edits;
    send the rest to judgment, and drops and near-duplicates to review-drops.json."""
    review, flagged = [], []
    for source in sorted(work.dir.glob("standards-input-*.json")):
        n = source.stem.rsplit("-", 1)[1]
        inputs = {item["ref"] for item in load(source)}
        for name, rows in (("review-standards", review), ("standards-escalate", flagged)):
            path = work.dir / f"{name}-{n}.json"
            if not path.exists():
                sys.exit(f"{path.name} is missing; run the standards pass on {source.name}.")
            entries = load(path)
            if stray := [e["ref"] for e in entries if e["ref"] not in inputs]:
                sys.exit(
                    f"{path.name} has refs not in {source.name} (keyed by position instead of ref?): "
                    + ", ".join(stray)
                )
            rows += entries
    escalated = load(work.dir / "escalated.json")
    replace = []
    known = {e["ref"] for e in escalated}

    def escalate(ref, reason, edits=None):
        if ref not in known:
            escalated.append({"ref": ref, "reasons": []})
            known.add(ref)
        entry = next(e for e in escalated if e["ref"] == ref)
        entry["reasons"].append(reason)
        if edits:
            entry["proposed"] = edits

    kept = []
    for entry in review:
        if entry.get("drop") or "near-duplicate" in entry.get("reason", "").lower():
            replace.append({"ref": entry["ref"], "reason": entry.get("reason", "")})
        elif entry.get("severity") in STANDARDS_SEVERITIES:
            kept.append(entry)
        else:
            escalate(
                entry["ref"],
                f"Standards reviewer suspected {entry.get('severity')}: {entry.get('reason', '')}",
                entry.get("edits"),
            )
    for row in flagged:
        if "near-duplicate" in row["reason"].lower():
            replace.append({"ref": row["ref"], "reason": row["reason"]})
        else:
            escalate(row["ref"], f"Standards reviewer: {row['reason']}")
    replacing = {r["ref"] for r in replace}
    escalated = [e for e in escalated if e["ref"] not in replacing]
    kept = [e for e in kept if e["ref"] not in replacing]
    # One reviewer per item: the judge gets standards edits on escalated items as proposals.
    for entry in [e for e in kept if e["ref"] in known]:
        target = next(e for e in escalated if e["ref"] == entry["ref"])
        target["reasons"].append(
            f"Standards reviewer also proposed ({entry['severity']}): {entry.get('reason', '')}"
        )
        target["proposed"] = {**entry.get("edits", {}), **target.get("proposed", {})}
        kept.remove(entry)
    dump(work.dir / "review-standards.json", kept)
    dump(work.dir / "escalated.json", escalated)
    dump(work.dir / "review-drops.json", [{**r, "drop": True} for r in replace])
    print(
        f"{len(kept)} standards edits kept, {len(escalated)} escalated, {len(replace)} to drop and replace"
    )


def cmd_judge_input(work: Work, args) -> None:
    """Write judgment-input-<round>.json: the escalated items, or a recheck's unclean solves.
    --round defaults to the latest round, --batch to that round's batch."""
    work.use_round(args)
    batch = {ref: item for ref, _, item in items_of(work.batch(args.batch))}
    log = work.log()
    rows = []
    if args.round == "initial":
        entries = load(work.dir / "escalated.json")
    else:  # a recheck: the items whose solve in this round wasn't clean
        entries = [
            {"ref": ref, "reasons": [f"Recheck answer {s['answer']}, defensible {s.get('defensible') or 'none'}."]}
            for ref in batch
            if (s := latest(log, ref, args.round)) and not s["clean"]
        ]
    for entry in entries:
        item = batch[entry["ref"]]
        rows.append(
            {
                "ref": entry["ref"],
                **item,
                "blind": latest(log, entry["ref"], args.round),
                "escalation": entry["reasons"],
                **({"proposed": entry["proposed"]} if "proposed" in entry else {}),
            }
        )
        log["judged"].append(content_hash(item))
    dump(work.dir / f"judgment-input-{args.round}.json", rows)
    dump(work.dir / "blind-log.json", log)
    print(
        f"round {args.round}, batch {args.batch}: {len(rows)} items for judgment in "
        f"judgment-input-{args.round}.json; the judge writes review-judgment-{args.round}.json"
    )


def cmd_apply(work: Work, args) -> None:
    """Apply review edits as written and refuse unknown refs and fields. Dropped items go to
    the subject's replacement backlog, so their quizzes stay short until it is written."""
    out_path = work.dir / args.output
    if out_path.exists():
        sys.exit(f"{out_path} already exists.")
    batch = work.batch(args.batch)
    items = {ref: item for ref, _, item in items_of(batch)}
    entries = [entry for name in args.reviews for entry in load(work.dir / name)]
    errors, drop, rewritten = [], {}, []
    for entry in entries:
        ref, edits = entry.get("ref"), entry.get("edits", {})
        if ref not in items:
            errors.append(f"{ref}: no such item.")
            continue
        if entry.get("drop"):
            drop.setdefault(ref, entry.get("reason", ""))
            continue
        item = items[ref]
        for field, value in edits.items():
            if field in ITEM_FIELDS:
                item[field] = value
            elif field in NESTED:
                parent, key = field.split(".")
                item.setdefault(parent, {})[key] = value
            else:
                errors.append(f"{ref}: {field} is not an editable field.")
        if "choices" in edits and "answer" not in edits:
            errors.append(f"{ref}: a choices edit must also send answer.")
        if len(item["choices"]) != 4 or item["answer"] not in ("A", "B", "C", "D"):
            errors.append(f"{ref}: choices and answer don't match.")
        if {"stem", "choices", "answer"} & edits.keys() and ref not in rewritten:
            rewritten.append(ref)
    if errors:
        sys.exit("\n".join(errors))
    backlog = work.backlog()
    renumber = {}
    for topic in batch["topics"]:
        for quiz in topic["quizzes"]:
            for n, item in enumerate(quiz["items"], 1):
                ref = SEP.join((topic["name"], quiz["name"], str(n)))
                if ref not in drop:
                    continue
                backlog = [
                    b for b in backlog if (b["ref"], b["stem"]) != (ref, item["stem"])
                ]
                backlog.append(
                    {
                        "ref": ref,
                        "topic": topic["name"],
                        "quiz": quiz["name"],
                        "reason": drop[ref],
                        "answer": item["answer"],
                        "metadata": item.get("metadata", {}),
                        "stem": item["stem"],
                    }
                )
            kept = []
            for n, item in enumerate(quiz["items"], 1):
                ref = SEP.join((topic["name"], quiz["name"], str(n)))
                if ref not in drop:
                    kept.append(item)
                    renumber[ref] = SEP.join((topic["name"], quiz["name"], str(len(kept))))
            quiz["items"] = kept
        # A replacement batch has one item per quiz, so a drop can empty a quiz.
        topic["quizzes"] = [q for q in topic["quizzes"] if q["items"]]
    batch["topics"] = [t for t in batch["topics"] if t["quizzes"]]
    # Drops renumber the items after them; rewritten refs name items in the output batch.
    rewritten = [renumber[r] for r in rewritten if r in renumber]
    dump(out_path, batch)
    if drop:
        dump(work.backlog_path, backlog)
    dump(work.dir / f"rewritten-{Path(args.output).stem}.json", rewritten)
    print(
        json.dumps(
            {
                "applied": len(entries) - len(drop),
                "dropped": sorted(drop),
                "replacementBacklog": len(backlog),
                "rewritten": len(rewritten),
                "rewrittenFile": f"rewritten-{Path(args.output).stem}.json",
            },
            ensure_ascii=False,
        )
    )


def cmd_accept(work: Work, args) -> None:
    """Record items as judged unchanged, e.g. a recheck disagreement where the key is clearly right."""
    batch = {ref: item for ref, _, item in items_of(work.batch(args.batch))}
    unknown = [r for r in args.refs if r not in batch]
    if unknown:
        sys.exit("No such item: " + ", ".join(unknown))
    log = work.log()
    log["judged"] += [content_hash(batch[r]) for r in args.refs]
    dump(work.dir / "blind-log.json", log)
    print(f"{len(args.refs)} items accepted as judged")


def cmd_ready(work: Work, args) -> None:
    """Every item must have a clean blind solve of its current content, or have been judged as is."""
    log = work.log()
    # Match by content, not ref: drops renumber items between rounds.
    cleared = set(log["judged"]) | {
        s["hash"] for solves in log["solved"].values() for s in solves if s["clean"]
    }
    missing = [
        ref for ref, _, item in items_of(work.batch(args.batch)) if content_hash(item) not in cleared
    ]
    if missing:
        sys.exit(
            "Not ready; these need a blind solve of their current content (or a fix):\n"
            + "\n".join(missing)
        )
    print("Ready to stage.")


FIND_FULL, FIND_TITLES = 8, 40  # past FIND_FULL matches, list titles only


def find_sources(path: Path, terms: list[str]) -> None:
    """Print the ledger entries that contain every term, newest first."""
    terms = [t.lower() for t in terms]
    hits = [
        e
        for e in (load(path) if path.exists() else [])
        if all(t in json.dumps(e, ensure_ascii=False).lower() for t in terms)
    ]
    hits.sort(key=lambda e: str(e.get("year", "")), reverse=True)
    full = len(hits) <= FIND_FULL
    for e in hits[:FIND_TITLES]:
        print(f"{e['status']} {e.get('year', '')} {e['title']}")
        if full:
            print(f"  {e.get('url', '')}")
            print("".join(f"  - {f}\n" for f in e.get("facts", [])), end="")
    if not hits:
        print("No matching sources.")
    elif not full:
        print(f"{len(hits)} matches. Add a term from the title you need to see its URL and facts.")


def cmd_ledger(work: Work, args) -> None:
    """Merge every topic's sources-<n>.json into the shared ledger, WORK/../sources.json; --find TERM... looks entries up."""
    if args.find:
        find_sources(work.ledger, args.find)
    else:
        merge_ledger(work)


def merge_ledger(work: Work) -> None:
    path = work.ledger
    path.parent.mkdir(parents=True, exist_ok=True)
    # Sessions for other subjects share this ledger; hold the lock across read, merge and write.
    with open(path.with_name(path.name + ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        index: dict[tuple[str, str], dict] = {}

        def fold(row: dict) -> bool:
            """Merge a row into the index; True when it is a new entry."""
            url = re.sub(r"^(https?://)?(www\.)?", "", row.get("url", "").strip().lower()).rstrip("/")
            k = (url or row["title"].strip().lower(), str(row.get("year", "")))
            entry = index.get(k)
            if entry is None:
                index[k] = {**row, "facts": list(row.get("facts", []))}
                return True
            if STATUS_RANK[row["status"]] > STATUS_RANK[entry["status"]]:
                entry["status"] = row["status"]
                entry["url"] = row.get("url", entry.get("url", ""))
            entry["facts"] += [f for f in row.get("facts", []) if f not in entry["facts"]]
            return False

        for row in load(path) if path.exists() else []:
            fold(row)
        added = 0
        for source in sorted(work.root.glob("*/sources-*.json")):
            for row in load(source):
                if row.get("status") not in STATUS_RANK:
                    sys.exit(f"{source}: {row['title']} has status {row.get('status')!r}.")
                added += fold(row)
        dump(path, sorted(index.values(), key=lambda e: e["title"].lower()))
    print(f"{len(index)} sources ({added} new) in {path}")


def cmd_backlog(work: Work, args) -> None:
    """Count the dropped items awaiting replacement, per quiz; --clear once they are staged.
    --clear keeps the drops from replacements/batch.json, each with its slot's earlier reason, and
    moves WORK/replacements aside as replacements-<k>. With an outline, shows each quiz's hard share."""
    if args.clear:
        batch_path = work.root / "replacements" / "batch.json"
        new = {i["stem"] for _, _, i in items_of(load(batch_path))} if batch_path.exists() else set()
        keep = [b for b in work.backlog() if b["stem"] in new]
        earlier = [b for b in work.backlog() if b["stem"] not in new]
        for entry in keep:
            slot = (entry["topic"], entry["quiz"])
            prior = next((e for e in earlier if (e["topic"], e["quiz"]) == slot), None)
            if prior:
                earlier.remove(prior)
                entry["reason"] += f" Earlier drop in this slot: {prior['reason']}"
        if keep:
            dump(work.backlog_path, keep)
        else:
            work.backlog_path.unlink(missing_ok=True)
        moved = ""
        if (work.root / "replacements").exists():
            k = 1
            while (work.root / f"replacements-{k}").exists():
                k += 1
            (work.root / "replacements").rename(work.root / f"replacements-{k}")
            moved = f" replacements moved to replacements-{k}."
        print(f"Backlog cleared; {len(keep)} dropped replacements kept for the next round.{moved}")
        return
    outline = load(work.root / "outline.json") if (work.root / "outline.json").exists() else {"topics": []}
    staged = {(t["name"], q["name"]): q for t in outline["topics"] for q in t.get("quizzes", [])}
    counts: dict[tuple, int] = {}
    for entry in work.backlog():
        key = (entry["topic"], entry["quiz"])
        counts[key] = counts.get(key, 0) + 1
    lines = []
    for key, n in counts.items():
        quiz = staged.get(key, {})
        hard = f" (hard {quiz['difficulty'].get('hard', 0)}/{quiz['questionCount']} staged)" if "difficulty" in quiz else ""
        lines.append(f"{n} {SEP.join(key)}{hard}")
    print("\n".join(lines) or "Backlog is empty.")


ROLES = ("writer", "blind", "standards", "judge", "replace")
PROMPTS = Path(__file__).resolve().parent / "prompts"


def numbered(folder: Path, pattern: str) -> list[Path]:
    return sorted(folder.glob(pattern), key=lambda p: int(p.stem.rsplit("-", 1)[1]))


def cmd_prompt(work: Work, args) -> None:
    """Render prompts/<role>.md for ROLE (writer, blind, standards, judge, replace) into
    TOPICDIR/prompt-<role>.md (writer: prompt-writer-<n>.md) and print its path. writer needs
    exactly one --n; blind and standards take --n values (default all of the round's items files or
    all standards-input files). replace needs no topic."""
    role, root = args.role, work.root.resolve()
    if role != "replace" and not args.topic:
        sys.exit(f"{role} needs a topic.")
    folder = root / "replacements" if role == "replace" else root / work.dir.name
    n = None
    if role == "writer":
        if not args.n or len(args.n) != 1:
            sys.exit("writer needs exactly one --n.")
        n = args.n[0]
        if not (folder / f"brief-{n}.json").exists():
            sys.exit(f"{folder / f'brief-{n}.json'} does not exist; run slices first.")
    tag = f"{role}-{n}" if n else role
    scratch = folder / "scratch" / tag
    scratch.mkdir(parents=True, exist_ok=True)
    notes = [p.read_text("utf-8").strip() for p in (root / "notes.md", folder / "notes.md") if p.exists()]
    subs = {"WORK": str(root), "TOPICDIR": str(folder), "TOPICNAME": "replacements" if role == "replace" else args.topic, "SCRATCH": str(scratch) + "/", "REPO": str(Path(__file__).resolve().parents[3])}
    if role == "writer":
        subs |= {"BRIEF": str(folder / f"brief-{n}.json"), "BATCH": str(folder / f"batch-{n}.json")}
    if role in ("blind", "judge"):
        subs["ROUND"] = (work.rounds() or sys.exit("No blind round yet; run blind first."))[-1]
    if role == "judge":
        subs["BATCH"] = str(folder / load(folder / "blind" / subs["ROUND"] / "meta.json")["batch"])
    if role == "blind":
        round_dir = folder / "blind" / subs["ROUND"]
        paths = [round_dir / f"items-{k}.json" for k in args.n] if args.n else numbered(round_dir, "items-*.json")
        subs["FILES"] = "\n".join(f"- {p}" for p in paths)
    if role == "standards":
        paths = [folder / f"standards-input-{k}.json" for k in args.n] if args.n else numbered(folder, "standards-input-*.json")
        if not paths:
            sys.exit("No standards-input files; run triage first.")
        subs["INPUTS"] = "\n".join(f"- {p}" for p in paths)
    subs["SUBJECT_NOTES"] = "\n\n".join(notes) or "None."
    text = (PROMPTS / f"{role}.md").read_text("utf-8")
    # One pass over whole tokens, so substituted text is never scanned again.
    text = re.sub(r"\b(" + "|".join(subs) + r")\b", lambda m: subs[m[1]], text)
    out = folder / f"prompt-{tag}.md"
    out.write_text(text, "utf-8")
    print(out)


STOP = set(
    """the and for with that this are was were has had have not but you your from into over under than then
    their there these those they them its his her who whom what when where while will would should could may might can does did
    been being any all each both either other such only also more less very per via about after before during without within
    year years old woman man boy girl male female patient patients presents presented presenting history following which most
    likely appropriate next step steps management diagnosis examination exam shows reveals reveal show mg dl kg ml mmhg bpm
    one two three four five six seven eight nine ten days day weeks week months month hours hour ago brought comes came
    physical findings finding test tests result results reported complains complaint""".split()
)


def tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) >= 3 and t not in STOP]


def cmd_similar(work: Work, args) -> None:
    """Near-duplicate candidates for each batch item (stem plus keyed choice): TF-IDF cosine against
    WORK/stems.txt and the batch's other items. Lists up to --top matches scoring 0.35 or more."""
    corpus, section = [], ""
    stems = work.root / "stems.txt"
    for line in stems.read_text("utf-8").splitlines() if stems.exists() else []:
        if line.startswith("## "):
            section = line[3:]
        elif line.startswith("- "):
            corpus.append((section, line[2:]))
    rows = list(items_of(work.batch(args.batch)))
    corpus += [(f"this batch{SEP}{ref}", item["stem"]) for ref, _, item in rows]
    docs = [Counter(tokens(stem)) for _, stem in corpus]
    df = Counter(t for d in docs for t in d)
    idf = lambda t: math.log((len(docs) + 1) / (df[t] + 1)) + 1

    def vec(counts):
        v = {t: c * idf(t) for t, c in counts.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1
        return {t: x / norm for t, x in v.items()}

    vectors, flagged = [vec(d) for d in docs], 0
    for ref, _, item in rows:
        keyed = item["choices"]["ABCD".index(item["answer"])]
        query = vec(Counter(tokens(f"{item['stem']} {keyed}")))
        scored = sorted(
            (
                (sum(w * v.get(t, 0) for t, w in query.items()), sec, stem)
                for (sec, stem), v in zip(corpus, vectors)
                if sec != f"this batch{SEP}{ref}" and stem != item["stem"]
            ),
            reverse=True,
        )
        hits = [s for s in scored[: args.top] if s[0] >= 0.35]
        if hits:
            flagged += 1
            print(ref)
            for score, sec, stem in hits:
                print(f"  {score:.2f} {sec}: {stem[:160]}")
    print(f"{flagged} of {len(rows)} items have near-duplicate candidates.")


def cmd_gate(work: Work, args) -> None:
    """Run the batch report (npm run report:quiz-batch) on a batch with the outline and blueprint."""
    repo = Path(__file__).resolve().parents[3]
    root = work.root.resolve()
    cmd = ["npm", "run", "-s", "report:quiz-batch", "--", str(work.dir.resolve() / args.batch),
           "--outline", str(root / "outline.json"), "--blueprint", str(root / "blueprint.json")]
    sys.exit(subprocess.run(cmd, cwd=repo, check=False).returncode)


KEEP = {"blueprint.json"}


def cmd_clean(work: Work, args) -> None:
    """Merge the ledger, then delete everything but blueprint.json."""
    if work.backlog():
        sys.exit(
            f"{len(work.backlog())} dropped items still await replacement; "
            "write and stage them, then run backlog --clear."
        )
    merge_ledger(work)
    removed = []
    for path in sorted(work.root.iterdir()):
        if path.name in KEEP:
            continue
        shutil.rmtree(path) if path.is_dir() else path.unlink()
        removed.append(path.name)
    print(f"Removed {len(removed)} entries; kept {', '.join(sorted(KEEP))}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--work", type=Path, required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    for name, fn, opts in [
        ("slices", cmd_slices, []),
        ("merge", cmd_merge, []),
        ("blind", cmd_blind, ["batch=batch.json", "round?", "refs?"]),
        ("check-blind", cmd_check_blind, ["round?"]),
        ("triage", cmd_triage, ["batch?", "round?"]),
        ("route-standards", cmd_route_standards, []),
        ("judge-input", cmd_judge_input, ["batch?", "round?"]),
        ("apply", cmd_apply, ["batch", "output"]),
        ("accept", cmd_accept, ["batch"]),
        ("ready", cmd_ready, ["batch"]),
        ("ledger", cmd_ledger, []),
        ("backlog", cmd_backlog, []),
        ("prompt", cmd_prompt, []),
        ("similar", cmd_similar, ["batch=batch.json"]),
        ("gate", cmd_gate, ["batch=batch.json"]),
        ("clean", cmd_clean, []),
    ]:
        p = sub.add_parser(name, help=fn.__doc__, description=fn.__doc__)
        if name == "prompt":
            p.add_argument("role", choices=ROLES)
        p.add_argument(
            "topic",
            nargs="?" if name in ("ledger", "backlog", "clean", "prompt") else None,
            default="",
        )
        for opt in opts:
            opt, _, default = opt.partition("=")
            if opt.endswith("?"):
                p.add_argument(f"--{opt[:-1]}")
            elif default:
                p.add_argument(f"--{opt}", default=default)
            else:
                p.add_argument(f"--{opt}", required=True)
        if name == "apply":
            p.add_argument("reviews", nargs="+")
        if name == "accept":
            p.add_argument("refs", nargs="+")
        if name == "ledger":
            p.add_argument("--find", nargs="+", metavar="TERM")
        if name == "backlog":
            p.add_argument("--clear", action="store_true")
        if name == "prompt":
            p.add_argument("--n", nargs="+", type=int)
        if name == "similar":
            p.add_argument("--top", type=int, default=3)
        p.set_defaults(fn=fn)
    args = parser.parse_args()
    args.fn(Work(args.work, args.topic), args)


if __name__ == "__main__":
    main()
