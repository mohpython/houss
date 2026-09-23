/*
# Add severity classification and review actions to prescriptions

## Summary
This migration adds a severity level to flagged prescriptions so the admin
review queue can be prioritized (critical cases first), and adds a review_status
column to track the current state of the review process (pending, retake_requested,
corrected, auto_approved). It also adds a review_reasons JSONB column to store
structured reasons at the row level (instead of only in audit logs).

## New Columns on `prescriptions`
- `review_severity` (text, nullable): 'critical' | 'moderate' | 'minor' — set when
  the prescription is flagged for review. NULL when not flagged.
- `review_status` (text, default 'pending'): 'pending' | 'resolved' | 'retake_requested' | 'corrected' | 'auto_approved'
- `review_reasons` (JSONB, nullable): structured array of reason strings, stored
  directly on the row for faster querying without joining audit_logs.

## Index
- `prescriptions_review_severity_idx` — index on review_severity for sorting the queue.

## Security
- No RLS policy changes. Existing policies already allow patients to update their
  own prescriptions and admins to update any. The new columns are covered by those
  existing policies.
*/

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS review_severity text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_reasons jsonb;

CREATE INDEX IF NOT EXISTS prescriptions_review_severity_idx
  ON public.prescriptions (review_severity)
  WHERE review_severity IS NOT NULL;
