type LogLevel = "DEBUG" | "INFO" | "ERROR";

type RequestLogBase = {
  ts: string;
  level: LogLevel;
  request_id: string;
  method: string;
  path: string;
  status: number;
  latency_ms: number;
};

type WebhookLogExtras = {
  message_id?: string;
  dup?: boolean;
  result?: string;
};

export function logJSON(
  level: LogLevel,
  payload: Record<string, unknown>,
  logLevel: LogLevel = "INFO"
): void {
  const allowedLevels: LogLevel[] = ["DEBUG", "INFO", "ERROR"];
  if (!allowedLevels.includes(level)) return;

  const levelOrder: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    ERROR: 2,
  };

  if (levelOrder[level] < levelOrder[logLevel]) return;

  const ts = new Date().toISOString();
  const line = JSON.stringify({ ts, level, ...payload });
  console.log(line);
}

export function logRequest(
  logLevel: LogLevel,
  base: Omit<RequestLogBase, "ts" | "level">,
  extras: WebhookLogExtras = {}
): void {
  logJSON(
    "INFO",
    {
      ...base,
      ...extras,
    },
    logLevel
  );
}

