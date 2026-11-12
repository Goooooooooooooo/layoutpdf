import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { TemplateFileSchema } from '@/engine/core/validation.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const outputDirectory = fileURLToPath(new URL('../docs/schema', import.meta.url));
const outputFile = fileURLToPath(new URL('../docs/schema/template.schema.json', import.meta.url));

const schema = z.toJSONSchema(TemplateFileSchema, {
  target: 'draft-2020-12',
  io: 'input',
});

const document = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://layoutpdf.dev/schema/template.schema.json',
  title: 'LayoutPDF template file',
  description: 'Serialized `layoutpdf-template` v3 document accepted by layoutpdf.',
  ...schema,
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`wrote ${outputFile.replace(`${root}/`, '')}`);
