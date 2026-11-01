<template>
  <div class="lobby container">
    <Parser
      @onParse="onParse"
    />
    <Stave
      ref="stave"
    />
  </div>
</template>

<script>

import Button from "@/components/elements/Button.vue";
import Input from "@/components/elements/Input.vue";
import Parser from "@/components/parser/Parser.vue";
import Stave from "@/components/elements/Stave.vue";

export default {
  name: "Lobby",
  components: {Stave, Parser, Input, Button},
  methods: {
    onParse(data) {
      console.log(data);
      this.$refs.stave.setTracks(data.tracks);
      this.$refs.stave.setSamplers(data.samplers);
      this.$refs.stave.setMidi(data.midi);
      this.$refs.stave.setSpeed(data.midi.header.tempos[0].bpm);
      this.$refs.stave.createNotes(data.midi.header.ppq);
    }
  }
}
</script>

<style lang="scss" scoped>

.lobby {
  &.container {
    width: 1082px;
    height: 698px;
    margin: 16px 8px;

    border: 4px solid rgba(29, 29, 27, 0.15);
    box-shadow: inset 0px -4px 2px rgba(255, 255, 255, 0.15), inset 0px 4px 2px rgba(255, 255, 255, 0.15);
    border-radius: 12px;
  }

  & .header {
    display: flex;
    width: 1403px;
    height: 120px;
    justify-content: space-between;
    align-items: center;
    gap: 283px;
    flex-shrink: 0;

    & .room {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }
}

</style>
