<script setup>
import { computed, onBeforeUnmount, onMounted, ref, markRaw } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'
import ModalPanel from '../ui/ModalPanel.vue'
import { emptyDesign, placePart, removeAt, CastleCode, PARTS, LIMITS, STORAGE_KEYS } from '../../game/editor/CastleDesign.js'
import { MATERIAL_NAMES } from '../../game/entities/materials.js'

/**
 * Atelier de châteaux (v4.0) : construire, tester, partager.
 * - Choisir une pièce (et son matériau), puis toucher la scène : la pièce se
 *   pose sur ce qui est dessous. Défenseurs et barils se placent dans l'étage visé.
 * - Clavier : ← → déplacent le curseur, Entrée pose, Suppr. retire.
 * - Pour partager son château, il faut d'abord l'avoir pris soi-même.
 */
const app = useApp()
const { state, t } = app
const TOOLS = ['room', 'wall', 'plank', 'base', 'roof', 'soldier', 'knight', 'king', 'barrel', 'erase']
const canvas = ref(null)
let view = null
let ro = null
const design = ref(loadDraft())
const tool = ref('room')
const material = ref('wood')
const history = []
const cursorX = ref(1500)
const showSettings = ref(false)
const share = ref({ state: 'idle', url: '' })
const message = ref('')

function loadDraft() {
  try {
    const code = app.services.storage.readJson(STORAGE_KEYS.draft)
    if (typeof code === 'string') return CastleCode.decode(code, { draft: true })
  } catch {
    /* brouillon illisible : on repart d'un château vide */
  }
  return emptyDesign()
}
function saveDraft() {
  try {
    app.services.storage.writeJson(STORAGE_KEYS.draft, CastleCode.encode(design.value))
  } catch {
    /* sans stockage : le brouillon vit le temps de la session */
  }
}

const code = computed(() => {
  try {
    return CastleCode.encode(design.value)
  } catch {
    return ''
  }
})
const counts = computed(() => ({
  parts: design.value.parts.length,
  targets: design.value.parts.filter((p) => PARTS[p.kind].target).length,
}))
// Château déjà pris par son auteur (dans cette session, ou mémorisé sur l'appareil).
if (!state.editorVerified) {
  try {
    const saved = app.services.storage.readJson(STORAGE_KEYS.verified)
    if (typeof saved === 'string' && saved.length <= 4000) state.editorVerified = saved
  } catch {
    /* rien de mémorisé */
  }
}
const verified = computed(() => Boolean(code.value) && state.editorVerified === code.value)
const playable = computed(() => counts.value.targets > 0)

function changed() {
  design.value = { ...design.value, parts: [...design.value.parts] }
  share.value = { state: 'idle', url: '' }
  view?.setDesign(design.value)
  saveDraft()
}
function snapshot() {
  history.push(JSON.stringify(design.value))
  if (history.length > 60) history.shift()
}
function act(x, y) {
  snapshot()
  const d = design.value
  const ok = tool.value === 'erase' ? removeAt(d, x, y) : placePart(d, tool.value, x, material.value, y)
  if (!ok) {
    history.pop()
    message.value = t(tool.value === 'erase' ? 'editor.nothing' : 'editor.cannot')
    app.announce(message.value)
    return
  }
  message.value = ''
  changed()
  app.announce(tool.value === 'erase' ? t('editor.removed') : t('editor.placed', { part: t(`editor.parts.${tool.value}`) }))
}
function undo() {
  const prev = history.pop()
  if (!prev) return
  design.value = JSON.parse(prev)
  changed()
}
function clearAll() {
  snapshot()
  design.value.parts = []
  changed()
}

/* ----- Saisie : pointeur et clavier ----- */
function onPointer(e) {
  if (!view) return
  const p = view.toWorld(e.clientX, e.clientY)
  cursorX.value = p.x
  if (e.type === 'pointerdown') act(p.x, p.y)
  else view.ghost(design.value, tool.value, p.x)
}
function onKey(e) {
  const step = e.shiftKey ? 50 : 10
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    cursorX.value = Math.max(950, Math.min(2250, cursorX.value + (e.key === 'ArrowLeft' ? -step : step)))
    view?.ghost(design.value, tool.value, cursorX.value)
    e.preventDefault()
  } else if (e.key === 'Enter' || e.key === ' ') {
    act(cursorX.value, null)
    e.preventDefault()
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    const top = design.value.parts.filter((p) => Math.abs(p.x - cursorX.value) <= PARTS[p.kind].w / 2).sort((a, b) => a.y - PARTS[a.kind].h - (b.y - PARTS[b.kind].h))[0]
    if (top) {
      const prev = tool.value
      tool.value = 'erase'
      act(top.x, top.y - 2)
      tool.value = prev
    }
    e.preventDefault()
  } else if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
    undo()
    e.preventDefault()
  }
}
function pickTool(k) {
  tool.value = k
  view?.ghost(design.value, k, cursorX.value)
}

/* ----- Essai et partage ----- */
function test() {
  if (!playable.value) return
  app.startCustom(code.value, { fromEditor: true })
}
async function shareCastle() {
  if (!verified.value || share.value.state === 'busy') return
  share.value = { state: 'busy', url: '' }
  try {
    const res = await app.shareCastle(code.value, t('editor.shareText'))
    share.value = { state: res.method, url: res.url }
  } catch {
    share.value = { state: 'failed', url: '' }
  }
}
function setting(key, value) {
  design.value = { ...design.value, [key]: value }
  changed()
}
function setAmmo(type, value) {
  design.value = { ...design.value, ammo: { ...design.value.ammo, [type]: Math.max(0, Math.min(5, value)) } }
  changed()
}
const nameError = computed(() => design.value.name !== '' && !/^[\p{L}\p{N}][\p{L}\p{N} _'-]{0,15}$/u.test(design.value.name))

onMounted(async () => {
  const { assets } = await import('../../game/GameController.js')
  const { EditorView } = await import('../../game/editor/EditorView.js')
  if (!canvas.value) return
  view = markRaw(new EditorView(canvas.value, await assets()))
  view.setDesign(design.value)
  view.resize()
  ro = new ResizeObserver(() => view?.resize())
  ro.observe(canvas.value)
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <main class="editor">
    <header class="editor__bar">
      <button type="button" class="btn btn--icon" :aria-label="t('menu.back')" @click="app.go('modes')"><AppIcon name="back" :size="20" /></button>
      <h1 class="editor__title">{{ t('editor.title') }}</h1>
      <p class="editor__count" aria-live="polite">{{ t('editor.count', { parts: counts.parts, max: LIMITS.parts, targets: counts.targets }) }}</p>
      <div class="editor__actions">
        <button type="button" class="btn" :disabled="!design.parts.length" @click="undo"><AppIcon name="refresh" :size="18" />{{ t('editor.undo') }}</button>
        <button type="button" class="btn" @click="showSettings = true"><AppIcon name="gear" :size="18" />{{ t('editor.settings') }}</button>
        <button type="button" class="btn btn--primary" :disabled="!playable" @click="test"><AppIcon name="play" :size="18" />{{ t('editor.test') }}</button>
        <button type="button" class="btn" :disabled="!verified" :title="verified ? '' : t('editor.verifyFirst')" @click="shareCastle"><AppIcon name="users" :size="18" />{{ t('editor.share') }}</button>
      </div>
    </header>

    <canvas
      ref="canvas"
      class="editor__canvas"
      tabindex="0"
      role="application"
      :aria-label="t('editor.canvasLabel')"
      @pointerdown="onPointer"
      @pointermove="onPointer"
      @keydown="onKey"
    />

    <p v-if="message" class="editor__message" role="status">{{ message }}</p>
    <p v-else-if="!verified && playable" class="editor__message editor__message--hint">{{ t('editor.verifyFirst') }}</p>
    <div v-if="share.state !== 'idle' && share.state !== 'busy'" class="editor__message" role="status">
      <template v-if="share.state === 'copied'">{{ t('daily.copied') }}</template>
      <template v-else-if="share.state === 'shared'">{{ t('daily.shared') }}</template>
      <label v-else class="share__manual">{{ t('daily.copyManual') }}<input class="input" type="text" readonly :value="share.url" @focus="$event.target.select()"></label>
    </div>

    <footer class="editor__tools">
      <div class="editor__palette" role="radiogroup" :aria-label="t('editor.partsLabel')">
        <button v-for="k in TOOLS" :key="k" type="button" role="radio" :aria-checked="tool === k" :class="['tool', { 'tool--on': tool === k }]" @click="pickTool(k)">
          {{ t(`editor.parts.${k}`) }}
        </button>
      </div>
      <div v-if="PARTS[tool]?.material" class="editor__materials" role="radiogroup" :aria-label="t('editor.materialLabel')">
        <button v-for="m in MATERIAL_NAMES" :key="m" type="button" role="radio" :aria-checked="material === m" :class="['swatch', `swatch--${m}`, { 'swatch--on': material === m }]" @click="material = m">
          {{ t(`editor.materials.${m}`) }}
        </button>
      </div>
      <button type="button" class="btn btn--ghost btn--small" :disabled="!design.parts.length" @click="clearAll"><AppIcon name="trash" :size="16" />{{ t('editor.clear') }}</button>
    </footer>

    <ModalPanel v-if="showSettings" labelledby="editor-settings" @close="showSettings = false">
      <h2 id="editor-settings" class="modal__title">{{ t('editor.settings') }}</h2>
      <div class="editor__form">
        <label class="field">
          <span class="field__label">{{ t('editor.name') }}</span>
          <input class="input" type="text" maxlength="16" :value="design.name" :aria-invalid="nameError" @input="setting('name', $event.target.value.slice(0, 16))">
          <span v-if="nameError" class="notice notice--warning">{{ t('profiles.nameError') }}</span>
        </label>
        <label class="field">
          <span class="field__label">{{ t('editor.theme') }}</span>
          <select class="input" :value="design.theme" @change="setting('theme', Number($event.target.value))">
            <option v-for="n in 10" :key="n" :value="n">{{ t(`levels.chapters.${n}`) }}</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">{{ t('editor.shots', { count: design.shots }) }}</span>
          <input class="range" type="range" min="1" max="12" step="1" :value="design.shots" @input="setting('shots', Number($event.target.value))">
        </label>
        <label class="field">
          <span class="field__label">{{ t('editor.wind', { value: Math.round(design.wind * 100) }) }}</span>
          <input class="range" type="range" min="0" max="20" step="1" :value="Math.round(design.wind * 20)" @input="setting('wind', Number($event.target.value) / 20)">
        </label>
        <fieldset class="field">
          <legend class="field__label">{{ t('game.ammoTitle') }}</legend>
          <div class="editor__ammo">
            <label v-for="a in ['boulder', 'fire', 'bomb', 'split']" :key="a" class="editor__ammo-item">
              <span>{{ t(`game.ammo.${a}`) }}</span>
              <input class="input" type="number" min="0" max="5" :value="design.ammo[a]" @change="setAmmo(a, Number($event.target.value) || 0)">
            </label>
          </div>
        </fieldset>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary" data-autofocus @click="showSettings = false">{{ t('menu.close') }}</button>
      </div>
    </ModalPanel>
  </main>
</template>
