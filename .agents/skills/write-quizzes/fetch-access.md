# Fetch access

Sites that refuse automated fetches, and the route that loads instead. Look up the site or issuing body when a fetch fails; the general fallbacks are in [verification.md](verification.md#procedure). The source ledger records blocked documents; this file records blocked sites.

When you verify a fact in another body's guideline, cite that body, and name it in the stem where the bodies differ.

| Site or body | Fails with | Use instead |
| --- | --- | --- |
| AHA/ACC (ahajournals, JACC) | 403 | The guideline's own PubMed Central copy (many are there), then the Web Archive raw form of the full-text page. ACC "Guidelines Made Simple" or pocket-guide PDFs for recommendation classes and thresholds. A university mirror PDF that WebFetch returns as binary reads after saving it and running `pdftotext -layout` |
| AHA resuscitation (CPR, ECC) | | Guideline pages on cpr.heart.org subdomains |
| 2025 AHA/ACC and 2024 ESC hypertension | Blocked everywhere | 2020 Philippine hypertension guideline (PMC8678709), NICE NG136 and NG133, or ADA Standards section 10; cite that body |
| NCCN guidelines | Login required | The matching ESGO guideline (open access in *Int J Gynecol Cancer*, often in PMC) for gynecologic cancers, ACMG or ASCO for hereditary risk, or the drug's FDA label for an approval; cite that body |
| ESMO (Annals of Oncology guidelines) | 403, not open access | 2025 UK bone sarcoma guideline (Gerrand et al., Br J Cancer, PMC11723950) for bone sarcomas; otherwise an equivalent open guideline; cite that body |
| ESC, ERS | 403 | PubMed Central copy, then society pocket-guide PDFs. Joint ERS/ATS guideline PDFs load from member.thoracic.org with `curl -sL`. Recent guidelines without a PMCID (2025 pregnancy guideline): the OUP full text at academic.oup.com loads but truncates partway or runs past 300,000 characters (2018 syncope guideline), so fetch the needed section from the OUP chapter or supplementary links |
| *The Lancet* (thelancet.com) | 403; Europe PMC has the abstract only | PubMed Central author manuscript, or a university repository PDF (GBD papers are often in coauthors' repositories); otherwise list the fact as abstract-only |
| Neurocritical Care Society (neurocriticalcare.org) | 403 | Journal article PDF hosted by a university neurocritical care page (2023 SAH guideline) |
| BTS | 403 | PDFs in the brit-thoracic.org.uk document library |
| GOLD, GINA report PDFs | WebFetch size limit (over 10 MB) | Download the PDF with `curl -sL` and read it with `pdftotext -layout` |
| CDC STI treatment pages | Often refused | PubMed Central copy of the MMWR guideline |
| clinicalinfo.hiv.gov (NIH HIV and opportunistic infection guidelines) | 403 | Web Archive raw form of the guideline PDF |
| ADA Standards of Care (diabetesjournals.org, Diabetes Care) | Cloudflare challenge; PMC, Europe PMC and efetch return metadata without the body (2026 edition) | Try the Wayback Machine copy of the diabetesjournals.org section; otherwise verify in an ACOG Committee Opinion or Clinical Consensus that loads, or list the fact as unverified |
| PubMed Central | Browser check | The article page with `curl -sL` and a browser User-Agent, then the Europe PMC full-text copy, or NCBI E-utilities `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=<PMCID digits>` (full-text XML) when Europe PMC also refuses; articles outside the open-access subset come back abstract-only from all three, so record them as abstract-only |
| PubMed (pubmed.ncbi.nlm.nih.gov) | Cookie wall | Europe PMC REST search for the abstract and full citation: `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:<PMID>%20AND%20SRC:MED&resultType=core` |
| Philippine Statistics Authority (psa.gov.ph: causes of death) | 403, including press-release PDFs | Web Archive raw form with curl (`web.archive.org/web/2025id_/<URL>`) |
| Japanese Circulation Society (Circ J guidelines) | Not tested on J-STAGE | University-hosted PDF of the guideline (JCS 2023 vasospastic angina on a Tohoku University page) |
| RSNA (pubs.rsna.org: *Radiology*, Fleischner statements) | Refused | Europe PMC copy, or a hospital- or society-hosted copy of the recommendation table |
| NCBI Bookshelf | Often refused | Europe PMC or a copy hosted by another agency |
| Wolters Kluwer (journals.lww.com: *Crit Care Med*, PADIS 2018) | 402 | PubMed Central copy if one exists; otherwise list the fact as unverified |
| *Respiratory Care* (rcjournal.com) | Refused | Web Archive raw form of the PDF with `curl -sL` (`web.archive.org/web/2020id_/<PDF URL>`) |
| ASRA neuraxial anticoagulation (rapm.bmj.com) | Full text blocked, summaries only | The anticoagulant's DailyMed label (spinal/epidural hematoma and catheter timing sections); cite the label |
| EULAR (ard.bmj.com) | 403 | Author manuscript in a university repository (eprints, institutional open-access pages) |
| ESGO | | Pocket-guideline PDFs on esgo.org; some full texts are hosted by national societies (BGCS) |
| ACOG | 402 | Committee Opinions, Clinical Consensus documents and Practice Advisories load through the Wayback Machine (`web.archive.org/web/2026/<acog.org URL>`; for a PDF, `web.archive.org/web/2026id_/<URL>` returns the raw file); Practice Bulletins there are paywalled stubs. Otherwise an SMFM-hosted copy, or an equivalent current guideline that loads: NICE (also through the UK Government Web Archive), WHO, SMFM, FIGO |
| ASCRS (Diseases of the Colon & Rectum) | Paywalled, summaries only | A repository copy when one exists (ASCRS 2020 Crohn guideline on eScholarship); otherwise an open guideline on the same point: WSES (World J Emerg Surg), AGA clinical practice updates, UEG/ESCP; cite that body |
| AAP (*Pediatrics* on publications.aap.org) | Full text refused | The guideline's algorithm or summary pages on aap.org (2026 UTI imaging algorithm); cite that page |
| AUA | Login | EAU guideline chapters on uroweb.org; cite EAU |
| Drug labels (DailyMed) | Sometimes unreachable | openFDA label API with curl: `https://api.fda.gov/drug/label.json?search=openfda.generic_name:<drug>&limit=1` with one unquoted word (the quoted form often returns "all shards failed"; search a combination product by its full name), fields `adverse_reactions` and `effective_time`. For one indication of a multi-use drug, add `+AND+indications_and_usage:<word>` (brand names such as Zyban return nothing). OTC labels (nicotine replacement) have no adverse-reaction section: use the UK SmPC at `medicines.org.uk/emc/product/<id>/smpc`. Add `+AND+openfda.route:INTRAVENOUS` for injectables, which otherwise return topical or cosmetic labels first. Cite the US prescribing information |
| ASH, ISTH and BSH hematology guidelines | efetch returns abstract or front matter only | Guideline PDFs hosted on thebloodproject.com; save the binary WebFetch returns and run `pdftotext -layout` |
| *Mayo Clinic Proceedings*, *J Clin Oncol* (ascopubs.org) | 403 | PubMed Central copy if one exists; otherwise list the fact as abstract-only |
| GRADE guidelines series (jclinepi.com) | 403 | GRADE Handbook on gdt.gradepro.org; cite the handbook |
| Philippine laws (lawphil.net, officialgazette.gov.ph) | Unreachable, refused | WIPO Lex full text of the Act; a compiled legal database (LawPlayer) when WIPO lacks it, recorded as unofficial in the ledger |
| DOH administrative orders and implementing rules (PhilPEN AO 2012-0029) | Not reachable | Supreme Court E-Library (elibrary.judiciary.gov.ph) copy of the issuance; otherwise the PhilHealth circular that reproduces the protocol (Circular 20, 2013, for PhilPEN); cite the circular |
| National Privacy Commission (privacy.gov.ph: DPA IRR, NPC circulars) | Refused, as is the Senate copy | Supreme Court E-Library copy, then a compiled legal database (chanrobles), recorded as unofficial in the ledger |
| DOLE department orders (DO 53-03, DO 208-20) | Not reachable, secondary copies only | Supreme Court E-Library copy, then the Web Archive copy of the DOLE PDF; ECC rules from the ECC's booklet of the Amended Rules |
| WHO IRIS (Ottawa Charter, other WHO PDFs) | 403 | The Web Archive or PAHO (iris.paho.org) copy of the PDF; otherwise the document's who.int summary page, recorded as summary-only. For contraception, the WHO MEC 6th edition annex; for STI regimens, CDC 2021 STI guidelines, cited as CDC |
| FNRI-DOST (fnri.dost.gov.ph: Pinggang Pinoy, dietary guidelines) | Firewall error | Web Archive copy of the FNRI page or PDF |
