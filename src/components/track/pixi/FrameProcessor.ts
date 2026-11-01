import * as PIXI from 'pixi.js';

export class FrameProcessor {
    app: PIXI.Application;
    allTime: number;
    allTicks: number;
    isPaused: boolean;
    speed: number;
    notes: PIXI.Sprite[];

    __notePickerX = 124;
    __quarterStep = 136;

    constructor(ref) {
        this.app = new PIXI.Application({
            backgroundAlpha: 0,
            resizeTo: ref,
        });
        this.speed = 0;

        ref.appendChild(this.app.view);
        this.__initTime();
        this.__initStave();
        this.__initNotes();
    }

    createNote(xIndex, yIndex) {
        const notesMap = {0: 'Left', 1: 'Up', 2: 'Right', 3: 'Down'};
        const x = this.__notePickerX + this.__quarterStep * xIndex;
        const note = PIXI.Sprite.from(`/src/assets/stave/notes/${notesMap[yIndex]}.svg`);
        this.notes.push(note);
        this.app.stage.addChildAt(note, 1);
        note.anchor.set(0.5, 0.5);
        note.x = x;
        note.y = yIndex * 28 + 68;
        return
    }

    __initTime() {
        this.allTime = 0;
        this.isPaused = true;

        this.app.ticker.add(() =>
        {
            if (this.isPaused) {
                return;
            }
            this.allTime += this.app.ticker.deltaMS;
        });
    }

    __initStave() {
        const stave = PIXI.Sprite.from('/src/assets/stave/Stave.svg');
        this.app.stage.addChildAt(stave, 0);
        stave.x = 0;
        stave.y = 0;

        const staveFade = PIXI.Sprite.from('/src/assets/stave/Stave Fade.svg');
        this.app.stage.addChildAt(staveFade, 1);
        staveFade.x = 670;
    }

    __initNotes() {
        this.notes = [];
    }

    setSpeed(bpm) {
        this.speed = bpm * this.__quarterStep / 60000;
    }

    moveElements(deltaMs) {
        for (const note of this.notes) {
            note.x -= deltaMs * this.speed;
        }
        // TODO: Добавить метод для создания/удаления Notes
    }

    setOnPointermove(onPointerMoveCallback) {
        this.app.stage.interactive = true;
        this.app.stage.on("pointermove", onPointerMoveCallback);
    }

    addCallback(onFrameCallback) {
        this.app.ticker.add(() =>
        {
            if (this.isPaused) {
                return;
            }
            onFrameCallback(this.allTime, this.app.ticker.deltaMS)
        });
    }

    start() {
        this.isPaused = false;
    }

    stop() {
        this.isPaused = true;
    }
}
