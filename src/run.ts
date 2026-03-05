import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { restoreLitellmCache, saveLitellmCache } from './cache';
import { waitForReady } from './wait-for-ready';

export async function run(): Promise<void> {
  try {
    const version = core.getInput('version');
    const configPath = core.getInput('config-path');
    const config = core.getInput('config');
    const model = core.getInput('model');
    const port = core.getInput('port') || '4000';
    const logLevel = core.getInput('log-level') || 'INFO';
    const apiKey = core.getInput('api-key');
    const timeout = parseInt(core.getInput('timeout') || '120', 10);
    const extraArgs = core.getInput('extra-args');
    const pipInstallArgs = core.getInput('pip-install-args');
    const cacheEnabled = core.getInput('cache') !== 'false' && version !== '';
    const isWindows = os.platform() === 'win32';

    const uvBinDir = path.join(os.homedir(), '.local', 'bin');

    // Try to restore from cache (only when version is pinned)
    let cacheHit = false;
    if (cacheEnabled) {
      core.startGroup('Restore LiteLLM cache');
      cacheHit = await restoreLitellmCache(version, pipInstallArgs);
      core.endGroup();
    }

    if (!cacheHit) {
      // Install uv if not already available
      core.startGroup('Install uv');
      let uvFound = false;
      try {
        uvFound =
          (await exec.exec('uv', ['--version'], {
            ignoreReturnCode: true,
            silent: true,
          })) === 0;
      } catch {
        uvFound = false;
      }
      if (!uvFound) {
        if (isWindows) {
          await exec.exec('powershell', [
            '-ExecutionPolicy',
            'ByPass',
            '-c',
            'irm https://astral.sh/uv/install.ps1 | iex',
          ]);
        } else {
          await exec.exec('sh', [
            '-c',
            'curl -LsSf https://astral.sh/uv/install.sh | sh',
          ]);
        }
      }
      core.endGroup();

      // Install litellm
      core.startGroup('Install LiteLLM');
      const litellmPackage = version
        ? `litellm[proxy]==${version}`
        : 'litellm[proxy]';
      const uvArgs = ['tool', 'install', litellmPackage];
      if (pipInstallArgs) {
        uvArgs.push(...pipInstallArgs.split(/\s+/).filter(Boolean));
      }
      await exec.exec('uv', uvArgs);
      core.endGroup();

      // Save to cache
      if (cacheEnabled) {
        core.startGroup('Save LiteLLM cache');
        await saveLitellmCache(version, pipInstallArgs);
        core.endGroup();
      }
    }

    core.addPath(uvBinDir);
    process.env.PATH = `${uvBinDir}${path.delimiter}${process.env.PATH ?? ''}`;

    // Determine config file path
    let resolvedConfigPath = configPath;
    if (config && !configPath) {
      const tmpConfigPath = path.join(os.tmpdir(), 'litellm-config.yaml');
      fs.writeFileSync(tmpConfigPath, config, 'utf-8');
      resolvedConfigPath = tmpConfigPath;
      core.info(`Wrote inline config to ${tmpConfigPath}`);
    }

    // Build litellm CLI arguments
    const litellmArgs: string[] = ['--port', port];

    if (resolvedConfigPath) {
      litellmArgs.push('--config', resolvedConfigPath);
    }

    if (model) {
      litellmArgs.push('--model', model);
    }

    if (logLevel === 'DEBUG') {
      litellmArgs.push('--detailed_debug');
    }

    if (extraArgs) {
      litellmArgs.push(...extraArgs.split(/\s+/).filter(Boolean));
    }

    // Set up environment variables
    const env: Record<string, string> = { ...process.env } as Record<
      string,
      string
    >;
    if (apiKey) {
      env.LITELLM_MASTER_KEY = apiKey;
    }
    env.LITELLM_LOG = logLevel;

    // Start the proxy server
    const logFilePath = path.join(os.tmpdir(), 'litellm-proxy.log');
    const logFd = fs.openSync(logFilePath, 'w');

    core.info(`Starting LiteLLM proxy on port ${port}...`);
    core.info(`Command: litellm ${litellmArgs.join(' ')}`);

    const child = spawn('litellm', litellmArgs, {
      detached: !isWindows,
      stdio: ['ignore', logFd, logFd],
      env,
      shell: isWindows,
    });
    child.unref();
    fs.closeSync(logFd);

    if (child.pid === undefined) {
      throw new Error('Failed to start LiteLLM proxy server');
    }

    const pid = child.pid;
    core.saveState('pid', pid.toString());
    core.saveState('log-file', logFilePath);
    core.info(`LiteLLM proxy started with PID ${pid}`);

    // Wait for the server to be ready
    const baseUrl = `http://localhost:${port}`;
    core.startGroup('Waiting for LiteLLM proxy to be ready');
    await waitForReady(baseUrl, timeout);
    core.endGroup();

    // Set outputs
    core.setOutput('base-url', baseUrl);
    core.setOutput('pid', pid.toString());
    core.info(`LiteLLM proxy is ready at ${baseUrl}`);
  } catch (error) {
    const logFile = core.getState('log-file');
    if (logFile && fs.existsSync(logFile)) {
      core.startGroup('LiteLLM Proxy Logs');
      core.info(fs.readFileSync(logFile, 'utf-8'));
      core.endGroup();
    }

    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}
