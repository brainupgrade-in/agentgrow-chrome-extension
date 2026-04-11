/**
 * Creates a CWS-ready zip from the dist/ directory.
 * Outputs: agentgrow-v{version}.zip + SHA256SUMS.txt
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const distDir = resolve(root, 'dist');
const manifest = JSON.parse(readFileSync(resolve(distDir, 'manifest.json'), 'utf8'));
const version = manifest.version;
const zipName = `agentgrow-v${version}.zip`;
const zipPath = resolve(root, zipName);

// Create zip from dist/
execSync(`cd "${distDir}" && zip -r "${zipPath}" . -x "*.map" ".vite/*"`, { stdio: 'inherit' });

// Generate SHA-256
const zipBuffer = readFileSync(zipPath);
const hash = createHash('sha256').update(zipBuffer).digest('hex');
const sizeKB = Math.round(zipBuffer.length / 1024);

writeFileSync(resolve(root, 'SHA256SUMS.txt'), `${hash}  ${zipName}\n`);

console.log(`\n✓ ${zipName} (${sizeKB} KB)`);
console.log(`✓ SHA-256: ${hash}`);
console.log(`✓ SHA256SUMS.txt written`);
console.log(`\nUpload ${zipName} to Chrome Web Store Developer Dashboard`);
