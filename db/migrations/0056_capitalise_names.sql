-- Display names, capitalised the way new ones now are (src/shared/names.ts; 2026-11-10, the user's call):
-- 1. A name that is just the username (email sign-ups got that) becomes the username made readable: "asha_k" → "Asha K".
-- 2. Every name: the first letter of each word (after the start, a space or a hyphen) is raised; the rest is untouched,
--    so "McDonald" and "DJ" stay as they are. Only rows that change are written.
WITH src AS (
  SELECT p.user_id,
         CASE
           WHEN p.display_name = u.handle::text
             AND btrim(regexp_replace(replace(p.display_name, '_', ' '), '\s+', ' ', 'g')) <> ''
             THEN btrim(regexp_replace(replace(p.display_name, '_', ' '), '\s+', ' ', 'g'))
           ELSE p.display_name
         END AS name
  FROM profiles p
  JOIN users u ON u.id = p.user_id
),
fixed AS (
  SELECT s.user_id,
         (SELECT string_agg(
                   CASE
                     WHEN i = 1 OR substr(s.name, i - 1, 1) ~ '[[:space:]-]' THEN upper(substr(s.name, i, 1))
                     ELSE substr(s.name, i, 1)
                   END,
                   '' ORDER BY i)
            FROM generate_series(1, char_length(s.name)) AS i) AS name
  FROM src s
)
UPDATE profiles p
   SET display_name = f.name
  FROM fixed f
 WHERE f.user_id = p.user_id
   AND f.name IS NOT NULL
   AND f.name IS DISTINCT FROM p.display_name;
