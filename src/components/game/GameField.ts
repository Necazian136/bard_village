/**
 * GameField — PixiJS-поле игры в стиле Trombone Champ.
 *
 * Ось X — время (ноты едут справа налево к жёлтой линии), ось Y — высота
 * ноты (каждая октава отмечена горизонтальной линией и подписана).
 * Курсор игрока — по оси Y от мыши; его высота (midi) — pitch для игры.
 *
 * Отрисовку и ввод держим здесь, а логику судейства — в GameEngine,
 * чтобы потом можно было добавить мультиплеер (несколько игроков/полей).
 */
import * as PIXI from 'pixi.js';
import { clampMidi, midiToName } from './GameEngine';
import type { EventResult, GameNote, NoteEvent } from './GameEngine';

const COLOR = {
    startDot: 0xff4fd8, // розовый кружок начала ноты
    endDot: 0x38c6ff, // синий кружок конца ноты
    activeDot: 0xff4d4d, // нота на линии — красная
    hitDot: 0x7dff6a,
    missDot: 0x6b6f76,
    playLine: 0xffd84d,
    cursor: 0xffffff,
    grid: 0xffffff,
    octaveLabel: 0xffffff,
};

const JUDGMENT_TEXT: Record<string, { text: string; color: number }> = {
    PERFECT: { text: 'PERFECT!', color: 0xffe14d },
    GOOD: { text: 'GOOD!', color: 0x7dff6a },
    NASTY: { text: 'NASTY!', color: 0xff5d5d },
    MISS: { text: 'MISS', color: 0x9aa0a6 },
};

interface NoteView {
    event: NoteEvent;
    note: GameNote;
    y: number;
    bar: PIXI.Graphics;
    startDot: PIXI.Graphics;
    endDot: PIXI.Graphics;
    /** цифра «сколько нот в аккорде» на главной (самой низкой) ноте */
    label: PIXI.Text | null;
}

interface JudgmentAnim {
    text: PIXI.Text;
    ageMs: number;
    ttlMs: number;
}

export class GameField {
    app: PIXI.Application;

    /** скорость прокрутки, пикселей в секунду песни */
    pxPerSec = 300;
    /** x жёлтой линии, куда прилетают ноты */
    lineX = 110;
    top = 48;
    bottom = 52;

    nowMs = 0;
    playing = false;

    events: NoteEvent[] = [];
    minMidi = 48;
    maxMidi = 84;
    durationMs = 1;

    cursorPitch = 60;

    onFrame: (nowMs: number, deltaMs: number) => void = () => {};
    onCursorPitch: (pitch: number) => void = () => {};

    private bgLayer = new PIXI.Container();
    private gridLayer = new PIXI.Container();
    private notesLayer = new PIXI.Container();
    private fxLayer = new PIXI.Container();
    private cursorLayer = new PIXI.Container();

    private views: NoteView[] = [];
    private connectors = new Map<number, { g: PIXI.Graphics; event: NoteEvent }>();
    /**
     * Ленивая загрузка: вместо того чтобы создавать все ноты на сцене сразу,
     * храним события стеком (отсортированы по времени) и берём следующее
     * (pop), только когда оно доехало до правого края экрана.
     */
    private stack: NoteEvent[] = [];
    /** сколько видов нот создано всего (для статистики/тестов) */
    spawnedViews = 0;
    /** сколько видов нот осталось у события на сцене (для удаления коннектора) */
    private eventViewsLeft = new Map<number, number>();

    private cursorY = 0;
    private cursorLine!: PIXI.Graphics;
    private cursorDot!: PIXI.Graphics;
    private cursorLabel!: PIXI.Text;
    private judgmentAnims: JudgmentAnim[] = [];
    private progressBg!: PIXI.Graphics;
    private progressFill!: PIXI.Graphics;

    constructor(ref: HTMLElement) {
        this.app = new PIXI.Application({
            backgroundAlpha: 0,
            resizeTo: ref,
            antialias: true,
        });
        ref.appendChild(this.app.view as unknown as HTMLCanvasElement);

        this.app.stage.addChild(this.bgLayer, this.gridLayer, this.notesLayer, this.fxLayer, this.cursorLayer);

        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;
        this.app.stage.on('pointermove', (e: PIXI.FederatedPointerEvent) => this.onPointerMove(e));

        this.app.renderer.on('resize', () => this.layout());
        this.app.ticker.add(() => this.tick());

        this.initCursor();
        this.initHud();
        this.layout();
    }

    // ---------- настройка песни ----------

    setEvents(events: NoteEvent[], minMidi: number, maxMidi: number): void {
        this.events = events;
        this.minMidi = minMidi;
        this.maxMidi = Math.max(maxMidi, minMidi + 1);
        let max = 0;
        for (const e of events) {
            for (const n of e.notes) {
                max = Math.max(max, e.timeMs + n.durationMs);
            }
        }
        this.durationMs = Math.max(max, 1);
        this.clearViews();
        // стек для ленивой загрузки: pop() даёт ближайшее по времени событие
        this.stack = [...events].reverse();
        this.layout();
    }

    setPxPerSec(pxPerSec: number): void {
        this.pxPerSec = pxPerSec;
    }

    // ---------- координаты ----------

    private get fieldHeight(): number {
        return Math.max(50, this.app.screen.height - this.top - this.bottom);
    }

    private get semitonePx(): number {
        return this.fieldHeight / (this.maxMidi - this.minMidi);
    }

    midiToY(midi: number): number {
        return this.top + (this.maxMidi - clampMidi(midi)) * this.semitonePx;
    }

    yToMidi(y: number): number {
        const m = this.maxMidi - (y - this.top) / this.semitonePx;
        return clampMidi(m);
    }

    /** x координата ноты, стартовавшей в tMs, при текущем времени nowMs */
    private xOf(tMs: number): number {
        return this.lineX + ((tMs - this.nowMs) / 1000) * this.pxPerSec;
    }

    getCursorPitch(): number {
        return this.cursorPitch;
    }

    getNow(): number {
        return this.nowMs;
    }

    // ---------- жизненный цикл ----------

    start(): void {
        this.nowMs = 0;
        this.playing = true;
        this.clearViews();
        this.stack = [...this.events].reverse();
        this.layout();
    }

    stop(): void {
        this.playing = false;
    }

    // ---------- ввод ----------

    private onPointerMove(e: PIXI.FederatedPointerEvent): void {
        const y = Math.max(this.top, Math.min(this.app.screen.height - this.bottom, e.global.y));
        this.cursorY = y;
        this.cursorPitch = this.yToMidi(y);
        this.drawCursor();
        this.onCursorPitch(this.cursorPitch);
    }

    // ---------- построение видов ----------

    private clearViews(): void {
        for (const v of this.views) {
            v.bar.destroy();
            v.startDot.destroy();
            v.endDot.destroy();
            v.label?.destroy();
        }
        this.views = [];
        for (const c of this.connectors.values()) {
            c.g.destroy();
        }
        this.connectors.clear();
        this.eventViewsLeft.clear();
        this.notesLayer.removeChildren();
    }

    /** Создать виды нот одного события, когда оно доехало до правого края. */
    private spawnEventViews(event: NoteEvent): void {
        let baseView: NoteView | null = null;
        for (const note of event.notes) {
            const bar = new PIXI.Graphics();
            const startDot = new PIXI.Graphics();
            const endDot = new PIXI.Graphics();
            this.notesLayer.addChild(bar, startDot, endDot);
            const view: NoteView = {
                event,
                note,
                y: this.midiToY(note.midi),
                bar,
                startDot,
                endDot,
                label: null,
            };
            this.views.push(view);
            this.spawnedViews++;
            if (note.midi === event.baseMidi) {
                baseView = view;
            }
        }
        this.eventViewsLeft.set(event.id, event.notes.length);
        if (event.notes.length > 1) {
            // аккорд: соединяем ноты вертикальной линией (как на скриншоте)
            const g = new PIXI.Graphics();
            this.notesLayer.addChildAt(g, 0);
            this.connectors.set(event.id, { g, event });
            // на главной (самой низкой) ноте — цифра, сколько нот в аккорде
            const label = new PIXI.Text(String(event.notes.length), {
                fontFamily: 'system-ui, sans-serif',
                fontSize: 20,
                fontWeight: 'bold',
                fill: 0xffffff,
                stroke: 0x1d1d1b,
                strokeThickness: 4,
            });
            label.anchor.set(0.5);
            this.notesLayer.addChild(label);
            if (baseView) {
                baseView.label = label;
            }
        }
    }

    /** Берём следующее событие из стека, только когда его пора показать. */
    private spawnDueViews(): void {
        const w = this.app.screen.width;
        while (this.stack.length > 0) {
            const event = this.stack[this.stack.length - 1];
            if (this.xOf(event.timeMs) > w + 140) {
                break;
            }
            this.spawnEventViews(this.stack.pop()!);
        }
    }

    // ---------- отрисовка ----------

    private layout(): void {
        this.app.stage.hitArea = this.app.screen;
        this.drawBackground();
        this.drawGrid();
        this.drawProgress();
        this.drawCursor();
        this.spawnDueViews();
        this.moveAll();
    }

    private clearLayer(layer: PIXI.Container): void {
        const removed = layer.removeChildren();
        for (const child of removed) {
            child.destroy({ children: true });
        }
    }

    private drawBackground(): void {
        this.clearLayer(this.bgLayer);
        const w = this.app.screen.width;
        const h = this.app.screen.height;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, w);
        canvas.height = Math.max(2, h);
        const ctx = canvas.getContext('2d')!;
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0.0, '#4330c8');
        grad.addColorStop(0.45, '#7c3aed');
        grad.addColorStop(1.0, '#d862ec');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
        sprite.width = w;
        sprite.height = h;
        this.bgLayer.addChild(sprite);
    }

    private drawGrid(): void {
        this.clearLayer(this.gridLayer);
        const w = this.app.screen.width;
        const h = this.app.screen.height;

        for (let midi = this.minMidi; midi <= this.maxMidi; midi++) {
            const y = this.midiToY(midi);
            const isOctave = midi % 12 === 0;
            const g = new PIXI.Graphics();
            g.lineStyle(isOctave ? 2 : 1, COLOR.grid, isOctave ? 0.28 : 0.07);
            g.moveTo(0, y);
            g.lineTo(w, y);
            this.gridLayer.addChild(g);
            if (isOctave) {
                const label = new PIXI.Text(midiToName(midi), {
                    fontFamily: 'system-ui, sans-serif',
                    fontSize: 15,
                    fill: COLOR.octaveLabel,
                });
                label.alpha = 0.65;
                label.x = 8;
                label.y = y - label.height - 2;
                this.gridLayer.addChild(label);
            }
        }

        // жёлтая линия, к которой прилетают ноты
        const line = new PIXI.Graphics();
        line.lineStyle(12, COLOR.playLine, 0.22);
        line.moveTo(this.lineX, this.top - 20);
        line.lineTo(this.lineX, h - this.bottom + 20);
        line.lineStyle(5, COLOR.playLine, 0.95);
        line.moveTo(this.lineX, this.top - 20);
        line.lineTo(this.lineX, h - this.bottom + 20);
        this.gridLayer.addChild(line);
    }

    private initCursor(): void {
        this.cursorLine = new PIXI.Graphics();
        this.cursorDot = new PIXI.Graphics();
        this.cursorLabel = new PIXI.Text('', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 22,
            fill: COLOR.cursor,
        });
        this.cursorLayer.addChild(this.cursorLine, this.cursorDot, this.cursorLabel);
        this.cursorY = this.app.screen.height / 2;
        this.cursorPitch = this.yToMidi(this.cursorY);
    }

    private drawCursor(): void {
        const w = this.app.screen.width;
        const y = this.cursorY;
        this.cursorLine.clear();
        this.cursorLine.lineStyle(2, COLOR.cursor, 0.35);
        this.cursorLine.moveTo(0, y);
        this.cursorLine.lineTo(w, y);
        this.cursorDot.clear();
        this.cursorDot.lineStyle(3, 0x1d1d1b, 0.9);
        this.cursorDot.beginFill(COLOR.cursor, 1);
        this.cursorDot.drawCircle(this.lineX, y, 13);
        this.cursorDot.endFill();
        this.cursorLabel.text = midiToName(this.cursorPitch);
        this.cursorLabel.x = this.lineX + 20;
        this.cursorLabel.y = y - this.cursorLabel.height / 2;
    }

    private initHud(): void {
        this.progressBg = new PIXI.Graphics();
        this.progressFill = new PIXI.Graphics();
        this.fxLayer.addChild(this.progressBg, this.progressFill);
    }

    private drawProgress(): void {
        const w = this.app.screen.width;
        const h = this.app.screen.height;
        const y = h - 14;
        this.progressBg.clear();
        this.progressBg.beginFill(0xffffff, 0.18);
        this.progressBg.drawRect(0, y, w, 6);
        this.progressBg.endFill();
        this.progressFill.clear();
    }

    private setProgress(p: number): void {
        const w = this.app.screen.width;
        const h = this.app.screen.height;
        const y = h - 14;
        this.progressFill.clear();
        this.progressFill.beginFill(COLOR.playLine, 0.9);
        this.progressFill.drawRect(0, y, Math.max(0, Math.min(1, p)) * w, 6);
        this.progressFill.endFill();
    }

    // ---------- обновление каждый кадр ----------

    private tick(): void {
        const deltaMS = this.app.ticker.deltaMS;
        this.updateJudgmentAnims(deltaMS);
        if (!this.playing) {
            return;
        }
        this.nowMs += deltaMS;
        this.spawnDueViews();
        this.moveAll();
        this.setProgress(this.nowMs / this.durationMs);
        this.onFrame(this.nowMs, deltaMS);
    }

    private moveAll(): void {
        const lineX = this.lineX;
        for (let i = this.views.length - 1; i >= 0; i--) {
            const v = this.views[i];
            const x1 = this.xOf(v.event.timeMs);
            const x2 = this.xOf(v.event.timeMs + v.note.durationMs);
            const y = v.y;

            if (x2 < -80) {
                // нота ушла за левый край — убираем её со сцены
                v.bar.destroy();
                v.startDot.destroy();
                v.endDot.destroy();
                v.label?.destroy();
                this.views.splice(i, 1);
                const left = (this.eventViewsLeft.get(v.event.id) ?? 1) - 1;
                if (left <= 0) {
                    this.eventViewsLeft.delete(v.event.id);
                    const connector = this.connectors.get(v.event.id);
                    if (connector) {
                        connector.g.destroy();
                        this.connectors.delete(v.event.id);
                    }
                } else {
                    this.eventViewsLeft.set(v.event.id, left);
                }
                continue;
            }

            // цифра аккорда едет вместе с главной нотой
            if (v.label) {
                v.label.x = x1;
                v.label.y = y;
            }

            const barH = 20;
            const r = 15;
            if (x2 - x1 < 12) {
                // короткая нота — один кружок
                v.bar.visible = false;
                v.endDot.visible = false;
                v.startDot.clear();
                const active = !v.event.judged && x1 <= lineX + 6 && x2 >= lineX - 6;
                const res = v.event.result;
                let color = COLOR.startDot;
                if (res) {
                    color = res.judgment === 'MISS' ? COLOR.missDot : COLOR.hitDot;
                } else if (active) {
                    color = COLOR.activeDot;
                }
                v.startDot.lineStyle(3, 0xffffff, 0.95);
                v.startDot.beginFill(color, res ? 0.55 : 1);
                v.startDot.drawCircle(x1, y, r);
                v.startDot.endFill();
                v.startDot.visible = true;
            } else {
                // длинная нота — «труба» от начала до конца, градиент розовый→синий
                v.bar.visible = true;
                v.endDot.visible = true;
                v.bar.clear();
                const SEGMENTS = 10;
                const width = Math.max(1, x2 - x1);
                for (let s = 0; s < SEGMENTS; s++) {
                    v.bar.beginFill(GameField.lerpColor(COLOR.startDot, COLOR.endDot, s / (SEGMENTS - 1)), 0.92);
                    v.bar.drawRect(x1 + (width * s) / SEGMENTS, y - barH / 2, width / SEGMENTS + 1, barH);
                    v.bar.endFill();
                }
                v.bar.lineStyle(2, 0xffffff, 0.85);
                v.bar.drawRoundedRect(x1, y - barH / 2, width, barH, barH / 2);
                v.startDot.clear();
                const res = v.event.result;
                let color = COLOR.startDot;
                if (res) {
                    color = res.judgment === 'MISS' ? COLOR.missDot : COLOR.hitDot;
                } else if (!v.event.judged && x1 <= lineX + 6 && x2 >= lineX - 6) {
                    color = COLOR.activeDot;
                }
                v.startDot.lineStyle(3, 0xffffff, 0.95);
                v.startDot.beginFill(color, res ? 0.6 : 1);
                v.startDot.drawCircle(x1, y, r);
                v.startDot.endFill();
                v.endDot.clear();
                v.endDot.lineStyle(3, 0xffffff, 0.95);
                v.endDot.beginFill(res ? COLOR.missDot : COLOR.endDot, res ? 0.6 : 1);
                v.endDot.drawCircle(x2, y, r);
                v.endDot.endFill();
            }
        }

        // вертикальные соединители аккордов
        for (const { g, event } of this.connectors.values()) {
            const x = this.xOf(event.timeMs);
            if (x < -80) continue;
            const yTop = this.midiToY(event.notes[event.notes.length - 1].midi);
            const yBottom = this.midiToY(event.notes[0].midi);
            g.clear();
            g.lineStyle(6, 0xffffff, 0.5);
            g.moveTo(x, yTop);
            g.lineTo(x, yBottom);
        }
    }

    // ---------- результат судейства ----------

    addJudgment(result: EventResult): void {
        const j = JUDGMENT_TEXT[result.judgment] ?? JUDGMENT_TEXT.MISS;
        const label = result.noteCount > 1
            ? `${j.text} ${result.hitCount}/${result.noteCount}`
            : j.text;
        const text = new PIXI.Text(label, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 72,
            fill: j.color,
            stroke: 0x1d1d1b,
            strokeThickness: 8,
            align: 'center',
        });
        text.anchor.set(0.5);
        text.x = this.app.screen.width / 2;
        text.y = this.app.screen.height * 0.3;
        this.fxLayer.addChild(text);
        this.judgmentAnims.push({ text, ageMs: 0, ttlMs: 900 });
        this.moveAll();
    }

    private updateJudgmentAnims(deltaMS: number): void {
        for (let i = this.judgmentAnims.length - 1; i >= 0; i--) {
            const a = this.judgmentAnims[i];
            a.ageMs += deltaMS;
            const t = a.ageMs / a.ttlMs;
            if (t >= 1) {
                this.fxLayer.removeChild(a.text);
                a.text.destroy();
                this.judgmentAnims.splice(i, 1);
                continue;
            }
            const scale = 1.6 - 0.6 * Math.min(1, t * 3);
            a.text.scale.set(scale);
            a.text.alpha = 1 - Math.max(0, t - 0.4) / 0.6;
        }
    }

    private static lerpColor(a: number, b: number, t: number): number {
        const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
        const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
        const r = Math.round(ar + (br - ar) * t);
        const g = Math.round(ag + (bg - ag) * t);
        const bl = Math.round(ab + (bb - ab) * t);
        return (r << 16) | (g << 8) | bl;
    }

    destroy(): void {
        this.app.destroy(true, { children: true });
    }
}
