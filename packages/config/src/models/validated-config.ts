import type { z } from 'zod';
import type { AnalyzerConfigSchema } from '../schemas/schema.js';

export type ValidatedConfig = z.infer<typeof AnalyzerConfigSchema>;

export type CacheConfig = ValidatedConfig['cache'];
