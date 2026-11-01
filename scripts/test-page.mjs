// Автотест: главная страница открывается без ошибок в консоли, а игра запускается.
// Делает production-сборку, поднимает статический сервер и гоняет её в headless Chromium.
//
// Запуск: npm run test:page
// Скриншоты: artifacts/*.png
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumEnv, CHROMIUM_ARGS } from './chromium-launcher.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function serveDist(port) {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.join(dist, path.normalize(urlPath));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('== сборка ==');
  execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'pipe' });
  console.log('build ok');

  const port = 4173 + Math.floor(Math.random() * 500);
  const server = await serveDist(port);
  const base = `http://127.0.0.1:${port}`;
  console.log('== сервер ==', base);

  const { exe, env } = chromiumEnv();
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    executablePath: exe,
    headless: true,
    env,
    args: CHROMIUM_ARGS,
    defaultViewport: { width: 1280, height: 900 },
  });

  const consoleErrors = [];
  const pageErrors = [];
  const failedReqs = [];
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('requestfailed', (r) => failedReqs.push(`${r.url()} (${r.failure()?.errorText})`));

    // --- 1. главная страница открывается ---
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#app .page', { timeout: 15000 });
    await sleep(1500);
    check('страница монтируется (Vue app)', true);
    check('кнопки загрузки видны', await page.evaluate(() =>
      [...document.querySelectorAll('button')].some((b) => /Загрузить \.mid/.test(b.textContent)) &&
      [...document.querySelectorAll('button')].some((b) => /Демо/.test(b.textContent))));
    check('игровое поле (canvas) создано', await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return !!c && c.width > 0 && c.height > 0;
    }));
    await page.screenshot({ path: path.join(artifacts, '01-page-load.png') });
    check('нет ошибок в консоли после загрузки', consoleErrors.length === 0 && pageErrors.length === 0,
      [...consoleErrors, ...pageErrors].slice(0, 3).join(' | '));

    // --- 2. загружаем демо-песню ---
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Демо/.test(b.textContent)).click());
    await page.waitForFunction(() => document.querySelectorAll('select option').length > 0, { timeout: 30000 });
    await page.waitForFunction(() => {
      const b = window.__bard;
      return b && b.session.engine && b.session.engine.events.length > 0 && Object.keys(b.session.samplers || {}).length > 0;
    }, { timeout: 30000 });
    await sleep(1000);
    const loaded = await page.evaluate(() => ({
      events: window.__bard.session.engine.events.length,
      views: window.__bard.session.field.views.length,
      samplers: Object.keys(window.__bard.session.samplers).length,
      tracks: document.querySelectorAll('select option').length,
    }));
    check('демо-midi распарсено, ноты разложены на поле', loaded.events > 0 && loaded.views > 0,
      `событий: ${loaded.events}, нот на поле: ${loaded.views}, дорожек: ${loaded.tracks}`);
    check('сэмплеры инструментов загружены', loaded.samplers > 0, `каналов: ${loaded.samplers}`);
    await page.screenshot({ path: path.join(artifacts, '02-demo-loaded.png') });

    // --- 3. начинаем играть и жмём клавиши ---
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Играть/.test(b.textContent)).click());
    await sleep(400);
    const field = await page.evaluate(() => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 5000) {
      const y = field.y + field.h * (0.25 + 0.5 * Math.abs(Math.sin(i / 2.5)));
      await page.mouse.move(field.x + 110, y);
      await page.keyboard.press('abcdefghij'[i % 10]);
      await sleep(200);
      i++;
    }
    const game = await page.evaluate(() => {
      const eng = window.__bard.session.engine;
      return {
        score: eng.score,
        judged: eng.judgedCount,
        total: eng.events.length,
        nowMs: Math.round(window.__bard.session.field.getNow()),
        accPlayed: window.__bard.session.accompaniment.reduce((s, a) => s + a.ptr, 0),
        domScore: (document.body.innerText.match(/Очки: \d+/) || ['?'])[0],
      };
    });
    check('игра идёт (время поля растёт)', game.nowMs > 3000, `nowMs: ${game.nowMs}`);
    check('ноты судятся, очки начисляются', game.judged > 0 && game.score > 0,
      `засуджено: ${game.judged}/${game.total}, ${game.domScore}`);
    check('аккомпанемент (другие каналы) звучит', game.accPlayed > 0, `нот аккомпанемента: ${game.accPlayed}`);
    await page.screenshot({ path: path.join(artifacts, '03-game-playing.png') });

    check('нет ошибок в консоли за всю сессию',
      consoleErrors.length === 0 && pageErrors.length === 0 && failedReqs.length === 0,
      [...consoleErrors, ...pageErrors, ...failedReqs].slice(0, 5).join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? `\nALL PAGE TESTS PASSED (${results.length})` : `\n${failed.length}/${results.length} PAGE TESTS FAILED`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
