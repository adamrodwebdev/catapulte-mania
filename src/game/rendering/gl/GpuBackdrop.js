import { BACKDROP_FRAGMENT, BACKDROP_VERTEX, MAX_BEAMS, MAX_MIST } from './backdropShaders.js'

/**
 * Fond WebGL2 (v6.5, prototype) : un canevas posé sous celui du jeu dessine la peinture du
 * chapitre, ses rais de lumière et sa brume sur la carte graphique, en une passe. Le canevas
 * du jeu (2D, transparent) garde tout le reste : ciel vivant restant, sol, monde, interface.
 *
 * - Pas de WebGL2, ou contexte perdu : `ready` devient faux et le rendu 2D reprend la
 *   peinture et tous les effets (aucune image perdue).
 * - Une seule texture : la peinture en cours, envoyée une fois, avec ses mipmaps.
 *
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ x0: number, y0: number, w: number, h: number }} Placement
 * @typedef {{ sun: Point, tint: readonly number[], reach: number, alpha: number,
 *   scale: number, beams: ReadonlyArray<{ a: number, w: number, len: number, ph: number, f: number, sway: number }> }} ShaftsFrame
 *   rais, en px CSS ; `w` des rais en part de la largeur de la peinture, `scale` cette largeur
 * @typedef {{ bands: ReadonlyArray<{ y: number, h: number, alpha: number, offset: number }>, tint: readonly number[] }} MistFrame
 * @typedef {{ img: HTMLImageElement, placed: Placement, time: number, shafts: ShaftsFrame | null, mist: MistFrame | null }} BackdropFrame
 */
export class GpuBackdrop {
  #canvas
  #gl
  #program = null
  #uniforms = {}
  #texture = null
  #textureFor = null
  #lost = false
  #visible = true
  #beams = new Float32Array(MAX_BEAMS * 4)
  #beamMotion = new Float32Array(MAX_BEAMS * 2)
  #mist = new Float32Array(MAX_MIST * 4)
  #dpr = 1

  /**
   * Pose le fond sous le canevas du jeu, s'il y a WebGL2.
   * @param {HTMLCanvasElement} gameCanvas
   * @returns {GpuBackdrop | null}
   */
  static attach(gameCanvas) {
    if (typeof document === 'undefined' || !gameCanvas.parentNode) return null
    const canvas = document.createElement('canvas')
    canvas.className = `${gameCanvas.className} game__canvas--gl`
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.pointerEvents = 'none'
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'default' })
    if (!gl) return null
    gameCanvas.parentNode.insertBefore(canvas, gameCanvas)
    const backdrop = new GpuBackdrop(canvas, gl)
    if (!backdrop.ready) {
      backdrop.dispose()
      return null
    }
    return backdrop
  }

  /** @param {HTMLCanvasElement} canvas @param {WebGL2RenderingContext} gl */
  constructor(canvas, gl) {
    this.#canvas = canvas
    this.#gl = gl
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.#lost = true
      this.#program = null
      this.#texture = null
      this.#textureFor = null
    })
    canvas.addEventListener('webglcontextrestored', () => {
      this.#lost = false
      this.#setup()
    })
    this.#setup()
  }

  /** Le fond peut-il dessiner ? (faux sans programme, ou contexte perdu) */
  get ready() {
    return !this.#lost && this.#program !== null
  }

  resize(cssW, cssH, dpr) {
    this.#dpr = dpr
    this.#canvas.width = Math.round(cssW * dpr)
    this.#canvas.height = Math.round(cssH * dpr)
  }

  /** Cache le fond (le rendu 2D dessine alors tout lui-même). */
  hide() {
    if (!this.#visible) return
    this.#visible = false
    this.#canvas.style.visibility = 'hidden'
  }

  /** @param {BackdropFrame} frame */
  draw(frame) {
    if (!this.ready) return
    if (!this.#visible) {
      this.#visible = true
      this.#canvas.style.visibility = ''
    }
    const gl = this.#gl
    const u = this.#uniforms
    this.#bindPainting(frame.img)
    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height)
    gl.useProgram(this.#program)
    gl.uniform2f(u.res, this.#canvas.width, this.#canvas.height)
    gl.uniform1f(u.dpr, this.#dpr)
    gl.uniform4f(u.place, frame.placed.x0, frame.placed.y0, frame.placed.w, frame.placed.h)
    gl.uniform1f(u.time, frame.time)
    this.#setShafts(frame.shafts)
    this.#setMist(frame.mist)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    this.#gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.#canvas.remove()
  }

  #setShafts(shafts) {
    const gl = this.#gl
    const u = this.#uniforms
    const beams = shafts?.beams ?? []
    const count = Math.min(MAX_BEAMS, beams.length)
    gl.uniform1i(u.beamCount, count)
    if (!count) return
    for (let i = 0; i < count; i++) {
      const b = beams[i]
      this.#beams.set([b.a, b.w * shafts.scale, b.len, b.ph], i * 4)
      this.#beamMotion.set([b.f, b.sway], i * 2)
    }
    gl.uniform4fv(u.beams, this.#beams)
    gl.uniform2fv(u.beamMotion, this.#beamMotion)
    gl.uniform2f(u.sun, shafts.sun.x, shafts.sun.y)
    gl.uniform3f(u.tint, shafts.tint[0] / 255, shafts.tint[1] / 255, shafts.tint[2] / 255)
    gl.uniform1f(u.reach, shafts.reach)
    gl.uniform1f(u.shaftAlpha, shafts.alpha)
  }

  #setMist(mist) {
    const gl = this.#gl
    const u = this.#uniforms
    const bands = mist?.bands ?? []
    const count = Math.min(MAX_MIST, bands.length)
    gl.uniform1i(u.mistCount, count)
    if (!count) return
    for (let i = 0; i < count; i++) {
      const m = bands[i]
      this.#mist.set([m.y, m.h, m.alpha, m.offset], i * 4)
    }
    gl.uniform4fv(u.mist, this.#mist)
    gl.uniform3f(u.mistTint, mist.tint[0] / 255, mist.tint[1] / 255, mist.tint[2] / 255)
  }

  #bindPainting(img) {
    const gl = this.#gl
    if (this.#textureFor === img) return
    if (!this.#texture) this.#texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.#texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.#textureFor = img
  }

  #setup() {
    const gl = this.#gl
    const program = link(gl, BACKDROP_VERTEX, BACKDROP_FRAGMENT)
    if (!program) return
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    // Un seul triangle qui couvre tout l'écran.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    const at = (name) => gl.getUniformLocation(program, name)
    this.#uniforms = {
      res: at('u_res'), dpr: at('u_dpr'), place: at('u_place'), time: at('u_time'),
      sun: at('u_sun'), tint: at('u_tint'), reach: at('u_reach'), shaftAlpha: at('u_shaftAlpha'),
      beamCount: at('u_beamCount'), beams: at('u_beams'), beamMotion: at('u_beamMotion'),
      mistCount: at('u_mistCount'), mist: at('u_mist'), mistTint: at('u_mistTint'),
    }
    gl.useProgram(program)
    gl.uniform1i(at('u_paint'), 0)
    this.#program = program
  }
}

/** Compile et lie le programme ; null en cas d'échec (le rendu 2D prend alors le relais). */
function link(gl, vertexSource, fragmentSource) {
  const shader = (type, source) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, source)
    gl.compileShader(s)
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s
    console.warn('[Catapulte Mania] fond WebGL2 indisponible', gl.getShaderInfoLog(s))
    return null
  }
  const vs = shader(gl.VERTEX_SHADER, vertexSource)
  const fs = shader(gl.FRAGMENT_SHADER, fragmentSource)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  console.warn('[Catapulte Mania] fond WebGL2 indisponible', gl.getProgramInfoLog(program))
  return null
}
