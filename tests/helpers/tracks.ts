import { GET as tracksRoute } from '@/app/api/me/tracks/route';
import { flushBackground } from '@/platform/background';
import { call } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };

export interface TracksBody {
  frozen?: boolean;
  people?: { handle: string; displayName: string; portraitTint: string; when: string }[];
  hidden?: { today: number; yesterday: number; 'this-week': number };
  days?: number;
  error?: { code: string };
}

/** GET /api/me/tracks — visits are recorded after the response, so let them finish first. */
export const myTracks = async (opts: Opts) => {
  await flushBackground();
  return call(tracksRoute, 'GET', '/api/me/tracks', undefined, opts) as Promise<{
    status: number;
    data: TracksBody;
    text: string;
    res: Response;
  }>;
};

export const names = async (opts: Opts): Promise<string[]> =>
  (await myTracks(opts)).data.people!.map((p) => p.handle);
