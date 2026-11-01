<template>
  <div class="stave container">
    <div ref="pixi" class="pixi"></div>
    <Button
        class="play-button"
        :onClick="play"
    >
      Play
    </Button>
  </div>
</template>

<script>
import * as Tone from "tone";
import {FrameProcessor} from '@/components/track/pixi/FrameProcessor';
import Button from '@/components/elements/Button.vue';

const self = {
  samplers: null,
  tracks: null,
  midi: null,
  activeChannel: 0,
  frameProcessor: null,
};

const singleNotesMap = {0: 'Orange', 1: 'Green', 2: 'Purple'};
const multipleNotesMap = {0: 'Green-Orange', 1: 'Purple-Green', 2: 'Orange-Purple'};

export default {
  name: "Stave",
  components: {Button},
  data() {
    return {
      isPlaying: false,
    }
  },
  mounted() {
    self.frameProcessor = new FrameProcessor(this.$refs.pixi);
  },
  methods: {
    setTracks(tracks) {
      self.tracks = tracks;
    },
    setSamplers(samplers) {
      self.samplers = samplers;
    },
    setMidi(midi) {
      self.midi = midi;
    },
    setSpeed(bpm) {
      self.frameProcessor.setSpeed(bpm);
    },
    createNotes(ppq) {
      let currentTrack = self.tracks[self.activeChannel];
      while (currentTrack) {
        const noteValue = currentTrack.notes[0].midi % 4;
        if (currentTrack.notes.length !== 1) {
          const noteMap = {0: [0, 1], 1: [1, 2], 2: [2, 3], 3: [3, 0]};
          for (const noteMapValue of noteMap[noteValue]) {
            const x = currentTrack.notes[0].ticks / ppq;

            self.frameProcessor.createNote(x, noteMapValue);
          }
        } else {
          const x = currentTrack.notes[0].ticks / ppq;

          self.frameProcessor.createNote(x, noteValue);
        }
        currentTrack = currentTrack.nextNode;
      }
    },
    play() {
      if (this.isPlaying) {
        return;
      }
      this.isPlaying = true;
      const currentTracks = {};
      for (const channel in self.tracks) {
        currentTracks[channel] = self.tracks[channel];
      }

      self.frameProcessor.addCallback((allTime, delta) => {
        this.playMidi(currentTracks, allTime);
        this.moveElements(delta);
      });
      self.frameProcessor.start();
    },
    moveElements(delta) {
      self.frameProcessor.moveElements(delta);
    },
    playMidi(currentTracks, allTime) {
      for (const channel in currentTracks) {
        const trackNode = currentTracks[channel];
        if (trackNode === undefined) {
          continue;
        }
        if (trackNode.time <= allTime) {
          for (const note of trackNode.notes) {
            if (self.samplers[channel] === undefined) {
              break;
            }

            let duration = note.duration;
            if (channel > 12800) {
              duration = 20;
            }
            const now = Tone.now();
            self.samplers[channel].triggerAttackRelease(
                note.name,
                duration,
                now,
                note.velocity
            );
          }
          currentTracks[channel] = trackNode.nextNode;
        }
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.stave {
  &.container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    gap: 10px;
    margin: 10px;
  }
  & .play-button {
    width: 180px;
  }
  & .pixi {
    width: 810px;
    height: 220px;
  }
}
</style>
