import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const htmlFiles = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) walk(absolutePath);
    if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(absolutePath);
  }
}

walk(projectRoot);

const missing = [];
for (const htmlFile of htmlFiles) {
  const html = readFileSync(htmlFile, 'utf8');
  for (const match of html.matchAll(/(?:href|src)="([^"#?]+)"/g)) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|tel:|data:)/.test(reference)) continue;
    const target = resolve(dirname(htmlFile), reference);
    if (!existsSync(target)) missing.push(`${htmlFile} -> ${reference}`);
  }
}

const casesHtml = readFileSync(join(projectRoot, 'pages', 'cases.html'), 'utf8');
const caseCount = (casesHtml.match(/class="case-index"/g) ?? []).length;
const imageCount = (casesHtml.match(/<img\s/g) ?? []).length;
const partnerLogoCount = (casesHtml.match(/class="partner-logo(?:\s|\")/g) ?? []).length;

console.log(`HTML files: ${htmlFiles.length}`);
console.log(`Missing local references: ${missing.length}`);
console.log(`Case entries: ${caseCount}`);
console.log(`Case images: ${imageCount}`);
console.log(`Partner logos: ${partnerLogoCount}`);

if (missing.length > 0) console.error(missing.join('\n'));
if (missing.length > 0 || caseCount !== 9 || imageCount !== 13 || partnerLogoCount !== 5) process.exitCode = 1;
