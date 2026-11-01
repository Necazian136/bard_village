<template>
  <div
      class="placeholder"
      :class="{disabled: disabled, active: !disabled}"
  >
    <div class="input-outer">
      <input class="input-inner baloo-font" :placeholder="placeholder"/>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: "Input",
  data() {
    return {
      text: '',
    }
  },
  props: {
    disabled: {
      type: Boolean,
      default() {
        return false;
      }
    },
    placeholder: {
      type: String,
      default() {
        return '';
      }
    }
  },
}
</script>

<style lang="scss" scoped>
.placeholder {
  max-width: 400px;
  height: 128px;

  &.disabled {
    .input {
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
      .input {
        &-outer {
          background-color: #6D7F89;
        }
      }
    }

    &:focus-within {
      .input {
        &-outer {
          background-color: #6D7F89;
        }

        &-inner {
          background-color: #1F2D38;
        }
      }
    }
  }
}

.input {
  &-outer {
    max-width: 400px;
    max-height: 120px;
    height: 100%;
    background-color: #53656F;
    border-radius: 20px;
    padding: 4px;
    transition: all .2s;
  }

  &-inner {
    font-size: 64px;
    height: calc(100% - 8px);
    width: calc(100% - 8px);

    border-radius: 16px;
    background: #384651;

    display: flex;
    align-items: center;
    justify-content: center;
    transition: all .2s;

    &::placeholder { /* Most modern browsers support this now. */
      color: rgba(255, 255, 255, 0.40);
      font-family: MeowScript-Regular, sans-serif;
    }
  }
}
</style>
