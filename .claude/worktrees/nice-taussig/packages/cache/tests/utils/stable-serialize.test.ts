import { describe, it, expect } from 'vitest';
import { stableSerialize, SerializationError } from '../../src/utils/stable-serialize.js';

describe('stableSerialize', () => {
    it('serializes primitives', () => {
        expect(stableSerialize(1)).toBe('1');
        expect(stableSerialize(true)).toBe('true');
        expect(stableSerialize('string')).toBe('"string"');
        expect(stableSerialize(null)).toBe('null');
    });

    it('rejects undefined as input', () => {
        expect(() => stableSerialize(undefined)).toThrowError(SerializationError);
    });

    it('rejects functions as input', () => {
        expect(() => stableSerialize(() => {})).toThrowError(SerializationError);
    });
    
    it('rejects non-finite numbers', () => {
        expect(() => stableSerialize(NaN)).toThrowError(SerializationError);
        expect(() => stableSerialize(Infinity)).toThrowError(SerializationError);
    });

    it('serializes Dates as ISO strings', () => {
        const d = new Date('2023-01-01T00:00:00Z');
        expect(stableSerialize(d)).toBe('"2023-01-01T00:00:00.000Z"');
    });

    it('serializes RegExps as strings', () => {
        expect(stableSerialize(/abc/gi)).toBe('"/abc/gi"');
    });

    it('serializes arrays maintaining insertion order', () => {
        expect(stableSerialize([1, 'a', true])).toBe('[1,"a",true]');
    });

    it('sorts object keys alphabetically', () => {
        const obj1 = { z: 1, a: 2, c: 3 };
        const obj2 = { a: 2, c: 3, z: 1 };
        
        expect(stableSerialize(obj1)).toBe('{"a":2,"c":3,"z":1}');
        expect(stableSerialize(obj1)).toBe(stableSerialize(obj2));
    });

    it('omits undefined object properties safely', () => {
        const obj1 = { a: 1, b: undefined, c: 3 };
        const obj2 = { a: 1, c: 3 };
        
        expect(stableSerialize(obj1)).toBe('{"a":1,"c":3}');
        expect(stableSerialize(obj1)).toBe(stableSerialize(obj2));
    });

    it('detects and rejects circular references', () => {
        const obj: any = { a: 1 };
        obj.self = obj;
        
        expect(() => stableSerialize(obj)).toThrowError(SerializationError);
        expect(() => stableSerialize(obj)).toThrowError(/Circular reference detected/);
    });
});
