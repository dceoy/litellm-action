import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as os from 'os';

export async function terminateProcess(pid: number): Promise<void> {
  if (os.platform() === 'win32') {
    await exec.exec('taskkill', ['/T', '/F', '/PID', pid.toString()]);
  } else {
    process.kill(-pid, 'SIGTERM');
  }
}

export async function cleanup(): Promise<void> {
  const pidStr = core.getState('pid');
  const logFile = core.getState('log-file');

  if (pidStr) {
    const pid = parseInt(pidStr, 10);
    core.info(`Stopping LiteLLM proxy (PID: ${pid})...`);
    try {
      await terminateProcess(pid);
      core.info('LiteLLM proxy stopped');
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;
      if (errno.code === 'ESRCH') {
        core.info('LiteLLM proxy process already exited');
      } else {
        core.warning(`Failed to stop LiteLLM proxy: ${error}`);
      }
    }
  }

  if (logFile && fs.existsSync(logFile)) {
    core.startGroup('LiteLLM Proxy Logs');
    const logs = fs.readFileSync(logFile, 'utf-8');
    if (logs.trim()) {
      core.info(logs);
    } else {
      core.info('(no logs)');
    }
    core.endGroup();
  }
}
