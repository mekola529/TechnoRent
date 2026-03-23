/** Safe error logging — never leaks full stack/internals in production */
export function logError(label: string, e: unknown): void {
  if (process.env.NODE_ENV === "production") {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${label} ${msg}`);
  } else {
    console.error(label, e);
  }
}
