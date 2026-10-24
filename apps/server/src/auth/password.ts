import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to argon2id with OWASP's recommended cost
// (19 MiB memory, 2 passes, 1 lane), so no options are passed.

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real check. Login calls this for unknown emails so
 * response timing doesn't reveal which emails have accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hash("not-a-real-account-password");
  await verify(await dummyHash, password);
}
