<template>
  <div class="page">
    <header class="topbar">
      <h1 class="logo">Bard Village</h1>
      <div class="controls">
        <input
          ref="fileInput"
          type="file"
          accept=".mid,.midi"
          class="hidden"
          @change="onFileChange"
        >
        <button class="btn" @click="pickFile">Загрузить .mid</button>
        <button class="btn" @click="loadDemo">Демо</button>
        <select
          v-if="loaded"
          v-model.number="selectedTrackIndex"
          class="select"
          :disabled="isPlaying"
          @change="onTrackChange"
        >
          <option v-for="t in trackOptions" :key="t.index" :value="t.index">{{ t.label }}</option>
        </select>
        <button class="btn primary" :disabled="!loaded" @click="togglePlay">
          {{ isPlaying ? 'Стоп' : 'Играть' }}
        </button>
        <label class="speed">
          Скорость
          <input type="range" min="150" max="600" step="10" v-model.number="pxPerSec">
        </label>
      </div>
      <div v-if="loaded" class="stats">
        <span>Очки: {{ score }}</span>
        <span>Комбо: {{ combo }} (макс. {{ maxCombo }})</span>
        <span>Высота: {{ cursorNote }}</span>
        <span v-if="!samplersReady" class="warn">загрузка сэмплов…</span>
      </div>
    </header>

    <div v-if="fieldError" class="field-error">{{ fieldError }}</div>
    <div v-show="!fieldError" ref="field" class="field"></div>

    <p class="hint">
      Мышь по вертикали — ваша высота (нота подписана у курсора). Любая клавиша в момент,
      когда нота доехала до жёлтой линии, — сыграть. Аккорд из N нот — нажмите N клавиш.
      Вы звучите на своей высоте, а не «как в midi»: аккорд сдвигается на разницу
      между вашей высотой и его самой низкой нотой.
    </p>

    <div v-if="finished" class="overlay">
      <div class="card">
        <div class="card-title">Песня окончена!</div>
        <div>Очки: {{ score }} · макс. комбо: {{ maxCombo }}</div>
        <button class="btn primary" @click="togglePlay">Играть снова</button>
      </div>
    </div>
  </div>
</template>

<script>
import * as Tone from "tone";
import { Midi } from "@tonejs/midi";
import * as NoteHandler from "@/components/track/note/NoteHandler";
import { GameEngine, midiToName } from "@/components/game/GameEngine";
import { GameField } from "@/components/game/GameField";
import { loadSamplersForMidi } from "@/components/game/SamplerLoader";

// Нереактивное состояние сессии (движок, поле, сэмплеры)
const session = {
  midi: null,
  samplers: null,
  field: null,
  engine: null,
  accompaniment: [],
};

export default {
  name: "App",
  data() {
    return {
      loaded: false,
      fieldError: "",
      trackOptions: [],
      selectedTrackIndex: 0,
      isPlaying: false,
      finished: false,
      score: 0,
      combo: 0,
      maxCombo: 0,
      cursorNote: "",
      pxPerSec: 300,
      samplersReady: false,
      readyTimer: null,
    };
  },
  computed: {
    playerTrack() {
      return session.midi ? session.midi.tracks[this.selectedTrackIndex] : null;
    },
  },
  watch: {
    pxPerSec(v) {
      if (session.field) {
        session.field.setPxPerSec(v);
      }
    },
  },
  mounted() {
    try {
      session.field = new GameField(this.$refs.field);
    } catch (e) {
      console.error(e);
      this.fieldError = "Не удалось инициализировать игровое поле (нужен WebGL или Canvas): " + e.message;
      return;
    }
    session.field.onCursorPitch = (pitch) => {
      this.cursorNote = midiToName(pitch);
    };
    session.field.onFrame = (nowMs) => this.onFrame(nowMs);
    window.addEventListener("keydown", this.onKeyDown);
    // ручка для автотестов/дебага
    window.__bard = { session };
  },
  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
    if (this.readyTimer) {
      clearInterval(this.readyTimer);
    }
    if (session.field) {
      session.field.destroy();
      session.field = null;
    }
  },
  methods: {
    pickFile() {
      this.$refs.fileInput.click();
    },
    async onFileChange() {
      const file = this.$refs.fileInput.files[0];
      if (!file) {
        return;
      }
      const midi = new Midi(await file.arrayBuffer());
      await this.loadMidi(midi);
    },
    async loadDemo() {
      const midi = await Midi.fromUrl("/demo.mid");
      await this.loadMidi(midi);
    },
    async loadMidi(midi) {
      this.loaded = false;
      session.midi = midi;
      session.samplers = await loadSamplersForMidi(midi);
      this.trackOptions = midi.tracks
        .map((track, index) => ({ track, index }))
        .filter(({ track }) => track.notes.length > 0)
        .map(({ track, index }) => ({
          index,
          label: `${track.instrument.name || "Инструмент"} (канал ${track.channel})`,
        }));
      const firstMelodic = this.trackOptions.find((o) => midi.tracks[o.index].channel !== 9);
      this.selectedTrackIndex = (firstMelodic || this.trackOptions[0] || { index: 0 }).index;
      this.loaded = true;
      this.finished = false;
      this.prepareSong();
      this.checkSamplersReady();
      if (this.readyTimer) {
        clearInterval(this.readyTimer);
      }
      this.readyTimer = setInterval(() => this.checkSamplersReady(), 500);
    },
    checkSamplersReady() {
      if (!session.midi || !session.samplers) {
        return;
      }
      const track = session.midi.tracks[this.selectedTrackIndex];
      if (!track) {
        return;
      }
      if (track.channel === 9) {
        this.samplersReady = Object.keys(session.samplers).some((k) => Number(k) > 12800);
      } else {
        this.samplersReady = session.samplers[track.channel] !== undefined;
      }
    },
    onTrackChange() {
      if (this.isPlaying) {
        this.stopGame();
      }
      this.finished = false;
      this.prepareSong();
      this.checkSamplersReady();
    },
    /** Строит движок событий из выбранной дорожки и раскладывает ноты на поле */
    prepareSong() {
      const track = this.playerTrack;
      if (!track || !session.field) {
        return;
      }
      const notes = track.notes.map((n) => ({
        midi: n.midi,
        time: n.time,
        duration: n.duration,
        velocity: n.velocity,
      }));
      session.engine = new GameEngine(notes);
      const [minMidi, maxMidi] = session.engine.getPitchRange(6);
      session.field.setEvents(session.engine.events, minMidi, maxMidi);
      session.field.setPxPerSec(this.pxPerSec);
      // аккомпанемент — все остальные дорожки играют сами
      session.accompaniment = session.midi.tracks
        .map((t, index) => ({ track: t, index, ptr: 0 }))
        .filter((a) => a.index !== this.selectedTrackIndex && a.track.notes.length > 0);
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
    },
    togglePlay() {
      if (this.isPlaying) {
        this.stopGame();
        return;
      }
      Tone.start(); // разблокировка аудио по клику
      this.finished = false;
      this.prepareSong(); // свежий движок — судейство с нуля
      session.field.start();
      this.isPlaying = true;
    },
    stopGame() {
      this.isPlaying = false;
      this.finished = false;
      if (session.field) {
        session.field.stop();
      }
    },
    onFrame(nowMs) {
      if (!session.engine || !session.field) {
        return;
      }
      // судейство событий, время которых уже наступило
      const results = session.engine.update(nowMs);
      for (const r of results) {
        this.applyResult(r);
      }
      this.score = session.engine.score;
      this.combo = session.engine.combo;
      this.maxCombo = session.engine.maxCombo;
      // аккомпанемент: все дорожки, кроме выбранной игроком
      for (const acc of session.accompaniment) {
        const notes = acc.track.notes;
        while (acc.ptr < notes.length && notes[acc.ptr].time * 1000 <= nowMs) {
          this.playAccompanimentNote(acc.track, notes[acc.ptr]);
          acc.ptr++;
        }
      }
      if (nowMs > session.engine.durationMs + 1500) {
        this.isPlaying = false;
        this.finished = true;
        session.field.stop();
      }
    },
    applyResult(result) {
      // звучат ВСЕ ноты события, каждая сдвинута на offset игрока
      for (const s of result.soundNotes) {
        this.playPlayerNote(s);
      }
      session.field.addJudgment(result);
    },
    getSamplerFor(channel, origMidi) {
      const realChannel = NoteHandler.getRealChannel(channel, { midi: origMidi });
      return session.samplers ? session.samplers[realChannel] : undefined;
    },
    playPlayerNote(soundNote) {
      const track = this.playerTrack;
      if (!track) {
        return;
      }
      const sampler = this.getSamplerFor(track.channel, soundNote.origMidi);
      if (!sampler) {
        return;
      }
      const realChannel = NoteHandler.getRealChannel(track.channel, { midi: soundNote.origMidi });
      const duration = realChannel > 12800 ? 0.02 : soundNote.durationMs / 1000;
      sampler.triggerAttackRelease(soundNote.name, duration, Tone.now(), soundNote.velocity);
    },
    playAccompanimentNote(track, note) {
      const realChannel = NoteHandler.getRealChannel(track.channel, note);
      const sampler = session.samplers ? session.samplers[realChannel] : undefined;
      if (!sampler) {
        return;
      }
      const duration = realChannel > 12800 ? 0.02 : note.duration;
      sampler.triggerAttackRelease(note.name, duration, Tone.now(), note.velocity);
    },
    onKeyDown(e) {
      if (e.repeat) {
        return;
      }
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        return;
      }
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.isPlaying || !session.engine || !session.field) {
        return;
      }
      // игрок нажал «играть»: фиксируем нажатие на высоте курсора
      const pitch = session.field.getCursorPitch();
      const nowMs = session.field.getNow();
      const usedByNote = session.engine.addBlow(nowMs, pitch);
      if (!usedByNote) {
        // нажал не в ноту — просто играем на своей высоте (короткий звук)
        const track = this.playerTrack;
        const sampler = track ? this.getSamplerFor(track.channel, pitch) : undefined;
        if (sampler) {
          sampler.triggerAttackRelease(midiToName(pitch), 0.3, Tone.now(), 0.9);
        }
      }
    },
  },
};
</script>

<style scoped>
.page {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 1060px;
  max-width: 100vw;
  margin: 0 auto;
  padding: 16px 12px 24px;
}

.topbar {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.logo {
  margin: 0;
  font-size: 28px;
  letter-spacing: 0.5px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn {
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: #2e2a44;
  color: #f3f0ff;
  font-size: 15px;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: #3d3859;
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn.primary {
  background: #7c3aed;
  font-weight: 600;
}

.btn.primary:hover:not(:disabled) {
  background: #8b5cf6;
}

.select {
  height: 40px;
  max-width: 320px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: #2e2a44;
  color: #f3f0ff;
  font-size: 15px;
}

.speed {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #c9c4e8;
}

.stats {
  display: flex;
  gap: 20px;
  font-size: 16px;
  color: #e6e1ff;
  flex-wrap: wrap;
}

.stats .warn {
  color: #fbbf24;
}

.hidden {
  display: none;
}

.field {
  width: 1000px;
  max-width: 100%;
  height: 560px;
  border-radius: 14px;
  overflow: hidden;
  cursor: none;
  touch-action: none;
  background: #241f3a;
}

.field-error {
  width: 1000px;
  max-width: 100%;
  padding: 24px;
  border-radius: 14px;
  background: #4c1d1d;
  color: #fecaca;
}

.hint {
  margin: 0;
  max-width: 960px;
  text-align: center;
  font-size: 14px;
  line-height: 1.5;
  color: #b7b1d9;
}

.overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 8, 20, 0.6);
  z-index: 10;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 44px;
  border-radius: 16px;
  background: #2e2a44;
  font-size: 20px;
}

.card-title {
  font-size: 28px;
  font-weight: 700;
}
</style>
