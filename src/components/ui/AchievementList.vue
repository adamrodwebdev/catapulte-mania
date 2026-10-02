<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'
import { ACHIEVEMENTS, achievementParams } from '../../game/progression/Achievements.js'
import AppIcon from './AppIcon.vue'

/**
 * Les trois succès d'un niveau, avec leur état (obtenu, nouveau, à faire).
 * Lisible par lecteur d'écran : l'état est écrit en toutes lettres.
 */
const props = defineProps({
  /** Niveau (avec `achievements`, la liste des trois identifiants). */
  level: { type: Object, required: true },
  /** Succès déjà obtenus (masque 0..7). */
  mask: { type: Number, default: 0 },
  /** Succès obtenus pendant cette partie pour la première fois (masque). */
  fresh: { type: Number, default: 0 },
  compact: { type: Boolean, default: false },
})

const { t } = useApp()
const items = computed(() =>
  props.level.achievements.map((id, i) => ({
    id,
    icon: ACHIEVEMENTS[id].icon,
    done: Boolean((props.mask | props.fresh) & (1 << i)),
    fresh: Boolean(props.fresh & (1 << i)),
    params: achievementParams(id, props.level),
  })),
)
</script>

<template>
  <ul :class="['ach-list', { 'ach-list--compact': compact }]">
    <li v-for="a in items" :key="a.id" :class="['ach', { 'ach--done': a.done, 'ach--fresh': a.fresh }]">
      <span class="ach__badge" aria-hidden="true"><AppIcon :name="a.done ? 'trophy' : a.icon" :size="compact ? 18 : 22" /></span>
      <span class="ach__text">
        <span class="ach__name">{{ t(`ach.${a.id}.name`) }}</span>
        <span class="ach__desc">{{ t(`ach.${a.id}.desc`, a.params) }}</span>
      </span>
      <span class="ach__state">{{ a.fresh ? t('ach.fresh') : a.done ? t('ach.done') : t('ach.todo') }}</span>
    </li>
  </ul>
</template>
