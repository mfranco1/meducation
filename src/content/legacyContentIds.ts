/** One-time compatibility map for browser attempts saved before schema version 4. */
const legacySubjectIds = [
  "anat_histo",
  "biochem",
  "leg_med",
  "medicine",
  "micropara",
  "ob",
  "patho",
  "pedia",
  "pharm",
  "physio",
  "prev_med",
  "surg",
] as const;

const legacyQuizIds = [
  "anat_histo-5-anatomy-practice-test-1-handout-october-2026",
  "anat_histo-5-anatomy-practice-test-2-october-2026",
  "anat_histo-5-anatomy-practice-test-3-handout-october-2026",
  "anat_histo-5-anatomy-practice-test-4-handout-oct-2026",
  "anat_histo-5-anatomy-practice-test-5-handout-october-2026",
  "anat_histo-5-anatomy-practice-test-a-october-2026",
  "anat_histo-5-anatomy-practice-test-b-october-2026",
  "anat_histo-5-anatomy-practice-test-c-october-2026",
  "biochem-4-biochemistry-practice-test-1-oct-2026",
  "biochem-4-biochemistry-practice-test-2-oct-2026",
  "biochem-4-biochemistry-practice-test-3-oct-2026",
  "biochem-4-biochemistry-practice-test-4-oct-2026",
  "biochem-4-biochemistry-practice-test-5-oct-2026",
  "biochem-4-biochemistry-practice-test-a-oct-2026",
  "biochem-4-biochemistry-practice-test-b-oct-2026",
  "biochem-4-biochemistry-practice-test-c-oct-2026",
  "leg_med-2-lmmje-practice-test-1-handout-october-2026",
  "leg_med-2-lmmje-practice-test-2-handout-october-2026",
  "leg_med-2-lmmje-practice-test-3-handout-october-2026",
  "leg_med-2-lmmje-practice-test-4-handout-october-2026",
  "leg_med-2-lmmje-practice-test-5-handout-october-2026",
  "leg_med-2-lmmje-practice-test-a-handout-october-2026",
  "leg_med-2-lmmje-practice-test-b-october-2026",
  "leg_med-2-lmmje-practice-test-c-october-2026",
  "leg_med-2-lmmje-supersamplex-oct-2026",
  "medicine-a12-internal-medicine-practice-test-1-oct-2026",
  "medicine-a12-internal-medicine-practice-test-2-oct-2026",
  "medicine-a12-internal-medicine-practice-test-3-oct-2026",
  "medicine-a12-internal-medicine-practice-test-4-oct-2026",
  "medicine-a12-internal-medicine-practice-test-5-oct-2026",
  "medicine-a12-internal-medicine-practice-test-a-oct-2026",
  "medicine-a12-internal-medicine-practice-test-b-oct-2026",
  "medicine-a12-internal-medicine-practice-test-c-oct-2026",
  "micropara-6-microbiology-and-parasitology-practice-test-1-oct-2026",
  "micropara-6-microbiology-and-parasitology-practice-test-2-oct-2026",
  "micropara-6-microbiology-and-parasitology-practice-test-3-oct-2026",
  "micropara-6-microbiology-and-parasitology-practice-test-4-oct-2026",
  "micropara-6-microbiology-and-parasitology-practice-test-5-oct-2026",
  "micropara-6-microbiology-and-parasitology-practice-test-a-oct-2026",
  "micropara-6-microbiology-and-parasitology-practice-test-b-oct-2026",
  "ob-7-obstetrics-and-gynecology-practice-test-1-oct-2026",
  "ob-7-obstetrics-and-gynecology-practice-test-2-oct-2026",
  "ob-7-obstetrics-and-gynecology-practice-test-3-oct-2026",
  "ob-7-obstetrics-and-gynecology-practice-test-4-oct-2026",
  "ob-7-obstetrics-and-gynecology-practice-test-5-oct-2026",
  "ob-7-obstetrics-and-gynecology-practice-test-a-oct-2026",
  "ob-7-obstetrics-and-gynecology-practice-test-b-oct-2026",
  "ob-7-obstetrics-and-gynecology-practice-test-c-oct-2026",
  "patho-3-pathology-practice-test-1-oct-2026",
  "patho-3-pathology-practice-test-2-oct-2026",
  "patho-3-pathology-practice-test-3-oct-2026",
  "patho-3-pathology-practice-test-4-oct-2026",
  "patho-3-pathology-practice-test-5-oct-2026",
  "patho-3-pathology-practice-test-a-oct-2026",
  "patho-3-pathology-practice-test-b-oct-2026",
  "patho-3-pathology-practice-test-c-oct-2026",
  "pedia-8-pediatrics-practice-test-1-oct-2026",
  "pedia-8-pediatrics-practice-test-2-oct-2026",
  "pedia-8-pediatrics-practice-test-3-oct-2026",
  "pedia-8-pediatrics-practice-test-4-oct-2026",
  "pedia-8-pediatrics-practice-test-5-oct-2026",
  "pedia-8-pediatrics-practice-test-a-oct-2026",
  "pedia-8-pediatrics-practice-test-b-oct-2026",
  "pedia-8-pediatrics-practice-test-c-oct-2026",
  "pharm-a10-pharmacology-practice-test-1-oct-2026",
  "pharm-a10-pharmacology-practice-test-2-oct-2026",
  "pharm-a10-pharmacology-practice-test-3-october-2026",
  "pharm-a10-pharmacology-practice-test-4-october-2026",
  "pharm-a10-pharmacology-practice-test-5-october-2026",
  "pharm-a10-pharmacology-practice-test-a-october-2026",
  "pharm-a10-pharmacology-practice-test-b-october-2026",
  "pharm-a10-pharmacology-practice-test-c-october-2026",
  "physio-1-physiology-practice-test-1-oct-2026",
  "physio-1-physiology-practice-test-2-oct-2026",
  "physio-1-physiology-practice-test-3-oct-2026",
  "physio-1-physiology-practice-test-4-oct-2026",
  "physio-1-physiology-practice-test-5-oct-2026",
  "physio-1-physiology-practice-test-a-oct-2026",
  "physio-1-physiology-practice-test-b-oct-2026",
  "physio-1-physiology-practice-test-c-oct-2026",
  "physio-1-physiology-usmle-style-practice-test-oct-2026",
  "prev_med-9-prevmed-practice-test-1-oct-2026",
  "prev_med-9-prevmed-practice-test-2-oct-2026",
  "prev_med-9-prevmed-practice-test-3-oct-2026",
  "prev_med-9-prevmed-practice-test-4-oct-2026",
  "prev_med-9-prevmed-practice-test-5-oct-2026",
  "prev_med-9-prevmed-practice-test-a-oct-2026",
  "prev_med-9-prevmed-practice-test-b-oct-2026",
  "prev_med-9-prevmed-practice-test-c-oct-2026",
  "prev_med-9-prevmed-supersamplex-oct-2026",
  "surg-a11-surgery-practice-test-1-oct-2026",
  "surg-a11-surgery-practice-test-2-oct-2026",
  "surg-a11-surgery-practice-test-3-oct-2026",
  "surg-a11-surgery-practice-test-4-oct-2026",
  "surg-a11-surgery-practice-test-5-oct-2026",
  "surg-a11-surgery-practice-test-a-oct-2026",
  "surg-a11-surgery-practice-test-b-oct-2026",
  "surg-a11-surgery-practice-test-c-oct-2026",
] as const;

const questionStarts = [1, 101, 201, 301, 401, 501, 601, 701, 801, 901, 1001, 1101, 1201, 1300, 1399, 1499, 1599, 1699, 1799, 1899, 1999, 2099, 2199, 2299, 2399, 2699, 2802, 2902, 3002, 3102, 3202, 3301, 3401, 3500, 3600, 3700, 3800, 3900, 4000, 4100, 4200, 4300, 4400, 4500, 4600, 4700, 4800, 4900, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900, 6000, 6098, 6198, 6298, 6397, 6497, 6597, 6697, 6797, 6897, 6997, 7097, 7197, 7297, 7397, 7497, 7597, 7697, 7797, 7897, 7997, 8097, 8197, 8297, 8397, 8497, 8597, 8697, 8797, 8897, 8997, 9097, 9397, 9497, 9597, 9697, 9797, 9897, 9997, 10097];
const questionCounts = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 99, 99, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 300, 103, 100, 100, 100, 100, 99, 100, 99, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 98, 100, 100, 99, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 300, 100, 100, 100, 100, 100, 100, 100, 100];
const skippedSourceNumberQuizIndex = 26;
const legacyQuizIndex = new Map<string, number>(legacyQuizIds.map((id, index) => [id, index]));

export function currentSubjectIdForLegacy(id: string) {
  const index = legacySubjectIds.indexOf(id as typeof legacySubjectIds[number]);
  return index < 0 ? id : `s${index + 1}`;
}

export function currentQuizIdForLegacy(id: string) {
  const index = legacyQuizIndex.get(id);
  return index === undefined ? id : `q${index + 1}`;
}

export function currentQuestionIdForLegacy(id: string) {
  const match = /^(.*)-q-(\d+)$/.exec(id);
  if (!match) return id;
  const quizIndex = legacyQuizIndex.get(match[1]);
  if (quizIndex === undefined) return id;
  const sourceNumber = Number(match[2]);
  const position = quizIndex === skippedSourceNumberQuizIndex && sourceNumber >= 50 ? sourceNumber - 1 : sourceNumber;
  if (!Number.isInteger(position) || position < 1 || position > questionCounts[quizIndex]) return id;
  return `i${questionStarts[quizIndex] + position - 1}`;
}
