export function getParsedError(error: unknown): string {
  if (error && typeof error === "object") {
    if ("shortMessage" in error && typeof error.shortMessage === "string") return error.shortMessage;
    if ("reason" in error && typeof error.reason === "string") return error.reason;
    if ("message" in error && typeof error.message === "string") return error.message;
  }
  return "The transaction could not be completed.";
}
