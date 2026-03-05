import * as core from '@actions/core';
import * as http from 'http';

export async function waitForReady(
  baseUrl: string,
  timeoutSeconds: number,
): Promise<void> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  const pollIntervalMs = 2000;

  core.info(
    `Polling ${baseUrl}/health/readiness (timeout: ${timeoutSeconds}s)...`,
  );

  while (Date.now() - startTime < timeoutMs) {
    try {
      const healthy = await checkHealth(baseUrl);
      if (healthy) {
        return;
      }
      core.debug('Health check returned non-200 status, retrying...');
    } catch {
      core.debug('Health check connection failed, retrying...');
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `LiteLLM proxy did not become ready within ${timeoutSeconds} seconds`,
  );
}

function checkHealth(baseUrl: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}/health/readiness`;
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Health check request timed out'));
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
