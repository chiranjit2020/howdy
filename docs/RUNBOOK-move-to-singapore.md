# Runbook: move Howdy's servers to Singapore

**Why:** most people using Howdy are in India. Today the app runs in Washington DC (Vercel `iad1`) and the database in
Ohio (Neon `aws-us-east-2`). Every tap crosses the world twice; the health report measured ~250 ms for a single database
query from India. Moving both to Singapore puts them ~30–60 ms from India.

**Why Singapore and not Mumbai:** the database and the app servers must sit side by side, because one page makes many
database queries one after another. Neon's nearest region to India is Singapore (`aws-ap-southeast-1`), so the app
servers go there too (Vercel `sin1`). App in Mumbai + database in Singapore would be slower than both in Singapore.

**Downtime:** a few minutes during which new posts may be lost. With two accounts, just tell the other person not to
post during the window.

**What moves:**

| Piece | Today | After | Data to copy? |
| --- | --- | --- | --- |
| App servers (Vercel functions) | `iad1` Washington DC | `sin1` Singapore | No |
| Database (Neon Postgres 18) | `aws-us-east-2` Ohio | `aws-ap-southeast-1` Singapore | **Yes** (step 3) |
| Redis (rate limits) | check `REDIS_URL` | same provider, Singapore | No (counters are temporary) |
| Photo storage (Cloudflare R2) | automatic | optional, step 8 | Only if you move it |
| Email (Resend) | — | unchanged | — |

---

## 0. Before you start (10 minutes)

1. In **Vercel → howdy → Settings → Environment Variables**, open the **Production** values of `DATABASE_URL`,
   `DATABASE_URL_DIRECT` and `REDIS_URL` and save copies somewhere private. They are your way back.
   - Note which database name is in `DATABASE_URL` (the part after the last `/`, before `?`). Local development uses
     `howdy_dev`; production may use a different one.
   - If those variables are marked as managed by the **Neon integration**, disconnect the integration first (or
     change them from the Neon side), otherwise it may overwrite your edits.
2. Install the Postgres 18 tools, or use Docker (easiest; Docker Desktop must be running):
   ```powershell
   docker run --rm postgres:18 pg_dump --version   # should print 18.x
   ```

## 1. Create the new database in Singapore

1. **Neon console → New Project**
   - Name: `howdy-sg`
   - Postgres version: **18** (the same as today)
   - Cloud & region: **AWS · Asia Pacific (Singapore)**
2. In the new project's **Dashboard → Connect**, copy two connection strings for the database you will use (you can
   rename the default `neondb`, or create `howdy`):
   - **Pooled** (host contains `-pooler`) → becomes `DATABASE_URL`
   - **Direct** (no `-pooler`) → becomes `DATABASE_URL_DIRECT` (used for migrations and the copy below)

## 2. Freeze writes (start of the short window)

Tell the other person: *"Don't post for 10 minutes."* Nothing else is needed at this size.

## 3. Copy the data

Run in PowerShell from any folder. Replace the two placeholders with the **direct** (non-pooler) strings.

```powershell
$OLD = "<old production DATABASE_URL_DIRECT>"
$NEW = "<new Singapore direct connection string>"

# Dump everything (tables, the migrations record, the citext extension) into one file.
docker run --rm -v "${PWD}:/work" postgres:18 pg_dump --format=custom --no-owner --no-acl --file=/work/howdy.dump "$OLD"

# Load it into Singapore.
docker run --rm -v "${PWD}:/work" postgres:18 pg_restore --no-owner --no-acl --exit-on-error --dbname="$NEW" /work/howdy.dump
```

`--no-owner --no-acl` matters: the new Neon project has a different role name, and the restore should make everything
belong to it.

## 4. Check the copy

Run the same count on both databases; every number must match.

```powershell
$COUNT = "select 'users', count(*) from users union all select 'profiles', count(*) from profiles union all select 'post_cards', count(*) from post_cards union all select 'messages', count(*) from messages union all select 'posse_links', count(*) from posse_links union all select 'media', count(*) from media union all select 'migrations', count(*) from drizzle.__drizzle_migrations"
docker run --rm postgres:18 psql "$OLD" -c $COUNT
docker run --rm postgres:18 psql "$NEW" -c $COUNT
```

## 5. Redis in Singapore

Look at the host in your production `REDIS_URL`.

- **Upstash** (`*.upstash.io`): Upstash console → **Create Database** → Region **AP-Southeast-1 (Singapore)** → copy the
  `rediss://…` URL (the TCP one, not the REST URL; the app uses ioredis).
- **Another provider:** create a Redis in its Singapore region if it has one.

Nothing to copy: Redis only holds rate-limit counters that expire within minutes.

## 6. Point production at Singapore

1. **Vercel → Settings → Environment Variables (Production):** replace `DATABASE_URL`, `DATABASE_URL_DIRECT` and
   `REDIS_URL` with the new values.
2. **Move the app servers:** ask Claude to push the one-line change in `vercel.json`:
   ```json
   "regions": ["sin1"]
   ```
   (The same can be set in **Vercel → Settings → Functions → Function Region**; the file keeps it in the repo.)
   Do this **together with** the database switch. Moving only the servers would make things slower, because every
   query would then cross back to Ohio.
3. The push triggers a new production deploy with the new variables and region. If you only changed variables, use
   **Deployments → ⋯ → Redeploy** on the latest one.

## 7. Confirm it worked (end of the window)

1. Open the app, sign in, open your Porch, post a card, check Chimes.
2. Run the health report (GitHub → **Actions → Health watch → Run workflow**, or wait for the next run) and read it:
   - `region` must be **`sin1`**
   - Database should answer in **under ~20 ms** (it was ~250 ms from India to Ohio)
   - Every check `ok`
3. Tell the other person they can post again.

## 8. Optional: photo storage near India

R2 picks a bucket's location when the bucket is created and never moves it. Photos are small and few today, so this can
wait. When you want it:

1. Cloudflare → **R2 → Create bucket** → name `howdy-media-apac` → **Location: Specify jurisdiction/hint → Asia-Pacific (APAC)**.
2. Copy the objects (e.g. with `rclone copy r2:old-bucket r2:howdy-media-apac`), with the same API token or a new one
   that can read the old bucket and write the new one.
3. Change `R2_BUCKET` in Vercel and redeploy.

## 9. Afterwards

- Keep the old Ohio Neon project for **one to two weeks**, then delete it (Neon → project → Settings → Delete).
- Update your local `.env.local` only if you want local development to use the Singapore database as well.

## Rolling back

Put the saved values from step 0 back into Vercel, remove `"regions"` from `vercel.json` (or set it to `["iad1"]`), and
redeploy. Anything posted after the switch lives only in the Singapore database, so copy it back first if it matters.
