type DiagnosticValue = string | number | boolean;

export function logContentDiagnostic(event: string, details: Record<string, DiagnosticValue>) {
  console.warn(`[content] ${event}`, details);
}
