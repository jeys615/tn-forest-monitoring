import { AlertStatus, AlertAction } from '@tn-forest/shared/types';

// ─── Valid lifecycle transitions ───────────────────────────────────────────────
//
//  OPEN → ACKNOWLEDGED
//  OPEN → DISMISSED       (direct dismiss without acknowledgement)
//  ACKNOWLEDGED → UNDER_REVIEW
//  ACKNOWLEDGED → RESOLVED
//  ACKNOWLEDGED → DISMISSED
//  UNDER_REVIEW → CONFIRMED
//  UNDER_REVIEW → DISMISSED
//  UNDER_REVIEW → RESOLVED
//  CONFIRMED → RESOLVED
//  CONFIRMED → DISMISSED
//  RESOLVED → (terminal — no further transitions)
//  DISMISSED → (terminal — no further transitions)
//
// ─────────────────────────────────────────────────────────────────────────────

type TransitionMap = Map<AlertStatus, Set<AlertStatus>>;

const VALID_TRANSITIONS: TransitionMap = new Map([
  [AlertStatus.OPEN, new Set([AlertStatus.ACKNOWLEDGED, AlertStatus.DISMISSED])],
  [
    AlertStatus.ACKNOWLEDGED,
    new Set([AlertStatus.UNDER_REVIEW, AlertStatus.RESOLVED, AlertStatus.DISMISSED]),
  ],
  [
    AlertStatus.UNDER_REVIEW,
    new Set([AlertStatus.CONFIRMED, AlertStatus.RESOLVED, AlertStatus.DISMISSED]),
  ],
  [AlertStatus.CONFIRMED, new Set([AlertStatus.RESOLVED, AlertStatus.DISMISSED])],
  // Terminal states — no outgoing transitions
  [AlertStatus.RESOLVED, new Set()],
  [AlertStatus.DISMISSED, new Set()],
]);

/** Map of AlertAction → the target AlertStatus it produces */
export const ACTION_TARGET_STATUS: Record<AlertAction, AlertStatus | null> = {
  [AlertAction.ACKNOWLEDGE]: AlertStatus.ACKNOWLEDGED,
  [AlertAction.START_REVIEW]: AlertStatus.UNDER_REVIEW,
  [AlertAction.CONFIRM]: AlertStatus.CONFIRMED,
  [AlertAction.DISMISS]: AlertStatus.DISMISSED,
  [AlertAction.RESOLVE]: AlertStatus.RESOLVED,
  [AlertAction.ASSIGN]: null, // assignment does not change status
};

export const TERMINAL_STATUSES = new Set<AlertStatus>([
  AlertStatus.RESOLVED,
  AlertStatus.DISMISSED,
]);

/**
 * Returns `true` when transitioning from `from` to `to` is permitted by the
 * state machine.  Both `from` and `to` must be valid `AlertStatus` values.
 */
export function isValidTransition(from: AlertStatus, to: AlertStatus): boolean {
  return VALID_TRANSITIONS.get(from)?.has(to) ?? false;
}

/** Returns `true` when `status` is a terminal state (RESOLVED or DISMISSED). */
export function isTerminalStatus(status: AlertStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Given the current status and a requested action, returns the target status
 * or throws if the action is not valid from the current state.
 *
 * Returns `null` for ASSIGN — it does not change status.
 */
export function resolveActionTarget(
  currentStatus: AlertStatus,
  action: AlertAction,
): AlertStatus | null {
  const targetStatus = ACTION_TARGET_STATUS[action];

  // ASSIGN is always allowed unless the alert is in a terminal state
  if (action === AlertAction.ASSIGN) {
    if (isTerminalStatus(currentStatus)) {
      throw new Error(
        `Cannot assign an alert in terminal state: ${currentStatus}`,
      );
    }
    return null;
  }

  if (targetStatus === null) {
    throw new Error(`Unknown action: ${action}`);
  }

  if (!isValidTransition(currentStatus, targetStatus)) {
    throw new Error(
      `Invalid lifecycle transition: ${currentStatus} → ${targetStatus} (action: ${action})`,
    );
  }

  return targetStatus;
}
