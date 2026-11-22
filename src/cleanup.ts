import {
  endGroup as coreEndGroup,
  getState as coreGetState,
  info as coreInfo,
  startGroup as coreStartGroup,
  warning as coreWarning,
} from '@actions/core';
import { exec as execExec } from '@actions/exec';
import { existsSync as fsExistsSync, readFileSync as fsReadFileSync } from 'fs';
import { platform as osPlatform } from 'os';
import process from 'node:process';

export async function terminateProcess(pid: number): Promise<void> {
  if (osPlatform() === 'win32') {
    await execExec('taskkill', ['/T', '/F', '/PID', pid.toString()]);
  } else {
    process.kill(-pid, 'SIGTERM');
  }
}

export async function cleanup(): Promise<void> {
  const pidStr = coreGetState('pid');
  const logFile = coreGetState('log-file');

  if (pidStr) {
    const pid = Number.parseInt(pidStr, 10);
    coreInfo(`Stopping LiteLLM proxy (PID: ${pid})...`);
    try {
      await terminateProcess(pid);
      coreInfo('LiteLLM proxy stopped');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
        coreInfo('LiteLLM proxy process already exited');
      } else {
        coreWarning(
          `Failed to stop LiteLLM proxy: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  if (logFile && fsExistsSync(logFile)) {
    coreStartGroup('LiteLLM Proxy Logs');
    const logs = fsReadFileSync(logFile, 'utf-8');
    if (logs.trim()) {
      coreInfo(logs);
    } else {
      coreInfo('(no logs)');
    }
    coreEndGroup();
  }
}
