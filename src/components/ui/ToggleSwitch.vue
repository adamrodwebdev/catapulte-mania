<script setup>
/** Interrupteur accessible (role="switch"), utilisable au clavier. */
const props = defineProps({
  modelValue: { type: Boolean, required: true },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  id: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])
const toggle = () => emit('update:modelValue', !props.modelValue)
</script>

<template>
  <div class="field field--switch">
    <div class="field__text">
      <span :id="`${id}-label`" class="field__label">{{ label }}</span>
      <span v-if="description" :id="`${id}-desc`" class="field__desc">{{ description }}</span>
    </div>
    <button
      :id="id"
      type="button"
      role="switch"
      class="switch"
      :aria-checked="modelValue ? 'true' : 'false'"
      :aria-labelledby="`${id}-label`"
      :aria-describedby="description ? `${id}-desc` : undefined"
      @click="toggle"
    >
      <span class="switch__thumb" />
    </button>
  </div>
</template>
