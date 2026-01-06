type Counter = Record<string, number>;

const httpRequests: Counter = {};
const webhookResults: Counter = {};
const latencyBuckets: Record<number, number> = { 100: 0, 500: 0, Infinity: 0 };
let latencyCount = 0;
let latencyTotal = 0;

export function recordHttpRequest(path: string, status: number): void {
  const key = `${path}|${status}`;
  httpRequests[key] = (httpRequests[key] ?? 0) + 1;
}

export function recordWebhookResult(result: string): void {
  webhookResults[result] = (webhookResults[result] ?? 0) + 1;
}

export function recordLatency(ms: number): void {
  latencyCount += 1;
  latencyTotal += ms;
  if (ms <= 100) {
    latencyBuckets[100] = (latencyBuckets[100] ?? 0) + 1;
  } else if (ms <= 500) {
    latencyBuckets[500] = (latencyBuckets[500] ?? 0) + 1;
  } else {
    latencyBuckets[Infinity] = (latencyBuckets[Infinity] ?? 0) + 1;
  }
}

export function renderMetrics(): string {
  const lines: string[] = [];

  for (const [key, count] of Object.entries(httpRequests)) {
    const [path, status] = key.split("|");
    lines.push(`http_requests_total{path="${path}",status="${status}"} ${count}`);
  }

  for (const [result, count] of Object.entries(webhookResults)) {
    lines.push(`webhook_requests_total{result="${result}"} ${count}`);
  }

  const buckets = Object.keys(latencyBuckets)
    .map((k) => Number(k))
    .sort((a, b) => (a === Infinity ? 1 : b === Infinity ? -1 : a - b));

  let cumulative = 0;
  for (const le of buckets) {
    cumulative += latencyBuckets[le] ?? 0;
    const label = le === Infinity ? "+Inf" : le.toString();
    lines.push(`request_latency_ms_bucket{le="${label}"} ${cumulative}`);
  }
  lines.push(`request_latency_ms_count ${latencyCount}`);
  lines.push(`request_latency_ms_sum ${latencyTotal}`);

  return lines.join("\n") + "\n";
}

