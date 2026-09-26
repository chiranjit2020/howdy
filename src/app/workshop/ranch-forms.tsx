'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  displayNameSchema,
  FENCE_POSTING_LEVELS,
  PORTRAIT_TINTS,
  VISIBILITIES,
  type FencePosting,
  type PortraitTint,
  type Visibility,
} from '@/shared/validation/profile';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Avatar, Button, ClayCard, Input, Radio, Select, Switch, useToast } from '@/ui/primitives';

const TINT_LABEL: Record<PortraitTint, string> = {
  peach: 'Peach',
  mint: 'Mint',
  gold: 'Gold',
  lavender: 'Lavender',
  sky: 'Sky',
};

const VISIBILITY_LABEL: Record<Visibility, string> = {
  everyone: 'Anyone, even signed-out visitors',
  members: 'Howdy members only',
  posse: 'My Pals only',
};

/** Tend the Ranch: display name and Portrait. */
export function TendForm({
  displayName: initialName,
  portraitTint: initialTint,
  handle,
}: {
  displayName: string;
  portraitTint: PortraitTint;
  handle: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(initialName);
  const [tint, setTint] = useState<PortraitTint>(initialTint);
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const parsed = displayNameSchema.safeParse(displayName);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message);
      return;
    }
    setNameError(undefined);
    setBusy(true);
    const res = await apiRequest('PATCH', '/api/me/porch', { displayName: parsed.data, portraitTint: tint });
    setBusy(false);
    if (res.ok) {
      setDisplayName(parsed.data);
      toast({ title: 'Porch swept and looking sharp.', tone: 'success' });
      router.refresh();
    } else if (res.error?.fields?.displayName) setNameError(res.error.fields.displayName);
    else setFormError(res.error?.message);
  }

  return (
    <ClayCard>
      <form onSubmit={save} noValidate className="flex flex-col gap-5">
        <h2 className="text-title text-text-primary">Tend your Porch</h2>
        {formError && <FormMessage tone="error">{formError}</FormMessage>}
        <Input
          label="Display name"
          name="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          error={nameError}
          hint={`Shown on your Porch. Your call sign @${handle} stays the same.`}
          autoComplete="name"
        />
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-caption font-semibold text-text-primary">Portrait colour</legend>
          <div className="mb-2 flex items-center gap-3">
            <Avatar name={displayName || handle} tint={tint} size="lg" />
            <span className="text-caption text-text-secondary">Shown whenever you have no photo.</span>
          </div>
          {PORTRAIT_TINTS.map((t) => (
            <Radio
              key={t}
              name="portraitTint"
              label={TINT_LABEL[t]}
              checked={tint === t}
              onChange={() => setTint(t)}
            />
          ))}
        </fieldset>
        <Button type="submit" loading={busy}>
          Save
        </Button>
      </form>
    </ClayCard>
  );
}

/** Boundary Lines: who may open the Ranch and read the Signal. */
export function BoundaryForm({
  ranchVisibility,
  signalVisibility,
  official = false,
}: {
  ranchVisibility: Visibility;
  signalVisibility: Visibility;
  /** The Howdy team account: these settings are overridden to "everyone", so say so rather than pretend. */
  official?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [ranch, setRanch] = useState(ranchVisibility);
  const [signal, setSignal] = useState(signalVisibility);
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    setBusy(true);
    const res = await apiRequest('PATCH', '/api/me/porch', {
      ranchVisibility: ranch,
      signalVisibility: signal,
    });
    setBusy(false);
    if (res.ok) {
      toast({ title: 'Boundary Lines updated.', tone: 'success' });
      router.refresh();
    } else setFormError(res.error?.message);
  }

  return (
    <ClayCard>
      <form onSubmit={save} noValidate className="flex flex-col gap-5">
        <h2 className="text-title text-text-primary">Boundary Lines</h2>
        {formError && <FormMessage tone="error">{formError}</FormMessage>}
        {official && (
          <FormMessage tone="info">
            As the Howdy team account, your Porch, Signal and Fence are always open to everyone (signed in or
            not), whatever you choose here, and nobody can block you.
          </FormMessage>
        )}
        <Select
          label="Who can visit your Porch?"
          value={ranch}
          onChange={(e) => setRanch(e.target.value as Visibility)}
          hint="New Porches start with members only."
        >
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABEL[v]}
            </option>
          ))}
        </Select>
        <Select
          label="Who can read your Signal?"
          value={signal}
          onChange={(e) => setSignal(e.target.value as Visibility)}
          hint="Never broader than who can visit your Porch."
        >
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABEL[v]}
            </option>
          ))}
        </Select>
        <Button type="submit" loading={busy}>
          Save Boundary Lines
        </Button>
      </form>
    </ClayCard>
  );
}

const POSTING_LABEL: Record<FencePosting, string> = {
  members: 'Any Howdy member who can read it',
  posse: 'My Pals only',
  nobody: 'Nobody but me',
};

/** Fence rules: who reads it, who may nail cards to it, and whether cards wait for approval. */
export function FenceRulesForm({
  fenceVisibility,
  fencePosting,
  fenceReview,
}: {
  fenceVisibility: Visibility;
  fencePosting: FencePosting;
  fenceReview: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reading, setReading] = useState(fenceVisibility);
  const [posting, setPosting] = useState(fencePosting);
  const [review, setReview] = useState(fenceReview);
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    setBusy(true);
    const res = await apiRequest('PATCH', '/api/me/porch', {
      fenceVisibility: reading,
      fencePosting: posting,
      fenceReview: review,
    });
    setBusy(false);
    if (res.ok) {
      toast({ title: 'Fence rules updated.', tone: 'success' });
      router.refresh();
    } else setFormError(res.error?.message);
  }

  return (
    <ClayCard>
      <form onSubmit={save} noValidate className="flex flex-col gap-5">
        <h2 className="text-title text-text-primary">Fence rules</h2>
        {formError && <FormMessage tone="error">{formError}</FormMessage>}
        <Select
          label="Who can read your Fence?"
          value={reading}
          onChange={(e) => setReading(e.target.value as Visibility)}
          hint="Never broader than who can visit your Porch."
        >
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABEL[v]}
            </option>
          ))}
        </Select>
        <Select
          label="Who can nail cards to it?"
          value={posting}
          onChange={(e) => setPosting(e.target.value as FencePosting)}
          hint="You can always write on your own Fence. People you Restrict have their cards held for you."
        >
          {FENCE_POSTING_LEVELS.map((v) => (
            <option key={v} value={v}>
              {POSTING_LABEL[v]}
            </option>
          ))}
        </Select>
        <Switch
          label="Approve cards first"
          hint="Cards from others wait for you before anyone else sees them."
          checked={review}
          onCheckedChange={setReview}
        />
        <Button type="submit" loading={busy}>
          Save Fence rules
        </Button>
      </form>
    </ClayCard>
  );
}

/** Which kinds of Chime ring. Applies from now on; Chimes already rung stay where they are. */
export function ChimePrefsForm({
  initial,
}: {
  initial: Record<'posse' | 'fence' | 'replies' | 'yo' | 'whispers' | 'tributes' | 'townhalls', boolean>;
}) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | undefined>();

  async function set(key: keyof typeof prefs, value: boolean) {
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    setError(undefined);
    const res = await apiRequest('PATCH', '/api/me/chime-prefs', { [key]: value });
    if (!res.ok) {
      setPrefs(before);
      setError(res.error?.message ?? 'That did not save. Try again.');
    } else toast({ title: 'Chime settings saved.', tone: 'success' });
  }

  return (
    <ClayCard className="flex flex-col gap-2">
      <h2 className="text-title text-text-primary">Chimes</h2>
      <p className="text-caption text-text-secondary">
        Choose what rings. People you have muted, restricted or blocked never ring, whatever you choose here.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <Switch
        label="Pals"
        hint="Requests to be Pals, and yeses."
        checked={prefs.posse}
        onCheckedChange={(v) => set('posse', v)}
      />
      <Switch
        label="Your Fence"
        hint="Cards nailed to it, and cards waiting for you."
        checked={prefs.fence}
        onCheckedChange={(v) => set('fence', v)}
      />
      <Switch
        label="Replies"
        hint="Scribbles on your cards."
        checked={prefs.replies}
        onCheckedChange={(v) => set('replies', v)}
      />
      <Switch
        label="Yo"
        hint="When someone gives your card a Yo."
        checked={prefs.yo}
        onCheckedChange={(v) => set('yo', v)}
      />
      <Switch
        label="Whispers"
        hint="Private messages from your Pals."
        checked={prefs.whispers}
        onCheckedChange={(v) => set('whispers', v)}
      />
      <Switch
        label="Tributes & Marks"
        hint="A Tribute waiting for you, one that was approved, or a new Mark."
        checked={prefs.tributes}
        onCheckedChange={(v) => set('tributes', v)}
      />
      <Switch
        label="Town Halls"
        hint="An invite, or someone accepting yours."
        checked={prefs.townhalls}
        onCheckedChange={(v) => set('townhalls', v)}
      />
    </ClayCard>
  );
}
