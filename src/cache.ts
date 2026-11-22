import {
  restoreCache as cacheRestoreCache,
  saveCache as cacheSaveCache,
} from '@actions/cache';
import { info as coreInfo, warning as coreWarning } from '@actions/core';
import { createHash as cryptoCreateHash } from 'crypto';
import {
  arch as osArch,
  homedir as osHomedir,
  platform as osPlatform,
} from 'os';
import { join as pathJoin } from 'path';

export function getCachePaths(): string[] {
  const home = osHomedir();
  return [
    pathJoin(home, '.local', 'share', 'uv'),
    pathJoin(home, '.local', 'bin'),
  ];
}

export function getCacheKey(version: string, pipInstallArgs: string): string {
  const platform = osPlatform();
  const arch = osArch();
  const versionPart = version;
  const hash = cryptoCreateHash('sha256')
    .update(pipInstallArgs)
    .digest('hex')
    .slice(0, 16);
  return `litellm-${platform}-${arch}-${versionPart}-${hash}`;
}

export async function restoreLitellmCache(
  version: string,
  pipInstallArgs: string,
): Promise<boolean> {
  try {
    const primaryKey = getCacheKey(version, pipInstallArgs);
    const paths = getCachePaths();
    coreInfo(`Cache key: ${primaryKey}`);
    const matchedKey = await cacheRestoreCache(paths, primaryKey);
    if (matchedKey) {
      coreInfo(`Cache restored from key: ${matchedKey}`);
      return true;
    }
    coreInfo('Cache not found');
    return false;
  } catch (error) {
    coreWarning(
      `Failed to restore cache: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

export async function saveLitellmCache(
  version: string,
  pipInstallArgs: string,
): Promise<void> {
  try {
    const key = getCacheKey(version, pipInstallArgs);
    const paths = getCachePaths();
    await cacheSaveCache(paths, key);
    coreInfo(`Cache saved with key: ${key}`);
  } catch (error) {
    coreWarning(
      `Failed to save cache: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
