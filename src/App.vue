<template>
  <div class="container">
    <Lobby/>
  </div>
</template>

<script lang="ts">
import Track from "@/components/track/Track.vue";
import Lobby from "@/components/pages/Lobby.vue";

export default {
  components: {Lobby, Track}
}
</script>

<style scoped>
  .container {
    display: flex;
    justify-content: center;
    align-items: center;
  }
</style>
