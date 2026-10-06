import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Architecture boundaries (docs/ARCHITECTURE.md §2, ADR-002). Enforced here so they cannot erode silently:
 *   app → modules → platform / shared          (never the other way)
 *   ui  → shared only                          (no server code in components)
 *   a module is imported ONLY through its index.ts, and modules depend on each other in one direction:
 *   auth → profiles → (authz, relationships), auth → moderation   (no cycles)
 * Tests are exempt: they exercise module internals on purpose.
 */
const DEEP = {
  group: ['@/modules/*/*'],
  message: 'Import a module only through its index.ts (e.g. "@/modules/auth").',
};
const NO_MODULES = {
  group: ['@/modules', '@/modules/**'],
  message: 'This layer must not depend on feature modules.',
};
const NO_PLATFORM = {
  group: ['@/platform', '@/platform/**'],
  message: 'This layer must not depend on platform (server) code.',
};
const NO_UI = { group: ['@/ui', '@/ui/**'], message: 'Lower layers must not import UI code.' };
const NO_APP = {
  group: ['@/app', '@/app/**', '@/realtime', '@/realtime/**'],
  message: 'Nothing may import from an entry-point layer (app routes, realtime process).',
};

const restrict = (files, ...patterns) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns }] },
});

/** Which other modules each module may import (via their index only). Anything not listed is forbidden. */
const MODULE_DEPENDENCIES = {
  // Sign-in asks moderation why an account is suspended (moderation itself depends on nothing).
  auth: ['profiles', 'moderation'],
  profiles: ['authz', 'relationships'],
  authz: [],
  relationships: ['authz', 'moderation'],
  moderation: [],
  // moderation: the anti-spam checks (new-account budgets, holding for review). It depends on nothing.
  fence: ['authz', 'profiles', 'relationships', 'moderation'],
  notifications: ['authz', 'profiles', 'relationships', 'push'],
  // Town Halls: names, who is hidden from whom (the feed, ADR-033), and the anti-spam checks. Only Tributes and Marks
  // depend on it, to ask whether two people are neighbours (ADR-044).
  'town-halls': ['moderation', 'profiles', 'relationships'],
  // Tributes and Marks: the Porch policy, names, the relationship, and whether two people are neighbours (ADR-044).
  tributes: ['authz', 'profiles', 'relationships', 'town-halls'],
  marks: ['authz', 'profiles', 'relationships', 'town-halls'],
  whispers: ['authz', 'profiles', 'relationships', 'moderation'],
  tracks: ['profiles', 'relationships'],
  // Owns files and nothing else; who may SEE a file is decided in the app layer.
  media: [],
  // Owns devices and sending; what deserves a push is the notifications module's call.
  push: [],
  // Time Capsules (Phase 12): the first-week budget, names, and who is still a Pal. Nothing depends on it.
  capsules: ['moderation', 'profiles', 'relationships'],
  // Memories (Phase 12): read-only; who I can still see decides what comes back.
  memories: ['profiles', 'relationships'],
  // Pals you may know (Phase 13): the Porch policy, and names. Nothing depends on it.
  suggestions: ['authz', 'profiles'],
  // Porch Light (ADR-032): names, and which Pals a light reaches. Nothing depends on it.
  lights: ['profiles', 'relationships'],
};
const moduleRules = Object.entries(MODULE_DEPENDENCIES).map(([name, allowed]) => {
  const forbidden = Object.keys(MODULE_DEPENDENCIES).filter((m) => m !== name && !allowed.includes(m));
  return restrict(
    [`src/modules/${name}/**/*.{ts,tsx}`],
    DEEP,
    NO_UI,
    NO_APP,
    ...forbidden.map((m) => ({
      group: [`@/modules/${m}`, `@/modules/${m}/**`],
      message: `The ${name} module may not depend on ${m}.`,
    })),
  );
});

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'coverage/**', '.dev/**', 'db/migrations/**', 'next-env.d.ts']),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error',
      // Never render unsanitised HTML (XSS). Revisit only with a reviewed sanitiser.
      'react/no-danger': 'error',
    },
  },
  restrict(['src/app/**/*.{ts,tsx}'], DEEP),
  // The realtime process is a second entry point like the app: it composes modules through their indexes only.
  restrict(['src/realtime/**/*.{ts,tsx}'], DEEP, NO_UI, {
    group: ['@/app', '@/app/**'],
    message: 'The realtime process must not import the app layer.',
  }),
  restrict(['src/ui/**/*.{ts,tsx}'], NO_MODULES, NO_PLATFORM, NO_APP),
  restrict(['src/platform/**/*.{ts,tsx}'], NO_MODULES, NO_UI, NO_APP),
  restrict(['src/shared/**/*.{ts,tsx}'], NO_MODULES, NO_PLATFORM, NO_UI, NO_APP),
  ...moduleRules,
]);
