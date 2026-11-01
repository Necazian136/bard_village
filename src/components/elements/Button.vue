<template>
  <div
      class="placeholder"
      :class="{disabled: disabled, active: !disabled}"
      @click="onClick"
  >
    <div class="button-outer">
      <div class="button-inner meow-font prevent-select"><slot></slot></div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: "Button",
  props: {
    disabled: {
      type: Boolean,
      default() {
        return false;
      }
    }
  },
  methods: {
    onClick() {
      this.$emit('onClick');
    }
  }
}
</script>

<style lang="scss" scoped>

.placeholder {
  max-width: 392px;
  height: 142px;
  position: relative;

  .button {
    &-outer {
      bottom: 0;
      left: 0;
      position: absolute;
      height: 100%;
      width: 100%;
    }
  }

  &.disabled {
    .button {
      &-outer {
        background-color: #2B3944;
      }

      &-inner {
        background-color: #465862;
        color: rgba(255, 255, 255, 0.50);
      }
    }
  }

  &.active {
    &:hover {
      .button {
        &-outer {
          background-color: #2B3944;
        }

        &-inner {
          background-color: #60727C;
        }
      }
    }

    &:active {
      .button {
        &-outer {
          background-color: #2B3944;
          padding: 4px;
        }

        &-inner {
          background-color: #465862;
        }
      }
    }
  }
}

.button {
  &-outer {
    max-width: 392px;
    max-height: 120px;
    height: 100%;
    background-color: #384651;
    border-radius: 20px;
    padding: 4px 4px 18px;
    transition: all .2s;
  }

  &-inner {
    height: 100%;
    width: 100%;

    border-radius: 16px;
    background: #53656F;

    display: flex;
    align-items: center;
    justify-content: center;
    transition: all .2s;
  }
}

</style>
