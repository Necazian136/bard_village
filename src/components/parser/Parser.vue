<template>
  <div class="parser">
    <input @change="parseFromUploadedFile" class="hidden" type="file" accept=".mid,.midi" ref="midi-file">
    <Button @click="selectFile">Загрузить .mid</Button>
    <Button @click="loadDemo">Демо</Button>
  </div>
</template>

<script>
import * as MIDI from "@tonejs/midi";
import * as Tone from "tone";
import * as NoteHandler from "../track/note/NoteHandler";
import {TrackNode} from "../track/note/TrackNode";
import Button from "../elements/Button.vue";

const self = {
  midi: null,
  samplers: null,
  tracks: null,
};

export default {
  name: "Parser",
  components: {Button},
  methods: {
    getParsedData() {
      return self;
    },
    selectFile() {
      this.$refs['midi-file'].click();
    },
    loadDemo() {
      this.parseFromUrl('/demo.mid');
    },
    parseFromUploadedFile() {
      const url = URL.createObjectURL(this.$refs['midi-file'].files[0]);
      this.parseFromUrl(url);
    },
    parseFromInsertedUrl() {
      const url = this.$refs['midi-url'].value;
      this.parseFromUrl(url);
    },
    async parseFromUrl(url) {
      self.midi = await MIDI.Midi.fromUrl(url);
      await this.loadSamplers();
      this.createTrackNodesFromMidi();
      this.$emit('onParse', self);
    },
    createTrackNodesFromMidi() {
      const trackToTimeNotes = {};
      self.midi.tracks.forEach((track) => {
        track.notes.forEach((note) => {
          const realChannel = NoteHandler.getRealChannel(track.channel, note);
          if (trackToTimeNotes[realChannel] === undefined) {
            trackToTimeNotes[realChannel] = {};
          }
          const msTime = Math.round(note.time * 1000);
          if (trackToTimeNotes[realChannel][msTime] === undefined) {
            trackToTimeNotes[realChannel][msTime] = [];
          }
          trackToTimeNotes[realChannel][msTime].push(note);
        });
      });

      self.tracks = {}
      for (const [channel, timeToNotes] of Object.entries(trackToTimeNotes)) {
        let prevTrack = undefined;
        let currentTrack = undefined;
        for (const [time, notes] of Object.entries(timeToNotes)) {
          currentTrack = new TrackNode();
          currentTrack.notes = notes;
          currentTrack.time = time;
          currentTrack.ticks = notes[0].ticks;
          if (prevTrack !== undefined) {
            prevTrack.nextNode = currentTrack;
            currentTrack.prevNode = prevTrack;
          } else {
            self.tracks[channel] = currentTrack;
            currentTrack.prevNode = undefined;
          }
          prevTrack = currentTrack;
        }
      }
    },
    async loadSamplers() {
      const context = new Tone.Context();
      self.samplers = {}
      for (let track of self.midi.tracks) {
        if (self.samplers[track.channel] !== undefined) {
          continue;
        }
        if (track.channel === 9) {
          const notes = NoteHandler.getAllNotesFromChannel(track.channel, self.midi);
          for (const note of notes) {
            if (note.midi < 35 || note.midi > 81) {
              continue;
            }
            const drumsChannel = NoteHandler.getRealChannel(track.channel, note);
            if (self.samplers[drumsChannel] !== undefined) {
              continue;
            }
            const zones = await NoteHandler.getZonesByMidiDrumsNumber(drumsChannel);
            const sampler = new Tone.Sampler({
              urls: await NoteHandler.getMappedNotesFromZones(context, zones),
              onload: () => {
                self.samplers[drumsChannel] = sampler;
              }
            }).toDestination();
            sampler.volume.value = -15;
          }
        } else {
          const zones = await NoteHandler.getZonesByMidiInstrumentNumber(track.instrument.number);
          const sampler = new Tone.Sampler({
            urls: await NoteHandler.getMappedNotesFromZones(context, zones),
            onload: () => {
              self.samplers[track.channel] = sampler;
            }
          }).toDestination();
          sampler.volume.value = -15;
        }
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.parser {
  display: flex;
  gap: 12px;
  padding: 10px 12px 0;

  & :deep(.placeholder) {
    height: 60px;
  }

  & :deep(.meow-font) {
    font-size: 34px;
  }
}

.hidden {
  visibility: hidden;
}
</style>
