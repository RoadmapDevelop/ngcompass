/**
 * Unit Tests — constants.ts
 *
 * Verifies that every exported constant has its expected value and type.
 * If a constant is intentionally changed, this test will catch unintended drift.
 */

import { describe, it, expect } from 'vitest';
import {
    WORKER_POOL_TASK_THRESHOLD,
    LOCAL_CONCURRENCY_LIMIT,
    MIN_WORKER_COUNT,
    SPINNER_FRAME_INTERVAL_MS,
    BUDGET_MS_PER_FILE_WITHOUT_TYPES,
    BUDGET_MS_PER_FILE_WITH_TYPES,
} from '../src/constants.js';

describe('Engine Constants', () => {
    describe('WORKER_POOL_TASK_THRESHOLD', () => {
        it('is a positive number', () => {
            expect(typeof WORKER_POOL_TASK_THRESHOLD).toBe('number');
            expect(WORKER_POOL_TASK_THRESHOLD).toBeGreaterThan(0);
        });

        it('has the expected value 150', () => {
            expect(WORKER_POOL_TASK_THRESHOLD).toBe(150);
        });
    });

    describe('LOCAL_CONCURRENCY_LIMIT', () => {
        it('is a positive number', () => {
            expect(typeof LOCAL_CONCURRENCY_LIMIT).toBe('number');
            expect(LOCAL_CONCURRENCY_LIMIT).toBeGreaterThan(0);
        });

        it('has the expected value 4', () => {
            expect(LOCAL_CONCURRENCY_LIMIT).toBe(4);
        });
    });

    describe('MIN_WORKER_COUNT', () => {
        it('is a positive number', () => {
            expect(typeof MIN_WORKER_COUNT).toBe('number');
            expect(MIN_WORKER_COUNT).toBeGreaterThan(0);
        });

        it('has the expected value 2', () => {
            expect(MIN_WORKER_COUNT).toBe(2);
        });
    });

    describe('SPINNER_FRAME_INTERVAL_MS', () => {
        it('is a positive number', () => {
            expect(typeof SPINNER_FRAME_INTERVAL_MS).toBe('number');
            expect(SPINNER_FRAME_INTERVAL_MS).toBeGreaterThan(0);
        });

        it('has the expected value 80', () => {
            expect(SPINNER_FRAME_INTERVAL_MS).toBe(80);
        });
    });

    describe('BUDGET_MS_PER_FILE_WITHOUT_TYPES', () => {
        it('is a positive number', () => {
            expect(typeof BUDGET_MS_PER_FILE_WITHOUT_TYPES).toBe('number');
            expect(BUDGET_MS_PER_FILE_WITHOUT_TYPES).toBeGreaterThan(0);
        });

        it('has the expected value 2', () => {
            expect(BUDGET_MS_PER_FILE_WITHOUT_TYPES).toBe(2);
        });
    });

    describe('BUDGET_MS_PER_FILE_WITH_TYPES', () => {
        it('is a positive number', () => {
            expect(typeof BUDGET_MS_PER_FILE_WITH_TYPES).toBe('number');
            expect(BUDGET_MS_PER_FILE_WITH_TYPES).toBeGreaterThan(0);
        });

        it('has the expected value 5', () => {
            expect(BUDGET_MS_PER_FILE_WITH_TYPES).toBe(5);
        });

        it('is strictly greater than BUDGET_MS_PER_FILE_WITHOUT_TYPES', () => {
            // Type-aware analysis is allowed more time than syntax-only analysis
            expect(BUDGET_MS_PER_FILE_WITH_TYPES).toBeGreaterThan(BUDGET_MS_PER_FILE_WITHOUT_TYPES);
        });
    });
});
