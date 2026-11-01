<template>
  <div>
    <div class="pixi" ref="pixi"></div>
    <div>
      <label>
        Link:
        <input ref="midi-url">
      </label>
      <button @click="parseFromUrl">Parse</button>
    </div>
    <div>
      <label>
        File:
        <input type="file" ref="midi-file">
      </label>
      <button @click="parseFromFile">Parse</button>
    </div>
    <div>
      <button @click="playMidi">Play</button>
    </div>
  </div>
</template>

<script>
import * as MIDI from '@tonejs/midi';
import * as Tone from 'tone'
import * as NoteHandler from '@/components/track/note/NoteHandler.ts'
import {TrackNode} from '@/components/track/note/TrackNode.ts'
import {FrameProcessor} from "@/components/track/pixi/FrameProcessor";

const self = {
  midi: null,
  samplers: null,
  tracks: null,
  frameProcessor: null,
};

export default {
  name: "Track",
  methods: {
    async parseFromUrl() {
      console.log(this.$refs['midi-url'].value);
      self.midi = await MIDI.Midi.fromUrl(this.$refs['midi-url'].value);
      await this.loadSamplers();
      this.createTrackNodesFromMidi();
    },
    async parseFromFile() {
      const url = URL.createObjectURL(this.$refs['midi-file'].files[0]);
      self.midi = await MIDI.Midi.fromUrl(url);
      await this.loadSamplers();
      this.createTrackNodesFromMidi();
    },
    playMidi() {
      if (self.midi === null) {
        return;
      }

      self.frameProcessor = new FrameProcessor(this.$refs.pixi);
      const currentTracks = {};
      for (const channel in self.tracks) {
        currentTracks[channel] = self.tracks[channel];
      }

      self.frameProcessor.addCallback((allTime, delta) => {
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
      });
      self.frameProcessor.start();
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
          if (prevTrack !== undefined) {
            prevTrack.nextNode = currentTrack;
          } else {
            self.tracks[channel] = currentTrack;
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

<style scoped>
  .pixi {
    width: 1440px;
    height: 880px;
    background-color: rgba(0, 0, 0, 0.14);
  }
</style>
