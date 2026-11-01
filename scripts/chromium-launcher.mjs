// Запуск headless Chromium из npm-пакета @sparticuz/chromium (бинарник внутри пакета,
// системные .so — из прилагаемого al2023.tar.br). Нужен только для автотестов.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(root, 'node_modules', '.cache', 'bard-chromium');

function ensureChromium() {
  const marker = path.join(CACHE, 'chromium');
  if (fs.existsSync(marker)) {
    return CACHE;
  }
  const binDir = path.join(root, 'node_modules', '@sparticuz', 'chromium', 'bin');
  if (!fs.existsSync(binDir)) {
    throw new Error('@sparticuz/chromium не установлен. Выполните: npm install');
  }
  fs.mkdirSync(CACHE, { recursive: true });
  for (const f of ['al2023.tar.br', 'chromium.br', 'swiftshader.tar.br', 'fonts.tar.br']) {
    const raw = zlib.brotliDecompressSync(fs.readFileSync(path.join(binDir, f)));
    fs.writeFileSync(path.join(CACHE, f.replace(/\.br$/, '')), raw);
  }
  for (const tar of ['al2023.tar', 'swiftshader.tar', 'fonts.tar']) {
    execFileSync('tar', ['xf', path.join(CACHE, tar)], { cwd: CACHE });
  }
  return CACHE;
}

export function chromiumEnv() {
  const dir = ensureChromium();
  const exe = path.join(dir, 'chromium');
  if (!fs.existsSync(exe)) {
    throw new Error('chromium binary not found in ' + dir);
  }
  fs.chmodSync(exe, 0o755);
  const libDir = path.join(dir, 'lib');
  const env = { ...process.env };
  env.LD_LIBRARY_PATH = [libDir, dir, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  if (fs.existsSync(path.join(dir, 'fonts.conf'))) {
    env.FONTCONFIG_FILE = path.join(dir, 'fonts.conf');
  }
  if (fs.existsSync(path.join(dir, 'fonts'))) {
    env.FONTCONFIG_PATH = path.join(dir, 'fonts');
  }
  return { exe, env, dir };
}

export const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  '--font-render-hinting=none',
];
