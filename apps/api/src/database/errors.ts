export class DatabaseConfigurationError extends Error {
  readonly code = "database_not_configured";
  readonly status = 503;

  constructor() {
    super("database_not_configured");
    this.name = "DatabaseConfigurationError";
  }
}

export class DatabaseUnavailableError extends Error {
  readonly code = "database_unavailable";
  readonly status = 503;

  constructor() {
    super("database_unavailable");
    this.name = "DatabaseUnavailableError";
  }
}

function hasConnectionCode(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (
      typeof record.code === "string" &&
      /^(08|53|57P01|ECONN|ETIMEDOUT|ENOTFOUND|EHOST|EPIPE|P1001|P1002|P1017)/.test(
        record.code,
      )
    )
      return true;
    if (
      typeof record.message === "string" &&
      /connection (?:terminated|closed|refused)|could not connect|server has closed/i.test(
        record.message,
      )
    )
      return true;
    current = record.cause;
  }
  return false;
}

export function databaseFailure(error: unknown): unknown {
  return hasConnectionCode(error) ? new DatabaseUnavailableError() : error;
}
