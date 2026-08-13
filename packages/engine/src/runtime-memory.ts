import v8 from 'node:v8';
import type { HeapUsage } from '@ngcompass/common';

export function requestGarbageCollection(): boolean {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc === 'function') {
    gc();
    return true;
  }
  return false;
}

export function sampleHeapUsage(): HeapUsage {
  const { heapUsed } = process.memoryUsage();
  const { heap_size_limit } = v8.getHeapStatistics();
  return { usedBytes: heapUsed, limitBytes: heap_size_limit };
}

export function getHeapPressureRatio(): number {
  const { usedBytes, limitBytes } = sampleHeapUsage();
  return limitBytes > 0 ? usedBytes / limitBytes : 0;
}

export function requestGarbageCollectionUnderPressure(
  pressureRatio: number
): boolean {
  if (getHeapPressureRatio() < pressureRatio) return false;
  return requestGarbageCollection();
}
