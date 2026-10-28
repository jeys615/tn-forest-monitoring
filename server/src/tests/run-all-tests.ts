/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execAsync = promisify(exec);

const testFiles = [
  'm1-auth.test.ts',
  'm2-zone.test.ts',
  'm3-satellite.test.ts',
  'm4-monitoring.test.ts',
  'm5-baseline-processing.test.ts',
  'm6-change-detection.test.ts',
  'm7-marked-area-analysis.test.ts',
  'm7-temporary-analysis.test.ts',
  'gis-calculation-validation.test.ts',
  'm8-gee-satellite.test.ts',
  'm8-real-acquisition.test.ts',
  'm8-zonal-statistics.test.ts',
  'm8-real-baseline.test.ts',
  'm8-real-world-validation.test.ts',
  'm8-automated-monitoring.test.ts',
  'm8-production-reliability.test.ts',
  'm8-multisource-acquisition.test.ts',
  'm8-resolution-normalization.test.ts',
  'm9-transport-epass.test.ts',
  'm10-checkpoint-enforcement.test.ts',
  'm11-reconciliation.test.ts',
  'm12-enforcement-case.test.ts',
  'monitoring-pipeline-integrity.test.ts',
  'raster-processing-pipeline.test.ts',
  'm8-production-freeze.test.ts',
  'gee-no-fake-fallback.test.ts',
  'baseline-activation-safety.test.ts',
  'gee-discovery.test.ts',
  'crs-normalization-area-safety.test.ts',
  'clean-empty-state-validation.test.ts',
];

interface TestResult {
  file: string;
  passed: boolean;
  durationMs: number;
  output: string;
}

async function runAll() {
  console.log('================================================================');
  console.log('🚀 RUNNING ALL 21 REGRESSION TEST SUITES (M1 THROUGH M13)');
  console.log('================================================================\n');




  const results: TestResult[] = [];
  const startTime = Date.now();

  for (const file of testFiles) {
    const filePath = path.join('src', 'tests', file);
    process.stdout.write(`Running ${file}... `);
    const testStart = Date.now();
    try {
      const { stdout, stderr } = await execAsync(`npx tsx ${filePath}`, {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        maxBuffer: 50 * 1024 * 1024,
      });
      const durationMs = Date.now() - testStart;
      console.log(`✅ PASSED (${durationMs}ms)`);
      results.push({
        file,
        passed: true,
        durationMs,
        output: stdout + stderr,
      });
    } catch (err: any) {
      const durationMs = Date.now() - testStart;
      console.log(`❌ FAILED (${durationMs}ms)`);
      console.error(err.stderr || err.message || err.stdout);
      results.push({
        file,
        passed: false,
        durationMs,
        output: (err.stdout || '') + (err.stderr || '') + err.message,
      });
    }
  }

  const totalDuration = Date.now() - startTime;
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  console.log('\n================================================================');
  console.log('📊 TEST SUMMARY REPORT');
  console.log('================================================================');
  for (const r of results) {
    console.log(`${r.passed ? '✅' : '❌'} ${r.file.padEnd(40)} ${r.passed ? 'PASSED' : 'FAILED'} (${r.durationMs}ms)`);
  }
  console.log('----------------------------------------------------------------');
  console.log(`Total Suites: ${results.length}`);
  console.log(`Passed:       ${totalPassed}`);
  console.log(`Failed:       ${totalFailed}`);
  console.log(`Total Time:   ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Master test runner failed:', err);
  process.exit(1);
});
