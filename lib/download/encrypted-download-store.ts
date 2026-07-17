"use client";

/**
 * Global store for a pending *encrypted* download awaiting its passphrase.
 *
 * Encrypted files are end-to-end encrypted: the server only ever holds
 * ciphertext, so a plain download would hand the user unusable (still-encrypted)
 * bytes under the original filename — looking like the protection was bypassed.
 * Instead, when a download is requested for an encrypted file we stash it here,
 * a globally-mounted dialog prompts for the passphrase, decrypts in the browser,
 * and only then saves the real file. Same external-store pattern as
 * download-store / notify-store.
 */

import type { EncryptionMetaV1 } from "@/lib/crypto/client-encryption";

export type PendingEncryptedDownload = {
  fileId: string;
  fileName: string;
  mimeType: string;
  meta: EncryptionMetaV1;
};

type Listener = () => void;

let pending: PendingEncryptedDownload | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function getPendingEncryptedDownload(): PendingEncryptedDownload | null {
  return pending;
}

export function subscribePendingEncryptedDownload(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setPendingEncryptedDownload(item: PendingEncryptedDownload) {
  pending = item;
  emit();
}

export function clearPendingEncryptedDownload() {
  if (!pending) return;
  pending = null;
  emit();
}
