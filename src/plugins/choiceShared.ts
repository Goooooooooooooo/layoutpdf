import { z } from 'zod';
import type { RenderBuildContext } from '@/engine/core/plugin.js';
import type { RenderChoiceOption } from '@/engine/renderTree/model.js';

export const ChoiceOptionSchema = z.object({
  label: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(200),
});

export const ChoiceOptionsSchema = z.array(ChoiceOptionSchema)
  .min(1)
  .max(100)
  .superRefine((options, context) => {
    const values = new Set<string>();
    options.forEach((option, index) => {
      if (values.has(option.value)) {
        context.addIssue({
          code: 'custom',
          message: `Choice value must be unique: ${option.value}`,
          path: [index, 'value'],
        });
      }
      values.add(option.value);
    });
  });

export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>;

export function cloneChoiceOptions(options: readonly ChoiceOption[]): RenderChoiceOption[] {
  return options.map(option => ({ label: option.label, value: option.value }));
}

export function resolveChoiceLabel(args: {
  value: string;
  options: readonly ChoiceOption[];
  placeholder: string;
  context: RenderBuildContext;
  inputKey?: string;
}): string {
  if (args.value === '') return args.placeholder;
  const option = args.options.find(candidate => candidate.value === args.value);
  if (option) return option.label;
  args.context.report({
    severity: 'error',
    code: 'INVALID_CHOICE_VALUE',
    message: `Choice value is not present in the configured options: ${args.value}`,
    inputKey: args.inputKey,
  });
  return args.value;
}
