import { z } from 'zod';
import type { NumericDisplayFormat } from '@/engine/renderTree/model.js';

export const NumericDisplayFormatSchema: z.ZodType<NumericDisplayFormat> = z.object({
  prefix: z.string(),
  symbolLayout: z.enum(['attached', 'edge']),
  zeroDisplay: z.enum(['zero', 'dash', 'blank']),
  emptyDisplay: z.enum(['blank', 'dash']),
  decimalPlaces: z.number().int().min(0).max(10).optional(),
  negativeStyle: z.enum([
    'minus-after-symbol',
    'minus-before-symbol',
    'parentheses',
    'triangle',
  ]).optional(),
});
