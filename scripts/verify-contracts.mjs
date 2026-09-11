import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'app/page.tsx',
  'app/api/generation/route.ts',
  'app/api/generation/source/route.ts',
  'app/api/games/[jobId]/route.ts',
  'app/api/games/[jobId]/qr/route.ts',
  'app/api/payments/payfast/route.ts',
  'app/api/payments/payfast/itn/route.ts',
  'app/api/payments/payfast/status/route.ts',
  'lib/db/game-records.ts',
  'lib/game-factory/sprite-gen-contract.ts',
  'lib/game-factory/gameplay.ts',
  'lib/game-factory/theme-gameplay.ts',
  'lib/payfast.ts',
];

for (const relative of requiredFiles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing required production file: ${relative}`);
}

const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
if (tsconfig.compilerOptions?.baseUrl !== '.') throw new Error('tsconfig must define baseUrl "." for @ alias resolution.');
if (JSON.stringify(tsconfig.compilerOptions?.paths?.['@/*']) !== JSON.stringify(['./*'])) {
  throw new Error('tsconfig must map @/* to ./* for production imports.');
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.dependencies?.next !== '14.2.35') {
  throw new Error(`Unexpected Next.js version: ${packageJson.dependencies?.next}`);
}
for (const script of ['build', 'test:contracts', 'test:gameplay']) {
  if (!packageJson.scripts?.[script]) throw new Error(`Missing required npm script: ${script}`);
}

console.log('NahaKids production contract checks: PASS');
console.log(`Verified ${requiredFiles.length} required production files, @ alias mapping, Next.js patch level and test scripts.`);
