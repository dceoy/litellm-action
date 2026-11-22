import {
  addPath as coreAddPath,
  endGroup as coreEndGroup,
  getInput as coreGetInput,
  getState as coreGetState,
  info as coreInfo,
  saveState as coreSaveState,
  setFailed as coreSetFailed,
  setOutput as coreSetOutput,
  startGroup as coreStartGroup,
} from '@actions/core';
import { exec as execExec } from '@actions/exec';
import { spawn } from 'child_process';
import {
  closeSync as fsCloseSync,
  existsSync as fsExistsSync,
  mkdtempSync as fsMkdtempSync,
  openSync as fsOpenSync,
  readFileSync as fsReadFileSync,
  writeFileSync as fsWriteFileSync,
} from 'fs';
import {
  homedir as osHomedir,
  platform as osPlatform,
  tmpdir as osTmpdir,
} from 'os';
import { delimiter as pathDelimiter, join as pathJoin } from 'path';

import { restoreLitellmCache, saveLitellmCache } from './cache';
import { waitForReady } from './wait-for-ready';
import process from 'node:process';

const WHITESPACE = /\s+/u;

export async function run(): Promise<void> {
  try {
    const version = coreGetInput('version');
    const configPath = coreGetInput('config-path');
    const config = coreGetInput('config');
    const model = coreGetInput('model');
    const port = coreGetInput('port') || '4000';
    const logLevel = coreGetInput('log-level') || 'INFO';
    const apiKey = coreGetInput('api-key');
    const timeout = Number.parseInt(coreGetInput('timeout') || '120', 10);
    const extraArgs = coreGetInput('extra-args');
    const pipInstallArgs = coreGetInput('pip-install-args');
    const cacheEnabled = coreGetInput('cache') !== 'false' && version !== '';
    const isWindows = osPlatform() === 'win32';

    const uvBinDir = pathJoin(osHomedir(), '.local', 'bin');

    // Try to restore from cache (only when version is pinned)
    let cacheHit = false;
    if (cacheEnabled) {
      coreStartGroup('Restore LiteLLM cache');
      cacheHit = await restoreLitellmCache(version, pipInstallArgs);
      coreEndGroup();
    }

    if (!cacheHit) {
      // Install uv if not already available
      coreStartGroup('Install uv');
      let uvFound = false;
      try {
        uvFound =
          (await execExec('uv', ['--version'], {
            ignoreReturnCode: true,
            silent: true,
          })) === 0;
      } catch {
        uvFound = false;
      }
      if (!uvFound) {
        if (isWindows) {
          await execExec('powershell', [
            '-ExecutionPolicy',
            'ByPass',
            '-c',
            'irm https://astral.sh/uv/install.ps1 | iex',
          ]);
        } else {
          await execExec('sh', [
            '-c',
            'curl -LsSf https://astral.sh/uv/install.sh | sh',
          ]);
        }
      }
      coreEndGroup();

      // Install litellm
      coreStartGroup('Install LiteLLM');
      const litellmPackage = version
        ? `litellm[proxy]==${version}`
        : 'litellm[proxy]';
      const uvArgs = ['tool', 'install', litellmPackage];
      if (pipInstallArgs) {
        uvArgs.push(...pipInstallArgs.split(WHITESPACE).filter(Boolean));
      }
      await execExec('uv', uvArgs);
      coreEndGroup();

      // Save to cache
      if (cacheEnabled) {
        coreStartGroup('Save LiteLLM cache');
        await saveLitellmCache(version, pipInstallArgs);
        coreEndGroup();
      }
    }

    coreAddPath(uvBinDir);
    process.env['PATH'] =
      `${uvBinDir}${pathDelimiter}${process.env['PATH'] ?? ''}`;

    const tempDir = fsMkdtempSync(pathJoin(osTmpdir(), 'litellm-'));

    // Determine config file path
    let resolvedConfigPath = configPath;
    if (config && !configPath) {
      const tmpConfigPath = pathJoin(tempDir, 'litellm-config.yaml');
      fsWriteFileSync(tmpConfigPath, config, 'utf-8');
      resolvedConfigPath = tmpConfigPath;
      coreInfo(`Wrote inline config to ${tmpConfigPath}`);
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
      litellmArgs.push(...extraArgs.split(WHITESPACE).filter(Boolean));
    }

    // Set up environment variables
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (apiKey) {
      env['LITELLM_MASTER_KEY'] = apiKey;
    }
    env['LITELLM_LOG'] = logLevel;

    // Start the proxy server
    const logFilePath = pathJoin(tempDir, 'litellm-proxy.log');
    const logFd = fsOpenSync(logFilePath, 'w');

    coreInfo(`Starting LiteLLM proxy on port ${port}...`);
    coreInfo(`Command: litellm ${litellmArgs.join(' ')}`);

    const child = spawn('litellm', litellmArgs, {
      detached: !isWindows,
      stdio: ['ignore', logFd, logFd],
      env,
      shell: isWindows,
    });
    child.unref();
    fsCloseSync(logFd);

    if (child.pid === undefined) {
      throw new Error('Failed to start LiteLLM proxy server');
    }

    const pid = child.pid;
    coreSaveState('pid', pid.toString());
    coreSaveState('log-file', logFilePath);
    coreInfo(`LiteLLM proxy started with PID ${pid}`);

    // Wait for the server to be ready
    const baseUrl = `http://localhost:${port}`;
    coreStartGroup('Waiting for LiteLLM proxy to be ready');
    await waitForReady(baseUrl, timeout);
    coreEndGroup();

    // Set outputs
    coreSetOutput('base-url', baseUrl);
    coreSetOutput('pid', pid.toString());
    coreInfo(`LiteLLM proxy is ready at ${baseUrl}`);
  } catch (error) {
    const logFile = coreGetState('log-file');
    if (logFile && fsExistsSync(logFile)) {
      coreStartGroup('LiteLLM Proxy Logs');
      coreInfo(fsReadFileSync(logFile, 'utf-8'));
      coreEndGroup();
    }

    if (error instanceof Error) {
      coreSetFailed(error.message);
    } else {
      coreSetFailed('An unexpected error occurred');
    }
  }
}
