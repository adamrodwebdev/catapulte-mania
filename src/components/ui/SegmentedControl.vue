<script setup>
/** Groupe de choix exclusifs (boutons radio stylisés). */
defineProps({
  modelValue: { type: [String, Number], required: true },
  options: { type: Array, required: true },
  label: { type: String, required: true },
  name: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <fieldset class="field field--segmented">
    <legend class="field__label">{{ label }}</legend>
    <div class="segmented">
      <label
        v-for="opt in options"
        :key="opt.value"
        :class="['segmented__option', { 'segmented__option--on': opt.value === modelValue }]"
      >
        <input
          class="visually-hidden"
          type="radio"
          :name="name"
          :value="opt.value"
          :checked="opt.value === modelValue"
          @change="emit('update:modelValue', opt.value)"
        >
        <span>{{ opt.label }}</span>
      </label>
    </div>
  </fieldset>
</template>
