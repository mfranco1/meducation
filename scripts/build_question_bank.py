#!/usr/bin/env python3
"""Build source-derived runtime JSON from every PDF in tn-pdfs/*/tests.

This is a mechanical extraction only: wording/choice order are retained from the
PDF text layer, source answers are retained separately, and any ambiguous parse
is rejected into content/review-report.json rather than shipped as ready.
"""
from __future__ import annotations
import re, sys
from pathlib import Path
from pypdf import PdfReader
from question_bank_output import write_partial, write_question_bank

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tn-pdfs'
OUT = ROOT / 'src/content/questionBank.generated.json'
REPORT = ROOT / 'content/review-report.json'
PARTIALS = ROOT / 'content/extracted'

SUBJECT_NAMES = {'anat_histo':'Anatomy & Histology','biochem':'Biochemistry','leg_med':'Legal Medicine','medicine':'Internal Medicine','micropara':'Microbiology & Parasitology','ob':'Obstetrics & Gynecology','patho':'Pathology','pedia':'Pediatrics','pharm':'Pharmacology','physio':'Physiology','prev_med':'Preventive Medicine','surg':'Surgery'}

def slug(value: str) -> str:
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', value.lower())).strip('-')

def clean(value: str) -> str:
    # PDF text layers encode spacing as tabs. Preserve line structure, normalizing only layout spacing.
    value = value.replace('\u00a0', ' ').replace('\t', ' ')
    lines = [re.sub(r' {2,}', ' ', line).strip() for line in value.splitlines()]
    return '\n'.join(line for line in lines if line and not NOISE.match(line)).strip()

QUESTION = re.compile(r'(?m)^\s*[.]?(\d{1,3})(?:\.\d{1,3})?[.):]?(?:\s*$|\s+(?=[A-Z]))')
CHOICE = re.compile(r'(?m)^\s*([A-D])\.\s*')
COLUMN_CHOICE = re.compile(r'(?m)(?:^|\t{2,})([A-D])\.\s*')
ANSWER = re.compile(r'(?i)\banswer\s*[:;.]*\s*[^A-Za-z0-9\s]?\s*([A-D])(?:\s*[.)])?')
NOISE = re.compile(r'(?i)^(?:TOPNOTCH MEDICAL BOARD PREP|For inquiries visit|This\s+handout\s+is\s+only\s+valid|J O H N\s+F E R M A N|.*Page\s+\d+\s+of\s+\d+\s*$)')

# Source answer omissions confirmed from the accompanying discussion text.
VERIFIED_OVERRIDES = {
    'tn-pdfs/medicine/tests/A12 - INTERNAL MEDICINE PRACTICE TEST B OCT 2026.pdf': {72: 'A'},
    'tn-pdfs/ob/tests/7 - OBSTETRICS AND GYNECOLOGY PRACTICE TEST C OCT 2026.pdf': {74: 'D'},
}

def parse_question_block(block: str):
    options = list(CHOICE.finditer(block))
    column_layout = False
    if len(options) != 4 or [x.group(1) for x in options] != list('ABCD'):
        options = list(COLUMN_CHOICE.finditer(block)); column_layout = True
        if len(options) != 4 or set(x.group(1) for x in options) != set('ABCD'): return None
    stem = clean(block[:options[0].start()])
    choices = []
    for index, match in enumerate(options):
        end = options[index + 1].start() if index + 1 < len(options) else len(block)
        text = clean(block[match.end():end])
        if not text: return None
        choices.append({'id': match.group(1), 'text': text})
    if column_layout: choices.sort(key=lambda choice: choice['id'])
    return stem, choices

def extract(path: Path, subject_id: str):
    reader = PdfReader(str(path))
    page_text = [page.extract_text() or '' for page in reader.pages]
    full = '\n'.join(page_text)
    discussion_at = full.lower().find('discussion')
    source_text = full[:discussion_at] if discussion_at >= 0 else full
    source_matches = list(QUESTION.finditer(source_text))
    source_candidates = {}
    source_ordered = []
    for i, match in enumerate(source_matches):
        end = source_matches[i+1].start() if i+1 < len(source_matches) else len(source_text)
        result = parse_question_block(source_text[match.end():end])
        if result:
            number = int(match.group(1)); stem, choices = result
            source_ordered.append((number, stem, choices))
            if number not in source_candidates or len(stem) > len(source_candidates[number][0]): source_candidates[number] = (stem, choices)
    discussion = full[discussion_at:] if discussion_at >= 0 else full
    matches = list(QUESTION.finditer(discussion))
    parsed = {}
    answer_by_number = {}
    for i, match in enumerate(matches):
        end = matches[i+1].start() if i+1 < len(matches) else len(discussion)
        block = discussion[match.end():end]
        answer = ANSWER.search(block)
        if not answer: continue
        number = int(match.group(1))
        answer_by_number[number] = answer.group(1).upper()
        result = parse_question_block(block[:answer.start()])
        if not result: continue
        stem, choices = result
        rest = block[answer.end():]
        rationale_at = rest.lower().find('discussion')
        rationale = clean(rest[rationale_at + len('discussion'):] if rationale_at >= 0 else rest)
        candidate = (number, stem, choices, answer.group(1).upper(), rationale or None)
        if number not in parsed or len(stem) > len(parsed[number][1]): parsed[number] = candidate
    # Fill malformed discussion blocks from the original question section while retaining
    # the answer attached to the same numbered discussion block.
    for number, (stem, choices) in source_candidates.items():
        if number not in parsed and number in answer_by_number:
            parsed[number] = (number, stem, choices, answer_by_number[number], None)
    # Some tests provide an answer list rather than repeated discussion blocks.
    raw_answers = ANSWER.findall(full)
    if len(source_ordered) == len(raw_answers):
        for index, (number, stem, choices) in enumerate(source_ordered):
            if number not in parsed: parsed[number] = (number, stem, choices, raw_answers[index].upper(), None)
    relative = path.relative_to(ROOT).as_posix()
    for number, answer in VERIFIED_OVERRIDES.get(relative, {}).items():
        if number not in parsed and number in source_candidates:
            stem, choices = source_candidates[number]
            parsed[number] = (number, stem, choices, answer, None)
    return [parsed[n] for n in sorted(parsed)], len(reader.pages)

def main():
    requested = sys.argv[1:]
    pdf_only = requested and requested[0] == '--pdf'
    if pdf_only:
        if len(requested) != 2: raise SystemExit('Usage: build_question_bank.py --pdf tn-pdfs/<subject>/tests/<file>.pdf')
        pdf = ROOT / requested[1]
        subject_id = pdf.parts[-3]
        if subject_id not in SUBJECT_NAMES or not pdf.exists(): raise SystemExit(f'Invalid source PDF: {requested[1]}')
        subject_ids = [subject_id]
    else:
        subject_ids = requested or list(SUBJECT_NAMES)
    unknown = set(subject_ids) - set(SUBJECT_NAMES)
    if unknown: raise SystemExit(f'Unknown subjects: {", ".join(sorted(unknown))}')
    subjects = [{'id': id, 'name': name, 'description': 'Practice tests from the source collection', 'accent': ['#b9511b','#c67428','#9b4a2d'][n % 3]} for n, (id, name) in enumerate(SUBJECT_NAMES.items())]
    quizzes, questions, review = [], [], []
    for subject_id in subject_ids:
        pdfs = [pdf] if pdf_only else sorted((SOURCE / subject_id / 'tests').glob('*.pdf'))
        for pdf in pdfs:
            relative = pdf.relative_to(ROOT).as_posix(); quiz_id = f'{subject_id}-{slug(pdf.stem)}'
            try: parsed, pages = extract(pdf, subject_id)
            except Exception as exc:
                review.append({'file': relative, 'reason': f'Extraction error: {exc}'}); continue
            expected = 300 if 'supersamplex' in pdf.name.lower() else 100
            ready = len(parsed) == expected
            quizzes.append({'id':quiz_id,'subjectId':subject_id,'name':re.sub(r'^\w+\s*-\s*', '', pdf.stem).title(),'sourcePdf':relative,'questionCount':len(parsed),'status':'ready' if ready else 'needs_review'})
            if not ready:
                parsed_numbers = {row[0] for row in parsed}
                review.append({'file':relative,'reason':'Discussion-block count/order mismatch','parsedQuestions':len(parsed),'missingQuestions':sorted(set(range(1, expected + 1)) - parsed_numbers),'unexpectedQuestions':sorted(parsed_numbers - set(range(1, expected + 1))),'pages':pages})
                continue
            for number, stem, choices, answer, rationale in parsed:
                question = {'id':f'{quiz_id}-q-{number}','subjectId':subject_id,'quizId':quiz_id,'questionNumber':number,'stem':stem,'choices':choices,'sourceAnswer':answer,'answerSource':'provided_key','metadata':{'discipline':SUBJECT_NAMES[subject_id],'difficulty':'unknown'},'source':{'pdfFile':relative}}
                if number in VERIFIED_OVERRIDES.get(relative, {}):
                    question.pop('sourceAnswer')
                    question['verifiedAnswer'] = answer
                    question['answerSource'] = 'verified'
                    question['answerNote'] = 'The printed answer label is missing; the answer is explicit in the source discussion.'
                if rationale: question['rationale'] = rationale
                questions.append(question)
            print(f'OK {relative}: {len(parsed)} questions')
    if requested:
        name = slug(pdf.stem) if pdf_only else subject_ids[0]
        write_partial(PARTIALS, subject_ids[0], name, subjects, quizzes, questions, review)
        return
    write_question_bank(OUT, REPORT, subjects, quizzes, questions, review)

if __name__ == '__main__': main()
