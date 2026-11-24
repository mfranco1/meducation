# Surgery flashcards

Subject `Surgery`, work dir `var/flashcard-work/surgery/`, audit-only `plan.json` with 26 topics (52 decks, about 1,620 cards). Rules: [flashcard-audit](flashcard-audit.md).

## Status

Phase: Audit. In progress: Endocrine Surgery. Done: Surgical Foundations, Trauma and Emergency Surgery, Burns and Soft-Tissue Emergencies, Head, Neck, and Salivary Surgery. Next: Endocrine Surgery.

## Carried over

## Staged (not published)

- Surgical Foundations: 5 edits, 0 deletes. Second look: f-e0a41353 energy target split into stable adults (25 to 30 kcal/kg) and early critical illness (ASPEN 2022, ESPEN 2023). The other 4 only add sources (protein, enteral feeding in shock, postpyloric feeding, refeeding start).
- Trauma and Emergency Surgery: 9 edits, 2 deletes (airway-obstruction trivia, eFAST duplicate). Second look: f-bce62879 spinal cord injury steroids now follows AO Spine 2017 (methylprednisolone within 8 h as an option); AANS/CNS 2013 advised against. 7 edits only add sources (BTF 4th ed., ISNCSCI 2019); f-eb78a2c4 delta P now "less than 30 mmHg" (TQIP 2015).
- Burns and Soft-Tissue Emergencies: 9 edits, 0 deletes. Second look: f-c94efe6d pressure injury stage 3 vs 4 now separates by visible fat vs exposed deeper structures (NPIAP 2016). The other 8 only add sources (ABA 2024 burn shock, WSES/SIS-E 2018, NPIAP 2016).
- Head, Neck, and Salivary Surgery: 7 edits, 0 deletes, all source-only (NCI PDQ adult 2025 and childhood 2024, ACR Neck Mass 2018, French lymphatic malformation PNDS 2023, Sheikh 2023 deep neck infection review).

## Unverified (check before publishing)

- f-79005aa5 hyponatremia correction limit of 8 mEq/L in 24 h for high-risk patients: from Verbalis 2013 (not open access); the European 2014 guideline gives 10 then 8.
- f-a556298c head of bed 30 to 45 degrees for tube feeding: ASPEN/SCCM 2016 full text not reachable.
- f-e0a41353 the 25 to 30 kcal/kg/day stable-adult figure (ASPEN 2016, not reachable).
- f-f61d6e36 platelet target 100 for intracranial surgery: confirmed only for traumatic brain injury.
- f-26c532d0 von Willebrand card: abstract only this session.
- f-bc189fba superficial SSI management: IDSA 2014 summary only. f-8c7dcef7 Caprini: ledger only. f-8f72b9a9 70 to 80% tensile strength: unchecked.
- ATLS 11 manual not reachable: f-72c420f2 needle decompression site, f-f59a1265 chest tube site, f-13ce93b5 massive hemothorax thresholds, f-9e99aedc GCS 8 or less for airway (narrative review only). f-c8dcedd5 vented chest seal: TCCC 2013 abstract only.
- f-a357c25b, f-f29bb9af, f-e22c6556, f-36f6ed10 extremity vascular hard signs, API 0.9, CTA: ESVS 2025 blocked (403); download into `var/sources/manual/`. f-38162871, f-ba36e275 penetrating neck: narrative review only.
- f-80027fbe pressure injury treatment principles: 2019 international guideline not opened. f-a7dfa9a4 silver sulfadiazine "may delay epithelialization": not on the FDA label (label says delayed eschar separation). f-2e8835f7 pediatric urine output about 1 mL/kg/h: COBIS 2024 gives 0.5 to 1; ABLS not opened.
- AAO-HNS 2017 neck mass guideline full text not reachable (SAGE and Wiley 403; the archive fetch was blocked and needs the user's approval, or a PDF in `var/sources/manual/`): f-c3bf0174 FNA first, f-600bec63 mucosal evaluation for persistent adenopathy. f-e650ab79 contrast CT for deep neck abscess: no primary source. f-c8483791 avoid open parotid biopsy, and the core-biopsy part of f-839ea435: not in ACR 2018 or PDQ (try NCCN). f-e147f7d6 biopsy of persistent oral ulcer or leukoplakia: ADA 2026 guideline read as a summary only. f-d9635c47 order of antibiotics vs source control after airway: not stated in Sheikh 2023.

## Top-ups

- Surgical Foundations (confirm with `fronts.txt` grep): sodium disorders, nutritional assessment, perioperative risk assessment and ERAS, suture materials.
- Burns and Soft-Tissue Emergencies (confirm with `fronts.txt` grep): burn pathophysiology, burn complications, cellulitis and abscess, hidradenitis and pilonidal disease.
- Head, Neck, and Salivary Surgery (one deck, 36 cards for 106 questions; confirm with `fronts.txt` grep): oral cavity and lip lesions, odontogenic lesions, head and neck cancer risk factors and staging (AJCC 8th, p16), site-specific cancer management.
