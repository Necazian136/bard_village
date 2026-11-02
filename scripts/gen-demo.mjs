// Генерация демо-файла public/demo.mid: мелодия (тромбон) + аккомпанемент (фортепиано)
// Запуск: node scripts/gen-demo.mjs
import pkg from '@tonejs/midi';
const { Midi } = pkg;
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const midi = new Midi();
midi.name = 'Bard Village Demo';
midi.header.setTempo(120);

// --- Дорожка игрока: тромбон (канал 0, инструмент 57) ---
const lead = midi.addTrack();
lead.channel = 0;
lead.instrument.number = 57; // Trombone
lead.instrument.name = 'Trombone';

// [time(сек), midi или массив для аккорда, duration(сек)]
const melody = [
  [0.0, 60, 0.5], [0.5, 62, 0.5], [1.0, 64, 0.5], [1.5, 65, 0.5],
  [2.0, 67, 1.0], [3.0, 65, 0.5], [3.5, 64, 0.5],
  [4.0, [60, 64, 67], 1.0], [5.0, 69, 1.0],
  [6.0, [62, 65, 69], 1.0], [7.0, 71, 0.5], [7.5, 72, 0.5],
  [8.0, 74, 0.5], [8.5, 72, 0.5], [9.0, 71, 0.5], [9.5, 69, 0.5],
  [10.0, [67, 71, 74], 1.0], [11.0, 72, 1.0],
  [12.0, 74, 0.5], [12.5, 76, 0.5], [13.0, 77, 1.0], [14.0, 76, 1.0],
  [15.0, [60, 64, 67, 72], 2.0], // большой аккорд — жми 4 клавиши!
  [17.0, 72, 1.0], [18.0, 67, 2.0],
];
for (const [time, note, duration] of melody) {
  const midis = Array.isArray(note) ? note : [note];
  for (const m of midis) {
    lead.addNote({ midi: m, time, duration, velocity: 0.85 });
  }
}

// --- Аккомпанемент: фортепиано (канал 1) ---
const piano = midi.addTrack();
piano.channel = 1;
piano.instrument.number = 0; // Acoustic Grand Piano
piano.instrument.name = 'Piano';

const chords = [
  [0, [48, 55, 60]], // C
  [2, [45, 52, 57]], // Am
  [4, [41, 48, 53]], // F
  [6, [43, 50, 55]], // G
  [8, [48, 55, 60]], // C
  [10, [45, 52, 57]], // Am
  [12, [41, 48, 53]], // F
  [14, [43, 50, 55]], // G
  [16, [48, 55, 60]], // C
  [18, [48, 55, 60]], // C
];
for (const [time, notes] of chords) {
  for (const m of notes) {
    piano.addNote({ midi: m, time, duration: 2.0, velocity: 0.5 });
  }
}

const out = path.join(root, 'public', 'demo.mid');
fs.writeFileSync(out, Buffer.from(midi.toArray()));
console.log('written', out, fs.statSync(out).size, 'bytes');
