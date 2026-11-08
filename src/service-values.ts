/** Narrow JSON objects without assigning an unchecked `any` to service code. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
