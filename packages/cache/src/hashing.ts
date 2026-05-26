import crypto from 'node:crypto';
import xxhash from 'xxhash-wasm';

let h64: ((input: string | Uint8Array) => string) | undefined;

const formatDigest = (digest: bigint): string =>
  digest.toString(16).padStart(16, '0');

export const initHasher = async (): Promise<void> => {
  if (h64) return;
  const api = await xxhash();
  h64 = (input: string | Uint8Array): string =>
    formatDigest(
      typeof input === 'string' ? api.h64(input) : api.h64Raw(input)
    );
};

export const computeHash = (content: string | Uint8Array): string => {
  if (h64) return h64(content);
  const hasher = crypto.createHash('sha256');
  hasher.update(content);
  return hasher.digest('hex');
};
