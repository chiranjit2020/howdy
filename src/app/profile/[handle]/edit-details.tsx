'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { MyDetails } from '@/modules/profiles';
import {
  DETAIL_AUDIENCE_LABEL,
  DETAIL_AUDIENCES,
  DETAIL_LABEL,
  DETAIL_TEXT_MAX,
  MONTHS,
  RELATIONSHIP_LABEL,
  RELATIONSHIPS,
  type DetailAudience,
  type DetailKey,
  type Relationship,
  type TextDetail,
} from '@/shared/validation/details';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, Input, Modal, Select, useToast } from '@/ui/primitives';

const PLACEHOLDER: Record<TextDetail, string> = {
  livesIn: 'Kolkata',
  hometown: 'Siliguri',
  work: 'Designer at a studio',
  education: 'Jadavpur University',
  languages: 'Bengali, Hindi, English',
};

/** What a screen reader hears for each detail's audience picker. */
const WHO: Record<DetailKey, string> = {
  livesIn: 'Who sees where you live',
  hometown: 'Who sees where you are from',
  work: 'Who sees your work',
  education: 'Who sees your education',
  birthday: 'Who sees your birthday',
  languages: 'Who sees your languages',
  relationship: 'Who sees your relationship',
};

/**
 * Your personal details, edited on your profile: each one, and beside it who sees it (Everyone on Howdy, Friends, Only
 * me). Empty means not shown. The server checks everything again.
 */
export function EditDetails({ initial, label }: { initial: MyDetails; label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<Record<TextDetail, string>>({
    livesIn: initial.livesIn ?? '',
    hometown: initial.hometown ?? '',
    work: initial.work ?? '',
    education: initial.education ?? '',
    languages: initial.languages ?? '',
  });
  const [day, setDay] = useState(initial.birthday ? String(initial.birthday.day) : '');
  const [month, setMonth] = useState(initial.birthday ? String(initial.birthday.month) : '');
  const [relationship, setRelationship] = useState<Relationship | ''>(initial.relationship ?? '');
  const [audience, setAudience] = useState<Record<DetailKey, DetailAudience>>(initial.audience);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(undefined);
    if (Boolean(day) !== Boolean(month)) {
      setErrors({ birthday: 'Choose both the day and the month, or neither.' });
      return;
    }
    setBusy(true);
    const res = await apiRequest('PATCH', '/api/me/details', {
      ...text,
      birthday: day && month ? { day: Number(day), month: Number(month) } : null,
      relationship: relationship || null,
      audience,
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      toast({ title: 'Details saved.', tone: 'success' });
      router.refresh();
    } else if (res.error?.fields && Object.keys(res.error.fields).length > 0) {
      // "birthday.day" and the like belong to the birthday row.
      setErrors(Object.fromEntries(Object.entries(res.error.fields).map(([k, v]) => [k.split('.')[0]!, v])));
    } else setFormError(res.error?.message);
  }

  const picker = (key: DetailKey) => (
    <Select
      label={WHO[key]}
      hideLabel
      value={audience[key]}
      onChange={(e) => setAudience((a) => ({ ...a, [key]: e.target.value as DetailAudience }))}
      className="w-full shrink-0 sm:w-48"
    >
      {DETAIL_AUDIENCES.map((a) => (
        <option key={a} value={a}>
          {DETAIL_AUDIENCE_LABEL[a]}
        </option>
      ))}
    </Select>
  );
  // One detail per row: the field, and who sees it beside it, lined up with the box (on a phone, under it: side by side
  // there is no room for both).
  const row = (key: DetailKey, field: ReactNode) => (
    <div key={key} className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
      <div className="min-w-0 flex-1">{field}</div>
      <div className={errors[key] ? 'sm:mb-6' : undefined}>{picker(key)}</div>
    </div>
  );

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Your details">
        <form onSubmit={save} noValidate className="flex flex-col gap-4">
          <p className="text-caption text-text-secondary">
            All optional. Leave one empty and it isn’t shown. Choose who sees each one.
          </p>
          {formError && <FormMessage tone="error">{formError}</FormMessage>}
          {(['livesIn', 'hometown', 'work', 'education'] as const).map((key) =>
            row(
              key,
              <Input
                label={DETAIL_LABEL[key]}
                value={text[key]}
                onChange={(e) => setText((t) => ({ ...t, [key]: e.target.value }))}
                maxLength={DETAIL_TEXT_MAX}
                placeholder={PLACEHOLDER[key]}
                error={errors[key]}
              />,
            ),
          )}
          {row(
            'birthday',
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-caption font-semibold text-text-primary">
                Birthday <span className="font-normal text-text-secondary">· never the year</span>
              </legend>
              <div className="flex gap-2">
                <Select
                  label="Day"
                  hideLabel
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="w-24"
                  aria-invalid={errors.birthday ? true : undefined}
                >
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Month"
                  hideLabel
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="min-w-0 flex-1"
                  aria-invalid={errors.birthday ? true : undefined}
                >
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              {errors.birthday && (
                <p role="alert" className="text-caption font-medium text-danger">
                  {errors.birthday}
                </p>
              )}
            </fieldset>,
          )}
          {row(
            'languages',
            <Input
              label={DETAIL_LABEL.languages}
              value={text.languages}
              onChange={(e) => setText((t) => ({ ...t, languages: e.target.value }))}
              maxLength={DETAIL_TEXT_MAX}
              placeholder={PLACEHOLDER.languages}
              error={errors.languages}
            />,
          )}
          {row(
            'relationship',
            <Select
              label={DETAIL_LABEL.relationship}
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as Relationship | '')}
              error={errors.relationship}
            >
              <option value="">Not shown</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {RELATIONSHIP_LABEL[r]}
                </option>
              ))}
            </Select>,
          )}
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </form>
      </Modal>
    </>
  );
}
