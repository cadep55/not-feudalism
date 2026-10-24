/**
 * Outcome of a game rule. Rules return a failure for expected problems
 * (not enough gold, missing materials) and only throw for bugs.
 */
export type RuleResult<T, Reason extends string = string> =
  | { ok: true; value: T }
  | { ok: false; reason: Reason };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function fail<Reason extends string>(reason: Reason): { ok: false; reason: Reason } {
  return { ok: false, reason };
}
