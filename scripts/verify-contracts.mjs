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
  'lib/db/schema.ts',
  'lib/game-factory/sprite-gen-contract.ts',
  'lib/game-factory/gameplay.ts',
  'lib/game-factory/theme-gameplay.ts',
  'lib/payfast.ts',
  'worker/main.py',
  'drizzle/0003_payment_generation_request.sql',
  'drizzle/0004_generation_status.sql',
  '.env.example',
];

for (const relative of requiredFiles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing required production file: ${relative}`);
}

const duplicatePaymentImplementation = path.join(root, 'lib/payments/orders.ts');
if (fs.existsSync(duplicatePaymentImplementation)) throw new Error('Duplicate payment-order implementation detected at lib/payments/orders.ts. Use lib/db/payment-orders.ts only.');

const paymentOrders = fs.readFileSync(path.join(root, 'lib/db/payment-orders.ts'), 'utf8');
for (const invariant of [
  'eq(paymentOrders.paymentId, input.paymentId)',
  'eq(paymentOrders.packageId, input.packageId)',
  'eq(paymentOrders.amountCents, input.amountCents)',
  "ne(paymentOrders.status, 'paid')",
  "eq(paymentOrders.generationStatus, 'pending')",
  "set({ generationStatus: 'running' })",
  "set({ generationStatus: 'complete' })",
]) if (!paymentOrders.includes(invariant)) throw new Error(`Payment-order update is missing invariant: ${invariant}`);

const schema = fs.readFileSync(path.join(root, 'lib/db/schema.ts'), 'utf8');
if (!schema.includes("generationStatus: text('generation_status').notNull().default('pending')")) throw new Error('Payment orders must persist a single-flight generation status.');

const checkoutRoute = fs.readFileSync(path.join(root, 'app/api/payments/payfast/route.ts'), 'utf8');
if (!checkoutRoute.includes('const paymentId = randomUUID();')) throw new Error('Payment identifiers must be generated server-side.');
if (checkoutRoute.includes('body.paymentId')) throw new Error('Client-supplied payment identifiers must not control payment order identity.');
if (!checkoutRoute.includes('sourceObjectRef')) throw new Error('Payment order must bind the temporary source reference to the paid order.');
if (!checkoutRoute.includes('generationRequest')) throw new Error('Payment order must persist the generation request for post-payment generation.');
if (!checkoutRoute.includes("const returnPath = '/';")) throw new Error('PayFast return must land on the payment-aware app flow, not an ungenerated game route.');

const statusRoute = fs.readFileSync(path.join(root, 'app/api/payments/payfast/status/route.ts'), 'utf8');
if (!statusRoute.includes('[0-9a-f]{8}-[0-9a-f]{4}')) throw new Error('Payment status must require UUID payment identifiers.');
if (statusRoute.includes('order.packageId') || statusRoute.includes('order.jobId')) throw new Error('Payment status endpoint must not disclose package or job ownership data.');

const itnRoute = fs.readFileSync(path.join(root, 'app/api/payments/payfast/itn/route.ts'), 'utf8');
if (!itnRoute.includes('markPaymentPaid({')) throw new Error('PayFast ITN must use the active payment-order transition.');
if (!itnRoute.includes('packageId,')) throw new Error('PayFast ITN must pass the verified packageId to the payment transition.');
if (!itnRoute.includes('amountCents,')) throw new Error('PayFast ITN must pass the verified amountCents to the payment transition.');
if (!itnRoute.includes('const current = await getPaymentOrder(paymentId)')) throw new Error('PayFast ITN must tolerate concurrent duplicate callbacks.');

const generationRoute = fs.readFileSync(path.join(root, 'app/api/generation/route.ts'), 'utf8');
if (!generationRoute.includes('paymentId')) throw new Error('Sprite generation must require a payment identifier.');
if (!generationRoute.includes("order.status !== 'paid'")) throw new Error('Sprite generation must refuse unpaid orders.');
if (!generationRoute.includes('order.sourceObjectRef') || !generationRoute.includes('order.generationRequestJson')) throw new Error('Sprite generation must consume server-bound order metadata, not client-submitted generation data.');
if (!generationRoute.includes("status: 'paid'")) throw new Error('Generated paid games must persist as paid entitlements.');
for (const invariant of ['claimGeneration(body.paymentId)', 'order.generationStatus === \'complete\'', 'order.generationStatus === \'running\'', 'markGenerationComplete(body.paymentId)', 'releaseGenerationClaim(body.paymentId)']) if (!generationRoute.includes(invariant)) throw new Error(`Generation route missing single-flight invariant: ${invariant}`);
if (!generationRoute.includes('export const maxDuration = 300;')) throw new Error('Sprite generation route must remain within Vercel Hobby maximum duration.');

const sourceRoute = fs.readFileSync(path.join(root, 'app/api/generation/source/route.ts'), 'utf8');
for (const [name, route] of [['generation', generationRoute], ['source-photo', sourceRoute]]) {
  if (!route.includes('SPRITE_GEN_SHARED_SECRET?.trim()') || !route.includes('!secret')) throw new Error(`${name} route must fail closed when the sprite worker shared secret is missing.`);
  if (!route.includes("'x-worker-secret': secret")) throw new Error(`${name} route must authenticate requests to the sprite worker.`);
}

const page = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
if (!page.includes('CREATE & PAY R499')) throw new Error('Hero checkout UI must advertise the configured R499 Hero package.');
if (page.includes('R999')) throw new Error('Stale R999 Hero pricing copy detected.');
if (!page.includes('generatePaidGame')) throw new Error('Client must trigger generation only after payment verification.');
if (!page.includes('generationRequest: request')) throw new Error('Client checkout must bind the generation request to the paid order.');
if (!page.includes('sourceObjectRef: securedSourceRef')) throw new Error('Client checkout must bind the secured source reference to the paid order.');

const gameRoute = fs.readFileSync(path.join(root, 'app/api/games/[jobId]/route.ts'), 'utf8');
if (!gameRoute.includes('GAME_ADMIN_DELETE_SECRET?.trim()')) throw new Error('Game asset deletion must require an operator secret.');
if (!gameRoute.includes('x-admin-delete-secret')) throw new Error('Game asset deletion must use a dedicated server-side operator header.');

const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const variable of ['SPRITE_GEN_SHARED_SECRET=', 'GAME_ADMIN_DELETE_SECRET=']) if (!envExample.includes(variable)) throw new Error(`.env.example missing ${variable}`);

for (const [file, columns] of [['drizzle/0003_payment_generation_request.sql', ['source_object_ref', 'generation_request_json']], ['drizzle/0004_generation_status.sql', ['generation_status']]]) {
  const migration = fs.readFileSync(path.join(root, file), 'utf8');
  for (const column of columns) if (!migration.includes(column)) throw new Error(`Migration ${file} missing ${column}.`);
}

const worker = fs.readFileSync(path.join(root, 'worker/main.py'), 'utf8');
if (!worker.includes('if not expected or not secret:')) throw new Error('Sprite worker authorization must fail closed when the shared secret is missing.');
if (!worker.includes('hmac.compare_digest(secret, expected)')) throw new Error('Sprite worker authorization must use constant-time secret comparison.');
if (!worker.includes('purge_expired_sources()')) throw new Error('Sprite worker must purge expired temporary child photos.');
if (!worker.includes('active_sources: set[str] = set()')) throw new Error('Worker must track active source-photo references during generation.');
if (!worker.includes('if token in active_sources:')) throw new Error('Worker cleanup must not delete a source while its generation job is active.');
if (!worker.includes('active_sources.add(source_token)')) throw new Error('Worker must mark a source active before generation starts.');
if (!worker.includes('active_sources.discard(source_token)')) throw new Error('Worker must release active source state after generation finishes.');
if (!worker.includes('base_source.unlink(missing_ok=True)')) throw new Error('Sprite worker must delete the consumed temporary source after generation.');
if (!worker.includes('SPRITE_GEN_TIMEOUT_SECONDS", "240"')) throw new Error('Sprite worker default stage timeout must stay below the Vercel Hobby function ceiling.');

const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
if (tsconfig.compilerOptions?.baseUrl !== '.') throw new Error('tsconfig must define baseUrl "." for @ alias resolution.');
if (JSON.stringify(tsconfig.compilerOptions?.paths?.['@/*']) !== JSON.stringify(['./*'])) throw new Error('tsconfig must map @/* to ./* for production imports.');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.dependencies?.next !== '14.2.35') throw new Error(`Unexpected Next.js version: ${packageJson.dependencies?.next}`);
for (const script of ['build', 'test:contracts', 'test:gameplay', 'test:generation', 'test:smoke']) if (!packageJson.scripts?.[script]) throw new Error(`Missing required npm script: ${script}`);

console.log('NahaKids production contract checks: PASS');
console.log(`Verified ${requiredFiles.length} required production files plus payment, paid-generation, single-flight, privacy, deletion, runtime-duration and deployment invariants.`);
