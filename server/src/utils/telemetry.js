// server/src/utils/telemetry.js
/**
 * Observability & Telemetry Exporter
 * Tracks CPU, Memory, API request counts, latency metrics, and formats them in Prometheus format.
 */

const metricsRegistry = {
    apiRequestsTotal: new Map(), // path -> count
    apiLatencySeconds: new Map(), // path -> avg duration
};

/**
 * Record metrics for a request
 * @param {string} method - HTTP method
 * @param {string} path - Target path
 * @param {number} durationMs - Request duration in milliseconds
 * @param {number} status - HTTP status code
 */
function recordApiMetric(method, path, durationMs, status) {
    const key = `${method} ${path} [${status}]`;
    
    // Count
    const currentCount = metricsRegistry.apiRequestsTotal.get(key) || 0;
    metricsRegistry.apiRequestsTotal.set(key, currentCount + 1);
    
    // Latency
    const currentDuration = metricsRegistry.apiLatencySeconds.get(key) || 0;
    const avgDuration = currentDuration === 0 ? (durationMs / 1000) : (currentDuration * 0.9 + (durationMs / 1000) * 0.1);
    metricsRegistry.apiLatencySeconds.set(key, avgDuration);
}

/**
 * Format metrics in Prometheus plaintext format
 * @returns {string} Prometheus formatted metrics
 */
function getPrometheusMetrics() {
    const lines = [];
    
    lines.push('# HELP node_process_uptime_seconds Process uptime in seconds.');
    lines.push('# TYPE node_process_uptime_seconds gauge');
    lines.push(`node_process_uptime_seconds ${process.uptime().toFixed(2)}`);

    lines.push('# HELP node_memory_bytes Memory usage in bytes.');
    lines.push('# TYPE node_memory_bytes gauge');
    const memory = process.memoryUsage();
    lines.push(`node_memory_bytes{type="rss"} ${memory.rss}`);
    lines.push(`node_memory_bytes{type="heapTotal"} ${memory.heapTotal}`);
    lines.push(`node_memory_bytes{type="heapUsed"} ${memory.heapUsed}`);

    lines.push('# HELP hms_api_requests_total Total number of API requests.');
    lines.push('# TYPE hms_api_requests_total counter');
    for (const [key, count] of metricsRegistry.apiRequestsTotal.entries()) {
        const parts = key.split(' ');
        const method = parts[0];
        const path = parts[1];
        const status = parts[2].replace(/[\[\]]/g, '');
        lines.push(`hms_api_requests_total{method="${method}",path="${path}",status="${status}"} ${count}`);
    }

    lines.push('# HELP hms_api_latency_seconds Average request latency in seconds.');
    lines.push('# TYPE hms_api_latency_seconds gauge');
    for (const [key, latency] of metricsRegistry.apiLatencySeconds.entries()) {
        const parts = key.split(' ');
        const method = parts[0];
        const path = parts[1];
        lines.push(`hms_api_latency_seconds{method="${method}",path="${path}"} ${latency.toFixed(4)}`);
    }

    return lines.join('\n') + '\n';
}

module.exports = { recordApiMetric, getPrometheusMetrics };
