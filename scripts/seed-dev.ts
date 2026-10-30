/**
 * Test accounts for local development: four confirmed `tester_*` accounts who are all friends, with posts on each
 * other's walls, replies and reactions, so Home's feed has something in it. Run again to start over: existing
 * `tester_*` accounts are deleted first (everything they own goes with them). The password is generated each run and
 * written to `.dev/test-accounts.json` (gitignored). Refuses any database whose name is not `howdy_dev`.
 *
 * Run: `pnpm seed:dev`
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import sharp from 'sharp';
import { recordAcceptance } from '@/modules/auth/legal';
import { hashPassword } from '@/modules/auth/crypto';
import { getDb, getPool } from '@/platform/db';
import { getObjectStore } from '@/platform/storage';

config({ path: '.env.local', quiet: true });

const PEOPLE = [
  { handle: 'tester_asha', name: 'Asha Rao', tint: 'gold' },
  { handle: 'tester_ravi', name: 'Ravi Menon', tint: 'sky' },
  { handle: 'tester_meera', name: 'Meera Iyer', tint: 'lavender' },
  { handle: 'tester_dev', name: 'Dev Kapoor', tint: 'mint' },
] as const;
type Handle = (typeof PEOPLE)[number]['handle'];

/**
 * Pictures for photo posts, drawn here (no downloads): a landscape, a portrait, a square and a wide panorama, so every
 * shape a real photo comes in shows up in the feed.
 */
const ART = {
  sunset: {
    width: 1200,
    height: 800,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b1055"/><stop offset=".55" stop-color="#d4418e"/><stop offset="1" stop-color="#f8cf35"/>
      </linearGradient></defs>
      <rect width="1200" height="800" fill="url(#s)"/>
      <circle cx="820" cy="470" r="110" fill="#ffe08a"/>
      <path d="M0 560 Q300 470 600 540 T1200 520 V800 H0Z" fill="#3b1d5e"/>
      <path d="M0 640 Q350 560 700 630 T1200 610 V800 H0Z" fill="#260959"/>
    </svg>`,
  },
  plant: {
    width: 800,
    height: 1100,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100">
      <rect width="800" height="1100" fill="#f4efe6"/>
      <rect y="760" width="800" height="340" fill="#e2d6c3"/>
      <path d="M400 760 C390 600 300 520 220 470 C320 480 380 560 400 640 C420 520 470 420 600 380 C500 470 430 560 410 760Z" fill="#3f8f5b"/>
      <path d="M405 700 C430 600 520 560 640 560 C540 600 470 650 420 720Z" fill="#57a873"/>
      <path d="M300 760 H500 L470 960 H330Z" fill="#c4683f"/>
      <rect x="290" y="740" width="220" height="40" rx="8" fill="#d97b4f"/>
    </svg>`,
  },
  coffee: {
    width: 1000,
    height: 1000,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
      <rect width="1000" height="1000" fill="#5b3a29"/>
      <circle cx="500" cy="500" r="330" fill="#f6efe7"/>
      <circle cx="500" cy="500" r="250" fill="#8a5a3b"/>
      <path d="M500 380 C440 430 440 470 500 520 C560 470 560 430 500 380Z M500 520 C430 560 420 610 500 640 C580 610 570 560 500 520Z" fill="#e9d2b4"/>
      <path d="M830 470 C930 470 930 570 830 570" stroke="#f6efe7" stroke-width="40" fill="none"/>
    </svg>`,
  },
  street: {
    width: 1600,
    height: 700,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700">
      <rect width="1600" height="700" fill="#bee1e6"/>
      <rect x="80" y="220" width="220" height="380" fill="#f8cf35"/><rect x="320" y="160" width="180" height="440" fill="#ca054d"/>
      <rect x="520" y="260" width="260" height="340" fill="#f4efe6"/><rect x="800" y="180" width="200" height="420" fill="#260959"/>
      <rect x="1020" y="240" width="240" height="360" fill="#57a873"/><rect x="1280" y="200" width="240" height="400" fill="#d97b4f"/>
      <rect y="600" width="1600" height="100" fill="#4a4540"/>
      <rect x="140" y="640" width="120" height="12" fill="#f8f7ff"/><rect x="500" y="640" width="120" height="12" fill="#f8f7ff"/>
      <rect x="860" y="640" width="120" height="12" fill="#f8f7ff"/><rect x="1220" y="640" width="120" height="12" fill="#f8f7ff"/>
    </svg>`,
  },
} as const;

/** [author, wall, caption, minutes ago, picture, reactions [who, kind]] */
const PHOTO_POSTS: [Handle, Handle, string, number, keyof typeof ART, [Handle, string][]][] = [
  [
    'tester_meera',
    'tester_meera',
    'Sunset from the terrace tonight 🌇',
    40,
    'sunset',
    [
      ['tester_asha', 'love'],
      ['tester_ravi', 'fire'],
    ],
  ],
  [
    'tester_dev',
    'tester_dev',
    'New plant friend. Name suggestions?',
    150,
    'plant',
    [['tester_asha', 'laugh']],
  ],
  [
    'tester_ravi',
    'tester_asha',
    'Your filter coffee, as promised ☕',
    300,
    'coffee',
    [['tester_asha', 'love']],
  ],
  [
    'tester_asha',
    'tester_asha',
    'Colours of Pondicherry. Took a hundred of these, this one won.',
    60 * 30,
    'street',
    [
      ['tester_meera', 'fire'],
      ['tester_dev', 'yo'],
    ],
  ],
];

/** Asha and Dev's chat: [sender, words, minutes ago], oldest first. */
const CHAT: [Handle, string, number][] = [
  ['tester_dev', 'Are you coming for the trek next month?', 95],
  ['tester_asha', 'Depends on the dates! Which weekend?', 90],
  ['tester_dev', 'Second weekend. Kudremukh again, but the longer route this time 🥾', 88],
  ['tester_asha', 'Count me in. Do I need proper shoes?', 60],
  ['tester_dev', 'Yes, trust me on that one 😅', 58],
];

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

  // Posts with a photo, stored the way a real upload ends up: a WebP under cards/ in the object store, a ready
  // `card_photo` row on the card. (Re-seeding leaves the old files behind in .dev/media; they are never served.)
  const store = getObjectStore();
  for (const [author, wall, body, ago, art, reactions] of PHOTO_POSTS) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into post_cards (fence_owner_id, author_id, body, created_at)
       values ($1, $2, $3, now() - make_interval(mins => $4)) returning id`,
      [ids.get(wall), ids.get(author), body, ago],
    );
    const cardId = rows[0]!.id;
    const { svg, width, height } = ART[art];
    const webp = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
    const objectKey = `cards/${randomUUID()}.webp`;
    await store.put(objectKey, webp, 'image/webp');
    await pool.query(
      `insert into media (owner_id, kind, card_id, status, object_key, content_type, byte_size, width, height)
       values ($1, 'card_photo', $2, 'ready', $3, 'image/webp', $4, $5, $6)`,
      [ids.get(author), cardId, objectKey, webp.length, width, height],
    );
    for (const [who, kind] of reactions) {
      await pool.query(`insert into yos (card_id, user_id, kind) values ($1, $2, $3)`, [
        cardId,
        ids.get(who),
        kind,
      ]);
    }
  }

  // One conversation (Asha and Dev), so Messages and Home's chat window have something in them. Asha has read it all.
  const [a, d] = [ids.get('tester_asha')!, ids.get('tester_dev')!];
  const [low, high] = a < d ? [a, d] : [d, a];
  const { rows: convo } = await pool.query<{ id: string }>(
    `insert into conversations (user_low, user_high, last_seq, last_message_at) values ($1, $2, $3, now())
     returning id`,
    [low, high, CHAT.length],
  );
  for (const [i, [from, body, ago]] of CHAT.entries()) {
    await pool.query(
      `insert into messages (conversation_id, sender_id, seq, client_id, body, created_at)
       values ($1, $2, $3, $4, $5, now() - make_interval(mins => $6))`,
      [convo[0]!.id, ids.get(from), i + 1, randomUUID(), body, ago],
    );
  }
  await pool.query(
    `update conversations set ${a === low ? 'low_read_seq' : 'high_read_seq'} = last_seq where id = $1`,
    [convo[0]!.id],
  );

  mkdirSync('.dev', { recursive: true });
  writeFileSync(
    '.dev/test-accounts.json',
    `${JSON.stringify({ password, accounts: PEOPLE.map((p) => p.handle) }, null, 2)}\n`,
  );
  process.stdout.write(
    `Seeded ${PEOPLE.length} accounts and ${POSTS.length + PHOTO_POSTS.length} posts ` +
      `(${PHOTO_POSTS.length} with photos); password in .dev/test-accounts.json\n`,
  );
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`seed-dev failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
