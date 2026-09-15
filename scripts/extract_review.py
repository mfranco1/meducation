#!/usr/bin/env python3
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
review = [row['file'] for row in json.loads((ROOT / 'content/review-report.json').read_text()) if 'flashcard' not in row['file'].lower()]
offset, count = int(sys.argv[1]), int(sys.argv[2])

def run(relative):
    return subprocess.run([sys.executable, '-u', 'scripts/build_question_bank.py', '--pdf', relative], cwd=ROOT, capture_output=True, text=True).returncode

with ThreadPoolExecutor(max_workers=5) as pool:
    codes = list(pool.map(run, review[offset:offset + count]))
print(f'Processed {len(codes)} review PDFs; failures: {sum(code != 0 for code in codes)}')
