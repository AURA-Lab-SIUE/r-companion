// Update check.
//
// Marketplace and Open VSX installs are updated by VS Code itself, so this extension makes no
// network call for them. A copy installed from a .vsix file is invisible to that mechanism, so
// for those only, and only when auraR.updates.releaseUrl is set, it asks the GitHub releases
// API for the latest tag. No other network calls, no telemetry.

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { compareVersions } from './profiles';

export type InstallSource = 'gallery' | 'vsix' | 'development' | 'unknown';

/**
 * How this copy was installed. VS Code records it in extensions.json in the extensions folder
 * (metadata.source is "gallery" or "vsix"). Read-only, and "unknown" when the file is absent,
 * for example in a codespace's remote extension host.
 */
export function installSource(ctx: { extensionPath: string; extensionMode: number; extension?: { id: string } }): InstallSource {
  // ExtensionMode.Development = 2, Test = 3
  if (ctx.extensionMode === 2 || ctx.extensionMode === 3) return 'development';
  try {
    const file = path.join(path.dirname(ctx.extensionPath), 'extensions.json');
    const entries = JSON.parse(fs.readFileSync(file, 'utf8')) as any[];
    const mine = entries.find(
      (e) => path.resolve(e?.location?.fsPath ?? e?.location?.path ?? '') === path.resolve(ctx.extensionPath) ||
        e?.relativeLocation === path.basename(ctx.extensionPath),
    );
    const src = mine?.metadata?.source;
    if (src === 'gallery') return 'gallery';
    if (src === 'vsix' || src === 'resource') return 'vsix';
    return mine?.metadata?.id ? 'gallery' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface UpdateInfo {
  latest: string;
  newer: boolean;
  page?: string;
}

export function parseRelease(json: any, current: string): UpdateInfo {
  const tag = String(json?.tag_name ?? '').replace(/^v/, '');
  if (!tag) throw new Error('the release address did not return a version tag');
  return { latest: tag, newer: compareVersions(tag, current) > 0, page: json?.html_url };
}

export function checkForUpdate(url: string, current: string): Promise<UpdateInfo> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'aura-lab-r-companion', Accept: 'application/vnd.github+json' }, timeout: 10000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          try {
            resolve(parseRelease(JSON.parse(body), current));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}
