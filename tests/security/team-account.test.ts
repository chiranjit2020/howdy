import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTeamAnnouncement } from '@/modules/profiles';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch, setSignal, viewRanch } from '../helpers/ranch';
import { doAct, q, relWith } from '../helpers/social';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
/** The team account is set by hand in the database, exactly as in production. */
const makeTeam = (handle: string) => q(`update users set role = 'admin' where handle = $1`, [handle]);

describe('The Howdy team account (role admin)', () => {
  it('its Porch and Signal are open to everyone, even signed out, whatever its own settings say', async () => {
    const team = await person('team');
    const stranger = await person('stranger');
    await patchRanch({ ranchVisibility: 'posse', signalVisibility: 'posse' }, as(team));
    await setSignal('New: Porches and Pals!', as(team));
    expect((await viewRanch(team.handle, as(stranger))).status).toBe(404); // an ordinary private Porch first
    await makeTeam(team.handle);

    const seen = await viewRanch(team.handle, as(stranger));
    expect(seen.status).toBe(200);
    expect(seen.data.ranch).toMatchObject({ verified: true, signal: { text: 'New: Porches and Pals!' } });
    const anonymous = await viewRanch(team.handle);
    expect(anonymous.status).toBe(200);
    expect(anonymous.data.ranch).toMatchObject({ signal: { text: 'New: Porches and Pals!' } });
  });

  it('nobody can block it, and nothing is stored when they try; muting still works', async () => {
    const team = await person('team');
    const member = await person('member');
    await makeTeam(team.handle);

    const tried = await doAct(team.handle, 'block', as(member));
    expect(tried.status).toBe(403);
    expect((await q('select count(*)::int n from user_controls where kind = $1', ['block'])).rows[0].n).toBe(
      0,
    );
    expect((await viewRanch(team.handle, as(member))).status).toBe(200);

    expect((await doAct(team.handle, 'mute', as(member))).status).toBe(200);
    expect((await relWith(team.handle, as(member))).data.relationship).toMatchObject({ muted: true });
  });

  it('an ordinary account is not verified and can still be blocked', async () => {
    const a = await person('alice');
    const b = await person('bob');
    expect((await viewRanch(a.handle, as(b))).data.ranch).toMatchObject({ verified: false });
    expect((await doAct(a.handle, 'block', as(b))).status).toBe(200);
  });

  it('its live Signal is the announcement on everyone’s Home', async () => {
    const team = await person('team');
    expect(await getTeamAnnouncement()).toBeNull();
    await setSignal('Try the new tab bar', as(team));
    expect(await getTeamAnnouncement()).toBeNull(); // not the team yet
    await makeTeam(team.handle);
    expect(await getTeamAnnouncement()).toMatchObject({
      text: 'Try the new tab bar',
      author: { handle: team.handle, verified: true },
    });
  });
});
