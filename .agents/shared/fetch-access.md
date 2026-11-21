# Fetch access

Sites that refuse automated fetches, and the route that loads instead. Shared by write-quizzes and write-flashcards. When a fetch fails, grep this file for the failing host (`grep -i "<domain>" .agents/shared/fetch-access.md`), then for the issuing body. The source ledger records blocked documents; this file records blocked sites.

## Terms

- **UA curl**: `curl -sL` with a browser User-Agent.
- **Archive copy**: UA curl on `web.archive.org/web/<year>id_/<URL>` (`id_` returns the raw page or PDF); if the archive blocks the browser User-Agent, retry with curl's default. WebFetch refuses web.archive.org.
- **PMC copy**: the article in PubMed Central, read as the PubMed Central entry says.
- **WebFetch PDF**: when WebFetch returns a PDF as binary, save it and read it with `pdftotext -layout`.

For a site not listed: PMC copy, then archive copy, then a copy hosted by another society, agency or university repository; otherwise record the fact as abstract-only.

## Indexes

- **PubMed Central** (pmc.ncbi.nlm.nih.gov; browser check): UA curl on the article page, then Europe PMC full text (`https://www.ebi.ac.uk/europepmc/webservices/rest/<PMCID>/fullTextXML`), then NCBI efetch (`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=<PMCID digits>`), then WebFetch on the article page. Find the copy with `https://pmc.ncbi.nlm.nih.gov/search/?term=<DOI>`. Articles outside the open-access subset, and pre-2000 page scans, come back without text: record them as abstract-only.
- **PubMed** (pubmed.ncbi.nlm.nih.gov; cookie wall), **BVS / LILACS** (search.bvsalud.org): Europe PMC REST search for the abstract and citation: `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:<PMID>%20AND%20SRC:MED&resultType=core`.
- **NCBI Bookshelf** (ncbi.nlm.nih.gov/books, GeneReviews; CAPTCHA): Europe PMC or another agency's copy.

## Archive copy works

These return 403 or HTML instead of the PDF; the archive copy loads: clinicalinfo.hiv.gov (NIH HIV guideline PDFs), BMJ specialty journals (lupus.bmj.com and other *.bmj.com article pages), DOH Epidemiology Bureau surveillance PDFs (pia.gov.ph), FNRI-DOST (fnri.dost.gov.ph: Pinggang Pinoy, dietary guidelines), Philippine Statistics Authority (psa.gov.ph), *Respiratory Care* (rcjournal.com), SOGC (*J Obstet Gynaecol Can*, `jogc.com/article/<PII>/pdf`), The Menopause Society (menopause.org PDFs; or the *Menopause* article in PMC), UNICEF data (data.unicef.org: UN IGME reports).

## Sites

Alphabetical by body.

- **AAP** (*Pediatrics*, publications.aap.org): older articles as the archive copy of `pediatrics.aappublications.org/content/pediatrics/<vol>/<issue>/<article>.full.pdf`; otherwise the guideline's algorithm or summary pages on aap.org. Cite the guideline.
- **AASLD** (aasld.org, *Hepatology* on journals.lww.com; often not in PMC): an EASL or ESPGHAN guideline or registry report in PMC; cite that body.
- **ACOG** (acog.org; 402): Committee Opinions, Clinical Consensus and Practice Advisories load at `web.archive.org/web/2026/<acog.org URL>` (archive copy for a PDF); Practice Bulletins there are paywalled stubs. Otherwise an SMFM-hosted copy or NICE, WHO or FIGO.
- ***Acta Medica Philippina*** (actamedicaphilippina.upm.edu.ph; abstract only on the page): UA curl on the galley PDF link (`.../article/download/<id>/<galley>/<file>`).
- **ADA Standards of Care** (diabetesjournals.org, *Diabetes Care*; Cloudflare; Europe PMC and efetch lack the body): UA curl on the section's PMC page, or WebFetch by offset (pages run past 300,000 characters). 2026: PMC12690183 section 2, PMC12690185 section 9, PMC12690187 section 10, PMC12690180 section 16. Then the archive copy of the diabetesjournals.org section.
- **AHA/ACC** (ahajournals.org, jacc.org): PMC copy, then archive copy of the full-text page. A saved *Circulation* text can lack the recommendation and drug tables; the archive copy of the *JACC* co-publication has them. ACC "Guidelines Made Simple" or pocket-guide PDFs for classes and thresholds; a university mirror as WebFetch PDF. Resuscitation: cpr.heart.org pages.
- **AHA/ACC 2025 and ESC 2024 hypertension** (blocked everywhere): 2020 Philippine hypertension guideline (PMC8678709), NICE NG136 and NG133, or ADA Standards section 10; cite that body.
- **ASCRS** (*Diseases of the Colon & Rectum*; summaries only): a repository copy (2020 Crohn guideline on eScholarship); otherwise WSES, AGA or UEG/ESCP, citing that body.
- **ASH, ISTH, BSH** (efetch returns front matter only): guideline PDFs on thebloodproject.com as WebFetch PDF.
- **ASRA** neuraxial anticoagulation (rapm.bmj.com): the anticoagulant's label (spinal/epidural hematoma and catheter timing; see Drug labels); cite the label.
- **AUA** (auanet.org; login): EAU chapters; cite EAU.
- ***BMJ*** (bmj.com): PMC copy.
- **BTS** (brit-thoracic.org.uk): PDFs in its document library.
- **CDC** (cdc.gov, stacks.cdc.gov): WebFetch for pages; Stacks PDFs as WebFetch PDF. STI treatment pages are often refused: PMC copy of the MMWR guideline.
- **CHEMM triage** (chemm.hhs.gov: START, JumpSTART; page text lacks the steps): render the linked flowchart SVG (`/media/.../*.svg`) with `qlmanage -t -s 1800 -o <dir> <file>.svg` and view it.
- **Cochrane Library** (cochranelibrary.com): the review's PMC page through WebFetch.
- **DOH** administrative orders and IRRs (doh.gov.ph; PhilPEN AO 2012-0029): ship.ph PDFs with curl (HIV AOs 2018-0024, 2022-0024, 2022-0024-A); older HIV orders by direct curl on aidsdatahub.org (`/sites/default/files/resource/<file>.pdf`, not the archive copy); then the Supreme Court E-Library (elibrary.judiciary.gov.ph); otherwise a PhilHealth circular that reproduces the protocol (Circular 20, 2013, for PhilPEN), cited as the circular.
- **DOLE** department orders (dole.gov.ph; DO 53-03, DO 208-20): Supreme Court E-Library, then archive copy of the DOLE PDF. ECC rules: the ECC booklet of the Amended Rules.
- **drugs.com** (AHFS): the drug's label (see Drug labels).
- **EAU** (uroweb.org; WebFetch fails): UA curl on `d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-<Name>-<year>.pdf`, then `pdftotext -layout`.
- **EMA** (ema.europa.eu; 429 at times): UA curl on `ema.europa.eu/en/documents/product-information/<name>-epar-product-information_en.pdf`; after a 429, wait or use the archive copy.
- **ESC, ERS** (escardio.org, *Eur Heart J*, ersjournals.com): PMC copy, then pocket-guide PDFs. ERS/ATS joint PDFs: curl from member.thoracic.org. Without a PMCID, see Oxford Academic.
- **ESGO** (esgo.org): pocket-guideline PDFs on esgo.org; some full texts hosted by national societies (BGCS).
- **ESMO** (annalsofoncology.org): for bone sarcoma, the 2025 UK guideline (Gerrand et al., *Br J Cancer*, PMC11723950); otherwise an open equivalent; cite that body.
- ***Eur J Cancer*** (ejcancer.com: EDF-EADO-EORTC skin cancer): curl on Université libre de Bruxelles repository PDFs (dipot.ulb.ac.be).
- **EULAR** (ard.bmj.com): author manuscript in a university repository.
- **GOLD, GINA** (goldcopd.org, ginasthma.org; over WebFetch's 10 MB limit): curl the PDF, `pdftotext -layout`. Figures and tables are images: `pdftoppm -png` the page and view it (the pocket guide holds the key figures).
- **GRADE** series (jclinepi.com): GRADE Handbook on gdt.gradepro.org; cite the handbook.
- **HAL** (*.hal.science; Anubis page): the PMC or publisher copy.
- **Japanese Circulation Society** (*Circ J*, J-STAGE untested): a university-hosted PDF (JCS 2023 vasospastic angina on a Tohoku University page).
- ***The Lancet*** (thelancet.com; Europe PMC has the abstract only): PMC author manuscript or a university repository PDF (GBD papers are often in coauthors' repositories); otherwise abstract-only.
- ***Mayo Clin Proc***, ***J Clin Oncol*** (ascopubs.org): PMC copy, then archive copy of the full-text page; otherwise abstract-only.
- **Medscape** (emedicine.medscape.com): a PMC review or a textbook.
- **National Privacy Commission** (privacy.gov.ph: DPA IRR, circulars; Senate copy refused too): Supreme Court E-Library, then chanrobles, recorded as unofficial in the ledger.
- **NCCN** (nccn.org; login): ESGO (*Int J Gynecol Cancer*, often in PMC) for gynecologic cancers, ACMG or ASCO for hereditary risk, the FDA label for an approval; cite that body.
- **NICE** (nice.org.uk): archive copy of `https://www.nice.org.uk/guidance/<id>/chapter/Recommendations` (year 2025); save-source `--from` that URL works.
- **Neurocritical Care Society** (neurocriticalcare.org): the article PDF on a university neurocritical care page (2023 SAH guideline).
- **NINDS** (ninds.nih.gov): MedlinePlus or MedlinePlus Genetics (slugs follow current names), or a PMC review.
- **Oxford Academic** (academic.oup.com: *Clin Infect Dis*, *Br J Dermatol*, *Eur Heart J*; curl and save-source blocked): WebFetch the article page by offset; recommendations sit far in.
- **Philippine laws** (lawphil.net, officialgazette.gov.ph): UA curl on lawphil.net; then WIPO Lex; then LawPlayer, recorded as unofficial in the ledger.
- **RSNA** (pubs.rsna.org: *Radiology*, Fleischner): Europe PMC, or a hospital- or society-hosted copy of the recommendation table.
- **Thieme** (thieme-connect.com; bot check on PDFs too): PMC or Europe PMC copy, then the abstract by Europe PMC REST search; otherwise a later review.
- **WHO** (who.int, WHO IRIS; 403, 5xx, timeouts; IRIS links can return an HTML shell, `bitstreams/<id>/content` can truncate): archive copy of the `apps.who.int/iris/bitstream/handle/...pdf` URL, or the PAHO copy (iris.paho.org); otherwise the who.int summary page, recorded as summary-only. Contraception: WHO MEC 6th edition annex. STI regimens: CDC 2021 STI guidelines, cited as CDC. TB estimates by age and sex: curl `extranet.who.int/tme/generateCSV.asp?ds=estimates_age_sex` (`ds=dictionary` for fields). ICD-10 Volume 2 (death certificate rules, live birth): curl `icd.who.int/browse10/Content/statichtml/ICD10Volume2_en_2019.pdf`.
- **Wiley** (onlinelibrary.wiley.com: *Epilepsia*): PMC or Europe PMC copy, then a university repository author manuscript.
- **Wolters Kluwer** (journals.lww.com: *Crit Care Med*, PADIS 2018, *Anesth Analg*, PONV; 402 or 403): PMC copy; otherwise list the fact as unverified.

## Drug labels

Cite the US prescribing information. DailyMed is sometimes unreachable; use the openFDA label API with curl:

- `https://api.fda.gov/drug/label.json?search=openfda.generic_name:<drug>&limit=1` with one unquoted word (quoted often returns "all shards failed"; search a combination product by its full name). Read `adverse_reactions` and `effective_time`.
- A generic name can return another product first (Jynarque for tolvaptan); some brands (Zyban) return nothing. Narrow with `+AND+indications_and_usage:<word>` or `openfda.brand_name:<brand>`, and by route with `+AND+openfda.route:INTRAVENOUS` (topical labels otherwise come first) or `ORAL` (tranexamic acid).
- OTC labels have no adverse-reaction section. Prescription-and-OTC drugs (loperamide): add `+AND+_exists_:adverse_reactions`. OTC-only (nicotine replacement): UK SmPC at `medicines.org.uk/emc/product/<id>/smpc`.
- Missing from openFDA (dimercaprol): `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=<brand>`, then the SPL XML by setid.
- Withdrawn in the US (single-ingredient indacaterol): the EMA SmPC (see EMA), or the old label PDF on accessdata.fda.gov by UA curl.
