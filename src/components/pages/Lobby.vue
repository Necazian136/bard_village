<template>
  <div class="lobby container">
    <Parser
      @onParse="onParse"
    />
    <Game
      ref="game"
    />
  </div>
</template>

<script>

import Button from "@/components/elements/Button.vue";
import Input from "@/components/elements/Input.vue";
import Parser from "@/components/parser/Parser.vue";
import Game from "@/components/game/Game.vue";

export default {
  name: "Lobby",
  components: {Game, Parser, Input, Button},
  methods: {
    onParse(data) {
      console.log(data);
      this.$refs.game.load(data);
    }
  }
}
</script>

<style lang="scss" scoped>

.lobby {
  &.container {
    width: 1082px;
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
