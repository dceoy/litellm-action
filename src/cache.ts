import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';

export function getCachePaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.local', 'share', 'uv'),
    path.join(home, '.local', 'bin'),
  ];
}

export function getCacheKey(version: string, pipInstallArgs: string): string {
  const platform = os.platform();
  const arch = os.arch();
  const versionPart = version || 'latest';
  const hash = crypto
    .createHash('sha256')
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
    core.info(`Cache key: ${primaryKey}`);
    const matchedKey = await cache.restoreCache(paths, primaryKey);
    if (matchedKey) {
      core.info(`Cache restored from key: ${matchedKey}`);
      return true;
    }
    core.info('Cache not found');
    return false;
  } catch (error) {
    core.warning(
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
    await cache.saveCache(paths, key);
    core.info(`Cache saved with key: ${key}`);
  } catch (error) {
    core.warning(
      `Failed to save cache: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
