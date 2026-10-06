import { z } from 'zod';
import './zod-setup'; // jitless Zod (no eval probe under our CSP)

/** A personal invite code (ADR-045): ten letters and digits, as it appears in /i/<code>. */
export const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{10}$/;
export const inviteCodeSchema = z.string().regex(INVITE_CODE_PATTERN, 'That invite link is not valid.');
