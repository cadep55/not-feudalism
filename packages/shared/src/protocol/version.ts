/**
 * Bump whenever a client/server message changes shape. The client shows
 * "please refresh" when its version doesn't match the server's.
 */
export const PROTOCOL_VERSION = 1;

export function isCompatibleProtocol(clientVersion: number): boolean {
  return clientVersion === PROTOCOL_VERSION;
}
