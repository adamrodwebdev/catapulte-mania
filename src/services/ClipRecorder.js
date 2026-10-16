/**
 * Moments forts (v6.0) : chaque tir est filmé depuis le canevas du jeu
 * (MediaRecorder), du départ jusqu'à un court instant après le retour au
 * calme ; seul le plus beau est gardé (sa valeur est donnée par la partie :
 * défenseurs abattus, vies ôtées à un général, coup de grâce).
 *
 * Rien n'est envoyé nulle part : le joueur enregistre ou partage la vidéo
 * s'il le souhaite. Navigateur sans MediaRecorder ni captureStream : rien.
 */

/** Formats essayés, du plus partageable (mp4) au plus courant (webm). */
const TYPES = Object.freeze(['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])

export class ClipRecorder {
  /** Premier format vidéo que le navigateur sait enregistrer, ou null. */
  static mimeType(MR = globalThis.MediaRecorder) {
    if (typeof MR?.isTypeSupported !== 'function') return null
    return TYPES.find((t) => MR.isTypeSupported(t)) ?? null
  }

  /** Peut-on filmer ce canevas ? */
  static supported(canvas, MR = globalThis.MediaRecorder) {
    return Boolean(canvas && typeof canvas.captureStream === 'function' && ClipRecorder.mimeType(MR))
  }

  #canvas
  #MR
  #type
  #fps
  #maxMs
  #bitrate
  #stream = null
  #rec = null
  #chunks = []
  #timer = null
  #best = null
  #url = null
  /** Arrêts en cours (la vidéo finit de s'écrire). */
  #pending = Promise.resolve()

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ MR?: typeof MediaRecorder, fps?: number, maxMs?: number, bitrate?: number }} [opts]
   */
  constructor(canvas, { MR = globalThis.MediaRecorder, fps = 30, maxMs = 12000, bitrate = 2_500_000 } = {}) {
    this.#canvas = canvas
    this.#MR = MR
    this.#type = ClipRecorder.mimeType(MR)
    this.#fps = fps
    this.#maxMs = maxMs
    this.#bitrate = bitrate
  }

  get recording() {
    return Boolean(this.#rec)
  }

  /** Extension du fichier enregistré. */
  get extension() {
    return this.#type?.startsWith('video/mp4') ? 'mp4' : 'webm'
  }

  /** Commence à filmer (sans effet si une prise est en cours). */
  start() {
    if (this.#rec || !this.#type) return
    try {
      this.#stream ??= this.#canvas.captureStream(this.#fps)
      const rec = new this.#MR(this.#stream, { mimeType: this.#type, videoBitsPerSecond: this.#bitrate })
      this.#chunks = []
      rec.ondataavailable = (e) => {
        if (e.data?.size) this.#chunks.push(e.data)
      }
      rec.start(500)
      this.#rec = rec
      // Garde-fou : une prise ne dure jamais plus de maxMs.
      this.#timer = setTimeout(() => this.stop(0), this.#maxMs)
    } catch {
      this.#rec = null
    }
  }

  /**
   * Arrête la prise et la garde si elle vaut au moins la meilleure.
   * @param {number} value intérêt du tir (0 : à jeter)
   * @returns {Promise<{ blob: Blob, value: number } | null>} la meilleure prise
   */
  stop(value) {
    const rec = this.#rec
    if (!rec) return this.#pending.then(() => this.#best)
    this.#rec = null
    clearTimeout(this.#timer)
    const done = new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(this.#chunks, { type: this.#type })
        this.#chunks = []
        if (value > 0 && blob.size > 0 && (!this.#best || value >= this.#best.value)) {
          if (this.#url) URL.revokeObjectURL(this.#url)
          this.#url = null
          this.#best = { blob, value }
        }
        resolve()
      }
      try {
        rec.stop()
      } catch {
        resolve()
      }
    })
    this.#pending = this.#pending.then(() => done)
    return this.#pending.then(() => this.#best)
  }

  /** La meilleure prise, une fois toutes les prises écrites : { url, type, extension, value } ou null. */
  async best() {
    await this.#pending
    if (!this.#best) return null
    this.#url ??= URL.createObjectURL(this.#best.blob)
    return { url: this.#url, blob: this.#best.blob, type: this.#type, extension: this.extension, value: this.#best.value }
  }

  dispose() {
    try {
      this.#rec?.stop()
    } catch {
      /* déjà arrêté */
    }
    this.#rec = null
    clearTimeout(this.#timer)
    this.#stream?.getTracks?.().forEach((tr) => tr.stop())
    this.#stream = null
    if (this.#url) URL.revokeObjectURL(this.#url)
    this.#url = null
    this.#best = null
  }
}
