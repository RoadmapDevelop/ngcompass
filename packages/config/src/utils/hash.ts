import crypto from 'node:crypto';

export function sha1Hex(content: string): string {
  return crypto.createHash('sha1').update(content).digest('hex');
}
