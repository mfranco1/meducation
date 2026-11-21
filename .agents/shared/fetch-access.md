# Fetch access

Sites that refuse automated fetches, and the route that loads instead. Shared by write-quizzes and write-flashcards. When a fetch fails, grep this file for the failing host (`grep -i "<domain>" .agents/shared/fetch-access.md`), then for the issuing body. The source ledger records blocked documents; this file records blocked sites.

## Terms

- **UA curl**: `curl -sL` with a browser User-Agent.
- **Archive copy**: `save-source <URL> --from web.archive.org/web/<year>id_/<URL>` (`id_` returns the raw page or PDF). WebFetch refuses web.archive.org.
- **PMC copy**: the article in PubMed Central, read as the PubMed Central entry says.
- **WebFetch PDF**: when WebFetch returns a PDF as binary, save it and read it with `pdftotext -layout`.

First check `var/sources/manual/` for a copy the user downloaded (`ls var/sources/manual/`) and save it with `save-source <the document's own URL> --from var/sources/manual/<file>`.

For a site not listed: PMC copy, then archive copy, then a copy hosted by another society, agency or university repository; otherwise record the fact as abstract-only.

Use only the routes listed. After a site refuses a fetch, don't retry its own host with a browser User-Agent or other URL variants: the permission classifier reads that as getting around access control and then refuses the archive copy too. When the classifier denies a fetch, don't retry or rephrase it: record the document as `blocked` and name it in your summary so the user can download it into `var/sources/manual/`.

## Indexes

- **PubMed Central** (pmc.ncbi.nlm.nih.gov; browser check): UA curl on the article page, then Europe PMC full text (`https://www.ebi.ac.uk/europepmc/webservices/rest/<PMCID>/fullTextXML`), then NCBI efetch (`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=<PMCID digits>`), then WebFetch on the article page. Find the copy with `https://pmc.ncbi.nlm.nih.gov/search/?term=<DOI>`. Articles outside the open-access subset, and pre-2000 page scans, come back without text: record them as abstract-only.
- **PubMed** (pubmed.ncbi.nlm.nih.gov; cookie wall), **BVS / LILACS** (search.bvsalud.org, pesquisa.bvsalud.org): Europe PMC REST search for the abstract and citation: `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:<PMID>%20AND%20SRC:MED&resultType=core`.
- **NCBI Bookshelf** (ncbi.nlm.nih.gov/books, GeneReviews; CAPTCHA): Europe PMC or another agency's copy. Endotext chapters: UA curl of the chapter PDF from endotext.org (`https://endotext.org/wp-content/uploads/pdfs/<chapter-slug>.pdf`), then `pdftotext`.

## Archive copy works

These return 403 or HTML instead of the PDF; the archive copy loads: clinicalinfo.hiv.gov (NIH HIV guideline PDFs), BMJ specialty journals (lupus.bmj.com and other *.bmj.com article pages; not jnnp.bmj.com), DOH Epidemiology Bureau surveillance PDFs (pia.gov.ph), FNRI-DOST (fnri.dost.gov.ph: Pinggang Pinoy, dietary guidelines), Philippine Statistics Authority (psa.gov.ph), SAGES guidelines (sages.org/publications/guidelines pages), *Respiratory Care* (rcjournal.com), SOGC (*J Obstet Gynaecol Can*, `jogc.com/article/<PII>/pdf`), The Menopause Society (menopause.org PDFs; or the *Menopause* article in PMC), UNICEF data (data.unicef.org: UN IGME reports).

## Sites

Alphabetical by body.

- **AAP** (*Pediatrics*, publications.aap.org): older articles as the archive copy of `pediatrics.aappublications.org/content/pediatrics/<vol>/<issue>/<article>.full.pdf`; otherwise the guideline's algorithm or summary pages on aap.org. Cite the guideline. CDC/AAP 2022 milestones (Zubler): the VCU PDF copy.
- **AASLD** (aasld.org, *Hepatology* on journals.lww.com; often not in PMC): an EASL or ESPGHAN guideline or registry report in PMC; cite that body.
- **ACOG** (acog.org; 402): Committee Opinions and Practice Advisories load at `web.archive.org/web/2026/<acog.org URL>` (archive copy for a PDF); Practice Bulletins and Clinical Consensus documents there are paywalled stubs. Otherwise an SMFM-hosted copy or NICE, WHO or FIGO.
- **ACR Appropriateness Criteria** (acsearch.acr.org; narratives can return "Coming Soon"): a university-hosted PDF copy (e.g. widionline.xray.ufl.edu); WebFetch saves it, then `pdftotext`.
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
- **CPIC** (cpicpgx.org; redirects to clinpgx.org, which WebFetch reads as empty): the guideline's PMC page through WebFetch.
- **Cochrane Library** (cochranelibrary.com): the review's PMC page through WebFetch.
- **DOH** administrative orders and IRRs (doh.gov.ph; PhilPEN AO 2012-0029): ship.ph PDFs with curl (HIV AOs 2018-0024, 2022-0024, 2022-0024-A); older HIV orders by direct curl on aidsdatahub.org (`/sites/default/files/resource/<file>.pdf`, not the archive copy); then the Supreme Court E-Library (elibrary.judiciary.gov.ph); otherwise a PhilHealth circular that reproduces the protocol (Circular 20, 2013, for PhilPEN), cited as the circular. LegalDex serves some AO texts (rabies AO 2018-0013).
- **DOLE** department orders (dole.gov.ph; DO 53-03, DO 208-20): Supreme Court E-Library, then archive copy of the DOLE PDF. ECC rules: the ECC booklet of the Amended Rules.
- **drugs.com** (AHFS): the drug's label (see Drug labels).
- **EAU** (uroweb.org; WebFetch fails): UA curl on `d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-<Name>-<year>.pdf`, then `pdftotext -layout`.
- **EMA** (ema.europa.eu; 429 at times): UA curl on `ema.europa.eu/en/documents/product-information/<name>-epar-product-information_en.pdf`; after a 429, wait or use the archive copy.
- **ESC, ERS** (escardio.org, *Eur Heart J*, ersjournals.com): PMC copy, then pocket-guide PDFs. ERS/ATS joint PDFs: curl from member.thoracic.org. Without a PMCID, see Oxford Academic.
- **ESGO** (esgo.org): pocket-guideline PDFs on esgo.org; some full texts hosted by national societies (BGCS).
- **ESMO** (annalsofoncology.org): for bone sarcoma, the 2025 UK guideline (Gerrand et al., *Br J Cancer*, PMC11723950); otherwise an open equivalent; cite that body.
- ***Eur J Cancer*** (ejcancer.com: EDF-EADO-EORTC skin cancer): curl on Université libre de Bruxelles repository PDFs (dipot.ulb.ac.be).
- **EULAR** (ard.bmj.com): author manuscript in a university repository.
- **FIGO Cancer Report** (*Int J Gynaecol Obstet* on onlinelibrary.wiley.com; 403): Europe PMC full text of the PMC copy (2025 cervix PMC12411820, ovary PMC12411830).
- **GOLD, GINA** (goldcopd.org, ginasthma.org; over WebFetch's 10 MB limit): curl the PDF, `pdftotext -layout`. Figures and tables are images: `pdftoppm -png` the page and view it (the pocket guide holds the key figures).
- **GRADE** series (jclinepi.com): GRADE Handbook on gdt.gradepro.org; cite the handbook.
- **HAL** (*.hal.science and university portals such as hal.univ-lorraine.fr; Anubis page): the PMC or publisher copy.
- **IARC GLOBOCAN** (gco.iarc.who.int; dashboards are scripts): curl the fact sheet PDF, `pdftotext -layout`. Cancer sites: `/media/globocan/factsheets/cancers/<n>-<site>-fact-sheet.pdf` (23-cervix-uteri, 24-corpus-uteri); countries: `/media/globocan/factsheets/populations/<code>-<name>-fact-sheet.pdf` (900-world, 608-philippines).
- **ISPAD** (*Pediatric Diabetes* on onlinelibrary.wiley.com; 403 everywhere, ISPAD asset URLs return other PDFs): an ISPAD-hosted translated chapter PDF as WebFetch PDF (the 2022 DKA chapter in Portuguese); otherwise ADA Standards section 14.
- ***J Hum Immun*** (rupress.org: IUIS classification, ESID registry reports): a university repository PDF (UCL Discovery), or the PMC copy through Europe PMC or efetch.
- ***J Neurol Neurosurg Psychiatry*** (jnnp.bmj.com; 403, archive copy paywalled, PMC PDFs behind a browser check, Europe PMC full text fails for older articles): record it as abstract-only and verify the fact in another source.
- **Japanese Circulation Society** (*Circ J*, J-STAGE untested): a university-hosted PDF (JCS 2023 vasospastic angina on a Tohoku University page).
- **KDIGO** (kdigo.org; some PDFs 404, *Kidney Int* 403): curl the kdigo.org PDF first (2012 AKI: `/wp-content/uploads/2016/10/KDIGO-2012-AKI-Guideline-English.pdf`). 2021 glomerular diseases executive summary: the Cambridge repository copy (`api.repository.cam.ac.uk/server/api/core/bitstreams/<id>/content`, 15 MB); curl drops about every 3 minutes, so resume with `curl -C -`.
- ***The Lancet*** (thelancet.com; Europe PMC has the abstract only): PMC author manuscript or a university repository PDF (GBD papers are often in coauthors' repositories); otherwise abstract-only.
- ***Mayo Clin Proc***, ***J Clin Oncol*** (ascopubs.org): PMC copy, then archive copy of the full-text page; otherwise abstract-only.
- **Medscape** (emedicine.medscape.com): a PMC review or a textbook.
- **National Privacy Commission** (privacy.gov.ph: DPA IRR, circulars; Senate copy refused too): Supreme Court E-Library, then chanrobles, recorded as unofficial in the ledger.
- ***Nature Reviews*** journals (nature.com; redirects to a login): PMC copy of the same or an earlier edition; otherwise abstract-only.
- **NCCN** (nccn.org; login): ESGO (*Int J Gynecol Cancer*, often in PMC) for gynecologic cancers, ACMG or ASCO for hereditary risk, the FDA label for an approval; cite that body.
- **NICE** (nice.org.uk): archive copy of `https://www.nice.org.uk/guidance/<id>/chapter/Recommendations` (year 2025); save-source `--from` that URL works.
- **Neurocritical Care Society** (neurocriticalcare.org): the article PDF on a university neurocritical care page (2023 SAH guideline).
- **NINDS** (ninds.nih.gov): MedlinePlus or MedlinePlus Genetics (slugs follow current names), or a PMC review.
- **Oxford Academic** (academic.oup.com: *Clin Infect Dis*, *Br J Dermatol*, *Eur Heart J*, *Europace*; curl and save-source blocked): WebFetch the article page by offset; recommendations sit far in.
- **Philippine laws** (lawphil.net, officialgazette.gov.ph): UA curl on lawphil.net; then WIPO Lex; then LawPlayer, recorded as unofficial in the ledger.
- **RSNA** (pubs.rsna.org: *Radiology*, Fleischner): Europe PMC, or a hospital- or society-hosted copy of the recommendation table.
- **Thieme** (thieme-connect.com; bot check on PDFs too): PMC or Europe PMC copy, then the abstract by Europe PMC REST search; otherwise a later review.
- **WHO** (who.int, WHO IRIS; 403, 5xx, timeouts; IRIS links can return an HTML shell, `bitstreams/<id>/content` can truncate): archive copy of the `apps.who.int/iris/bitstream/handle/...pdf` URL, or the PAHO copy (iris.paho.org), or a medbox.org mirror (`medbox.org/index.php/dl/<id>`; WebFetch saves the PDF, then `pdftotext`); otherwise the who.int summary page, recorded as summary-only. Malnutrition cutoffs: the WHO eLENA and NLIS pages load. Contraception: WHO MEC 6th edition annex. STI regimens: CDC 2021 STI guidelines, cited as CDC. TB estimates by age and sex: curl `extranet.who.int/tme/generateCSV.asp?ds=estimates_age_sex` (`ds=dictionary` for fields). ICD-10 Volume 2 (death certificate rules, live birth): curl `icd.who.int/browse10/Content/statichtml/ICD10Volume2_en_2019.pdf`. Deaths by cause, sex and age (Global Health Estimates): curl `xmart-api-public.who.int/DEX_CMS/GHE_FULL` with OData filters (`DIM_COUNTRY_CODE`, `DIM_YEAR_CODE`, `DIM_SEX_CODE`, `DIM_AGEGROUP_CODE`, `FLAG_RANKABLE eq 1`); rows are per country, so sum them for a world figure.
- **Wiley** (onlinelibrary.wiley.com: *Epilepsia*): PMC or Europe PMC copy, then a university repository author manuscript.
- **Wolters Kluwer** (journals.lww.com: *Crit Care Med*, PADIS 2018, *Anesth Analg*, PONV, *Otol Neurotol*; 402 or 403): PMC copy, then a university repository author manuscript (eScholarship, as a WebFetch PDF); otherwise list the fact as unverified.

## Drug labels

Cite the US prescribing information. DailyMed is sometimes unreachable; use the openFDA label API with curl:

- `https://api.fda.gov/drug/label.json?search=openfda.generic_name:<drug>&limit=1` with one unquoted word (quoted often returns "all shards failed"; search a combination product by its full name). Read `adverse_reactions` and `effective_time`.
- A generic name can return another product first (Jynarque for tolvaptan, Kadcyla for trastuzumab); some brands (Zyban) return nothing. Narrow with `+AND+indications_and_usage:<word>` or `openfda.brand_name:<brand>`, and by route with `+AND+openfda.route:INTRAVENOUS` (topical labels otherwise come first) or `ORAL` (tranexamic acid).
- OTC labels have no adverse-reaction section. Prescription-and-OTC drugs (loperamide): add `+AND+_exists_:adverse_reactions`. OTC-only (nicotine replacement): UK SmPC at `medicines.org.uk/emc/product/<id>/smpc`.
- Missing from openFDA (dimercaprol): `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=<brand>`, then the SPL XML by setid.
- Withdrawn in the US (single-ingredient indacaterol): the EMA SmPC (see EMA), or the old label PDF on accessdata.fda.gov by UA curl.
