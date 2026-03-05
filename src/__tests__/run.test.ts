import { EventEmitter } from 'events';
import type * as child_process_types from 'child_process';

jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('../wait-for-ready');
jest.mock('../cache');
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  openSync: jest.fn(),
  closeSync: jest.fn(),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  tmpdir: jest.fn(),
  platform: jest.fn(),
  homedir: jest.fn(),
}));

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';

const coreMock = core as jest.Mocked<typeof core>;
const execMock = exec as jest.Mocked<typeof exec>;
const spawnMock = child_process.spawn as jest.MockedFunction<
  typeof child_process.spawn
>;
const fsMock = {
  writeFileSync: fs.writeFileSync as jest.Mock,
  openSync: fs.openSync as jest.Mock,
  closeSync: fs.closeSync as jest.Mock,
  existsSync: fs.existsSync as jest.Mock,
  readFileSync: fs.readFileSync as jest.Mock,
};
const osMock = {
  tmpdir: os.tmpdir as jest.Mock,
  platform: os.platform as jest.Mock,
  homedir: os.homedir as jest.Mock,
};
const waitForReadyMod = jest.requireMock('../wait-for-ready') as {
  waitForReady: jest.Mock;
};
const cacheMod = jest.requireMock('../cache') as {
  restoreLitellmCache: jest.Mock;
  saveLitellmCache: jest.Mock;
};

import { run } from '../run';

function setupDefaultInputs(overrides: Record<string, string> = {}): void {
  const defaults: Record<string, string> = {
    version: '',
    'config-path': '',
    config: '',
    model: '',
    port: '',
    'log-level': '',
    'api-key': '',
    timeout: '',
    'extra-args': '',
    'pip-install-args': '',
    cache: '',
    ...overrides,
  };

  coreMock.getInput.mockImplementation((name: string) => defaults[name] || '');
}

function createMockChild(
  pid: number | undefined,
): child_process_types.ChildProcess {
  const child = new EventEmitter() as child_process_types.ChildProcess;
  Object.defineProperty(child, 'pid', { value: pid, writable: true });
  child.unref = jest.fn();
  return child;
}

describe('run', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: uv version check succeeds (uv is already available)
    execMock.exec.mockResolvedValue(0);
    waitForReadyMod.waitForReady.mockResolvedValue(undefined);
    cacheMod.restoreLitellmCache.mockResolvedValue(false);
    cacheMod.saveLitellmCache.mockResolvedValue(undefined);

    spawnMock.mockReturnValue(
      createMockChild(12345) as ReturnType<typeof child_process.spawn>,
    );
    fsMock.openSync.mockReturnValue(3);
    fsMock.closeSync.mockReturnValue(undefined);
    fsMock.writeFileSync.mockReturnValue(undefined);
    fsMock.existsSync.mockReturnValue(false);
    fsMock.readFileSync.mockReturnValue('');
    osMock.tmpdir.mockReturnValue('/tmp');
    osMock.platform.mockReturnValue('linux');
    osMock.homedir.mockReturnValue('/home/runner');

    coreMock.getState.mockReturnValue('');
  });

  it('should skip uv install and use tool install for litellm with defaults', async () => {
    setupDefaultInputs();

    await run();

    // uv version check returns 0 → already installed, no installer invoked
    expect(execMock.exec).not.toHaveBeenCalledWith(
      'sh',
      expect.arrayContaining(['curl']),
    );
    expect(coreMock.addPath).toHaveBeenCalledWith('/home/runner/.local/bin');
    expect(execMock.exec).toHaveBeenCalledWith('uv', [
      'tool',
      'install',
      'litellm[proxy]',
    ]);
    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '4000'],
      expect.objectContaining({ detached: true, shell: false }),
    );
    expect(coreMock.setOutput).toHaveBeenCalledWith(
      'base-url',
      'http://localhost:4000',
    );
    expect(coreMock.setOutput).toHaveBeenCalledWith('pid', '12345');
  });

  it('should install uv via shell script when uv is not available', async () => {
    execMock.exec.mockResolvedValueOnce(1); // uv version check fails → not installed
    setupDefaultInputs();

    await run();

    expect(execMock.exec).toHaveBeenCalledWith('sh', [
      '-c',
      'curl -LsSf https://astral.sh/uv/install.sh | sh',
    ]);
  });

  it('should install uv via shell script when uv version check throws', async () => {
    execMock.exec.mockRejectedValueOnce(new Error('command not found: uv'));
    setupDefaultInputs();

    await run();

    expect(execMock.exec).toHaveBeenCalledWith('sh', [
      '-c',
      'curl -LsSf https://astral.sh/uv/install.sh | sh',
    ]);
  });

  it('should install uv using PowerShell on Windows when not available', async () => {
    osMock.platform.mockReturnValue('win32');
    execMock.exec.mockResolvedValueOnce(1); // uv version check fails → not installed
    setupDefaultInputs();

    await run();

    expect(execMock.exec).toHaveBeenCalledWith('powershell', [
      '-ExecutionPolicy',
      'ByPass',
      '-c',
      'irm https://astral.sh/uv/install.ps1 | iex',
    ]);
  });

  it('should prepend uvBinDir to PATH even when PATH is undefined', async () => {
    const savedPath = process.env.PATH;
    delete process.env.PATH;
    setupDefaultInputs();

    await run();

    expect(process.env.PATH).toContain('/home/runner/.local/bin');
    process.env.PATH = savedPath;
  });

  it('should install specific version when provided', async () => {
    setupDefaultInputs({ version: '1.55.0' });

    await run();

    expect(execMock.exec).toHaveBeenCalledWith('uv', [
      'tool',
      'install',
      'litellm[proxy]==1.55.0',
    ]);
  });

  it('should pass pip install args when provided', async () => {
    setupDefaultInputs({ 'pip-install-args': '--extra-pkg some-pkg' });

    await run();

    expect(execMock.exec).toHaveBeenCalledWith('uv', [
      'tool',
      'install',
      'litellm[proxy]',
      '--extra-pkg',
      'some-pkg',
    ]);
  });

  it('should write inline config when config provided without config-path', async () => {
    setupDefaultInputs({ config: 'model_list:\n  - model: gpt-4' });

    await run();

    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      '/tmp/litellm-config.yaml',
      'model_list:\n  - model: gpt-4',
      'utf-8',
    );
    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '4000', '--config', '/tmp/litellm-config.yaml'],
      expect.any(Object),
    );
  });

  it('should use config-path when both config and config-path given', async () => {
    setupDefaultInputs({
      config: 'inline-config',
      'config-path': '/path/to/config.yaml',
    });

    await run();

    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '4000', '--config', '/path/to/config.yaml'],
      expect.any(Object),
    );
  });

  it('should use config-path when provided without inline config', async () => {
    setupDefaultInputs({ 'config-path': '/my/config.yaml' });

    await run();

    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '4000', '--config', '/my/config.yaml'],
      expect.any(Object),
    );
  });

  it('should add --model flag when model is provided', async () => {
    setupDefaultInputs({ model: 'openai/gpt-4o' });

    await run();

    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '4000', '--model', 'openai/gpt-4o'],
      expect.any(Object),
    );
  });

  it('should add --detailed_debug when log-level is DEBUG', async () => {
    setupDefaultInputs({ 'log-level': 'DEBUG' });

    await run();

    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '4000', '--detailed_debug'],
      expect.any(Object),
    );
  });

  it('should use custom port when provided', async () => {
    setupDefaultInputs({ port: '8080' });

    await run();

    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '8080'],
      expect.any(Object),
    );
    expect(coreMock.setOutput).toHaveBeenCalledWith(
      'base-url',
      'http://localhost:8080',
    );
  });

  it('should add extra args when provided', async () => {
    setupDefaultInputs({ 'extra-args': '--num_workers 4' });

    await run();

    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '4000', '--num_workers', '4'],
      expect.any(Object),
    );
  });

  it('should set LITELLM_MASTER_KEY when api-key is provided', async () => {
    setupDefaultInputs({ 'api-key': 'sk-test-key' });

    await run();

    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '4000'],
      expect.objectContaining({
        env: expect.objectContaining({
          LITELLM_MASTER_KEY: 'sk-test-key',
          LITELLM_LOG: 'INFO',
        }),
      }),
    );
  });

  it('should use custom timeout', async () => {
    setupDefaultInputs({ timeout: '60' });

    await run();

    expect(waitForReadyMod.waitForReady).toHaveBeenCalledWith(
      'http://localhost:4000',
      60,
    );
  });

  it('should use Windows-specific spawn options on win32', async () => {
    osMock.platform.mockReturnValue('win32');
    setupDefaultInputs();

    await run();

    expect(spawnMock).toHaveBeenCalledWith(
      'litellm',
      ['--port', '4000'],
      expect.objectContaining({ detached: false, shell: true }),
    );
  });

  it('should fail when child.pid is undefined', async () => {
    spawnMock.mockReturnValue(
      createMockChild(undefined) as ReturnType<typeof child_process.spawn>,
    );
    setupDefaultInputs();

    await run();

    expect(coreMock.setFailed).toHaveBeenCalledWith(
      'Failed to start LiteLLM proxy server',
    );
  });

  it('should display logs on error when log file exists', async () => {
    setupDefaultInputs();
    // uv version check succeeds (uv found), litellm tool install fails
    execMock.exec.mockResolvedValueOnce(0);
    execMock.exec.mockRejectedValue(new Error('uv tool install failed'));
    coreMock.getState.mockImplementation((name: string) => {
      if (name === 'log-file') return '/tmp/litellm-proxy.log';
      return '';
    });
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('some log output');

    await run();

    expect(coreMock.startGroup).toHaveBeenCalledWith('LiteLLM Proxy Logs');
    expect(coreMock.info).toHaveBeenCalledWith('some log output');
    expect(coreMock.setFailed).toHaveBeenCalledWith('uv tool install failed');
  });

  it('should not display logs on error when no log-file state', async () => {
    setupDefaultInputs();
    execMock.exec.mockResolvedValueOnce(0);
    execMock.exec.mockRejectedValue(new Error('uv tool install failed'));
    coreMock.getState.mockReturnValue('');

    await run();

    expect(coreMock.setFailed).toHaveBeenCalledWith('uv tool install failed');
    expect(fsMock.readFileSync).not.toHaveBeenCalled();
  });

  it('should handle non-Error thrown values', async () => {
    setupDefaultInputs();
    execMock.exec.mockResolvedValueOnce(0);
    execMock.exec.mockRejectedValue('string error');
    coreMock.getState.mockReturnValue('');

    await run();

    expect(coreMock.setFailed).toHaveBeenCalledWith(
      'An unexpected error occurred',
    );
  });

  it('should not read logs when log-file state exists but file missing', async () => {
    setupDefaultInputs();
    execMock.exec.mockResolvedValueOnce(0);
    execMock.exec.mockRejectedValue(new Error('fail'));
    coreMock.getState.mockImplementation((name: string) => {
      if (name === 'log-file') return '/tmp/litellm-proxy.log';
      return '';
    });
    fsMock.existsSync.mockReturnValue(false);

    await run();

    expect(coreMock.setFailed).toHaveBeenCalledWith('fail');
    expect(fsMock.readFileSync).not.toHaveBeenCalled();
  });

  describe('caching', () => {
    it('should attempt cache restore by default', async () => {
      setupDefaultInputs();

      await run();

      expect(cacheMod.restoreLitellmCache).toHaveBeenCalledWith('', '');
    });

    it('should skip install and save when cache is hit', async () => {
      cacheMod.restoreLitellmCache.mockResolvedValue(true);
      setupDefaultInputs();

      await run();

      // Should not install uv or litellm
      expect(execMock.exec).not.toHaveBeenCalledWith(
        'uv',
        expect.arrayContaining(['--version']),
        expect.anything(),
      );
      expect(execMock.exec).not.toHaveBeenCalledWith(
        'uv',
        expect.arrayContaining(['tool', 'install']),
      );
      // Should not save cache (already cached)
      expect(cacheMod.saveLitellmCache).not.toHaveBeenCalled();
      // Should still add bin dir to PATH
      expect(coreMock.addPath).toHaveBeenCalledWith('/home/runner/.local/bin');
      // Should still spawn litellm
      expect(spawnMock).toHaveBeenCalled();
    });

    it('should install and save cache on cache miss', async () => {
      cacheMod.restoreLitellmCache.mockResolvedValue(false);
      setupDefaultInputs({ version: '1.55.0' });

      await run();

      expect(execMock.exec).toHaveBeenCalledWith('uv', [
        'tool',
        'install',
        'litellm[proxy]==1.55.0',
      ]);
      expect(cacheMod.saveLitellmCache).toHaveBeenCalledWith('1.55.0', '');
    });

    it('should pass version and pip-install-args to cache functions', async () => {
      setupDefaultInputs({
        version: '1.55.0',
        'pip-install-args': '--extra foo',
      });

      await run();

      expect(cacheMod.restoreLitellmCache).toHaveBeenCalledWith(
        '1.55.0',
        '--extra foo',
      );
      expect(cacheMod.saveLitellmCache).toHaveBeenCalledWith(
        '1.55.0',
        '--extra foo',
      );
    });

    it('should skip caching when cache input is "false"', async () => {
      setupDefaultInputs({ cache: 'false' });

      await run();

      expect(cacheMod.restoreLitellmCache).not.toHaveBeenCalled();
      expect(cacheMod.saveLitellmCache).not.toHaveBeenCalled();
      // Should still install normally
      expect(execMock.exec).toHaveBeenCalledWith('uv', [
        'tool',
        'install',
        'litellm[proxy]',
      ]);
    });
  });
});
