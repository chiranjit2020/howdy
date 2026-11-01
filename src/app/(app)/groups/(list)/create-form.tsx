'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LIMITS } from '@/shared/limits';
import type { TownHallVisibility } from '@/shared/validation/town-halls';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, Input, Modal, Select, Switch, Textarea } from '@/ui/primitives';

const VISIBILITY_HINT: Record<TownHallVisibility, string> = {
  invite: 'Only people you invite can see it or join.',
  open: 'Friends of its members can find it, and anyone with its link can join.',
};

/**
 * Start a circle (ADR-054): a batch, a family, a society, a team. You become its owner at once and land on its page.
 * Private is the default: a circle is for people who know each other.
 */
export function CreateTownHallForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<TownHallVisibility>('invite');
  const [approval, setApproval] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    const res = await postJson<{ townHall: { id: string } }>('/api/town-halls', {
      name: name.trim(),
      description: description.trim(),
      visibility,
      joinRule: approval && visibility !== 'invite' ? 'approval' : 'instant',
    });
    setBusy(false);
    if (res.ok && res.data) {
      setOpen(false);
      router.push(`/groups/${res.data.townHall.id}`);
    } else
      setError(
        res.error?.fields?.name ??
          res.error?.fields?.description ??
          res.error?.message ??
          'That did not work. Try again.',
      );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Start a group
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Start a group">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-caption text-text-secondary">
            For people who know each other: your batch, family, society, team or class.
          </p>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.TOWNHALL_NAME_MAX}
            placeholder="e.g. Batch of 2019"
          />
          <Textarea
            label="What is it about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={LIMITS.TOWNHALL_DESCRIPTION_MAX}
            showCount
            rows={2}
          />
          <Select
            label="Who can find it?"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as TownHallVisibility)}
            hint={VISIBILITY_HINT[visibility]}
          >
            <option value="invite">Private</option>
            <option value="open">Friends can find it</option>
          </Select>
          {visibility !== 'invite' && (
            <Switch
              label="Ask to join"
              hint={
                approval
                  ? 'People ask; you (or a Deputy you appoint) let them in.'
                  : 'Off: anyone who finds it can join with one tap.'
              }
              checked={approval}
              onCheckedChange={setApproval}
            />
          )}
          <Button type="submit" loading={busy} disabled={!name.trim() || !description.trim()}>
            Start it
          </Button>
        </form>
      </Modal>
    </>
  );
}
