# ADR-038 — Burn Thread cannot wipe the other person's evidence ("burn for me")

Status: accepted (2026-10-05). Amends ADR-013 decision 11. Found by the Whispers threat model
(`docs/WHISPERS_THREAT_MODEL.md`); you chose a silent "burn for me" over changing Burn Thread for everyone.

## Context

Burn Thread deleted the whole thread for both people, "always allowed", and it needs only the other person's handle.
So someone who had been **blocked** or **restricted** could still burn the thread and delete what they sent —
including the held tray (ADR-026), which exists so the person who restricted them can read and report what was kept
back. Refusing the burn, or answering differently, would tell the burner they had been blocked or restricted.

## Decision

1. When the other person has blocked or restricted the burner (`relationships.hasLimited`; a block the burner set does
   not count), Burn Thread **clears the thread for the burner only**: `conversations.low_cleared_seq` /
   `high_cleared_seq` (migration 0030) is set to the last position. The other person keeps everything until the 7-day
   retention removes it, and can still report it.
2. **Indistinguishable to the burner.** Every place that shows the burner a Whisper hides what is at or before their
   cleared position (thread, list, unread, held tray, report lookup, live delivery, data export), and every position
   they see or send is counted from it, so the next Whisper is number 1 as after a real burn. The burner's old client
   ids are re-keyed, so re-sending one creates a new Whisper as it would after a real burn. The answer (`burned`)
   follows the same rules. Tested by running the same script against a real burn and a restricted one and comparing
   everything the burner sees.
3. Everyone else's burn is unchanged: a real delete for both people.
4. The Burn dialog no longer says "for both of you" (it cannot differ per person without revealing a protection). The
   Privacy Policy (1.10.0) states the exception; nobody has to agree again.

## Consequences

- A burner who is restricted and later unrestricted keeps a cleared view; the other person sees one continuous
  thread. That matches what each of them saw before.
- An abuser who is not yet blocked or restricted can still burn before a report. Block first, then report.
