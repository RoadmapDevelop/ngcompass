import crypto from 'node:crypto';

export const computeCompositeHash = (content: string, salt: string): string => {
  const hash = crypto.createHash('sha256');
  hash.update(content);
  if (salt) hash.update(salt);
  return hash.digest('hex');
};
