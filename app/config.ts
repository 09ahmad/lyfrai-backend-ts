export type AppConfig = {
  databaseUrl: string;
  webhookSecret: string | null;
  logLevel: "DEBUG" | "INFO";
};

const DEFAULT_DB_URL = "sqlite:////data/app.db";

export function loadConfig(): AppConfig {
  const databaseUrl = (Bun.env.DATABASE_URL ?? DEFAULT_DB_URL).trim();
  const secret = Bun.env.WEBHOOK_SECRET?.trim() ?? null;
  const rawLogLevel = (Bun.env.LOG_LEVEL ?? "INFO").toUpperCase();
  const logLevel = rawLogLevel === "DEBUG" ? "DEBUG" : "INFO";

  return {
    databaseUrl,
    webhookSecret: secret && secret.length > 0 ? secret : null,
    logLevel,
  };
}

