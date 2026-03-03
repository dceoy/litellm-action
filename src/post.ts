import * as core from '@actions/core';
import * as fs from 'fs';

function cleanup(): void {
  const pidStr = core.getState('pid');
  const logFile = core.getState('log-file');

  if (pidStr) {
    const pid = parseInt(pidStr, 10);
    core.info(`Stopping LiteLLM proxy (PID: ${pid})...`);
    try {
      process.kill(-pid, 'SIGTERM');
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

cleanup();
