jest.mock('@actions/cache');
jest.mock('@actions/core');
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: jest.fn(),
  platform: jest.fn(),
  arch: jest.fn(),
}));

import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as os from 'os';

const cacheMock = cache as jest.Mocked<typeof cache>;
const coreMock = core as jest.Mocked<typeof core>;
const osMock = {
  homedir: os.homedir as jest.Mock,
  platform: os.platform as jest.Mock,
  arch: os.arch as jest.Mock,
};

import {
  getCachePaths,
  getCacheKey,
  restoreLitellmCache,
  saveLitellmCache,
} from '../cache';

describe('cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    osMock.homedir.mockReturnValue('/home/runner');
    osMock.platform.mockReturnValue('linux');
    osMock.arch.mockReturnValue('x64');
  });

  describe('getCachePaths', () => {
    it('should return uv tools and bin directories', () => {
      const paths = getCachePaths();

      expect(paths).toEqual([
        '/home/runner/.local/share/uv',
        '/home/runner/.local/bin',
      ]);
    });

    it('should use platform-specific home directory', () => {
      osMock.homedir.mockReturnValue('C:\\Users\\runner');

      const paths = getCachePaths();

      expect(paths[0]).toContain('C:\\Users\\runner');
      expect(paths[1]).toContain('C:\\Users\\runner');
    });
  });

  describe('getCacheKey', () => {
    it('should include platform, arch, version, and args hash', () => {
      const key = getCacheKey('1.55.0', '');

      expect(key).toMatch(/^litellm-linux-x64-1\.55\.0-[a-f0-9]{16}$/);
    });

    it('should use "latest" when version is empty', () => {
      const key = getCacheKey('', '');

      expect(key).toMatch(/^litellm-linux-x64-latest-[a-f0-9]{16}$/);
    });

    it('should produce different keys for different pip-install-args', () => {
      const key1 = getCacheKey('1.55.0', '');
      const key2 = getCacheKey('1.55.0', '--extra-pkg foo');

      expect(key1).not.toEqual(key2);
    });

    it('should produce different keys for different platforms', () => {
      const key1 = getCacheKey('1.55.0', '');

      osMock.platform.mockReturnValue('win32');
      const key2 = getCacheKey('1.55.0', '');

      expect(key1).not.toEqual(key2);
    });

    it('should produce different keys for different architectures', () => {
      const key1 = getCacheKey('1.55.0', '');

      osMock.arch.mockReturnValue('arm64');
      const key2 = getCacheKey('1.55.0', '');

      expect(key1).not.toEqual(key2);
    });
  });

  describe('restoreLitellmCache', () => {
    it('should return true on cache hit', async () => {
      cacheMock.restoreCache.mockResolvedValue('litellm-linux-x64-1.55.0-abc');

      const result = await restoreLitellmCache('1.55.0', '');

      expect(result).toBe(true);
      expect(coreMock.info).toHaveBeenCalledWith(
        expect.stringContaining('Cache restored'),
      );
    });

    it('should return false on cache miss', async () => {
      cacheMock.restoreCache.mockResolvedValue(undefined);

      const result = await restoreLitellmCache('1.55.0', '');

      expect(result).toBe(false);
      expect(coreMock.info).toHaveBeenCalledWith('Cache not found');
    });

    it('should return false and warn on error', async () => {
      cacheMock.restoreCache.mockRejectedValue(new Error('network error'));

      const result = await restoreLitellmCache('1.55.0', '');

      expect(result).toBe(false);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining('network error'),
      );
    });

    it('should handle non-Error thrown values', async () => {
      cacheMock.restoreCache.mockRejectedValue('string error');

      const result = await restoreLitellmCache('1.55.0', '');

      expect(result).toBe(false);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining('string error'),
      );
    });

    it('should pass correct paths and key to restoreCache', async () => {
      cacheMock.restoreCache.mockResolvedValue(undefined);

      await restoreLitellmCache('1.55.0', '');

      expect(cacheMock.restoreCache).toHaveBeenCalledWith(
        ['/home/runner/.local/share/uv', '/home/runner/.local/bin'],
        expect.stringContaining('litellm-linux-x64-1.55.0-'),
      );
    });

    it('should log the cache key', async () => {
      cacheMock.restoreCache.mockResolvedValue(undefined);

      await restoreLitellmCache('1.55.0', '');

      expect(coreMock.info).toHaveBeenCalledWith(
        expect.stringMatching(/^Cache key: litellm-linux-x64-1\.55\.0-/),
      );
    });
  });

  describe('saveLitellmCache', () => {
    it('should save cache with correct key and paths', async () => {
      cacheMock.saveCache.mockResolvedValue(123);

      await saveLitellmCache('1.55.0', '');

      expect(cacheMock.saveCache).toHaveBeenCalledWith(
        ['/home/runner/.local/share/uv', '/home/runner/.local/bin'],
        expect.stringContaining('litellm-linux-x64-1.55.0-'),
      );
      expect(coreMock.info).toHaveBeenCalledWith(
        expect.stringContaining('Cache saved'),
      );
    });

    it('should warn on save error without failing', async () => {
      cacheMock.saveCache.mockRejectedValue(new Error('quota exceeded'));

      await saveLitellmCache('1.55.0', '');

      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining('quota exceeded'),
      );
    });

    it('should handle non-Error thrown values on save', async () => {
      cacheMock.saveCache.mockRejectedValue('save failed');

      await saveLitellmCache('1.55.0', '');

      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining('save failed'),
      );
    });
  });
});
