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
  'lib/db/payment-orders.ts',
  'lib/game-factory/sprite-gen-contract.ts',
  'lib/game-factory/gameplay.ts',
  'lib/game-factory/theme-gameplay.ts',
  'lib/payfast.ts',
  'worker/main.py',
];

for (const relative of requiredFiles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing required production file: ${relative}`);
}

const duplicatePaymentImplementation = path.join(root, 'lib/payments/orders.ts');
if (fs.existsSync(duplicatePaymentImplementation)) {
  throw new Error('Duplicate payment-order implementation detected at lib/payments/orders.ts. Use lib/db/payment-orders.ts only.');
}

const paymentOrders = fs.readFileSync(path.join(root, 'lib/db/payment-orders.ts'), 'utf8');
for (const invariant of [
  'eq(paymentOrders.paymentId, input.paymentId)',
  'eq(paymentOrders.packageId, input.packageId)',
  'eq(paymentOrders.amountCents, input.amountCents)',
  "ne(paymentOrders.status, 'paid')",
]) {
  if (!paymentOrders.includes(invariant)) throw new Error(`Payment-order update is missing invariant: ${invariant}`);
}

const itnRoute = fs.readFileSync(path.join(root, 'app/api/payments/payfast/itn/route.ts'), 'utf8');
if (!itnRoute.includes('markPaymentPaid({')) throw new Error('PayFast ITN must use the active payment-order transition.');
if (!itnRoute.includes('packageId,')) throw new Error('PayFast ITN must pass the verified packageId to the payment transition.');
if (!itnRoute.includes('amountCents,')) throw new Error('PayFast ITN must pass the verified amountCents to the payment transition.');
if (!itnRoute.includes('const current = await getPaymentOrder(paymentId)')) throw new Error('PayFast ITN must tolerate a concurrent duplicate callback after another callback has completed the payment.');

const generationRoute = fs.readFileSync(path.join(root, 'app/api/generation/route.ts'), 'utf8');
const sourceRoute = fs.readFileSync(path.join(root, 'app/api/generation/source/route.ts'), 'utf8');
for (const [name, route] of [['generation', generationRoute], ['source-photo', sourceRoute]]) {
  if (!route.includes('SPRITE_GEN_SHARED_SECRET?.trim()') || !route.includes('!secret')) {
    throw new Error(`${name} route must fail closed when the sprite worker shared secret is missing.`);
  }
  if (!route.includes("'x-worker-secret': secret")) {
    throw new Error(`${name} route must authenticate requests to the sprite worker.`);
  }
}

const worker = fs.readFileSync(path.join(root, 'worker/main.py'), 'utf8');
if (!worker.includes('if not expected or not secret:')) throw new Error('Sprite worker authorization must fail closed when the shared secret is missing.');
if (!worker.includes('hmac.compare_digest(secret, expected)')) throw new Error('Sprite worker authorization must use constant-time secret comparison.');
if (!worker.includes('purge_expired_sources()')) throw new Error('Sprite worker must purge expired temporary child photos.');
if (!worker.includes('base_source.unlink(missing_ok=True)')) throw new Error('Sprite worker must delete the consumed temporary source after generation.');

const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
if (tsconfig.compilerOptions?.baseUrl !== '.') throw new Error('tsconfig must define baseUrl "." for @ alias resolution.');
if (JSON.stringify(tsconfig.compilerOptions?.paths?.['@/*']) !== JSON.stringify(['./*'])) throw new Error('tsconfig must map @/* to ./* for production imports.');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.dependencies?.next !== '14.2.35') throw new Error(`Unexpected Next.js version: ${packageJson.dependencies?.next}`);
for (const script of ['build', 'test:contracts', 'test:gameplay', 'test:generation', 'test:smoke']) {
  if (!packageJson.scripts?.[script]) throw new Error(`Missing required npm script: ${script}`);
}

console.log('NahaKids production contract checks: PASS');
console.log(`Verified ${requiredFiles.length} required production files, payment architecture invariants, worker privacy/authentication invariants, @ alias mapping, Next.js patch level and test scripts.`);
