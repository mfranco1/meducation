/**
 * Development-only first step. Requires Poppler's `pdftotext` locally.
 * It writes raw text beside a source PDF; a human must structure/review it before it enters questionBank.ts.
 */
import { execFileSync } from 'node:child_process'; import { existsSync, mkdirSync, writeFileSync } from 'node:fs'; import { basename, resolve } from 'node:path';
const source=process.argv[2]; if(!source){ console.error('Usage: npm run extract:pdf -- <source.pdf>'); process.exit(1); } if(!existsSync(source)){ console.error(`Source not found: ${source}`); process.exit(1); }
const outputDir=resolve('content/raw'); mkdirSync(outputDir,{recursive:true}); const output=resolve(outputDir,`${basename(source,'.pdf')}.txt`); try { const text=execFileSync('pdftotext',['-layout',source,'-'],{encoding:'utf8'}); writeFileSync(output,text); console.log(`Extracted ${output}`); } catch { console.error('pdftotext is required. Install Poppler, then rerun. The output is raw source material, not a production question bank.'); process.exit(1); }
