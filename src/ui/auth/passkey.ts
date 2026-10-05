'use client';

import { useSyncExternalStore } from 'react';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';

/** Browser side of passkeys (ADR-040). The server makes and checks every challenge; this only carries them. */

export const passkeysSupported = (): boolean => typeof window !== 'undefined' && browserSupportsWebAuthn();

const noSubscribe = () => () => undefined;

/** Whether this browser can use passkeys: false on the server and during hydration, then the real answer. */
export function usePasskeysSupported(): boolean {
  return useSyncExternalStore(noSubscribe, passkeysSupported, () => false);
}

/** Closing the prompt or letting it time out is not an error to shout about. */
export type PasskeyOutcome<T> =
  { ok: true; response: T } | { ok: false; cancelled: boolean; message: string };

function failure(err: unknown): { ok: false; cancelled: boolean; message: string } {
  const name = (err as { name?: string; code?: string }).name;
  const code = (err as { code?: string }).code;
  if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') {
    return { ok: false, cancelled: true, message: 'The passkey prompt was closed. Nothing changed.' };
  }
  if (name === 'InvalidStateError' || code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return { ok: false, cancelled: false, message: 'This device already has a passkey for your account.' };
  }
  return { ok: false, cancelled: false, message: 'Passkeys did not work on this device. Try another way.' };
}

export async function signWithPasskey(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<PasskeyOutcome<AuthenticationResponseJSON>> {
  try {
    return { ok: true, response: await startAuthentication({ optionsJSON: options }) };
  } catch (err) {
    return failure(err);
  }
}

export async function makePasskey(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<PasskeyOutcome<RegistrationResponseJSON>> {
  try {
    return { ok: true, response: await startRegistration({ optionsJSON: options }) };
  } catch (err) {
    return failure(err);
  }
}

export type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON };
