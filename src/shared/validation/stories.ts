import { z } from 'zod';
import { REACTION_KINDS } from './fence';
import { hasDisguisingChars, hasLink, normaliseText } from './profile';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/** Stories (ADR-047): one photo, an optional short caption, for Pals or Close Pals, for 12 hours. */
export const STORY_CAPTION_MAX = 80;
export const STORY_AUDIENCES = ['pals', 'close'] as const;
export type StoryAudience = (typeof STORY_AUDIENCES)[number];

/** Shown over the photo to every viewer: the same screening as a Town Hall post (no look-alikes, no links). */
export const storyCaptionSchema = z
  .string()
  .transform(normaliseText)
  .pipe(
    z
      .string()
      .max(STORY_CAPTION_MAX, `At most ${STORY_CAPTION_MAX} characters.`)
      .refine((s) => !hasDisguisingChars(s), 'That contains characters that are not allowed.')
      .refine((s) => !hasLink(s), 'Links are not allowed in a Story.'),
  );

export const postStorySchema = z.object({
  photoId: z.uuid(),
  caption: storyCaptionSchema.optional(),
  audience: z.enum(STORY_AUDIENCES).default('pals'),
});
export type PostStoryInput = z.infer<typeof postStorySchema>;

/** Give, change (a kind) or take back (null) my reaction to a Story. */
export const storyReactionSchema = z.object({ kind: z.enum(REACTION_KINDS).nullable() });
