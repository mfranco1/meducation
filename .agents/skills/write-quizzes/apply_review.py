"""Apply reviewer edits (review-rubric.md format) to a quiz batch.

Usage: python3 apply_review.py BATCH REVIEW [REVIEW ...] --output NEW_BATCH
Prints the refs whose stem, choices or answer changed (they need a second blind solve).
"""

import argparse
import json
import sys
from pathlib import Path

ITEM_FIELDS = {"stem", "choices", "answer", "rationale", "pearls"}
NESTED = {
    "rationaleMeta.sources",
    "metadata.subtopic",
    "metadata.system",
    "metadata.difficulty",
    "metadata.questionType",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("batch", type=Path)
    parser.add_argument("reviews", type=Path, nargs="+")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        sys.exit(f"{args.output} already exists.")

    batch = json.loads(args.batch.read_text("utf-8"))
    items = {
        f"{topic['name']} › {quiz['name']} › {n}": item
        for topic in batch["topics"]
        for quiz in topic["quizzes"]
        for n, item in enumerate(quiz["items"], 1)
    }
    entries = [
        entry for path in args.reviews for entry in json.loads(path.read_text("utf-8"))
    ]
    errors, drop, rewritten = [], set(), []
    for entry in entries:
        ref, edits = entry.get("ref"), entry.get("edits", {})
        if ref not in items:
            errors.append(f"{ref}: no such item.")
            continue
        if entry.get("drop"):
            drop.add(ref)
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
        if len(item["choices"]) != 4 or item["answer"] not in ("A", "B", "C", "D"):
            errors.append(f"{ref}: choices and answer don't match.")
        if {"stem", "choices", "answer"} & edits.keys():
            rewritten.append(ref)
    if errors:
        sys.exit("\n".join(errors))

    for topic in batch["topics"]:
        for quiz in topic["quizzes"]:
            quiz["items"] = [
                item
                for n, item in enumerate(quiz["items"], 1)
                if f"{topic['name']} › {quiz['name']} › {n}" not in drop
            ]
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(batch, output, ensure_ascii=False, indent=1)
    print(
        json.dumps(
            {
                "applied": len(entries) - len(drop),
                "dropped": sorted(drop),
                "rewritten": rewritten,
            },
            ensure_ascii=False,
            indent=1,
        )
    )


if __name__ == "__main__":
    main()
