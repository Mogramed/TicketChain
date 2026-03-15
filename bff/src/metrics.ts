type HttpMetricKey = string;
const HTTP_DURATION_BUCKETS_MS = [25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

interface HttpMetricRecord {
  method: string;
  path: string;
  statusCode: number;
  total: number;
  durationMsTotal: number;
  durationBucketCounts: number[];
}

export interface IndexerStatusSnapshot {
  running: boolean;
  haltedByRateLimit: boolean;
  haltedReason: string | null;
  currentBatchSize: number;
  currentBackoffMs: number;
  consecutiveRateLimitErrors: number;
  totalRateLimitErrors: number;
  totalEventsProcessed: number;
  totalMetadataRefreshes: number;
  totalRangesProcessed: number;
  totalReorgResets: number;
  lastRateLimitAt: number | null;
  lastProcessedAt: number | null;
  lastProcessedRangeFrom: number | null;
  lastProcessedRangeTo: number | null;
  lastProcessedDurationMs: number | null;
}

export interface HealthAlertSnapshot {
  code: string;
  severity: "warning" | "critical";
  message: string;
}

export interface MetricsSnapshotInput {
  indexedBlock: number;
  latestBlock: number | null;
  rpcHealthy: boolean;
  healthOk: boolean;
  degraded: boolean;
  stalenessMs: number | null;
  alerts: HealthAlertSnapshot[];
  indexer: IndexerStatusSnapshot;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function metricLine(name: string, value: number, labels?: Record<string, string | number>): string {
  if (!labels || Object.keys(labels).length === 0) {
    return `${name} ${value}`;
  }

  const renderedLabels = Object.entries(labels)
    .map(([key, labelValue]) => `${key}="${escapeLabelValue(String(labelValue))}"`)
    .join(",");

  return `${name}{${renderedLabels}} ${value}`;
}

export class MetricsStore {
  private readonly httpRequests = new Map<HttpMetricKey, HttpMetricRecord>();
  private sseClientsConnected = 0;
  private sseEventsSentTotal = 0;

  recordHttpRequest(input: {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
  }): void {
    const method = input.method.toUpperCase();
    const path = input.path || "/";
    const key = `${method}:${path}:${input.statusCode}`;
    const previous = this.httpRequests.get(key);

    this.httpRequests.set(key, {
      method,
      path,
      statusCode: input.statusCode,
      total: (previous?.total ?? 0) + 1,
      durationMsTotal: (previous?.durationMsTotal ?? 0) + input.durationMs,
      durationBucketCounts:
        previous?.durationBucketCounts.map((count, index) =>
          input.durationMs <= HTTP_DURATION_BUCKETS_MS[index] ? count + 1 : count,
        ) ??
        HTTP_DURATION_BUCKETS_MS.map((bucket) => (input.durationMs <= bucket ? 1 : 0)),
    });
  }

  incrementSseClients(): void {
    this.sseClientsConnected += 1;
  }

  decrementSseClients(): void {
    this.sseClientsConnected = Math.max(0, this.sseClientsConnected - 1);
  }

  recordSseEvent(): void {
    this.sseEventsSentTotal += 1;
  }

  snapshot(): {
    httpRequests: HttpMetricRecord[];
    sseClientsConnected: number;
    sseEventsSentTotal: number;
  } {
    return {
      httpRequests: Array.from(this.httpRequests.values()).sort((left, right) =>
        `${left.method}:${left.path}:${left.statusCode}`.localeCompare(
          `${right.method}:${right.path}:${right.statusCode}`,
        ),
      ),
      sseClientsConnected: this.sseClientsConnected,
      sseEventsSentTotal: this.sseEventsSentTotal,
    };
  }

  renderPrometheus(input: MetricsSnapshotInput): string {
    const snapshot = this.snapshot();
    const lag =
      input.latestBlock === null ? -1 : Math.max(0, input.latestBlock - input.indexedBlock);
    const lines = [
      "# HELP chainticket_indexer_running Whether the indexer loop is running.",
      "# TYPE chainticket_indexer_running gauge",
      metricLine("chainticket_indexer_running", input.indexer.running ? 1 : 0),
      "# HELP chainticket_indexer_halted_by_rate_limit Whether the indexer halted due to rate limiting.",
      "# TYPE chainticket_indexer_halted_by_rate_limit gauge",
      metricLine(
        "chainticket_indexer_halted_by_rate_limit",
        input.indexer.haltedByRateLimit ? 1 : 0,
      ),
      "# HELP chainticket_indexer_current_batch_size Current indexer batch size.",
      "# TYPE chainticket_indexer_current_batch_size gauge",
      metricLine("chainticket_indexer_current_batch_size", input.indexer.currentBatchSize),
      "# HELP chainticket_indexer_current_backoff_ms Current rate-limit backoff delay in milliseconds.",
      "# TYPE chainticket_indexer_current_backoff_ms gauge",
      metricLine("chainticket_indexer_current_backoff_ms", input.indexer.currentBackoffMs),
      "# HELP chainticket_indexer_consecutive_rate_limit_errors Current streak of rate-limit errors.",
      "# TYPE chainticket_indexer_consecutive_rate_limit_errors gauge",
      metricLine(
        "chainticket_indexer_consecutive_rate_limit_errors",
        input.indexer.consecutiveRateLimitErrors,
      ),
      "# HELP chainticket_indexer_rate_limit_errors_total Total rate-limit errors seen by the indexer.",
      "# TYPE chainticket_indexer_rate_limit_errors_total counter",
      metricLine(
        "chainticket_indexer_rate_limit_errors_total",
        input.indexer.totalRateLimitErrors,
      ),
      "# HELP chainticket_indexer_events_processed_total Total indexed events processed.",
      "# TYPE chainticket_indexer_events_processed_total counter",
      metricLine(
        "chainticket_indexer_events_processed_total",
        input.indexer.totalEventsProcessed,
      ),
      "# HELP chainticket_indexer_metadata_refreshes_total Total metadata refresh batches applied to ticket_state.",
      "# TYPE chainticket_indexer_metadata_refreshes_total counter",
      metricLine(
        "chainticket_indexer_metadata_refreshes_total",
        input.indexer.totalMetadataRefreshes,
      ),
      "# HELP chainticket_indexer_ranges_processed_total Total processed block ranges.",
      "# TYPE chainticket_indexer_ranges_processed_total counter",
      metricLine(
        "chainticket_indexer_ranges_processed_total",
        input.indexer.totalRangesProcessed,
      ),
      "# HELP chainticket_indexer_reorg_resets_total Total indexed-state resets caused by reorg detection.",
      "# TYPE chainticket_indexer_reorg_resets_total counter",
      metricLine(
        "chainticket_indexer_reorg_resets_total",
        input.indexer.totalReorgResets,
      ),
      "# HELP chainticket_indexer_indexed_block Last indexed block.",
      "# TYPE chainticket_indexer_indexed_block gauge",
      metricLine("chainticket_indexer_indexed_block", input.indexedBlock),
      "# HELP chainticket_indexer_latest_block Latest chain block fetched by the BFF.",
      "# TYPE chainticket_indexer_latest_block gauge",
      metricLine("chainticket_indexer_latest_block", input.latestBlock ?? -1),
      "# HELP chainticket_indexer_lag_blocks Current lag between latest and indexed block.",
      "# TYPE chainticket_indexer_lag_blocks gauge",
      metricLine("chainticket_indexer_lag_blocks", lag),
      "# HELP chainticket_indexer_last_processed_at_ms Unix timestamp in milliseconds for the last successful processed range.",
      "# TYPE chainticket_indexer_last_processed_at_ms gauge",
      metricLine("chainticket_indexer_last_processed_at_ms", input.indexer.lastProcessedAt ?? -1),
      "# HELP chainticket_indexer_last_processed_duration_ms Duration in milliseconds of the last successful processed range.",
      "# TYPE chainticket_indexer_last_processed_duration_ms gauge",
      metricLine(
        "chainticket_indexer_last_processed_duration_ms",
        input.indexer.lastProcessedDurationMs ?? -1,
      ),
      "# HELP chainticket_indexer_staleness_ms Milliseconds since the last successful processed range while lag is non-zero.",
      "# TYPE chainticket_indexer_staleness_ms gauge",
      metricLine("chainticket_indexer_staleness_ms", input.stalenessMs ?? -1),
      "# HELP chainticket_rpc_healthy Whether the latest RPC health probe succeeded.",
      "# TYPE chainticket_rpc_healthy gauge",
      metricLine("chainticket_rpc_healthy", input.rpcHealthy ? 1 : 0),
      "# HELP chainticket_health_ok Whether the BFF health check has no active critical alerts.",
      "# TYPE chainticket_health_ok gauge",
      metricLine("chainticket_health_ok", input.healthOk ? 1 : 0),
      "# HELP chainticket_health_degraded Whether the BFF health check has any active warnings or critical alerts.",
      "# TYPE chainticket_health_degraded gauge",
      metricLine("chainticket_health_degraded", input.degraded ? 1 : 0),
      "# HELP chainticket_health_alerts_active_total Number of active health alerts.",
      "# TYPE chainticket_health_alerts_active_total gauge",
      metricLine("chainticket_health_alerts_active_total", input.alerts.length),
      "# HELP chainticket_health_alert_active Active health alerts by code and severity.",
      "# TYPE chainticket_health_alert_active gauge",
      ...input.alerts.map((alert) =>
        metricLine("chainticket_health_alert_active", 1, {
          code: alert.code,
          severity: alert.severity,
        }),
      ),
      "# HELP chainticket_http_requests_total Total HTTP requests handled by route and status.",
      "# TYPE chainticket_http_requests_total counter",
      ...snapshot.httpRequests.map((entry) =>
        metricLine("chainticket_http_requests_total", entry.total, {
          method: entry.method,
          path: entry.path,
          status: entry.statusCode,
        }),
      ),
      "# HELP chainticket_http_request_duration_ms_total Cumulative HTTP request duration in milliseconds.",
      "# TYPE chainticket_http_request_duration_ms_total counter",
      ...snapshot.httpRequests.map((entry) =>
        metricLine("chainticket_http_request_duration_ms_total", entry.durationMsTotal, {
          method: entry.method,
          path: entry.path,
          status: entry.statusCode,
        }),
      ),
      "# HELP chainticket_http_request_duration_ms Histogram of HTTP request durations in milliseconds.",
      "# TYPE chainticket_http_request_duration_ms histogram",
      ...snapshot.httpRequests.flatMap((entry) => {
        const labels = {
          method: entry.method,
          path: entry.path,
          status: entry.statusCode,
        };
        return [
          ...HTTP_DURATION_BUCKETS_MS.map((bucket, index) =>
            metricLine("chainticket_http_request_duration_ms_bucket", entry.durationBucketCounts[index] ?? 0, {
              ...labels,
              le: bucket,
            }),
          ),
          metricLine("chainticket_http_request_duration_ms_bucket", entry.total, {
            ...labels,
            le: "+Inf",
          }),
          metricLine("chainticket_http_request_duration_ms_sum", entry.durationMsTotal, labels),
          metricLine("chainticket_http_request_duration_ms_count", entry.total, labels),
        ];
      }),
      "# HELP chainticket_sse_clients_connected Number of active SSE clients.",
      "# TYPE chainticket_sse_clients_connected gauge",
      metricLine("chainticket_sse_clients_connected", snapshot.sseClientsConnected),
      "# HELP chainticket_sse_events_sent_total Total SSE events sent to clients.",
      "# TYPE chainticket_sse_events_sent_total counter",
      metricLine("chainticket_sse_events_sent_total", snapshot.sseEventsSentTotal),
    ];

    return `${lines.join("\n")}\n`;
  }

  reset(): void {
    this.httpRequests.clear();
    this.sseClientsConnected = 0;
    this.sseEventsSentTotal = 0;
  }
}

export const metrics = new MetricsStore();
