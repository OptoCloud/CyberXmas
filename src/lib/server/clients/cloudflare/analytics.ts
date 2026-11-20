// Workers Analytics Engine: operational events (job runs, source failures, request errors).
// Data point layout, queryable with the SQL API:
//   index1 = event, blob1 = event, blob2 = label, blob3 = status, double1..n = values
import type { AnalyticsEngineDataset } from '../../env.ts';

export interface MetricFields {
  /** What the event is about, e.g. a source ID or route prefix. */
  label?: string;
  /** Outcome, e.g. ok / error / skipped. */
  status?: string;
  /** Numeric measurements, e.g. [count, durationMs]. */
  values?: number[];
}

export interface Metrics {
  write(event: string, fields?: MetricFields): void;
}

/** Without a dataset binding, metrics are discarded. Writing never throws. */
export function createMetrics(dataset?: AnalyticsEngineDataset): Metrics {
  return {
    write(event, { label = '', status = '', values = [] } = {}) {
      if (!dataset) return;
      try {
        dataset.writeDataPoint({ indexes: [event], blobs: [event, label, status], doubles: values });
      } catch (failure) {
        console.warn('Unable to write metric', event, failure);
      }
    }
  };
}
