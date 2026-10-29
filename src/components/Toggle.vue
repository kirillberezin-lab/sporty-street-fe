<script setup>
defineProps({ modelValue: { type: Boolean, default: false }, disabled: { type: Boolean, default: false }, label: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <button
    type="button"
    class="toggle"
    :class="{ on: modelValue }"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <i />
  </button>
</template>
