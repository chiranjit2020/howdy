'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LIMITS } from '@/shared/limits';
import type { TownHallVisibility } from '@/shared/validation/town-halls';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, ClayCard, Input, Select, Switch, Textarea } from '@/ui/primitives';

const VISIBILITY_HINT: Record<TownHallVisibility, string> = {
  open: 'Anyone can find it in the directory.',
  members: 'Anyone can find it in the directory (a different label for you, same rule).',
  invite: 'Nobody can find it — you invite people by call sign.',
};

/** Start a new Town Hall. You become its owner at once. */
export function CreateTownHallForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<TownHallVisibility>('open');
  const [approval, setApproval] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    const res = await postJson('/api/town-halls', {
      name: name.trim(),
      description: description.trim(),
      visibility,
      joinRule: approval && visibility !== 'invite' ? 'approval' : 'instant',
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setName('');
      setDescription('');
      setVisibility('open');
      setApproval(false);
      router.refresh();
    } else
      setError(
        res.error?.fields?.name ??
          res.error?.fields?.description ??
          res.error?.message ??
          'That did not work. Try again.',
      );
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="self-start">
        Start a Town Hall
      </Button>
    );
  }

  return (
    <ClayCard>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h2 className="text-title text-text-primary">Start a Town Hall</h2>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.TOWNHALL_NAME_MAX}
        />
        <Textarea
          label="What is it about?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={LIMITS.TOWNHALL_DESCRIPTION_MAX}
          showCount
          rows={3}
        />
        <Select
          label="Who can find and join it?"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as TownHallVisibility)}
          hint={VISIBILITY_HINT[visibility]}
        >
          <option value="open">Open to all</option>
          <option value="members">Members only</option>
          <option value="invite">By invitation</option>
        </Select>
        {visibility !== 'invite' && (
          <Switch
            label="Ask to join"
            hint={
              approval
                ? 'People ask; you (or a Deputy you appoint) let them in.'
                : 'Off: anyone can join with one tap.'
            }
            checked={approval}
            onCheckedChange={setApproval}
          />
        )}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={!name.trim() || !description.trim()}>
            Start it
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </ClayCard>
  );
}
