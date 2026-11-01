<template>
  <div class="game container">
    <div class="panel">
      <select
        v-model.number="selectedTrackIndex"
        class="track-select baloo-font"
        :disabled="isPlaying"
        @change="onTrackChange"
      >
        <option v-for="t in trackOptions" :key="t.index" :value="t.index">
          {{ t.label }}
        </option>
      </select>
      <Button class="play-button" :onClick="togglePlay">
        {{ isPlaying ? 'Стоп' : 'Играть' }}
      </Button>
      <label class="speed baloo-font">
        Скорость
        <input
          type="range"
          min="150"
          max="600"
          step="10"
          v-model.number="pxPerSec"
        />
      </label>
      <div class="stats baloo-font">
        <span>Очки: {{ score }}</span>
        <span>Комбо: {{ combo }} (макс. {{ maxCombo }})</span>
        <span>Высота: {{ cursorNote }}</span>
        <span v-if="!samplersReady" class="warn">загрузка инструментов…</span>
      </div>
    </div>
    <div ref="pixi" class="pixi"></div>
    <div class="hint baloo-font">
      Мышь по вертикали — высота ноты. Любая клавиша в момент, когда нота на жёлтой линии, — сыграть.
      Аккорд: нажмите столько клавиш, сколько нот в аккорде. Играете не «как в midi», а на своей высоте!
    </div>
    <div v-if="finished" class="finish-overlay">
      <div class="finish-card">
        <div class="baloo-font">Песня окончена!</div>
        <div class="baloo-font">Очки: {{ score }}, макс. комбо: {{ maxCombo }}</div>
        <Button :onClick="togglePlay">Играть снова</Button>
      </div>
    </div>
  </div>
</template>

<script>
import * as Tone from "tone";
import Button from "@/components/elements/Button.vue";
import * as NoteHandler from "@/components/track/note/NoteHandler";
import { GameEngine, midiToName } from "@/components/game/GameEngine";
import { GameField } from "@/components/game/GameField";

// Нереактивное состояние «сессии» (как в остальных компонентах проекта)
const session = {
  midi: null,
  samplers: null,
  tracks: null,
  field: null,
  engine: null,
  accompaniment: [],
};

export default {
  name: "Game",
  components: { Button },
  data() {
    return {
      trackOptions: [],
      selectedTrackIndex: 0,
      isPlaying: false,
      finished: false,
      score: 0,
      combo: 0,
      maxCombo: 0,
      cursorNote: "",
      pxPerSec: 300,
      samplersReady: true,
      readyTimer: null,
    };
  },
  watch: {
    pxPerSec(v) {
      if (session.field) {
        session.field.setPxPerSec(v);
      }
    },
  },
  mounted() {
    session.field = new GameField(this.$refs.pixi);
    session.field.onCursorPitch = (pitch) => {
      this.cursorNote = midiToName(pitch);
    };
    session.field.onFrame = (nowMs) => this.onFrame(nowMs);
    window.addEventListener("keydown", this.onKeyDown);
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
    /** Вызывается из Lobby после парсинга midi-файла */
    load(data) {
      session.midi = data.midi;
      session.samplers = data.samplers;
      session.tracks = data.tracks;
      this.trackOptions = session.midi.tracks
        .map((track, index) => ({ track, index }))
        .filter(({ track }) => track.notes.length > 0)
        .map(({ track, index }) => ({
          index,
          label: `${track.instrument.name || "Инструмент"} (канал ${track.channel})`,
        }));
      const firstMelodic = this.trackOptions.find((o) => session.midi.tracks[o.index].channel !== 9);
      this.selectedTrackIndex = (firstMelodic || this.trackOptions[0] || { index: 0 }).index;
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
    get playerTrack() {
      return session.midi ? session.midi.tracks[this.selectedTrackIndex] : null;
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
      // аккомпанемент
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

<style lang="scss" scoped>
.game {
  &.container {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 1040px;
    margin: 16px 8px;
    padding: 12px;
    box-sizing: border-box;

    border: 4px solid rgba(29, 29, 27, 0.15);
    box-shadow: inset 0px -4px 2px rgba(255, 255, 255, 0.15), inset 0px 4px 2px rgba(255, 255, 255, 0.15);
    border-radius: 12px;
  }

  & .panel {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    width: 100%;
  }

  & .track-select {
    height: 44px;
    max-width: 340px;
    background: #384651;
    color: #fff;
    border: none;
    border-radius: 12px;
    padding: 0 10px;
    font-size: 20px;
  }

  & .play-button {
    width: 180px;
    height: 60px;

    & :deep(.meow-font) {
      font-size: 40px;
    }
  }

  & .speed {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    font-size: 20px;
  }

  & .stats {
    display: flex;
    gap: 18px;
    color: #fff;
    font-size: 22px;

    & .warn {
      color: #ffd84d;
    }
  }

  & .pixi {
    width: 1000px;
    height: 560px;
    border-radius: 12px;
    overflow: hidden;
    cursor: none;
    touch-action: none;
  }

  & .hint {
    color: rgba(255, 255, 255, 0.85);
    font-size: 18px;
    text-align: center;
    max-width: 900px;
  }

  & .finish-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(20, 10, 40, 0.55);
    border-radius: 12px;
    z-index: 10;
  }

  & .finish-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    background: #384651;
    color: #fff;
    border-radius: 20px;
    padding: 28px 44px;
    font-size: 32px;

    & :deep(.play-button), & :deep(.placeholder) {
      width: 220px;
      height: 70px;
    }
  }
}
</style>
