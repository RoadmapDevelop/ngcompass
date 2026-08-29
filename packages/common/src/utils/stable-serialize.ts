export class SerializationError extends Error {
  constructor(
    message: string,
    public readonly path: string[]
  ) {
    super(message);
    this.name = 'SerializationError';
  }
}

export const stableSerialize = (
  value: unknown,
  _path: string[] = [],
  _seen: WeakSet<object> = new WeakSet()
): string => {
  if (value === null) return 'null';

  if (value === undefined) {
    throw new SerializationError('undefined is not a valid hash input', _path);
  }

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';

    case 'number':
      if (!Number.isFinite(value)) {
        throw new SerializationError(
          `Non-finite number (${String(value)}) is not a valid hash input`,
          _path
        );
      }
      return String(value);

    case 'string':
      return JSON.stringify(value);

    case 'function':
      throw new SerializationError(
        'Functions are not valid hash inputs',
        _path
      );
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (value instanceof RegExp) {
    return JSON.stringify(value.toString());
  }

  if (typeof value === 'object') {
    const obj = value;

    if (_seen.has(obj)) {
      throw new SerializationError(
        `Circular reference detected at path: ${_path.join('.') || '(root)'}`,
        _path
      );
    }
    _seen.add(obj);

    let result: string;

    if (Array.isArray(value)) {
      const items = (value as unknown[]).map((v, i) =>
        stableSerialize(v, [..._path, String(i)], _seen)
      );
      result = '[' + items.join(',') + ']';
    } else {
      const record = value as Record<string, unknown>;
      const sortedKeys = Object.keys(record).sort();
      const pairs: string[] = [];

      for (const k of sortedKeys) {
        const v = record[k];
        if (v === undefined) continue;
        pairs.push(
          JSON.stringify(k) + ':' + stableSerialize(v, [..._path, k], _seen)
        );
      }

      result = '{' + pairs.join(',') + '}';
    }

    _seen.delete(obj);
    return result;
  }

  return JSON.stringify(value);
};
