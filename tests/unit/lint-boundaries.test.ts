import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/** Lint a snippet as if it lived at `filePath`, returning the boundary messages (rule no-restricted-imports). */
let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});
async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports').map((m) => m.message);
}

describe('architecture boundaries are enforced by lint', () => {
  it('a module is importable only through its index', async () => {
    expect(
      await violations('src/app/x/page.tsx', "import { signUp } from '@/modules/auth/accounts';"),
    ).toHaveLength(1);
    expect(
      await violations('src/app/x/page.tsx', "import { getCurrentUser } from '@/modules/auth';"),
    ).toEqual([]);
    expect(
      await violations(
        'src/modules/auth/x.ts',
        "import { createProfile } from '@/modules/profiles/service';",
      ),
    ).toHaveLength(1);
    expect(
      await violations('src/modules/auth/x.ts', "import { createProfile } from '@/modules/profiles';"),
    ).toEqual([]);
  });

  it('modules depend on each other in one direction only (no cycles)', async () => {
    // auth -> profiles is allowed; profiles -> auth is not
    expect(
      await violations('src/modules/profiles/x.ts', "import { requireSession } from '@/modules/auth';"),
    ).toHaveLength(1);
    expect(await violations('src/modules/profiles/x.ts', "import { can } from '@/modules/authz';")).toEqual(
      [],
    );
    // pure policy / relationship modules depend on no other module
    expect(
      await violations('src/modules/authz/x.ts', "import { getRanchForViewer } from '@/modules/profiles';"),
    ).toHaveLength(1);
    // relationships may use the policy, but nothing else; moderation stands alone
    expect(
      await violations('src/modules/relationships/x.ts', "import { can } from '@/modules/authz';"),
    ).toEqual([]);
    expect(
      await violations('src/modules/relationships/x.ts', "import { getCards } from '@/modules/profiles';"),
    ).toHaveLength(1);
    expect(
      await violations('src/modules/relationships/x.ts', "import { requireSession } from '@/modules/auth';"),
    ).toHaveLength(1);
    expect(
      await violations('src/modules/moderation/x.ts', "import { act } from '@/modules/relationships';"),
    ).toHaveLength(1);
    expect(await violations('src/modules/moderation/x.ts', "import { getDb } from '@/platform/db';")).toEqual(
      [],
    );
    expect(
      await violations(
        'src/modules/profiles/x.ts',
        "import { relationshipOf } from '@/modules/relationships';",
      ),
    ).toEqual([]);
    expect(
      await violations('src/modules/profiles/x.ts', "import { createReport } from '@/modules/moderation';"),
    ).toHaveLength(1);
    // fence sits on top: it may use authz, profiles, relationships and moderation (the anti-spam checks, ADR-024) —
    // and nothing may depend on it
    for (const ok of ['authz', 'profiles', 'relationships', 'moderation'])
      expect(await violations('src/modules/fence/x.ts', `import { a } from '@/modules/${ok}';`)).toEqual([]);
    // moderation still depends on nothing, so letting others use it cannot make a cycle
    for (const other of ['fence', 'relationships', 'whispers', 'auth'])
      expect(
        await violations('src/modules/moderation/x.ts', `import { a } from '@/modules/${other}';`),
      ).toHaveLength(1);
    for (const bad of ['auth'])
      expect(
        await violations('src/modules/fence/x.ts', `import { a } from '@/modules/${bad}';`),
      ).toHaveLength(1);
    for (const lower of ['auth', 'profiles', 'relationships', 'authz', 'moderation'])
      expect(
        await violations(`src/modules/${lower}/x.ts`, "import { listFence } from '@/modules/fence';"),
      ).toHaveLength(1);
    expect(
      await violations('src/app/x/page.tsx', "import { listFence } from '@/modules/fence/service';"),
    ).toHaveLength(1);
    // notifications sits beside fence: authz / profiles / relationships only, and nothing depends on it — modules talk
    // through domain events (src/platform/events.ts), wired in the app layer
    for (const ok of ['authz', 'profiles', 'relationships'])
      expect(
        await violations('src/modules/notifications/x.ts', `import { a } from '@/modules/${ok}';`),
      ).toEqual([]);
    for (const bad of ['auth', 'moderation', 'fence'])
      expect(
        await violations('src/modules/notifications/x.ts', `import { a } from '@/modules/${bad}';`),
      ).toHaveLength(1);
    for (const lower of ['auth', 'profiles', 'relationships', 'authz', 'moderation', 'fence'])
      expect(
        await violations(
          `src/modules/${lower}/x.ts`,
          "import { listChimes } from '@/modules/notifications';",
        ),
      ).toHaveLength(1);
    // whispers is a peer of fence / notifications: authz, profiles, relationships only — and nothing depends on it. The
    // realtime process (src/realtime) is a second entry point like src/app: it composes modules through their indexes.
    // (moderation too, for the first-week budget — ADR-024.)
    for (const ok of ['authz', 'profiles', 'relationships', 'moderation'])
      expect(await violations('src/modules/whispers/x.ts', `import { a } from '@/modules/${ok}';`)).toEqual(
        [],
      );
    for (const bad of ['auth', 'fence', 'notifications'])
      expect(
        await violations('src/modules/whispers/x.ts', `import { a } from '@/modules/${bad}';`),
      ).toHaveLength(1);
    for (const lower of [
      'auth',
      'profiles',
      'relationships',
      'authz',
      'moderation',
      'fence',
      'notifications',
    ])
      expect(
        await violations(`src/modules/${lower}/x.ts`, "import { sendWhisper } from '@/modules/whispers';"),
      ).toHaveLength(1);
    expect(
      await violations('src/realtime/x.ts', "import { sendWhisper } from '@/modules/whispers';"),
    ).toEqual([]);
    expect(
      await violations('src/realtime/x.ts', "import { sendWhisper } from '@/modules/whispers/service';"),
    ).toHaveLength(1);
    // tracks sits on profiles + relationships only (no policy needed: it only ever answers about the caller's own Ranch), and
    // nothing depends on it — visits reach it as domain events
    for (const ok of ['profiles', 'relationships'])
      expect(await violations('src/modules/tracks/x.ts', `import { a } from '@/modules/${ok}';`)).toEqual([]);
    for (const bad of ['auth', 'authz', 'moderation', 'fence', 'notifications', 'whispers'])
      expect(
        await violations('src/modules/tracks/x.ts', `import { a } from '@/modules/${bad}';`),
      ).toHaveLength(1);
    for (const lower of [
      'auth',
      'profiles',
      'relationships',
      'authz',
      'moderation',
      'fence',
      'notifications',
      'whispers',
    ])
      expect(
        await violations(`src/modules/${lower}/x.ts`, "import { listTracks } from '@/modules/tracks';"),
      ).toHaveLength(1);
    // media owns files and nothing else: it imports no other module, and no other module imports it. Who may SEE a photo is
    // decided in the app layer (the route), which composes media with the profile rules.
    for (const bad of [
      'auth',
      'profiles',
      'relationships',
      'authz',
      'moderation',
      'fence',
      'notifications',
      'whispers',
      'tracks',
    ])
      expect(
        await violations('src/modules/media/x.ts', `import { a } from '@/modules/${bad}';`),
      ).toHaveLength(1);
    for (const other of [
      'auth',
      'profiles',
      'relationships',
      'authz',
      'moderation',
      'fence',
      'notifications',
      'whispers',
      'tracks',
    ])
      expect(
        await violations(`src/modules/${other}/x.ts`, "import { readPortrait } from '@/modules/media';"),
      ).toHaveLength(1);
    expect(
      await violations('src/app/x/page.tsx', "import { readPortrait } from '@/modules/media/service';"),
    ).toHaveLength(1);
    expect(await violations('src/app/x/page.tsx', "import { readPortrait } from '@/modules/media';")).toEqual(
      [],
    );
    // auth must not reach the pure modules directly either (it goes through profiles)
    expect(await violations('src/modules/auth/x.ts', "import { can } from '@/modules/authz';")).toHaveLength(
      1,
    );
  });

  it('UI components contain no server code', async () => {
    expect(await violations('src/ui/x.tsx', "import { getDb } from '@/platform/db';")).toHaveLength(1);
    expect(await violations('src/ui/x.tsx', "import { authHandlers } from '@/modules/auth';")).toHaveLength(
      1,
    );
    expect(await violations('src/ui/x.tsx', "import { LIMITS } from '@/shared/limits';")).toEqual([]);
  });

  it('lower layers never import upward', async () => {
    expect(
      await violations('src/platform/x.ts', "import { authHandlers } from '@/modules/auth';"),
    ).toHaveLength(1);
    expect(await violations('src/platform/x.ts', "import { Button } from '@/ui/primitives';")).toHaveLength(
      1,
    );
    expect(await violations('src/shared/x.ts', "import { getDb } from '@/platform/db';")).toHaveLength(1);
    expect(await violations('src/shared/x.ts', "import { z } from 'zod';")).toEqual([]);
    expect(
      await violations('src/modules/auth/x.ts', "import { Button } from '@/ui/primitives';"),
    ).toHaveLength(1);
    expect(
      await violations('src/modules/auth/x.ts', "import { GET } from '@/app/api/health/route';"),
    ).toHaveLength(1);
  });

  it('tests are exempt (they exercise internals on purpose)', async () => {
    expect(await violations('tests/x.test.ts', "import { hashToken } from '@/modules/auth/crypto';")).toEqual(
      [],
    );
  });
});
