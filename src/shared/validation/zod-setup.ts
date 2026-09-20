import { z } from 'zod';

// Our production CSP forbids `unsafe-eval`. Zod 4 otherwise probes `new Function()` to JIT-compile validators, and the
// browser reports that (caught) attempt as a CSP violation on every page that validates a form. Plain interpretation
// is plenty fast for short strings. Import this for its side effect from every browser-reachable schema module.
z.config({ jitless: true });
