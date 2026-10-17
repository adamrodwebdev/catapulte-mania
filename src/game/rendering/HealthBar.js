/**
 * Barres de vie (v6.2) : un même dessin pour les défenseurs, les généraux et
 * l'engin du joueur.
 *
 * - Une pilule de verre sombre à liseré clair, découpée en cellules (10 points
 *   de vie, 50 pour les gros) : on compte les coups qu'il reste.
 * - Une couleur continue du vert à l'ambre puis au rouge (jamais seule : la
 *   longueur dit la même chose), teintée par l'état (poison, feu, gel).
 * - Le coup se voit : éclair blanc, sursaut (la barre gonfle puis se pose),
 *   petite secousse, et le morceau perdu se détache et tombe. La traînée claire
 *   tient un instant, puis se vide en douceur jusqu'à la vie réelle.
 * - v6.2 : une fonte continue (feu, poison, piqûres, engin qui brûle) n'est pas
 *   un coup : la barre et sa traînée descendent en douceur, sans éclair. Seule
 *   une baisse nettement plus forte que la fonte du moment compte comme un coup.
 * - En danger (un quart de vie), la barre bat en rouge ; un défenseur en armure
 *   a un liseré d'acier.
 *
 * Mouvement réduit : ni sursaut, ni secousse, ni chute du morceau, ni pulsation ;
 * la traînée se vide simplement.
 *
 * L'état d'animation de chaque barre est gardé par le rendu (v6.2, voir
 * HealthBarTracker), jamais sur l'entité dessinée : pas d'allocation par image
 * hors du premier affichage.
 */

/**
 * Durées (ms) des effets du coup, et maintien de la traînée avant qu'elle se vide.
 * v6.2 : BLOW, part de la vie qu'une baisse doit dépasser, en plus de deux fois la
 * fonte habituelle, pour compter comme un coup ; DRAIN, poids de chaque image
 * dans la fonte habituelle (moyenne glissante, en points de vie par ms).
 */
export const BAR_FX = Object.freeze({ FLASH: 160, POP: 260, SHAKE: 220, CHIP: 460, HOLD: 260, APPEAR: 180, IDLE: 3500, CRITICAL: 0.25, BLOW: 0.005, DRAIN: 0.5 })

/**
 * Mémoire des barres de vie (v6.2) : l'état d'animation de chaque barre (coups,
 * traînée, apparition), d'une image à l'autre. Une barre par entité suivie
 * (WeakMap : rien ne reste quand l'entité disparaît), plus celle de l'engin du
 * joueur. Appartient au rendu : la partie et les entités n'en savent rien.
 */
export class HealthBarTracker {
  /** @type {WeakMap<object, object>} */
  #bars = new WeakMap()
  #engine = null

  /**
   * Suit les points de vie d'une entité d'une image à l'autre.
   * @param {object} entity
   * @param {number} hp
   * @param {number} maxHp
   * @param {number} time horloge de rendu (ms)
   * @param {boolean} [animate]
   */
  track(entity, hp, maxHp, time, animate = true) {
    let s = this.#bars.get(entity)
    if (!s) {
      s = newBar(hp, time)
      this.#bars.set(entity, s)
    }
    return stepBar(s, hp, maxHp, time, animate)
  }

  /** Même chose pour la barre de l'engin du joueur (une seule par rendu). */
  trackEngine(hp, maxHp, time, animate = true) {
    this.#engine ??= newBar(hp, time)
    return stepBar(this.#engine, hp, maxHp, time, animate)
  }
}

/** État d'une barre qui apparaît. */
function newBar(hp, time) {
  return { hp, lag: hp, shownAt: time, hitAt: -Infinity, chip: null, lastHp: hp, at: time, drain: 0, droppedAt: -Infinity }
}

/**
 * Une image de plus pour une barre : coups, soins, traînée qui se vide.
 * @param {object} s état (voir newBar)
 * @param {number} hp
 * @param {number} maxHp
 * @param {number} time horloge de rendu (ms)
 * @param {boolean} animate
 */
export function stepBar(s, hp, maxHp, time, animate = true) {
  const dt = Math.max(0, time - s.at)
  const drop = s.lastHp - hp
  // v6.2 : la fonte du moment (feu, poison…) n'est pas un coup ; seule une baisse
  // nettement plus forte en est un (la première image d'une fonte, encore inconnue, aussi).
  const blow = drop > 1e-6 && drop > 2 * s.drain * dt + maxHp * BAR_FX.BLOW
  if (dt > 0) s.drain += (Math.max(0, drop) / dt - s.drain) * BAR_FX.DRAIN
  s.at = time
  if (drop > 1e-6) s.droppedAt = time
  if (blow) {
    // Un coup : l'éclair, le sursaut, le morceau qui se détache.
    s.hitAt = time
    s.chip = animate ? { from: hp / maxHp, to: s.lastHp / maxHp, at: time } : null
    s.lag = Math.max(s.lag, s.lastHp)
  } else if (hp > s.lastHp) {
    // Soin (sapeur, étendard) : la traînée suit sans délai.
    s.lag = hp
  }
  s.lastHp = hp
  s.hp = hp
  // La traînée tient, puis se vide en douceur (rattrape 14 % de l'écart par image).
  if (s.lag > hp && time - s.hitAt > BAR_FX.HOLD) s.lag = Math.max(hp, s.lag - Math.max(maxHp * 0.006, (s.lag - hp) * 0.14))
  if (s.lag < hp) s.lag = hp
  return s
}

/** Teinte (degrés) selon la part de vie : vert, ambre, puis rouge. */
function hueFor(k) {
  if (k >= 0.6) return 118
  if (k >= 0.3) return 42 + ((k - 0.3) / 0.3) * 76
  return Math.max(2, 42 * ((k - 0.05) / 0.25))
}

/**
 * Dessine une barre de vie.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} s état suivi (voir HealthBarTracker)
 * @param {object} o
 * @param {number} o.x centre
 * @param {number} o.y haut de la barre
 * @param {number} o.w largeur
 * @param {number} o.h hauteur
 * @param {number} o.maxHp
 * @param {number} o.cell points de vie par cellule
 * @param {number} o.px taille d'un pixel écran (monde)
 * @param {number} o.time horloge de rendu (ms)
 * @param {boolean} [o.animate]
 * @param {'poison'|'fire'|'frost'|null} [o.state]
 * @param {boolean} [o.armored] liseré d'acier
 * @param {boolean} [o.highContrast]
 * @param {boolean} [o.idleFade] s'atténuer au repos
 */
export function drawHealthBar(ctx, s, { x, y, w, h, maxHp, cell, px, time, animate = true, state = null, armored = false, highContrast = false, idleFade = true }) {
  const k = Math.max(0, Math.min(1, s.hp / maxHp))
  const lagK = Math.max(k, Math.min(1, s.lag / maxHp))
  const since = time - s.hitAt
  const appear = Math.min(1, (time - s.shownAt) / BAR_FX.APPEAR)
  // Au repos : ni coup ni fonte depuis un moment (v6.2 : une barre qui fond reste vive).
  const idle = idleFade && time - Math.max(s.hitAt, s.droppedAt ?? -Infinity) > BAR_FX.IDLE ? 0.78 : 1
  // Sursaut : la barre gonfle au coup puis se pose (retour élastique).
  let scale = 1
  let dx = 0
  if (animate && since < BAR_FX.POP) {
    const u = since / BAR_FX.POP
    scale = 1 + 0.2 * (1 - u) * Math.cos(u * Math.PI * 1.5)
  }
  if (animate && since < BAR_FX.SHAKE) dx = Math.sin(since * 0.09) * 1.6 * px * (1 - since / BAR_FX.SHAKE)
  const r = h / 2
  ctx.save()
  ctx.globalAlpha = appear * idle
  ctx.translate(x + dx, y + h / 2)
  ctx.scale(scale, scale)
  const x0 = -w / 2
  const y0 = -h / 2

  // Danger : un halo rouge qui bat.
  const critical = k > 0 && k <= BAR_FX.CRITICAL
  ctx.beginPath()
  pill(ctx, x0 - px, y0 - px, w + 2 * px, h + 2 * px, r + px)
  ctx.shadowColor = critical ? `rgba(232,64,52,${animate ? 0.55 + 0.35 * Math.sin(time / 120) : 0.8})` : 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = (critical ? 7 : 3) * px
  ctx.fillStyle = highContrast ? '#000' : 'rgba(18,14,28,0.84)'
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  // Contenu, découpé dans la pilule.
  ctx.save()
  ctx.beginPath()
  pill(ctx, x0, y0, w, h, r)
  ctx.clip()
  // Traînée : le morceau qui vient d'être perdu, clair, qui se vide.
  if (lagK > k) {
    ctx.fillStyle = since < BAR_FX.HOLD ? '#fffaf0' : 'rgba(255,236,196,0.92)'
    ctx.fillRect(x0 + w * k, y0, w * (lagK - k), h)
  }
  if (k > 0) {
    const hue = state === 'poison' ? 92 : hueFor(k)
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + h)
    if (highContrast) {
      grad.addColorStop(0, '#ffd400')
      grad.addColorStop(1, '#ffd400')
    } else {
      grad.addColorStop(0, `hsl(${hue} 78% 66%)`)
      grad.addColorStop(0.55, `hsl(${hue} 70% 50%)`)
      grad.addColorStop(1, `hsl(${hue} 72% 40%)`)
    }
    ctx.fillStyle = grad
    ctx.fillRect(x0, y0, w * k, h)
    // États : feu qui vacille, gel qui blanchit, bulles du poison.
    if (state === 'fire') {
      ctx.fillStyle = `rgba(255,140,40,${animate ? 0.25 + 0.15 * Math.sin(time / 70) : 0.3})`
      ctx.fillRect(x0, y0, w * k, h)
    } else if (state === 'frost') {
      ctx.fillStyle = 'rgba(200,232,255,0.45)'
      ctx.fillRect(x0, y0, w * k, h)
    } else if (state === 'poison' && animate) {
      ctx.fillStyle = 'rgba(230,255,190,0.7)'
      for (let i = 0; i < 3; i++) {
        const bx = x0 + ((time / 9 + i * 37) % Math.max(1, w * k))
        ctx.fillRect(bx, y0 + h * 0.3, px, px)
      }
    }
    // Reflet du verre.
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(x0, y0, w * k, h * 0.38)
  }
  // Cellules : une fine séparation tous les `cell` points de vie.
  if (cell > 0 && maxHp / cell <= 24) {
    ctx.fillStyle = 'rgba(18,14,28,0.7)'
    for (let v = cell; v < maxHp - 1e-6; v += cell) ctx.fillRect(x0 + (w * v) / maxHp - 0.5 * px, y0, px, h)
  }
  // Éclair du coup.
  if (since < BAR_FX.FLASH) {
    ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - since / BAR_FX.FLASH)})`
    ctx.fillRect(x0, y0, w, h)
  }
  ctx.restore()

  // Liseré : clair (verre), ou acier pour l'armure.
  ctx.beginPath()
  pill(ctx, x0, y0, w, h, r)
  ctx.lineWidth = px
  ctx.strokeStyle = armored ? 'rgba(196,212,230,0.95)' : 'rgba(255,255,255,0.2)'
  ctx.stroke()
  if (armored) {
    // Petit écu à gauche de la barre.
    const sx = x0 - 3.5 * px
    ctx.beginPath()
    ctx.moveTo(sx - 2.6 * px, y0 - 0.6 * px)
    ctx.lineTo(sx + 2.6 * px, y0 - 0.6 * px)
    ctx.lineTo(sx + 2.6 * px, y0 + h * 0.45)
    ctx.quadraticCurveTo(sx + 2.4 * px, y0 + h + 1.4 * px, sx, y0 + h + 2.4 * px)
    ctx.quadraticCurveTo(sx - 2.4 * px, y0 + h + 1.4 * px, sx - 2.6 * px, y0 + h * 0.45)
    ctx.closePath()
    ctx.fillStyle = '#9fb2c8'
    ctx.fill()
    ctx.lineWidth = 0.8 * px
    ctx.strokeStyle = '#1e1a2b'
    ctx.stroke()
  }

  // Le morceau perdu se détache et tombe en tournoyant.
  const chip = s.chip
  if (chip && animate) {
    const t = (time - chip.at) / BAR_FX.CHIP
    if (t >= 1) s.chip = null
    else {
      const cw = Math.max(px, w * (chip.to - chip.from))
      const cx = x0 + w * chip.from + cw / 2
      ctx.save()
      ctx.globalAlpha = appear * (1 - t)
      ctx.translate(cx + 6 * px * t, y0 + h / 2 + 14 * px * t * t)
      ctx.rotate(0.9 * t)
      ctx.fillStyle = '#fff3d6'
      ctx.fillRect(-cw / 2, -h / 2, cw, h)
      ctx.restore()
    }
  }
  ctx.restore()
}

/** Pilule (rectangle à bouts ronds). */
function pill(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2)
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arc(x + w - rr, y + h / 2, rr, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(x + rr, y + h)
  ctx.arc(x + rr, y + h / 2, rr, Math.PI / 2, -Math.PI / 2)
  ctx.closePath()
}
