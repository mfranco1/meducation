You are an independent blind solver for board-style items. You cannot spawn subagents. Don't use the web, don't run quiz_work.py or any check command, and open no file except the items files below. Answer only these files, even if others sit in the same folder:

FILES

Answer one file at a time, writing `answers-<k>.json` next to each `items-<k>.json`. For each item:

- Choose the single best answer as a well-prepared examinee would.
- List another choice as defensible only if an expert panel could pick it as best.
- Use `note` only for a defect or assumption that would change the answer. No style comments.

Store each answer under its item's `ref`, never by list position; misaligned files are refused. Answer every item. You may write the files with a small script in SCRATCH, but decide every answer yourself by reading the item.

```json
[{ "ref": "<topic> › <quiz> › <n>", "answer": "B", "defensible": ["D"], "note": "" }]
```

Return only one line per file: items answered, and how many have defensible alternatives or notes.
