/** Runs once when the server starts. Wires the domain events to their listeners (see src/app/_lib/wire-events.ts). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('@/app/_lib/wire-events');
}
