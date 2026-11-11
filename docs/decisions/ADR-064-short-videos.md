# ADR-064 — Short videos on posts (30 seconds, gone after 3 days)

Status: accepted (2026-11-11).

## Why

People want to share short clips, not only photos. There is no money for a video service or a transcoding server, so
the design has to fit what Howdy already pays nothing for: the Cloudflare R2 bucket used for photos (10 GB free,
watching is free because R2 does not charge for bandwidth) and the Neon database (one small row per video).

## Decisions

1. **One video per post, up to 30 seconds and 20 MB.** A post has a photo or a video, not both.
2. **Player = the browser's own `<video>` tag.** No player library. It shows the poster (one still frame) first,
   uses `preload="none"` so nothing downloads until the person taps play, starts with sound on tap, never autoplays
   and never loops. Phone data matters to the people we build for.
3. **The phone prepares the video, not a server.** Before upload the browser converts the clip with WebCodecs (the
   browser's built-in video encoder, through a small library such as Mediabunny) to:
   - MP4, H.264 video + AAC sound: the one format every browser plays. iPhones record HEVC by default, which Chrome and
     Firefox on Windows and Android often cannot play, so the original is never stored.
   - 720p at about 2 Mbps (a 30 s clip is about 6–8 MB).
   - **fast start**: the MP4's index (`moov` box) at the front of the file, so playback begins after the first few KB
     instead of after the whole file.
   - cut to 30 s; anything longer is trimmed in the picker or refused.
   - one frame saved as the poster, a small WebP, stored like a photo.

   A browser that cannot convert gets a calm message ("This phone can't prepare videos yet — try another browser")
   rather than an upload that later fails to play for friends.
4. **Upload goes straight from the browser to R2** through a short-lived signed upload link, the same as photos
   (`ObjectStore.createUpload`): the signature fixes the exact size and type, so the link cannot be reused for a bigger
   or different file. Keys live under `videos/`.
5. **The server checks what arrived** before the post is published: the stored size matches what was signed, and the
   first few KB show a real MP4 with H.264, fast start, and a duration of 30 s or less. No transcoding, just reading
   the header. Anything that fails is deleted and the writer sees why.
6. **Watching streams straight from R2, not through the app.** Photos are read and passed on by the app
   (`readCardPhoto`); a video must not be, because it would spend Vercel bandwidth and function time, and jumping
   forward would break. Instead, when someone allowed to see the post taps play, the server makes the same visibility
   check as for the post and returns a signed R2 link valid for about 10 minutes. The `<video>` tag streams from it:
   the browser fetches a little ahead of where you are watching and asks for just the bytes it needs when you jump
   (range requests, which R2 supports). There are no permanent public links.
7. **Gone after 3 days, two ways, both free.**
   - An R2 lifecycle rule (a bucket setting) deletes everything under `videos/` older than 3 days. Cloudflare may run
     it up to a day late; that is fine.
   - The existing stale-media cleanup marks expired video rows, so the post shows "This video has expired" instead of
     a broken player. The words of the post, its stars and replies stay.

   The post shows "Video · 2 days left" so the expiry is never a surprise.
8. **Friends only.** Each video is watched only by its writer's friends (and the writer), wherever it is posted: on
   their Home and on any wall. Anyone else who can read the post sees its words and "A video for their friends.";
   the video link and the poster are refused to them. Every video has "Report"; a report hides the video at once until
   a moderator looks. (Security backlog: CSAM scanning is still open, and there is no free tool for video.)

   *Changed 2026-11-11, after launch:* this first said videos could be posted only on walls set to "My friends only".
   The owner said videos must show on Home, and people will not change their whole wall's setting to post one clip,
   so the audience moved from the wall to the video itself. Strangers still never see an unchecked video.
9. **3 videos a day per person**, through the existing rate limiter, so one person cannot fill the free 10 GB.
10. **Stored in the existing `media` table, not a new one** (changed while building): kind `card_video`, with new
    columns `duration_ms`, `poster_key`, `expires_at` and a new status `expired` (migration 0058, additive only). The
    `media` table already has everything a post's file needs: it is deleted with its post, removed on account
    deletion, covered by the clean-up job, and "one photo per card" becomes "one photo or video per card" for free.
    The migration needs the usual OK before running on the live database.

## How it was built

- **Library: Mediabunny 1.62.1** (pinned exactly; a release at least two weeks old). Pure TypeScript over the browser's
  WebCodecs, no WebAssembly, so the CSP needs no `wasm-unsafe-eval`. Loaded only when someone picks a video.
- **Encoder settings** (`src/shared/validation/media.ts`, used by both the phone and the server): H.264, short side
  720 px (never enlarged, sizes even), 2 Mbps target, a key frame every 2 s (Mediabunny's default is 5; 2 makes
  jumping ahead start sooner for ~5% more size), frame rate capped at 30 (60 fps phone clips halve in size), rotation
  baked into the pixels, AAC 96 kbps (more than 2 channels mixed down), fast start `in-memory`, first 30 s kept.
- **Poster**: one frame at 0.5 s (past a black first frame) as a JPEG, sent through the card-photo path, so it is
  re-encoded to WebP and goes through the photo check like any photo. A frame the check would hold refuses the video.
- **Server check** (`src/modules/media/mp4.ts`): reads the first 1 MB only and walks the MP4 boxes: `ftyp` first,
  `moov` before `mdat`, one `avc1`/`avc3` picture track, at most one `mp4a` sound track, nothing else, ≤ 30.5 s,
  short side ≤ 736 and long side ≤ 1312. Nothing is decoded.
- **Watching**: `GET /api/cards/:id/video` checks the card's rules and 302-redirects to a 10-minute signed R2 link
  (`no-store`, `no-referrer`). If the link runs out mid-watch, the player asks once more and carries on from the same
  second. The poster is served by the app like a card photo.
- **Reports** hide the video from everyone but its writer at once; the moderator can play it from the queue;
  dismissing the last open report on that card shows it again.
- **Browsers that cannot convert** (no WebCodecs, or no AAC sound encoder) get a plain message instead
  of a broken upload. The sound is never silently dropped.

## What it holds

10 GB ÷ about 8 MB ≈ 1,200 videos alive at once; with 3-day expiry that is roughly 400 new videos a day before R2
starts to charge. Watching never costs anything.

## Considered and not chosen

- **Adaptive streaming (HLS/DASH)**, which cuts the video into chunks in several qualities and switches with the
  connection. It needs each video made several times (a paid server, or heavy work on the phone) and a player library
  for Chrome. It helps long videos on poor connections; a 30 s, 6–8 MB clip gains little.
- **A second 480p copy** for slow connections or Data Saver. Cheap to make on the phone, but it doubles storage. Add it
  only if people on weak data complain.
- **Storing the original file as uploaded.** Fails to play on many Android and Windows browsers (HEVC) and is often
  several times larger.
- **Video bytes in the database.** Databases are the wrong place for big files, and Neon's free storage is small.
- **A paid video service** (Mux, Cloudflare Stream, Bunny Stream). The right move if videos get longer or very
  popular; not needed for 30 s clips.

## Not now

- Videos longer than 30 seconds, or kept longer than 3 days.
- Videos in Messages, replies and group posts.
- Trimming, filters, captions.
- Public videos (waits on decision 8).
