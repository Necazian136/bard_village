// Юнит-тест чистой логики GameEngine: node scripts/test-engine.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = path.join(root, 'node_modules', '.cache', 'engine-test.mjs');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
execFileSync(path.join(root, 'node_modules', '.bin', 'esbuild'), [
  path.join(root, 'src/components/game/GameEngine.ts'),
  '--bundle', '--format=esm', '--outfile=' + tmp,
]);
const { GameEngine, midiToName, clampMidi } = await import(tmp);

let failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log('ok  -', msg); }
  else { failed++; console.error('FAIL-', msg, '\n  expected', e, '\n  actual  ', a); }
}

// --- группировка в события/аккорды ---
const notes = [
  { midi: 60, time: 0.0, duration: 0.5, velocity: 0.8 },
  { midi: 64, time: 0.0, duration: 0.5, velocity: 0.8 }, // аккорд с первой нотой
  { midi: 67, time: 1.0, duration: 1.0, velocity: 0.9 },
  { midi: 62, time: 2.0, duration: 0.5, velocity: 0.7 },
  { midi: 65, time: 2.0, duration: 0.5, velocity: 0.7 },
  { midi: 69, time: 2.0, duration: 0.5, velocity: 0.7 }, // трезвучие
];
const eng = new GameEngine(notes);
eq(eng.events.length, 3, '3 события (аккорда) из 6 нот');
eq(eng.events[0].baseMidi, 60, 'base аккорда = самая низкая нота (60)');
eq(eng.events[2].notes.map(n => n.midi), [62, 65, 69], 'ноты аккорда отсортированы');
eq(eng.durationMs, 2500, 'durationMs = последняя нота (2.0с) + длительность (0.5с)');
eq(eng.getPitchRange(6), [54, 75], 'диапазон высот с паддингом');
eq(midiToName(60), 'C4', 'midiToName(60) = C4');
eq(clampMidi(130), 127, 'clampMidi сверху');
eq(clampMidi(-3), 0, 'clampMidi снизу');

// --- попадание: нажал вовремя на той же высоте ---
eng.addBlow(0, 60);            // PERFECT по первой ноте... но событие — аккорд из 2 нот
let res = eng.update(0 + eng.hitWindowMs + 1);
eq(res.length, 1, 'одно событие засуджено');
eq(res[0].judgment, 'PERFECT', 'offset 0 -> PERFECT');
eq(res[0].hitCount, 1, 'одно нажатие покрывает 1 ноту из 2');
eq(res[0].soundNotes.map(s => s.midi), [60, 64], 'звучат все ноты аккорда, сдвиг 0');
eq(eng.score, 50, '50 очков за половину аккорда (100 * 1/2)');

// --- аккорд: нажал 3 клавиши, но выше на 2 полутона -> GOOD, весь аккорд сдвинут ---
eng.addBlow(1000, 69); eng.addBlow(1005, 69); eng.addBlow(1010, 69); // wait, event at 1000 is single note 67
res = eng.update(1000 + eng.hitWindowMs + 1);
eq(res.length, 1, 'второе событие засуджено');
eq(res[0].offset, 2, 'offset = 69 - 67 = 2');
eq(res[0].judgment, 'GOOD', '|offset|<=2 -> GOOD');
eq(res[0].soundNotes.map(s => s.midi), [69], 'нота сдвинута на offset: 67+2=69');

// --- трезвучие: 3 нажатия на 5 полутонов ниже -> NASTY, все 3 ноты сдвинуты ---
eng.addBlow(2000, 57); eng.addBlow(2002, 57); eng.addBlow(2004, 57);
res = eng.update(2000 + eng.hitWindowMs + 1);
eq(res.length, 1, 'третье событие засуджено');
eq(res[0].noteCount, 3, 'в аккорде 3 ноты');
eq(res[0].hitCount, 3, '3 нажатия покрывают все 3 ноты');
eq(res[0].judgment, 'NASTY', '|offset|=5 -> NASTY');
eq(res[0].offset, -5, 'offset = 57 - 62 = -5');
eq(res[0].soundNotes.map(s => s.midi), [57, 60, 64], 'КАЖДАЯ нота аккорда сдвинута на -5: 62,65,69 -> 57,60,64');
eq(res[0].points, 30, 'NASTY полностью = 30 очков');
eq(eng.combo, 3, 'комбо растет');

// --- MISS: не нажал ---
const eng2 = new GameEngine([{ midi: 60, time: 5.0, duration: 0.5, velocity: 1 }]);
const r2 = eng2.update(5000 + eng2.hitWindowMs + 1);
eq(r2[0].judgment, 'MISS', 'без нажатия = MISS');
eq(r2[0].soundNotes.length, 0, 'при MISS ничего не звучит');
eq(eng2.score, 0, 'очков нет');
eq(eng2.combo, 0, 'комбо сброшено');

// --- окно попадания: нажатие чуть раньше тоже засчитывается ---
const eng3 = new GameEngine([{ midi: 60, time: 1.0, duration: 0.5, velocity: 1 }]);
eng3.addBlow(1000 - 150, 60); // за 150мс до ноты, окно 180мс
const r3 = eng3.update(1000 + 181);
eq(r3[0].judgment, 'PERFECT', 'нажатие в пределах окна засчитано');

// --- нажатие сильно раньше — не засчитывается ---
const eng4 = new GameEngine([{ midi: 60, time: 1.0, duration: 0.5, velocity: 1 }]);
eng4.addBlow(1000 - 500, 60);
const r4 = eng4.update(1000 + 181);
eq(r4[0].judgment, 'MISS', 'нажатие вне окна не засчитано');

// --- addBlow возвращает, есть ли рядом событие (для свободной игры) ---
const eng5 = new GameEngine([{ midi: 60, time: 1.0, duration: 0.5, velocity: 1 }]);
eq(eng5.addBlow(1000, 60), true, 'событие рядом -> true');
eq(eng5.addBlow(5000, 60), false, 'событий рядом нет -> false');

// --- кламп сдвинутых нот ---
const eng6 = new GameEngine([{ midi: 126, time: 0, duration: 0.5, velocity: 1 }]);
eng6.addBlow(0, 127); // offset +1 -> 127 ok; +больше зажмётся в 127
const r6 = eng6.update(181);
eq(r6[0].soundNotes[0].midi, 127, 'сдвинутая нота зажата в 127');

console.log(failed === 0 ? '\nALL TESTS PASSED' : `\n${failed} TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
