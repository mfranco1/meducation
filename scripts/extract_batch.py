#!/usr/bin/env python3
import subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
files = sorted(path for path in (ROOT / 'tn-pdfs').glob('*/tests/*.pdf') if 'flashcard' not in path.name.lower())
offset = int(sys.argv[1]); count = int(sys.argv[2]); selected = files[offset:offset + count]

def run(path: Path):
    relative = path.relative_to(ROOT).as_posix()
    result = subprocess.run([sys.executable, '-u', 'scripts/build_question_bank.py', '--pdf', relative], cwd=ROOT, capture_output=True, text=True)
    return relative, result.returncode, result.stdout.strip(), result.stderr.strip()

with ThreadPoolExecutor(max_workers=6) as pool:
    for relative, code, stdout, stderr in pool.map(run, selected):
        print(('OK' if code == 0 else 'FAIL'), relative, stdout or stderr)
