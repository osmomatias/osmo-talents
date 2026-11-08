// Compile-only checks: these deliberate errors must be rejected by the public router API.
import { createRouter } from '../src/router';
type Context = { params: Record<string, number>; query: URLSearchParams };
const router = createRouter<Context, { ok: boolean }, 'cliente' | 'freela'>();
router.route('GET', '/jobs/:id', context => ({ ok: context.query.has('ready') }));
router.route('POST', '/jobs', async () => ({ ok: true }), { role: 'cliente', raw: 1024 });
// @ts-expect-error Invalid method must not enter the typed registration API.
router.route('INVALID', '/jobs', () => ({ ok: true }));
// @ts-expect-error Raw-body limits are numeric byte counts.
router.route('POST', '/files', () => ({ ok: true }), { raw: '1024' });
// @ts-expect-error Handlers must satisfy their declared response contract.
router.route('GET', '/jobs', () => ({ ok: 'yes' }));
// @ts-expect-error Context fields are checked, rather than implicitly any.
router.route('GET', '/jobs', context => ({ ok: context.nonexistent }));
// @ts-expect-error Only declared application roles may restrict this router.
router.route('GET', '/jobs', () => ({ ok: true }), { role: 'owner' });
// @ts-expect-error Registry size is a read-only count.
router.size = 0;
