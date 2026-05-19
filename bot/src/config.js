import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '..', 'bot-config.json');

const REGISTRY_KEY = '\\Software\\CosmoArtsStore\\Stargazer';
const REGISTRY_VALUE = 'InstallLocation';

function readJsonConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function writeJsonConfig(patch) {
  const current = readJsonConfig();
  const next = { ...current, ...patch };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function readRegistryInstallLocation() {
  if (process.platform !== 'win32') return null;
  const { default: Winreg } = await import('winreg');
  const reg = new Winreg({ hive: Winreg.HKCU, key: REGISTRY_KEY });
  return new Promise((resolve) => {
    reg.get(REGISTRY_VALUE, (err, item) => {
      if (err || !item) return resolve(null);
      resolve(item.value);
    });
  });
}

function fallbackLocalAppData() {
  const base = process.env.LOCALAPPDATA
    ?? path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'CosmoArtsStore', 'Stargazer');
}

/**
 * Resolve the Stargazer DB file path with priority:
 *   1. STARGAZER_DB_PATH env var
 *   2. bot-config.json `dbPath`
 *   3. Registry InstallLocation + \Data\db\stargazer.db
 *   4. %LOCALAPPDATA%\CosmoArtsStore\Stargazer\Data\db\stargazer.db
 */
export async function resolveDbPath() {
  if (process.env.STARGAZER_DB_PATH) {
    return { path: process.env.STARGAZER_DB_PATH, source: 'env' };
  }
  const conf = readJsonConfig();
  if (conf.dbPath) return { path: conf.dbPath, source: 'config' };

  const installLocation = await readRegistryInstallLocation();
  if (installLocation) {
    return {
      path: path.join(installLocation, 'Data', 'db', 'stargazer.db'),
      source: 'registry',
    };
  }
  return {
    path: path.join(fallbackLocalAppData(), 'Data', 'db', 'stargazer.db'),
    source: 'fallback',
  };
}

export function saveDbPathOverride(dbPath) {
  return writeJsonConfig({ dbPath });
}

export function clearDbPathOverride() {
  const current = readJsonConfig();
  delete current.dbPath;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
}

export function getConfig() {
  return readJsonConfig();
}

export function setConfig(patch) {
  return writeJsonConfig(patch);
}
