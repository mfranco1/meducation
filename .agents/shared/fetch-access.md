# Fetch access

Sites that refuse automated fetches, and the route that loads instead. Shared by write-quizzes and write-flashcards. When a fetch fails, grep this file for the failing host (`grep -i "<domain>" .agents/shared/fetch-access.md`), then for the issuing body. The source ledger records blocked documents; this file records blocked sites.

## General routes

For a site not listed, try these in order:

1. **PubMed Central copy**, as the PubMed Central row below describes.
2. **Raw archive copy**: `curl -sL` with a browser User-Agent on `web.archive.org/web/<year>id_/<URL>` (`id_` returns the raw page or PDF). WebFetch refuses web.archive.org.
3. A copy hosted by another society, agency or university repository.

**PDF through WebFetch**: when WebFetch returns a PDF as binary, save the file and read it with `pdftotext -layout`.

## Sites

General indexes first, then the rest alphabetically by body.

| Site or body | Fails with | Use instead |
| --- | --- | --- |
| PubMed Central (pmc.ncbi.nlm.nih.gov) | Browser check | The article page with `curl -sL` and a browser User-Agent, then the Europe PMC full-text XML (`https://www.ebi.ac.uk/europepmc/webservices/rest/<PMCID>/fullTextXML`), or NCBI E-utilities `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=<PMCID digits>` (full-text XML) when Europe PMC also refuses; articles outside the open-access subset come back abstract-only from all three, so record them as abstract-only. When Europe PMC XML returns 500 and efetch returns metadata only (the publisher blocks XML), WebFetch on the PMC article page often works. To find the PMC copy of an article, search `https://pmc.ncbi.nlm.nih.gov/search/?term=<DOI>` |
| PubMed (pubmed.ncbi.nlm.nih.gov) | Cookie wall | Europe PMC REST search for the abstract and full citation: `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:<PMID>%20AND%20SRC:MED&resultType=core` |
| NCBI Bookshelf (ncbi.nlm.nih.gov/books) | Often refused | Europe PMC or a copy hosted by another agency |
| BVS / LILACS (search.bvsalud.org) | 403 | Europe PMC REST search for the same record |
| AAP (*Pediatrics*, publications.aap.org) | Full text refused | The guideline's algorithm or summary pages on aap.org (2026 UTI imaging algorithm); cite that page |
| ACOG (acog.org) | 402 | Committee Opinions, Clinical Consensus documents and Practice Advisories load through the Wayback Machine (`web.archive.org/web/2026/<acog.org URL>`; for a PDF, the raw archive copy); Practice Bulletins there are paywalled stubs. Otherwise an SMFM-hosted copy, or an equivalent current guideline that loads: NICE (also through the UK Government Web Archive), WHO, SMFM, FIGO |
| *Acta Medica Philippina* (actamedicaphilippina.upm.edu.ph) | PMC browser check; the article page shows the abstract only | Full-text PDF with `curl -sL` from the galley link on the article page (`.../article/download/<id>/<galley>/<file>`) |
| ADA Standards of Care (diabetesjournals.org, *Diabetes Care*) | Cloudflare challenge; PMC, Europe PMC and efetch return metadata without the body (2026 edition) | Try the Wayback Machine copy of the diabetesjournals.org section; otherwise verify in an ACOG Committee Opinion or Clinical Consensus that loads, or list the fact as unverified |
| AHA/ACC (ahajournals.org, jacc.org) | 403 | The guideline's own PubMed Central copy (many are there), then the raw archive copy of the full-text page. ACC "Guidelines Made Simple" or pocket-guide PDFs for recommendation classes and thresholds. A university mirror PDF loads as a PDF through WebFetch. Resuscitation (CPR, ECC) guidelines: the pages on cpr.heart.org subdomains |
| AHA/ACC 2025 and ESC 2024 hypertension guidelines | Blocked everywhere | 2020 Philippine hypertension guideline (PMC8678709), NICE NG136 and NG133, or ADA Standards section 10; cite that body |
| ASCRS (*Diseases of the Colon & Rectum*) | Paywalled, summaries only | A repository copy when one exists (ASCRS 2020 Crohn guideline on eScholarship); otherwise an open guideline on the same point: WSES (*World J Emerg Surg*), AGA clinical practice updates, UEG/ESCP; cite that body |
| ASH, ISTH and BSH hematology guidelines | efetch returns abstract or front matter only | Guideline PDFs hosted on thebloodproject.com, as a PDF through WebFetch |
| ASRA neuraxial anticoagulation (rapm.bmj.com) | Full text blocked, summaries only | The anticoagulant's label (spinal/epidural hematoma and catheter timing sections; see Drug labels); cite the label |
| AUA (auanet.org) | Login | EAU guideline chapters on uroweb.org; cite EAU |
| *BMJ* (bmj.com) | 403 | The PMC copy (older research articles are in PMC) |
| BMJ specialty journals (lupus.bmj.com and other *.bmj.com) | 403 | The raw archive copy of the article page |
| BTS (brit-thoracic.org.uk) | 403 | PDFs in the brit-thoracic.org.uk document library |
| CDC (cdc.gov pages, stacks.cdc.gov PDFs) | 403 or HTML with curl; STI treatment pages often refused | WebFetch for pages; a Stacks PDF as a PDF through WebFetch. STI treatment: the PubMed Central copy of the MMWR guideline |
| clinicalinfo.hiv.gov (NIH HIV and opportunistic infection guidelines) | 403 | The raw archive copy of the guideline PDF |
| DOH administrative orders and implementing rules (doh.gov.ph; PhilPEN AO 2012-0029) | Not reachable | Supreme Court E-Library (elibrary.judiciary.gov.ph) copy of the issuance; otherwise the PhilHealth circular that reproduces the protocol (Circular 20, 2013, for PhilPEN); cite the circular |
| DOH Epidemiology Bureau surveillance PDFs (HIV/AIDS reports hosted on pia.gov.ph) | 403 or HTML instead of the PDF | The raw archive copy |
| DOLE department orders (dole.gov.ph; DO 53-03, DO 208-20) | Not reachable, secondary copies only | Supreme Court E-Library copy, then the raw archive copy of the DOLE PDF; ECC rules from the ECC's booklet of the Amended Rules |
| drugs.com (AHFS monographs) | 403 | The drug's label (see Drug labels) |
| EMA product information (ema.europa.eu SmPC PDFs) | 429 at times | `curl -sL` with a browser User-Agent on `ema.europa.eu/en/documents/product-information/<name>-epar-product-information_en.pdf`; after a 429, wait or use the raw archive copy |
| ESC, ERS (escardio.org, academic.oup.com *Eur Heart J*, ersjournals.com) | 403 | PubMed Central copy, then society pocket-guide PDFs. Joint ERS/ATS guideline PDFs load from member.thoracic.org with `curl -sL`. Recent guidelines without a PMCID (2025 pregnancy guideline): the OUP full text at academic.oup.com loads but truncates partway or runs past 300,000 characters (2018 syncope guideline), so fetch the needed section from the OUP chapter or supplementary links, or read the article page with WebFetch in chunks by offset (plain curl gets a Cloudflare challenge) |
| ESGO (esgo.org) | | Pocket-guideline PDFs on esgo.org; some full texts are hosted by national societies (BGCS) |
| ESMO (annalsofoncology.org) | 403, not open access | 2025 UK bone sarcoma guideline (Gerrand et al., *Br J Cancer*, PMC11723950) for bone sarcomas; otherwise an equivalent open guideline; cite that body |
| EULAR (ard.bmj.com) | 403 | Author manuscript in a university repository (eprints, institutional open-access pages) |
| FNRI-DOST (fnri.dost.gov.ph: Pinggang Pinoy, dietary guidelines) | Firewall error | The raw archive copy of the FNRI page or PDF |
| GOLD, GINA report PDFs (goldcopd.org, ginasthma.org) | WebFetch size limit (over 10 MB) | Download the PDF with `curl -sL` and read it with `pdftotext -layout` |
| GRADE guidelines series (jclinepi.com) | 403 | GRADE Handbook on gdt.gradepro.org; cite the handbook |
| Japanese Circulation Society (*Circ J* guidelines, J-STAGE) | Not tested on J-STAGE | University-hosted PDF of the guideline (JCS 2023 vasospastic angina on a Tohoku University page) |
| *The Lancet* (thelancet.com) | 403; Europe PMC has the abstract only | PubMed Central author manuscript, or a university repository PDF (GBD papers are often in coauthors' repositories); otherwise list the fact as abstract-only |
| *Mayo Clinic Proceedings*, *J Clin Oncol* (ascopubs.org) | 403 | PubMed Central copy if one exists (NCBI efetch `db=pmc` when Europe PMC full text fails), then the raw archive copy of the ascopubs full-text page; otherwise list the fact as abstract-only |
| Medscape (emedicine.medscape.com) | 402 | A PubMed Central review or a textbook |
| National Privacy Commission (privacy.gov.ph: DPA IRR, NPC circulars) | Refused, as is the Senate copy | Supreme Court E-Library copy, then a compiled legal database (chanrobles), recorded as unofficial in the ledger |
| NCCN guidelines (nccn.org) | Login required | The matching ESGO guideline (open access in *Int J Gynecol Cancer*, often in PMC) for gynecologic cancers, ACMG or ASCO for hereditary risk, or the drug's FDA label for an approval; cite that body |
| Neurocritical Care Society (neurocriticalcare.org) | 403 | Journal article PDF hosted by a university neurocritical care page (2023 SAH guideline) |
| Philippine laws (lawphil.net, officialgazette.gov.ph) | Unreachable, refused | WIPO Lex full text of the Act; a compiled legal database (LawPlayer) when WIPO lacks it, recorded as unofficial in the ledger |
| Philippine Statistics Authority (psa.gov.ph: causes of death, press-release PDFs) | 403 or HTML instead of the PDF | The raw archive copy |
| *Respiratory Care* (rcjournal.com) | Refused | The raw archive copy of the PDF |
| RSNA (pubs.rsna.org: *Radiology*, Fleischner statements) | Refused | Europe PMC copy, or a hospital- or society-hosted copy of the recommendation table |
| WHO (who.int, WHO IRIS: Ottawa Charter, fact sheets, other WHO PDFs) | 403, 502, 503 or timeouts | The raw archive copy or the PAHO (iris.paho.org) copy of the PDF; otherwise the document's who.int summary page, recorded as summary-only. For contraception, the WHO MEC 6th edition annex; for STI regimens, CDC 2021 STI guidelines, cited as CDC |
| Wolters Kluwer (journals.lww.com: *Crit Care Med*, PADIS 2018, *Anesth Analg*, PONV consensus guidelines) | 402 or 403 | PubMed Central copy if one exists; otherwise list the fact as unverified |

## Drug labels

Cite the US prescribing information. DailyMed (dailymed.nlm.nih.gov) is sometimes unreachable; use the openFDA label API with curl instead:

- Query `https://api.fda.gov/drug/label.json?search=openfda.generic_name:<drug>&limit=1` with one unquoted word (the quoted form often returns "all shards failed"; search a combination product by its full name). Read the fields `adverse_reactions` and `effective_time`.
- One indication of a multi-use drug: add `+AND+indications_and_usage:<word>`, or search `openfda.brand_name:<brand>`. A generic name can return another product's label first (Jynarque for tolvaptan), and some brands (Zyban) return nothing.
- Injectables: add `+AND+openfda.route:INTRAVENOUS`, since topical or cosmetic labels otherwise come first. The oral form of a drug that also has an IV label (tranexamic acid): add `+AND+openfda.route:ORAL`.
- OTC labels have no adverse-reaction section. For a drug also sold by prescription (loperamide), add `+AND+_exists_:adverse_reactions`. For an OTC-only drug (nicotine replacement), use the UK SmPC at `medicines.org.uk/emc/product/<id>/smpc`.
- A product openFDA lacks (dimercaprol): DailyMed `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=<brand>`, then the SPL XML by setid.
- A product withdrawn from the US (single-ingredient indacaterol): the EMA SmPC (EMA row), or the old label PDF on accessdata.fda.gov with `curl -sL` and a browser User-Agent.
