export interface ValidationIssue {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  path?: string;
  pageId?: string;
  elementId?: string;
  inputKey?: string;
  zodCode?: string;
  values?: Readonly<Record<string, RuntimeErrorValue>>;
}

export interface RenderIssue extends ValidationIssue {}

export type RuntimeErrorValue = string | number | boolean | null | undefined;

export class LayoutPDFRuntimeError extends Error {
  readonly code: string;
  readonly values: Readonly<Record<string, RuntimeErrorValue>>;

  constructor(
    code: string,
    message: string,
    values: Readonly<Record<string, RuntimeErrorValue>> = {},
  ) {
    super(message);
    this.name = 'LayoutPDFRuntimeError';
    this.code = code;
    this.values = values;
  }
}

export function isLayoutPDFRuntimeError(error: unknown): error is LayoutPDFRuntimeError {
  return error instanceof LayoutPDFRuntimeError;
}

export class LayoutPDFValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = 'LayoutPDFValidationError';
    this.issues = issues;
  }
}
