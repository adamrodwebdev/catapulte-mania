<script setup>
import { computed, onMounted, ref } from 'vue'
import PixelPortrait from '../ui/PixelPortrait.vue'
import { useApp } from '../../app/AppContext.js'
import { UpgradeCatalog } from '../../game/progression/UpgradeCatalog.js'
import { StoreService } from '../../services/StoreService.js'
import AppIcon from '../ui/AppIcon.vue'
import ScreenHeader from '../ui/ScreenHeader.vue'

/**
 * Atelier : dépenser l'or gagné en campagne.
 * Toutes les règles (prix, plafonds, solde) sont vérifiées par SaveSlot ;
 * l'écran ne fait qu'afficher et transmettre les demandes.
 */
const app = useApp()
const { state, t } = app
const profile = computed(() => state.profile)
const message = ref('')

onMounted(() => {
  if (!profile.value) app.go('profiles', { replace: true })
})

const upgrades = computed(() =>
  UpgradeCatalog.upgrades().map((u) => {
    const level = profile.value?.upgrades[u.id] || 0
    const cost = u.nextCost(level)
    const stars = u.nextStars(level)
    const starsOk = stars === null || stars <= (profile.value?.stars ?? 0)
    return { id: u.id, icon: u.icon, level, max: u.maxLevel, cost, stars, starsOk, affordable: cost !== null && starsOk && cost <= (profile.value?.gold ?? 0) }
  }),
)

const cosmetics = computed(() =>
  ['skin', 'trail'].map((slot) => ({
    slot,
    items: UpgradeCatalog.cosmetics()
      .filter((c) => c.slot === slot)
      .map((c) => ({
        id: c.id,
        cost: c.cost,
        event: c.event,
        owned: profile.value?.cosmetics.owned.includes(c.id),
        equipped: profile.value?.cosmetics[slot] === c.id,
        affordable: c.cost <= (profile.value?.gold ?? 0),
      })),
  })),
)

async function act(action, id) {
  const ok = await app.workshop(action, id)
  const lacksStars = action === 'upgrade' && upgrades.value.find((u) => u.id === id)?.starsOk === false
  message.value = ok ? (action === 'equip' ? '' : t('workshop.bought', { name: t(`workshop.names.${id}`) })) : t(lacksStars ? 'workshop.notEnoughStars' : 'workshop.notEnough')
  if (message.value) app.announce(message.value)
}

/** Boutique premium : préparée mais désactivée tant qu'aucun fournisseur de paiement n'est branché. */
const storeEnabled = StoreService.enabled
</script>

<template>
  <main v-if="profile" class="screen workshop">
    <ScreenHeader :title="t('workshop.title')" @back="app.go('levels')">
      <p class="gold-badge" :aria-label="t('workshop.balance', { gold: profile.gold })">
        <AppIcon name="coin" :size="20" />{{ profile.gold.toLocaleString(state.locale) }}
      </p>
    </ScreenHeader>
    <figure class="interlude workshop__host">
      <PixelPortrait id="gontran" height="6rem" decorative />
      <figcaption class="interlude__text">
        <span class="interlude__name">{{ t('characters.gontran.name') }}</span>
        <q>{{ t('workshop.gontran') }}</q>
      </figcaption>
    </figure>
    <p class="screen__intro">{{ t('workshop.intro') }} {{ t('workshop.earn') }}</p>
    <p class="visually-hidden" role="status" aria-live="polite">{{ message }}</p>
    <p v-if="message" class="notice" aria-hidden="true">{{ message }}</p>

    <section class="panel" aria-labelledby="ws-upgrades">
      <h2 id="ws-upgrades" class="panel__title">{{ t('workshop.upgrades') }}</h2>
      <p class="field__desc">{{ t('workshop.fairNote') }}</p>
      <ul class="shop-list">
        <li v-for="u in upgrades" :key="u.id" class="shop-item">
          <AppIcon :name="u.icon" :size="26" class="shop-item__icon" />
          <div class="shop-item__text">
            <h3 class="shop-item__name">{{ t(`workshop.names.${u.id}`) }}</h3>
            <p class="shop-item__desc">{{ t(`workshop.desc.${u.id}`) }}</p>
            <p class="pips" :aria-label="t('workshop.level', { n: u.level, max: u.max })">
              <span v-for="i in u.max" :key="i" :class="['pips__pip', { 'pips__pip--on': i <= u.level }]" aria-hidden="true" />
            </p>
          </div>
          <div v-if="u.cost !== null" class="shop-item__buy">
            <button type="button" class="btn btn--primary" :disabled="!u.affordable" @click="act('upgrade', u.id)">
              <AppIcon :name="u.starsOk ? 'coin' : 'lock'" :size="18" />{{ t('workshop.buy', { cost: u.cost }) }}
            </button>
            <span v-if="u.stars" :class="['shop-item__req', { 'shop-item__req--missing': !u.starsOk }]">
              <AppIcon name="star" :size="14" />{{ t('workshop.needStars', { count: u.stars }) }}
            </span>
          </div>
          <span v-else class="shop-item__done"><AppIcon name="check" :size="18" />{{ t('workshop.max') }}</span>
        </li>
      </ul>
    </section>

    <section v-for="group in cosmetics" :key="group.slot" class="panel" :aria-labelledby="`ws-${group.slot}`">
      <h2 :id="`ws-${group.slot}`" class="panel__title">{{ t('workshop.cosmetics') }} · {{ t(`workshop.slots.${group.slot}`) }}</h2>
      <ul class="look-grid">
        <li v-for="c in group.items" :key="c.id" :class="['look', `look--${c.id}`, { 'look--on': c.equipped }]">
          <span class="look__swatch" aria-hidden="true" />
          <span class="look__name">{{ t(`workshop.names.${c.id}`) }}</span>
          <span v-if="c.equipped" class="look__state"><AppIcon name="check" :size="16" />{{ t('workshop.equipped') }}</span>
          <button v-else-if="c.owned" type="button" class="btn" @click="act('equip', c.id)">{{ t('workshop.equip') }}</button>
          <span v-else-if="c.event" class="look__state look__state--event">{{ t(`workshop.event.${c.event}`) }}</span>
          <button v-else type="button" class="btn btn--primary" :disabled="!c.affordable" @click="act('cosmetic', c.id)">
            <AppIcon name="coin" :size="16" />{{ c.cost }}
          </button>
        </li>
      </ul>
    </section>

    <section v-if="storeEnabled" class="panel" aria-labelledby="ws-store">
      <h2 id="ws-store" class="panel__title">{{ t('workshop.store') }}</h2>
    </section>
  </main>
</template>
