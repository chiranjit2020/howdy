/**
 * Test accounts for local development: four confirmed `tester_*` accounts who are all friends, with posts on each
 * other's walls, replies and reactions, so Home's feed has something in it. Run again to start over: existing
 * `tester_*` accounts are deleted first (everything they own goes with them). The password is generated each run and
 * written to `.dev/test-accounts.json` (gitignored). Refuses any database whose name is not `howdy_dev`.
 *
 * Run: `pnpm seed:dev`
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { recordAcceptance } from '@/modules/auth/legal';
import { hashPassword } from '@/modules/auth/crypto';
import { getDb, getPool } from '@/platform/db';

config({ path: '.env.local', quiet: true });

const PEOPLE = [
  { handle: 'tester_asha', name: 'Asha Rao', tint: 'gold' },
  { handle: 'tester_ravi', name: 'Ravi Menon', tint: 'sky' },
  { handle: 'tester_meera', name: 'Meera Iyer', tint: 'lavender' },
  { handle: 'tester_dev', name: 'Dev Kapoor', tint: 'mint' },
] as const;
type Handle = (typeof PEOPLE)[number]['handle'];

/** [author, wall, body, minutes ago, replies [author, body], reactions [who, kind]] */
const POSTS: [Handle, Handle, string, number, [Handle, string][], [Handle, string][]][] = [
  [
    'tester_ravi',
    'tester_ravi',
    'Chai at 5 near the college gate? Who’s in ☕',
    25,
    [
      ['tester_asha', 'Me! Save me a seat'],
      ['tester_meera', '5:30 works better for me'],
      ['tester_dev', 'Bringing samosas'],
    ],
    [
      ['tester_asha', 'love'],
      ['tester_meera', 'yo'],
      ['tester_dev', 'fire'],
    ],
  ],
  [
    'tester_meera',
    'tester_asha',
    'Happy birthday Asha! 🎉 Have the best day, see you tonight.',
    90,
    [['tester_asha', 'Thank you!! 💛']],
    [
      ['tester_ravi', 'love'],
      ['tester_dev', 'love'],
    ],
  ],
  [
    'tester_dev',
    'tester_dev',
    'Finally finished the trek to Kudremukh. Legs are gone, worth every step.',
    60 * 5,
    [],
    [
      ['tester_ravi', 'fire'],
      ['tester_asha', 'fire'],
      ['tester_meera', 'laugh'],
    ],
  ],
  [
    'tester_meera',
    'tester_meera',
    'Recommend me a book for a long train ride. Anything but thrillers.',
    60 * 26,
    [
      ['tester_ravi', 'The Ministry of Utmost Happiness'],
      ['tester_dev', 'Anything by Ruskin Bond'],
    ],
    [['tester_asha', 'popcorn']],
  ],
  [
    'tester_ravi',
    'tester_dev',
    'You still owe me a cricket rematch. Sunday?',
    60 * 50,
    [['tester_dev', 'Sunday 7 am, bring your own bat']],
    [],
  ],
];

async function main(): Promise<void> {
  const pool = getPool();
  const { rows: here } = await pool.query<{ db: string }>('select current_database() as db');
  if (here[0]?.db !== 'howdy_dev') {
    throw new Error(`refusing to seed "${here[0]?.db}": only howdy_dev`);
  }

  const password = `test-${randomBytes(9).toString('base64url')}`;
  const passwordHash = await hashPassword(password);
  const ids = new Map<Handle, string>();

  await pool.query(`delete from users where handle like 'tester\\_%'`);
  for (const p of PEOPLE) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (email, handle, email_verified_at) values ($1, $2, now()) returning id`,
      [`${p.handle}@example.test`, p.handle],
    );
    const id = rows[0]!.id;
    ids.set(p.handle, id);
    await pool.query(`insert into credentials (user_id, password_hash) values ($1, $2)`, [id, passwordHash]);
    await pool.query(`insert into profiles (user_id, display_name, portrait_tint) values ($1, $2, $3)`, [
      id,
      p.name,
      p.tint,
    ]);
    await recordAcceptance(getDb(), id);
  }

  // Everyone is friends with everyone.
  const all = [...ids.values()];
  for (const [i, a] of all.entries()) {
    for (const b of all.slice(i + 1)) {
      const [low, high] = a < b ? [a, b] : [b, a];
      await pool.query(
        `insert into posse_links (user_low, user_high, status, requested_by, responded_at)
         values ($1, $2, 'accepted', $1, now())`,
        [low, high],
      );
    }
  }

  for (const [author, wall, body, ago, replies, reactions] of POSTS) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into post_cards (fence_owner_id, author_id, body, created_at)
       values ($1, $2, $3, now() - make_interval(mins => $4)) returning id`,
      [ids.get(wall), ids.get(author), body, ago],
    );
    const cardId = rows[0]!.id;
    for (const [i, [who, text]] of replies.entries()) {
      await pool.query(
        `insert into card_replies (card_id, author_id, body, created_at)
         values ($1, $2, $3, now() - make_interval(mins => $4))`,
        [cardId, ids.get(who), text, Math.max(1, ago - 5 * (i + 1))],
      );
    }
    for (const [who, kind] of reactions) {
      await pool.query(`insert into yos (card_id, user_id, kind) values ($1, $2, $3)`, [
        cardId,
        ids.get(who),
        kind,
      ]);
    }
  }

  mkdirSync('.dev', { recursive: true });
  writeFileSync(
    '.dev/test-accounts.json',
    `${JSON.stringify({ password, accounts: PEOPLE.map((p) => p.handle) }, null, 2)}\n`,
  );
  process.stdout.write(
    `Seeded ${PEOPLE.length} accounts and ${POSTS.length} posts; password in .dev/test-accounts.json\n`,
  );
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`seed-dev failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
