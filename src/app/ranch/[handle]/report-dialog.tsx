'use client';

import { useState } from 'react';
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from '@/shared/validation/moderation';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Button, Modal, Select, Textarea } from '@/ui/primitives';

const REASON_LABEL: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  spam: 'Spam or scams',
  impersonation: 'Pretending to be someone else',
  inappropriate: 'Something inappropriate',
  other: 'Something else',
};

/** "Flag trouble": pick a reason, add optional details, send. `endpoint` and `extra` say what is being reported. */
export function ReportDialog({
  open,
  title,
  endpoint,
  extra,
  onClose,
  onDone,
}: {
  open: boolean;
  title: string;
  endpoint: string;
  /** Extra JSON fields the endpoint needs (e.g. the person's handle). */
  extra?: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    setBusy(true);
    setError(undefined);
    const res = await postJson(endpoint, { ...extra, reason, ...(details.trim() ? { details } : {}) });
    setBusy(false);
    if (res.ok) {
      setDetails('');
      onClose();
      onDone();
    } else setError(res.error?.fields?.details ?? res.error?.message ?? 'Could not send that report.');
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="A person on our team reads every report. They are not told you sent it."
    >
      <div className="flex flex-col gap-4">
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Select
          label="What is going on?"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason)}
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABEL[r]}
            </option>
          ))}
        </Select>
        <Textarea
          label="Anything we should know? (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={REPORT_DETAILS_MAX}
          showCount
          rows={3}
        />
        <Button onClick={submit} loading={busy}>
          Send report
        </Button>
      </div>
    </Modal>
  );
}
