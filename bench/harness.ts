import { performance } from 'node:perf_hooks';

export interface BenchmarkCase {
  name: string;
  /** Runs once before any sample; excluded from the reported time. */
  setup?: () => void | Promise<void>;
  /** One measured iteration. */
  run: () => void | Promise<void>;
  /** Defaults to 5. */
  iterations?: number;
  /** Defaults to 2. */
  warmup?: number;
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  samplesMs: number[];
  minMs: number;
  medianMs: number;
  p95Ms: number;
  totalMs: number;
}

export interface BenchmarkOptions {
  iterations?: number;
  warmup?: number;
  /** Receives one line per finished case; defaults to `console.log`. */
  log?: (line: string) => void;
}

export function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

export async function measureCase(
  benchmark: BenchmarkCase,
  defaults: { iterations: number; warmup: number },
): Promise<BenchmarkResult> {
  const iterations = benchmark.iterations ?? defaults.iterations;
  const warmup = benchmark.warmup ?? defaults.warmup;
  await benchmark.setup?.();

  for (let index = 0; index < warmup; index += 1) {
    await benchmark.run();
  }

  const samplesMs: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await benchmark.run();
    samplesMs.push(performance.now() - started);
  }

  return {
    name: benchmark.name,
    iterations,
    samplesMs,
    minMs: Math.min(...samplesMs),
    medianMs: percentile(samplesMs, 0.5),
    p95Ms: percentile(samplesMs, 0.95),
    totalMs: samplesMs.reduce((sum, sample) => sum + sample, 0),
  };
}

export async function runBenchmarks(
  benchmarks: readonly BenchmarkCase[],
  options: BenchmarkOptions = {},
): Promise<BenchmarkResult[]> {
  const defaults = {
    iterations: options.iterations ?? 5,
    warmup: options.warmup ?? 2,
  };
  const log = options.log ?? ((line: string) => console.log(line));
  const results: BenchmarkResult[] = [];

  log(`benchmark: ${benchmarks.length} case(s), ${defaults.iterations} iteration(s), ${defaults.warmup} warmup`);
  log(formatHeader());
  for (const benchmark of benchmarks) {
    const result = await measureCase(benchmark, defaults);
    results.push(result);
    log(formatResult(result));
  }
  log('');
  log('median is the headline number; p95 shows the tail caused by GC or JIT noise.');
  return results;
}

function formatHeader(): string {
  return [
    'case'.padEnd(42),
    'median'.padStart(10),
    'p95'.padStart(10),
    'min'.padStart(10),
    'total'.padStart(10),
  ].join('');
}

function formatResult(result: BenchmarkResult): string {
  return [
    result.name.slice(0, 42).padEnd(42),
    `${result.medianMs.toFixed(2)}ms`.padStart(10),
    `${result.p95Ms.toFixed(2)}ms`.padStart(10),
    `${result.minMs.toFixed(2)}ms`.padStart(10),
    `${result.totalMs.toFixed(2)}ms`.padStart(10),
  ].join('');
}
