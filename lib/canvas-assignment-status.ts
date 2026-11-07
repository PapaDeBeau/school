export type CanvasSubmissionStatus = {
  workflow_state?: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  excused?: boolean;
  missing?: boolean;
  late?: boolean;
  score?: number | null;
  attempt?: number | null;
  submission_type?: string | null;
};

type AssignmentStatus = {
  submission_types?: string[];
  due_at?: string | null;
  submission?: CanvasSubmissionStatus | null;
};

export function isUnsubmittedExternalZero(assignment: AssignmentStatus) {
  const submission = assignment.submission;
  if (!assignment.submission_types?.includes("external_tool") || !submission || submission.excused || submission.score !== 0) return false;
  const state = submission.workflow_state?.trim().toLowerCase();
  return !submission.submitted_at
    && !(submission.attempt && submission.attempt > 0)
    && !submission.submission_type
    && state !== "submitted"
    && state !== "pending_review";
}

export function assignmentIsComplete(assignment: AssignmentStatus) {
  const submission = assignment.submission;
  if (!submission || isUnsubmittedExternalZero(assignment)) return false;
  const state = submission.workflow_state?.trim().toLowerCase();
  return submission.excused === true
    || Boolean(submission.submitted_at)
    || Boolean(submission.graded_at)
    || state === "submitted"
    || state === "graded"
    || state === "pending_review";
}

export function externalZeroNeedsAttention(assignment: AssignmentStatus, now = Date.now()) {
  return isUnsubmittedExternalZero(assignment)
    && Boolean(assignment.due_at && Date.parse(assignment.due_at) < now);
}
