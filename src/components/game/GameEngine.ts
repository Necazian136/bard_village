/**
 * GameEngine — чистая (без Pixi/Tone) логика игры в стиле Trombone Champ.
 *
 * Ноты midi раскладываются в «события»: все ноты, звучащие в один момент
 * времени, объединяются в один аккорд (NoteEvent). По оси X — время (мс),
 * по оси Y — высота ноты (midi-число, аккорд отмеряется по самой низкой ноте).
 *
 * Игрок двигает курсор по оси Y (его высота = pitch) и нажимает любые клавиши
 * («blow»/клик). Чтобы сыграть аккорд из N нот, нужно нажать N клавиш в окне
 * попадания. Сыгранный аккорд всегда сдвигается на offset = pitch игрока −
 * самая низкая нота аккорда: игрок звучит не «как в midi», а на своей высоте.
 *
 * Класс не зависит от рендера и звука, поэтому его можно переиспользовать
 * для мультиплеера: по сети летают только события blow и результаты судейства.
 */

export interface GameNoteInput {
    midi: number;
    /** время начала в секундах (как в @tonejs/midi) */
    time: number;
    /** длительность в секундах */
    duration: number;
    velocity: number;
}

export interface GameNote {
    midi: number;
    timeMs: number;
    durationMs: number;
    velocity: number;
    name: string;
}

export interface NoteEvent {
    id: number;
    /** время начала события (аккорда) в мс */
    timeMs: number;
    notes: GameNote[];
    /** самая низкая нота аккорда — по ней отмеряется высота события */
    baseMidi: number;
    judged: boolean;
    result: EventResult | null;
}

export interface Blow {
    timeMs: number;
    /** высота (midi), на которой стоял игрок в момент нажатия */
    pitch: number;
    consumed: boolean;
}

export type Judgment = 'PERFECT' | 'GOOD' | 'NASTY' | 'MISS';

export interface SoundNote {
    /** нота, которую надо сыграть (уже сдвинута на offset игрока) */
    midi: number;
    name: string;
    durationMs: number;
    velocity: number;
    /** исходная нота из midi (чтобы выбрать сэмплер барабана и т.п.) */
    origMidi: number;
}

export interface EventResult {
    eventId: number;
    timeMs: number;
    baseMidi: number;
    /** сколько клавиш нажато в окне попадания */
    blowCount: number;
    /** сколько нот аккорда покрыто нажатиями (не больше числа нот) */
    hitCount: number;
    noteCount: number;
    /** сдвиг всех нот аккорда относительно исходного = pitch игрока − baseMidi */
    offset: number;
    judgment: Judgment;
    points: number;
    /** ноты, которые прозвучат (пусто при MISS) */
    soundNotes: SoundNote[];
    score: number;
    combo: number;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToName(midi: number): string {
    const m = clampMidi(midi);
    return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}

export function clampMidi(midi: number): number {
    return Math.max(0, Math.min(127, Math.round(midi)));
}

export class GameEngine {
    events: NoteEvent[] = [];
    blows: Blow[] = [];

    /** окно попадания вокруг времени события, мс */
    hitWindowMs = 180;

    score = 0;
    combo = 0;
    maxCombo = 0;
    /** сколько отдельных нот было «покрыто» нажатиями */
    hitNotes = 0;
    totalNotes = 0;
    judgedCount = 0;

    private nextEventId = 0;

    constructor(notes: GameNoteInput[] = []) {
        this.setNotes(notes);
    }

    /** Разложить ноты по событиям (аккордам) и отсортировать по времени. */
    setNotes(notes: GameNoteInput[]): void {
        const byTime = new Map<number, GameNote[]>();
        for (const n of notes) {
            const timeMs = Math.round(n.time * 1000);
            if (!byTime.has(timeMs)) {
                byTime.set(timeMs, []);
            }
            byTime.get(timeMs)!.push({
                midi: clampMidi(n.midi),
                timeMs,
                durationMs: Math.max(30, Math.round(n.duration * 1000)),
                velocity: n.velocity,
                name: midiToName(n.midi),
            });
        }
        this.events = [];
        this.nextEventId = 0;
        for (const [timeMs, eventNotes] of byTime) {
            eventNotes.sort((a, b) => a.midi - b.midi);
            const baseMidi = eventNotes[0].midi; // самая низкая нота аккорда
            this.events.push({
                id: this.nextEventId++,
                timeMs,
                notes: eventNotes,
                baseMidi,
                judged: false,
                result: null,
            });
        }
        this.events.sort((a, b) => a.timeMs - b.timeMs);
        this.totalNotes = this.events.reduce((sum, e) => sum + e.notes.length, 0);
        this.blows = [];
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.hitNotes = 0;
        this.judgedCount = 0;
    }

    /** Длительность всей песни, мс (последняя нота + её хвост). */
    get durationMs(): number {
        let max = 0;
        for (const e of this.events) {
            for (const n of e.notes) {
                max = Math.max(max, e.timeMs + n.durationMs);
            }
        }
        return max;
    }

    /** Диапазон высот нот [min, max] — чтобы разложить их по вертикали. */
    getPitchRange(pad = 6): [number, number] {
        if (this.events.length === 0) {
            return [48, 72];
        }
        let min = 127;
        let max = 0;
        for (const e of this.events) {
            for (const n of e.notes) {
                min = Math.min(min, n.midi);
                max = Math.max(max, n.midi);
            }
        }
        return [clampMidi(min - pad), clampMidi(max + pad)];
    }

    /**
     * Нажатие любой клавиши. Возвращает true, если рядом есть событие
     * (тогда нажатие пойдет на ноту, а не на «свободную игру»).
     */
    addBlow(timeMs: number, pitch: number): boolean {
        this.blows.push({ timeMs, pitch: clampMidi(pitch), consumed: false });
        // подчищаем старые нажатия, чтобы массив не рос
        const cutoff = timeMs - this.hitWindowMs * 4;
        while (this.blows.length > 0 && this.blows[0].timeMs < cutoff) {
            this.blows.shift();
        }
        return this.eventNear(timeMs) !== null;
    }

    /** Ближайшее к timeMs несудимое событие в пределах окна попадания. */
    eventNear(timeMs: number): NoteEvent | null {
        for (const e of this.events) {
            if (e.judged) continue;
            if (e.timeMs > timeMs + this.hitWindowMs) break;
            if (Math.abs(e.timeMs - timeMs) <= this.hitWindowMs) return e;
        }
        return null;
    }

    /**
     * Продвинуть время. Возвращает результаты всех событий, время которых
     * (плюс окно попадания) уже наступило.
     */
    update(nowMs: number): EventResult[] {
        const results: EventResult[] = [];
        for (const e of this.events) {
            if (e.judged) continue;
            if (nowMs < e.timeMs + this.hitWindowMs) break; // события отсортированы
            results.push(this.judge(e));
        }
        return results;
    }

    private judge(event: NoteEvent): EventResult {
        event.judged = true;
        this.judgedCount++;

        const inWindow = this.blows.filter(
            (b) => !b.consumed && Math.abs(b.timeMs - event.timeMs) <= this.hitWindowMs
        );
        const blowCount = inWindow.length;
        // аккорд из N нот требует N нажатий: каждое нажатие покрывает одну ноту
        const hitCount = Math.min(blowCount, event.notes.length);

        let offset = 0;
        if (blowCount > 0) {
            // высота игрока — по нажатию, ближайшему ко времени события
            let best = inWindow[0];
            for (const b of inWindow) {
                if (Math.abs(b.timeMs - event.timeMs) < Math.abs(best.timeMs - event.timeMs)) {
                    best = b;
                }
            }
            offset = best.pitch - event.baseMidi;
            for (const b of inWindow) {
                b.consumed = true;
            }
        }

        let judgment: Judgment;
        let points = 0;
        if (blowCount === 0) {
            judgment = 'MISS';
            this.combo = 0;
        } else {
            const a = Math.abs(offset);
            judgment = a === 0 ? 'PERFECT' : a <= 2 ? 'GOOD' : 'NASTY';
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.hitNotes += hitCount;
            const fullness = event.notes.length > 0 ? hitCount / event.notes.length : 1;
            const base = judgment === 'PERFECT' ? 100 : judgment === 'GOOD' ? 60 : 30;
            points = Math.round(base * fullness);
            this.score += points;
        }

        // ВАЖНО: звучат ВСЕ ноты события, каждая сдвинута на offset игрока.
        // Даже «непопавшие» ноты аккорда сдвигаются на соответствующее значение.
        const soundNotes: SoundNote[] =
            blowCount > 0
                ? event.notes.map((n) => {
                      const midi = clampMidi(n.midi + offset);
                      return {
                          midi,
                          name: midiToName(midi),
                          durationMs: n.durationMs,
                          velocity: n.velocity,
                          origMidi: n.midi,
                      };
                  })
                : [];

        const result: EventResult = {
            eventId: event.id,
            timeMs: event.timeMs,
            baseMidi: event.baseMidi,
            blowCount,
            hitCount,
            noteCount: event.notes.length,
            offset,
            judgment,
            points,
            soundNotes,
            score: this.score,
            combo: this.combo,
        };
        event.result = result;
        return result;
    }
}
