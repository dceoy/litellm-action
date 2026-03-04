jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  platform: jest.fn(),
}));

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as os from 'os';

const coreMock = core as jest.Mocked<typeof core>;
const execMock = exec as jest.Mocked<typeof exec>;
const existsSyncMock = fs.existsSync as jest.Mock;
const readFileSyncMock = fs.readFileSync as jest.Mock;
const platformMock = os.platform as jest.Mock;

import { terminateProcess, cleanup } from '../cleanup';

describe('terminateProcess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should use taskkill on Windows', async () => {
    platformMock.mockReturnValue('win32');
    execMock.exec.mockResolvedValue(0);

    await terminateProcess(1234);

    expect(execMock.exec).toHaveBeenCalledWith('taskkill', [
      '/T',
      '/F',
      '/PID',
      '1234',
    ]);
  });

  it('should use process.kill on non-Windows', async () => {
    platformMock.mockReturnValue('linux');
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    await terminateProcess(1234);

    expect(killSpy).toHaveBeenCalledWith(-1234, 'SIGTERM');
    killSpy.mockRestore();
  });
});

describe('cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    platformMock.mockReturnValue('linux');
    existsSyncMock.mockReturnValue(false);
    readFileSyncMock.mockReturnValue('');
  });

  it('should terminate process and display logs', async () => {
    coreMock.getState.mockImplementation((name: string) => {
      if (name === 'pid') return '5678';
      if (name === 'log-file') return '/tmp/litellm-proxy.log';
      return '';
    });

    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue('proxy log output');

    await cleanup();

    expect(coreMock.info).toHaveBeenCalledWith(
      'Stopping LiteLLM proxy (PID: 5678)...',
    );
    expect(killSpy).toHaveBeenCalledWith(-5678, 'SIGTERM');
    expect(coreMock.info).toHaveBeenCalledWith('LiteLLM proxy stopped');
    expect(coreMock.startGroup).toHaveBeenCalledWith('LiteLLM Proxy Logs');
    expect(coreMock.info).toHaveBeenCalledWith('proxy log output');
    expect(coreMock.endGroup).toHaveBeenCalled();

    killSpy.mockRestore();
  });

  it('should handle ESRCH error when process already exited', async () => {
    coreMock.getState.mockImplementation((name: string) => {
      if (name === 'pid') return '5678';
      return '';
    });

    const esrchError = new Error('No such process') as NodeJS.ErrnoException;
    esrchError.code = 'ESRCH';
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
      throw esrchError;
    });

    await cleanup();

    expect(coreMock.info).toHaveBeenCalledWith(
      'LiteLLM proxy process already exited',
    );

    killSpy.mockRestore();
  });

  it('should warn on non-ESRCH termination errors', async () => {
    coreMock.getState.mockImplementation((name: string) => {
      if (name === 'pid') return '5678';
      return '';
    });

    const error = new Error('Permission denied') as NodeJS.ErrnoException;
    error.code = 'EPERM';
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
      throw error;
    });

    await cleanup();

    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to stop LiteLLM proxy:'),
    );

    killSpy.mockRestore();
  });

  it('should skip termination when no pid is saved', async () => {
    coreMock.getState.mockReturnValue('');

    await cleanup();

    expect(coreMock.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Stopping'),
    );
  });

  it('should display "(no logs)" when log file is empty', async () => {
    coreMock.getState.mockImplementation((name: string) => {
      if (name === 'log-file') return '/tmp/litellm-proxy.log';
      return '';
    });

    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue('   \n  ');

    await cleanup();

    expect(coreMock.info).toHaveBeenCalledWith('(no logs)');
  });

  it('should not read log file when it does not exist', async () => {
    coreMock.getState.mockImplementation((name: string) => {
      if (name === 'log-file') return '/tmp/litellm-proxy.log';
      return '';
    });

    existsSyncMock.mockReturnValue(false);

    await cleanup();

    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('should skip log display when no log-file state is saved', async () => {
    coreMock.getState.mockReturnValue('');

    await cleanup();

    expect(coreMock.startGroup).not.toHaveBeenCalled();
  });
});
