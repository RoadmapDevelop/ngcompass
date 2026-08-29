import type { Result } from './models/result.js';

export const Ok = <T>(data: T): Result<T, never> => ({ ok: true, data });

export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
