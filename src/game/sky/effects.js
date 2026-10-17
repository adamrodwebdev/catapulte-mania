import { skySprites, scratchCanvas } from './skySprites.js'

/**
 * Ciels vivants (v6.3) : les effets, un par nom (voir skyConfig.js).
 *
 * Chaque effet est créé pour un ciel (`sky`, voir LivingSky.js) et garde son
 * propre état ; il peut :
 *  - `update(dt, view)` : avancer (secondes) ; jamais appelé en mouvement réduit ;
 *  - `draw(ctx, view, t, motion, k)` : se dessiner en repère écran (px CSS) ;
 *    `t` est figé quand le mouvement est réduit (`motion` faux), `k` l'intensité.
 *
 * `view` : la vue et la peinture posée dedans — W, H (vue), ground (sol du jeu),
 * x0, y0, iw, ih (peinture), s (échelle de la peinture), u (unité : 1 pour une
 * peinture de 1440 px de large), map(u, v) → point écran.
 *
 * Le hasard vient du ciel (`sky.rand`), à part de celui de la partie : les
 * relectures ne changent pas.
 */

const TAU = Math.PI * 2
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const smooth = (v) => {
  const x = clamp01(v)
  return x * x * (3 - 2 * x)
}

/** Éclat en croix (neige au soleil, cristaux de givre). */
function sparkle(ctx, glow, x, y, r, alpha, color) {
  ctx.globalAlpha = clamp01(alpha * 0.6)
  ctx.drawImage(glow, x - r, y - r, 2 * r, 2 * r)
  ctx.globalAlpha = clamp01(alpha)
  ctx.fillStyle = color
  const th = Math.max(1, r * 0.12)
  ctx.fillRect(x - r, y - th / 2, 2 * r, th)
  ctx.fillRect(x - th / 2, y - r, th, 2 * r)
}

/** Un tampon de travail à la bonne taille (agrandi au besoin). */
function buffer(state, w, h) {
  state.buf ??= scratchCanvas()
  if (state.buf.width < w || state.buf.height < h) {
    state.buf.width = Math.max(state.buf.width, Math.ceil(w))
    state.buf.height = Math.max(state.buf.height, Math.ceil(h))
  }
  return state.buf
}

/* ---------- Lumière ---------- */

/** Halo de la lune : il respire. */
function moon(sky) {
  return {
    draw(ctx, view, t, motion, k) {
      const [mu, mv, mr] = sky.cfg.moon
      const p = view.map(mu, mv)
      const r = mr * view.iw * (1.6 + 0.1 * Math.sin(t * 0.7))
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = (0.1 + 0.05 * Math.sin(t * 0.55)) * Math.min(1.3, k)
      ctx.drawImage(skySprites().glow, p.x - r, p.y - r, 2 * r, 2 * r)
    },
  }
}

/** Étoiles de la peinture : chacune scintille à son rythme. */
function stars(sky) {
  return {
    draw(ctx, view, t, motion, k) {
      const list = sky.data.stars
      if (!list) return
      const glow = skySprites().glow
      ctx.globalCompositeOperation = 'lighter'
      for (const s of list) {
        const p = view.map(s.u, s.v)
        const tw = 0.5 + 0.5 * Math.sin(t * s.f * 6.28 + s.ph)
        const r = (2.5 + 5 * s.b) * view.u * (0.8 + 0.5 * tw)
        ctx.globalAlpha = clamp01((0.18 + 0.55 * tw) * s.b * k)
        ctx.drawImage(glow, p.x - r, p.y - r, 2 * r, 2 * r)
        if (motion && tw > 0.93 && s.b > 0.55) {
          ctx.globalAlpha = clamp01(0.5 * k)
          ctx.fillStyle = '#eef2ff'
          ctx.fillRect(p.x - 7 * view.u, p.y - 0.5, 14 * view.u, 1)
          ctx.fillRect(p.x - 0.5, p.y - 7 * view.u, 1, 14 * view.u)
        }
      }
    },
  }
}

/** Une étoile filante, de temps en temps. */
function meteors(sky) {
  const r = sky.rand
  let m = null
  let next = r.range(2, 5)
  return {
    update(dt, view, k) {
      if (!m && (next -= dt * k) <= 0) {
        const dir = r.next() < 0.5 ? -1 : 1
        m = { x: r.range(0.2, 0.8) * view.W, y: r.range(0.06, 0.3) * view.H, dx: dir * Math.cos(0.42), dy: Math.sin(0.42), len: r.range(110, 210) * view.u, life: 0, dur: r.range(0.7, 1.05) }
        next = r.range(7, 14)
      }
      if (m && (m.life += dt) > m.dur) m = null
    },
    draw(ctx, view, t, motion, k) {
      if (!motion || !m) return
      const q = m.life / m.dur
      const head = { x: m.x + m.dx * q * m.len * 2.4, y: m.y + m.dy * q * m.len * 2.4 }
      const tail = { x: head.x - m.dx * m.len, y: head.y - m.dy * m.len }
      const fade = Math.sin(Math.PI * q)
      const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y)
      g.addColorStop(0, 'rgba(220,230,255,0)')
      g.addColorStop(1, `rgba(245,248,255,${0.85 * fade * Math.min(1, k)})`)
      ctx.strokeStyle = g
      ctx.lineWidth = 1.6 * view.u
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(tail.x, tail.y)
      ctx.lineTo(head.x, head.y)
      ctx.stroke()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.6 * fade
      ctx.drawImage(skySprites().glow, head.x - 6 * view.u, head.y - 6 * view.u, 12 * view.u, 12 * view.u)
    },
  }
}

/** Halo du soleil peint : il respire, et faiblit quand un nuage le voile. */
function sun(sky) {
  return {
    draw(ctx, view, t, motion, k) {
      const s = sky.data.sun
      const cfg = sky.cfg.sun
      const p = view.map(s.u, s.v)
      const r = s.r * view.iw * cfg.halo * (1 + 0.05 * Math.sin(t * 0.5))
      const pulse = cfg.pulse ?? 0.2
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = clamp01(cfg.glow * (1 - pulse + pulse * Math.sin(t * 1.2)) * Math.min(1.3, k) * (1 - 0.7 * sky.veil))
      const sp = skySprites()
      ctx.drawImage(cfg.warm ? sp.sunsetGlow : sp.sunGlow, p.x - r, p.y - r, 2 * r, 2 * r)
    },
  }
}

/**
 * Rayons peints : trois masques qui s'allument à tour de rôle ; ou (`stream`)
 * des vagues de lumière qui partent du soleil et filent le long des rayons.
 */
function rays(sky) {
  const state = {}
  return {
    draw(ctx, view, t, motion, k) {
      const R = sky.data.rays
      if (!R) return
      const [x0, y0, x1, y1] = R.box
      const sc = view.iw / R.w
      const base = sky.cfg.sun.rays * Math.min(1.4, k) * (1 - 0.85 * sky.veil)
      ctx.globalCompositeOperation = 'lighter'
      if (sky.cfg.sun.stream) {
        const hx0 = Math.floor(x0 / 2)
        const hy0 = Math.floor(y0 / 2)
        const bw = Math.ceil(x1 / 2) - hx0
        const bh = Math.ceil(y1 / 2) - hy0
        const buf = buffer(state, bw, bh)
        const g = (state.g ??= buf.getContext('2d'))
        g.globalCompositeOperation = 'source-over'
        g.clearRect(0, 0, bw, bh)
        g.drawImage(R.merged, hx0, hy0, bw, bh, 0, 0, bw, bh)
        g.globalCompositeOperation = 'destination-in'
        const sx = (sky.data.sun.u * R.w) / 2 - hx0
        const sy = (sky.data.sun.v * R.h) / 2 - hy0
        const gr = g.createRadialGradient(sx, sy, 0, sx, sy, (R.reach * R.w) / 2)
        for (let i = 0; i <= 24; i++) {
          const r = i / 24
          const w = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(TAU * (r * 2.4 - t / 2.6))) ** 2
          gr.addColorStop(r, `rgba(0,0,0,${w.toFixed(3)})`)
        }
        g.fillStyle = gr
        g.fillRect(0, 0, bw, bh)
        ctx.globalAlpha = clamp01(base)
        ctx.drawImage(buf, 0, 0, bw, bh, view.x0 + hx0 * 2 * sc, view.y0 + hy0 * 2 * sc, bw * 2 * sc, bh * 2 * sc)
        return
      }
      // Masques à demi-résolution (voir SkyLibrary) : coordonnées divisées par deux.
      R.canvases.forEach((layer, i) => {
        const wave = 0.5 + 0.5 * Math.sin(t * 0.85 + i * 2.094)
        ctx.globalAlpha = clamp01(base * (0.15 + 0.85 * wave * wave))
        ctx.drawImage(layer, x0 / 2, y0 / 2, (x1 - x0) / 2, (y1 - y0) / 2, view.x0 + x0 * sc, view.y0 + y0 * sc, (x1 - x0) * sc, (y1 - y0) * sc)
      })
    },
  }
}

/**
 * Reflet du soleil (à la manière des décors animés) : une traînée horizontale qui
 * respire, un anneau irisé, deux reflets ronds tout près, jamais sur le champ de tir.
 */
function flare(sky) {
  return {
    draw(ctx, view, t, motion, k) {
      const s = sky.data.sun
      const sp = skySprites()
      const p = view.map(s.u, s.v)
      const R = Math.max(10 * view.u, s.r * view.iw)
      const pulse = 0.75 + 0.25 * Math.sin(t * 1.2)
      // `flare` : force du reflet (1 par défaut) ; le jeu éclaire déjà la scène depuis l'astre.
      const kk = Math.min(1.3, k) * (1 - 0.7 * sky.veil) * (sky.cfg.sun.flare ?? 1)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = clamp01(0.3 * pulse * kk)
      ctx.drawImage(sp.streak, p.x - R * 16, p.y - R * 0.5, R * 32, R)
      ctx.globalAlpha = clamp01(0.16 * (0.8 + 0.2 * Math.sin(t * 0.7)) * kk)
      ctx.drawImage(sp.haloRing, p.x - R * 5.5, p.y - R * 5.5, R * 11, R * 11)
      const cx = view.W * 0.5
      const cy = view.H * 0.4
      for (const [f, size, alpha, img] of [[0.3, 0.7, 0.12, sp.ghostCool], [0.46, 1.2, 0.08, sp.ghostWarm]]) {
        const gx = p.x + (cx - p.x) * f
        const gy = p.y + (cy - p.y) * f
        const gr = R * size
        ctx.globalAlpha = clamp01(alpha * pulse * kk)
        ctx.drawImage(img, gx - gr, gy - gr, 2 * gr, 2 * gr)
      }
    },
  }
}

/** Un nuage passe devant le soleil : la lumière baisse quelques secondes, puis revient. */
function veil(sky) {
  const r = sky.rand
  let at = -1
  let next = r.range(4, 7)
  return {
    update(dt, view, k) {
      if (at < 0 && (next -= dt * k) <= 0) {
        at = sky.t
        next = r.range(12, 20)
      }
      if (at < 0) {
        sky.veil = 0
        return
      }
      const q = sky.t - at
      sky.veil = q < 1.8 ? smooth(q / 1.8) : q < 4.6 ? 1 : 1 - smooth((q - 4.6) / 2.4)
      if (q > 7) {
        at = -1
        sky.veil = 0
      }
    },
    draw(ctx, view, t, motion, k) {
      if (!sky.veil) return
      ctx.globalAlpha = clamp01(sky.veil * 0.1 * Math.min(1.3, k))
      ctx.fillStyle = '#1e2633'
      ctx.fillRect(0, 0, view.W, view.ground)
    },
  }
}

/** Éclair : deux flashs (jamais plus de deux par seconde), un trait de foudre au loin, puis le tonnerre. */
function lightning(sky) {
  const r = sky.rand
  const s = { bolt: null, flash: 0, next: r.range(2.5, 4.5), pulses: [] }
  const strike = (view) => {
    const t = sky.t
    s.pulses.push({ at: t, len: 0.16, peak: 1 }, { at: t + 0.27, len: 0.2, peak: 0.62 })
    const x0 = r.range(0.22, 0.8) * view.W
    const y0 = view.map(0, 0.36).y
    const y1 = view.map(0, r.range(0.58, 0.68)).y
    const pts = [[x0, y0]]
    let x = x0
    for (let i = 1; i <= 9; i++) {
      x += r.range(-16, 16) * view.u
      pts.push([x, y0 + ((y1 - y0) * i) / 9])
    }
    const branch = []
    const bi = 3 + Math.floor(r.next() * 3)
    let bx = pts[bi][0]
    let by = pts[bi][1]
    for (let i = 0; i < 4; i++) {
      bx += r.range(6, 18) * view.u * (r.next() < 0.5 ? -1 : 1)
      by += r.range(10, 20) * view.u
      branch.push([bx, by])
    }
    s.bolt = { at: t, pts, branch: [pts[bi], ...branch] }
    s.next = r.range(5, 11)
    // Le tonnerre suit l'éclair, d'autant plus tard et plus sourd qu'il est loin.
    sky.emit('thunder', { distance: r.range(0.2, 0.9), pan: Math.max(-0.8, Math.min(0.8, (2 * x0) / view.W - 1)) })
  }
  return {
    strike,
    update(dt, view, k) {
      if ((s.next -= dt * k) <= 0) strike(view)
      s.flash = 0
      for (const p of s.pulses) {
        const q = sky.t - p.at
        if (q >= 0 && q < p.len) s.flash = Math.max(s.flash, p.peak * (1 - q / p.len) ** 2)
      }
      s.pulses = s.pulses.filter((p) => sky.t - p.at < p.len)
      if (s.bolt && sky.t - s.bolt.at > 0.2) s.bolt = null
    },
    draw(ctx, view, t, motion, k) {
      if (!motion) return
      if (s.flash > 0 && sky.data.flash) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = clamp01(s.flash * 0.42 * Math.min(1.25, k))
        ctx.drawImage(sky.data.flash, view.x0, view.y0, view.iw, view.ih)
        ctx.globalAlpha = clamp01(s.flash * 0.06 * k)
        ctx.fillStyle = '#c9dcff'
        ctx.fillRect(0, 0, view.W, view.ground)
        ctx.globalCompositeOperation = 'source-over'
      }
      if (s.bolt) {
        const q = 1 - (sky.t - s.bolt.at) / 0.2
        for (const [w, col, al] of [[7, '#9fbcff', 0.22], [2.2, '#ffffff', 0.95]]) {
          ctx.strokeStyle = col
          ctx.globalAlpha = clamp01(al * q)
          ctx.lineWidth = w * view.u
          ctx.lineJoin = 'round'
          for (const line of [s.bolt.pts, s.bolt.branch]) {
            ctx.beginPath()
            line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
            ctx.stroke()
          }
        }
      }
    },
  }
}

/** La neige scintille : de brefs éclats en croix, posés sur les névés de la peinture. */
function glints(sky) {
  const r = sky.rand
  let list = []
  return {
    update(dt, view, k) {
      const spots = sky.data.snow
      if (!spots?.length) return
      for (let n = sky.cfg.glints * k * dt; n > 0; n--) {
        if (r.next() < n) {
          const p = r.pick(spots)
          list.push({ u: p.u, v: p.v, age: 0, life: r.range(0.45, 0.9), size: r.range(0.7, 1.4) })
        }
      }
      for (const g of list) g.age += dt
      list = list.filter((g) => g.age < g.life)
    },
    draw(ctx, view, t, motion, k) {
      if (!motion) return
      const glow = skySprites().glow
      ctx.globalCompositeOperation = 'lighter'
      for (const g of list) {
        const p = view.map(g.u, g.v)
        sparkle(ctx, glow, p.x, p.y, 6 * g.size * view.u, Math.sin((Math.PI * g.age) / g.life) * Math.min(1.2, k), '#ffffff')
      }
    },
  }
}

/** Poussière de diamant : des cristaux de givre étincellent dans la lumière du soleil. */
function diamond(sky) {
  const r = sky.rand
  const PRISM = ['#ffffff', '#dff4ff', '#ffe6f4', '#fff6d8']
  let list = []
  return {
    update(dt, view, k) {
      const s = sky.data.sun
      for (let n = 5 * k * dt; n > 0; n--) {
        if (r.next() >= n) continue
        const ang = r.next() * TAU
        const rr = r.range(0.04, 0.34)
        const v = s.v + Math.sin(ang) * rr * 2.2
        if (v > 0.02 && v < 0.75) list.push({ u: s.u + Math.cos(ang) * rr, v, age: 0, life: r.range(0.9, 1.8), ph: r.next() * TAU, c: r.pick(PRISM), size: r.range(0.6, 1.2) })
      }
      for (const d of list) {
        d.age += dt
        d.u += sky.dir * 0.004 * dt
        d.v += 0.006 * dt
      }
      list = list.filter((d) => d.age < d.life)
    },
    draw(ctx, view, t, motion, k) {
      if (!motion) return
      const glow = skySprites().glow
      ctx.globalCompositeOperation = 'lighter'
      for (const d of list) {
        const p = view.map(d.u, d.v)
        const tw = 0.55 + 0.45 * Math.sin(t * 18 + d.ph)
        sparkle(ctx, glow, p.x, p.y, 3.2 * d.size * view.u, Math.sin((Math.PI * d.age) / d.life) * tw * Math.min(1.2, k), d.c)
      }
    },
  }
}

/** Poussière dorée : des grains flottent dans la lumière du couchant et scintillent. */
function dust(sky) {
  const r = sky.rand
  const spawn = () => {
    const s = sky.data.sun
    const ang = r.next() * TAU
    const rr = r.range(0.03, 0.26)
    return { u: s.u + Math.cos(ang) * rr, v: s.v + Math.sin(ang) * rr * 1.6, vu: r.range(-0.003, 0.003) + sky.dir * 0.002, vv: r.range(-0.006, -0.002), age: 0, life: r.range(5, 9), ph: r.next() * TAU, f: r.range(1.5, 3.5), size: r.range(0.7, 1.3) }
  }
  let list = null
  return {
    update(dt) {
      list ??= Array.from({ length: 34 }, () => Object.assign(spawn(), { age: r.range(0, 5) }))
      for (const m of list) {
        m.age += dt
        m.u += m.vu * dt
        m.v += m.vv * dt
        if (m.age > m.life) Object.assign(m, spawn())
      }
    },
    draw(ctx, view, t, motion, k) {
      if (!list) return
      const gold = skySprites().gold
      ctx.globalCompositeOperation = 'lighter'
      for (const m of list) {
        const q = m.age / m.life
        const tw = 0.5 + 0.5 * Math.sin(t * m.f + m.ph)
        const p = view.map(m.u, m.v)
        const rad = (1.6 + 1.6 * tw) * view.u * m.size
        ctx.globalAlpha = clamp01(Math.sin(Math.PI * q) * (0.25 + 0.55 * tw) * Math.min(1.3, k))
        ctx.drawImage(gold, p.x - rad, p.y - rad, 2 * rad, 2 * rad)
      }
    },
  }
}

/** Lucioles : sur la colline sombre de la peinture, elles errent et clignotent. */
function fireflies(sky) {
  const r = sky.rand
  let list = null
  return {
    update() {
      if (!list && sky.data.hill?.length) list = Array.from({ length: sky.cfg.fireflies }, () => {
        const p = r.pick(sky.data.hill)
        return { u: p.u, v: p.v, ph: r.next() * TAU, f: r.range(0.5, 1.1), w: r.range(0.6, 1.4) }
      })
    },
    draw(ctx, view, t, motion, k) {
      if (!list) return
      const img = skySprites().firefly
      ctx.globalCompositeOperation = 'lighter'
      for (const f of list) {
        const blink = Math.max(0, Math.sin(t * f.f + f.ph)) ** 4
        if (blink < 0.02) continue
        const p = view.map(f.u, f.v)
        const x = p.x + Math.sin(t * 0.37 * f.w + f.ph) * 22 * view.u
        const y = p.y + Math.sin(t * 0.61 * f.w + f.ph * 2) * 9 * view.u
        const rad = 7 * view.u
        ctx.globalAlpha = clamp01(blink * 0.9 * Math.min(1.3, k))
        ctx.drawImage(img, x - rad, y - rad, 2 * rad, 2 * rad)
      }
    },
  }
}

/* ---------- Air : nuages, brumes, vent ---------- */

/** Ombres des nuages : de grandes taches douces qui glissent sur les terres, jamais sur le ciel. */
function shadows(sky) {
  const r = sky.rand
  const cfg = sky.cfg.shadows
  const list = Array.from({ length: cfg.count }, (_, i) => ({ x: -0.3 + (1.5 * (i + r.next() * 0.6)) / cfg.count, v: r.range(cfg.from + 0.04, cfg.to), w: r.range(0.24, 0.4), sp: r.range(0.006, 0.011), i: i % 2 }))
  return {
    update(dt) {
      for (const c of list) {
        c.x += sky.dir * c.sp * dt
        if (sky.dir > 0 && c.x > 1.1) Object.assign(c, { x: -0.5, v: r.range(cfg.from + 0.04, cfg.to) })
        if (sky.dir < 0 && c.x < -0.5) Object.assign(c, { x: 1.1, v: r.range(cfg.from + 0.04, cfg.to) })
      }
    },
    draw(ctx, view, t, motion, k) {
      const sp = skySprites().shadow
      ctx.globalAlpha = clamp01(cfg.alpha * Math.min(1.3, k))
      for (const c of list) {
        const w = c.w * view.W
        const h = w * 0.2
        const y = view.map(0, c.v).y
        ctx.drawImage(sp[c.i], c.x * view.W, y - h / 2, w, h)
      }
    },
  }
}

/**
 * Risées : des taches de lumière courent sur l'herbe, découpées dans le masque
 * de la peinture (l'herbe seule s'éclaire) par une ellipse au bord fondu.
 */
function gusts(sky) {
  const r = sky.rand
  const cfg = sky.cfg.gusts
  const state = {}
  let x = null
  let v = 0
  let next = r.range(1.5, 3.5)
  let patches = []
  return {
    get active() {
      return x !== null
    },
    update(dt, view, k) {
      if (x === null && (next -= dt * k) <= 0) {
        x = sky.dir > 0 ? -0.25 : 1.25
        v = r.range(0.17, 0.24)
        patches = [[0, r.range(cfg.from + 0.12, 0.9), r.range(0.26, 0.34)], [-0.09, r.range(cfg.from + 0.08, 0.86), r.range(0.16, 0.22)], [-0.17, r.range(cfg.from + 0.14, 0.92), r.range(0.12, 0.18)]]
        sky.emit('gust', { dir: sky.dir, seconds: 1.5 / v })
      }
      if (x !== null) {
        x += sky.dir * v * dt
        if (x < -0.5 || x > 1.5) {
          x = null
          next = r.range(...(cfg.every ?? [6, 11]))
        }
      }
    },
    draw(ctx, view, t, motion, k) {
      const G = sky.data.grass
      if (!motion || x === null || !G) return
      const sc = view.iw / G.w
      const oval = skySprites().oval
      for (const [lag, pv, wid] of patches) {
        const pw = wid * view.W
        const ph = pw * 0.32
        const cx = (x + sky.dir * lag) * view.W
        const cy = view.map(0, pv).y
        const mw = Math.ceil(pw / sc)
        const mh = Math.ceil(ph / sc)
        const buf = buffer(state, mw, mh)
        const g = (state.g ??= buf.getContext('2d'))
        g.globalCompositeOperation = 'source-over'
        g.clearRect(0, 0, mw, mh)
        g.drawImage(G.canvas, (cx - pw / 2 - view.x0) / sc, (cy - ph / 2 - view.y0) / sc, mw, mh, 0, 0, mw, mh)
        g.globalCompositeOperation = 'destination-in'
        g.drawImage(oval, 0, 0, mw, mh)
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = clamp01(cfg.alpha * Math.min(1.4, k))
        ctx.drawImage(buf, 0, 0, mw, mh, cx - pw / 2, cy - ph / 2, mw * sc, mh * sc)
      }
    },
  }
}

/** Feuilles et pétales : ils traversent la scène avec le vent ; pendant une rafale, il en vient plus, et plus vite. */
function leaves(sky) {
  const r = sky.rand
  const cfg = sky.cfg.leaves
  let list = []
  let next = 0
  return {
    update(dt, view, k) {
      const gust = sky.effect('gusts')?.active ? 1.8 : 1
      if ((next -= dt * k * gust) <= 0) {
        next = r.range(0.3, 0.75)
        list.push({ x: sky.dir > 0 ? -0.02 : 1.02, v: r.range(cfg.from, cfg.to), vx: r.range(0.08, 0.15), ph: r.next() * TAU, spin: r.range(2, 5) * (r.next() < 0.5 ? -1 : 1), flut: r.range(1.6, 3.2), size: r.range(0.7, 1.3), c: r.pick(cfg.colors), age: 0 })
      }
      for (const f of list) {
        f.age += dt
        f.x += sky.dir * f.vx * gust * dt
        f.v += (Math.sin(f.age * f.flut + f.ph) * 0.02 + 0.006) * dt
      }
      list = list.filter((f) => f.x > -0.05 && f.x < 1.05 && f.v < 0.95)
    },
    draw(ctx, view, t, motion, k) {
      if (!motion) return
      ctx.globalAlpha = clamp01(0.9 * Math.min(1.2, k))
      for (const f of list) {
        const y = view.map(0, f.v).y
        const w = 4.5 * f.size * view.u
        const h = Math.max(0.7 * view.u, w * 0.5 * Math.abs(Math.cos(f.age * f.flut * 1.7 + f.ph)))
        ctx.save()
        ctx.translate(f.x * view.W, y)
        ctx.rotate(f.ph + f.age * f.spin)
        ctx.fillStyle = f.c
        ctx.beginPath()
        ctx.ellipse(0, 0, w, h, 0, 0, TAU)
        ctx.fill()
        ctx.restore()
      }
    },
  }
}

/** Lambeaux de nuages qui filent bas sous l'orage. */
function scud(sky) {
  const r = sky.rand
  let list = null
  return {
    update(dt, view) {
      list ??= Array.from({ length: 7 }, (_, i) => ({ x: r.range(-0.2, 1.1) * view.W, y: r.range(0.06, 0.42) * view.H, s: r.range(0.9, 1.8), v: r.range(28, 60), i: i % 2 }))
      for (const c of list) {
        c.x += sky.dir * c.v * view.u * dt
        if (sky.dir < 0 && c.x < -0.35 * view.W) Object.assign(c, { x: 1.15 * view.W, y: r.range(0.06, 0.42) * view.H })
        if (sky.dir > 0 && c.x > 1.15 * view.W) Object.assign(c, { x: -0.35 * view.W, y: r.range(0.06, 0.42) * view.H })
      }
    },
    draw(ctx, view, t, motion, k) {
      if (!list) return
      const sp = skySprites().scud
      ctx.globalAlpha = clamp01(0.55 * Math.min(1.2, k))
      for (const c of list) {
        const w = 260 * c.s * view.u
        ctx.drawImage(sp[c.i], c.x, c.y, w, w * 0.45)
      }
    },
  }
}

/** Brume : des bandes qui se raccordent, chacune à sa profondeur et à sa vitesse. */
function mist(sky) {
  return {
    draw(ctx, view, t, motion, k) {
      const sp = skySprites()
      const tex = sky.cfg.banks ? sp.banks : sp.mist
      for (const [v, speed, alpha, scale] of sky.cfg.mist) {
        const h = tex.height * scale * view.u
        const w = tex.width * scale * view.u
        const y = view.map(0, v).y - h / 2
        let x = ((((sky.dir * sky.t * speed * view.u) % w) + w) % w) - w
        ctx.globalAlpha = clamp01(alpha * k)
        for (; x < view.W; x += w) ctx.drawImage(tex, x, y, w, h)
      }
    },
  }
}

/**
 * Brume qui roule : des nuées arrivent avec le vent, enflent en passant devant
 * les arbres et se défont ; elles se croisent à des vitesses différentes.
 */
function fogroll(sky) {
  const r = sky.rand
  const cfg = sky.cfg.fogroll
  const spawn = (anywhere) => ({ x: anywhere ? r.range(-0.1, 1.1) : sky.dir > 0 ? r.range(-0.3, -0.05) : r.range(1.05, 1.3), v: r.range(cfg.from, cfg.to), vx: r.range(0.012, 0.03), r: r.range(0.1, 0.17), age: anywhere ? r.range(0, 12) : 0, life: r.range(18, 28), i: r.next() < 0.5 ? 0 : 1 })
  const list = Array.from({ length: cfg.count }, () => spawn(true))
  return {
    update(dt) {
      for (const p of list) {
        p.age += dt
        p.x += sky.dir * p.vx * dt
        if (p.age > p.life || p.x < -0.45 || p.x > 1.45) Object.assign(p, spawn(false))
      }
    },
    draw(ctx, view, t, motion, k) {
      const sp = skySprites().fogPuff
      for (const p of list) {
        const q = p.age / p.life
        const fade = Math.min(1, q * 4, (1 - q) * 3)
        const rad = p.r * view.W * (0.85 + 0.35 * q)
        const y = view.map(0, p.v).y
        ctx.globalAlpha = clamp01(cfg.alpha * fade * Math.min(1.3, k))
        ctx.drawImage(sp[p.i], p.x * view.W - rad, y - rad * 0.4, 2 * rad, rad * 0.8)
      }
    },
  }
}

/** Voiles de sable ou de poudreuse : fins, rapides, au ras du sol, par rafales. */
function veils(sky) {
  return {
    draw(ctx, view, t, motion, k) {
      const cfg = sky.cfg.veils
      const S = skySprites().veils[cfg.kind]
      for (const [v, speed, alpha, sy] of cfg.layers) {
        const w = S.width * 1.6 * view.u
        const h = S.height * sy * view.u
        const y = view.map(0, v).y - h / 2
        const gust = 0.55 + 0.45 * Math.sin(t * 0.37 + v * 9)
        let x = ((((sky.dir * t * speed * view.u) % w) + w) % w) - w
        ctx.globalAlpha = clamp01(alpha * gust * Math.min(1.4, k))
        for (; x < view.W; x += w) ctx.drawImage(S, x, y, w, h)
      }
    },
  }
}

/** Air chaud : la bande de l'horizon redessinée par fines lignes, décalées d'un souffle. */
function haze(sky) {
  return {
    draw(ctx, view, t, motion, k) {
      if (!motion) return
      const img = sky.img
      const [v0, v1] = sky.cfg.haze
      const top = Math.round(view.map(0, v0).y)
      const bot = Math.round(view.map(0, v1).y)
      const step = Math.max(2, Math.round(2 * view.u))
      const amp = 1.6 * view.u * Math.min(1.4, k)
      for (let y = top; y < bot; y += step) {
        const e = Math.sin((Math.PI * (y - top)) / (bot - top))
        const dx = e * amp * Math.sin((y / view.u) * 0.13 + t * 2.3) * (0.6 + 0.4 * Math.sin(t * 0.5 + (y / view.u) * 0.011))
        ctx.drawImage(img, 0, (y - view.y0) / view.s, img.width, step / view.s, view.x0 + dx, y, view.iw, step)
      }
    },
  }
}

/** Tourbillon de sable : une colonne qui s'évase, ondule et se dissout, des grains qui tournent, au loin. */
function devil(sky) {
  const r = sky.rand
  const cfg = sky.cfg.devil
  let d = null
  let next = r.range(2.5, 5)
  const hash = (n) => {
    const x = Math.sin(n * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }
  return {
    update(dt, view, k) {
      if (!d && (next -= dt * k) <= 0) {
        d = { u: r.range(0.18, 0.82), v: r.range(cfg.from, cfg.to), age: 0, life: r.range(10, 14), h: r.range(120, 170), sp: r.range(0.012, 0.02), seed: r.next() * 100 }
        sky.emit('devil', { u: d.u, speed: sky.dir * d.sp, seconds: d.life })
      }
      if (d) {
        d.age += dt
        d.u += sky.dir * d.sp * dt
        if (d.age > d.life) {
          d = null
          next = r.range(14, 24)
        }
      }
    },
    draw(ctx, view, t, motion, k) {
      if (!motion || !d) return
      const sp = skySprites()
      const q = d.age / d.life
      const fade = Math.min(1, q * 4, (1 - q) * 4) * Math.min(1.3, k)
      const base = view.map(d.u, d.v)
      const H = d.h * view.u
      const lean = sky.dir * 0.22
      const axis = (f) => base.x + lean * f * H + Math.sin(t * 2.2 + f * 5 + d.seed) * 7 * view.u * f
      for (let i = 0; i < 24; i++) {
        const f = i / 23
        const rad = (4 + 22 * f ** 1.3) * view.u
        ctx.globalAlpha = clamp01(0.2 * (1.2 - f) * fade)
        ctx.drawImage(sp.dustSoft, axis(f) - rad, base.y - f * H - rad * 0.9, rad * 2, rad * 1.8)
      }
      for (let i = 0; i < 3; i++) {
        const f = 0.82 + i * 0.08
        const rad = (22 + 10 * i) * view.u
        ctx.globalAlpha = clamp01(0.22 * fade)
        ctx.drawImage(sp.dust, axis(f) - rad * 1.2, base.y - f * H - rad * 0.6, rad * 2.4, rad * 1.2)
      }
      ctx.fillStyle = '#e9c48e'
      for (let j = 0; j < 44; j++) {
        const f = hash(j + d.seed)
        const ang = t * (6 - 3 * f) + hash(j * 7 + d.seed) * TAU
        const rr = (3 + 24 * f ** 1.4) * view.u
        const cx = base.x + lean * f * H
        ctx.globalAlpha = clamp01((0.2 + 0.3 * Math.sin(ang)) * fade)
        ctx.fillRect(cx + Math.cos(ang) * rr, base.y - f * H + Math.sin(ang) * rr * 0.22, 1.4 * view.u, 1.4 * view.u)
      }
      ctx.globalAlpha = clamp01(0.32 * fade)
      ctx.drawImage(sp.dustLow, base.x - 36 * view.u, base.y - 8 * view.u, 72 * view.u, 14 * view.u)
    },
  }
}

/* ---------- Eau, feu, matière ---------- */

/** Cascade : des filets d'eau défilent vers le bas, découpés par l'eau de la peinture ; au pied, l'écume monte. */
function falls(sky) {
  const r = sky.rand
  const state = {}
  let spray = []
  let next = 0
  return {
    update(dt, view, k) {
      if ((next -= dt * k) <= 0) {
        next = r.range(0.18, 0.4)
        spray.push({ du: r.range(-0.012, 0.012), age: 0, life: r.range(2.2, 3.4), r: r.range(10, 18), vy: r.range(8, 16), i: r.next() < 0.5 ? 0 : 1 })
      }
      for (const p of spray) p.age += dt
      spray = spray.filter((p) => p.age < p.life)
    },
    draw(ctx, view, t, motion, k) {
      const F = sky.data.falls
      if (!F || !motion) return
      const sp = skySprites()
      const sc = view.iw / F.w
      const buf = buffer(state, F.bw, F.bh)
      const g = (state.g ??= buf.getContext('2d'))
      g.globalCompositeOperation = 'source-over'
      g.clearRect(0, 0, F.bw, F.bh)
      const tex = sp.fallStreaks
      for (const [speed, shift] of [[90, 0], [140, 23]]) {
        const off = (t * speed + shift) % tex.height
        for (let x = -((shift * 3) % tex.width); x < F.bw; x += tex.width) for (let y = off - tex.height; y < F.bh; y += tex.height) g.drawImage(tex, x, y)
      }
      g.globalCompositeOperation = 'destination-in'
      g.drawImage(F.mask, 0, 0)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = clamp01(0.45 * Math.min(1.3, k))
      ctx.drawImage(buf, 0, 0, F.bw, F.bh, view.x0 + F.x0 * sc, view.y0 + F.y0 * sc, F.bw * sc, F.bh * sc)
      ctx.globalCompositeOperation = 'source-over'
      const foot = view.map(sky.cfg.falls.foot[0], sky.cfg.falls.foot[1])
      for (const p of spray) {
        const q = p.age / p.life
        const rad = p.r * view.u * (0.7 + 0.8 * q)
        ctx.globalAlpha = clamp01(0.4 * Math.sin(Math.PI * q) * Math.min(1.3, k))
        ctx.drawImage(sp.fogPuff[p.i], foot.x + p.du * view.iw - rad, foot.y - p.vy * view.u * p.age - rad * 0.6, 2 * rad, rad * 1.2)
      }
    },
  }
}

/** Ronds dans l'eau : deux cercles aplatis qui s'élargissent en ralentissant. */
function ripples(sky) {
  const r = sky.rand
  let list = []
  let next = 0.6
  return {
    update(dt, view, k) {
      const spots = sky.data.water
      if (!spots?.length) return
      if ((next -= dt * k) <= 0) {
        const p = r.pick(spots)
        list.push({ u: p.u, v: p.v, age: 0, life: r.range(2.6, 3.4), size: r.range(0.8, 1.3) })
        next = r.range(1.1, 2.6)
        if (r.next() < 0.5) sky.emit('plip', { u: p.u })
      }
      for (const p of list) p.age += dt
      list = list.filter((p) => p.age < p.life)
    },
    draw(ctx, view, t, motion, k) {
      if (!motion) return
      ctx.lineWidth = 1.2 * view.u
      for (const p of list) {
        const at = view.map(p.u, p.v)
        const q = p.age / p.life
        for (const [delay, grow] of [[0, 30], [0.18, 19]]) {
          const qq = (q - delay) / (1 - delay)
          if (qq <= 0) continue
          const rx = (2 + grow * p.size * Math.sqrt(qq)) * view.u
          const al = (1 - qq) ** 1.6 * Math.min(1.3, k)
          // Le creux de la ride (sombre), puis sa crête qui prend la lumière, juste dessous.
          ctx.strokeStyle = '#4c6658'
          ctx.globalAlpha = clamp01(0.4 * al)
          ctx.beginPath()
          ctx.ellipse(at.x, at.y, rx, rx * 0.24, 0, 0, TAU)
          ctx.stroke()
          ctx.strokeStyle = '#f4faf4'
          ctx.globalAlpha = clamp01(0.45 * al)
          ctx.beginPath()
          ctx.ellipse(at.x, at.y + 1.2 * view.u, rx, rx * 0.24, 0, 0, TAU)
          ctx.stroke()
        }
      }
    },
  }
}

/** Feux follets : des lueurs vertes qui flottent bas, vacillent, puis s'éteignent. */
function wisps(sky) {
  const r = sky.rand
  const cfg = sky.cfg.wisps
  let list = []
  let next = 0.3
  return {
    update(dt, view, k) {
      if (list.length < cfg.max && (next -= dt * k) <= 0) {
        list.push({ u: r.range(0.06, 0.94), v: r.range(cfg.from, cfg.to), age: 0, life: r.range(7, 11), ph: r.next() * TAU, size: r.range(0.8, 1.3), drift: r.range(-0.004, 0.004) })
        next = r.range(1.5, 3.5)
      }
      for (const w of list) {
        w.age += dt
        w.u += w.drift * dt
        w.v -= 0.0015 * dt
      }
      list = list.filter((w) => w.age < w.life)
    },
    draw(ctx, view, t, motion, k) {
      const sp = skySprites()
      ctx.globalCompositeOperation = 'lighter'
      for (const w of list) {
        const q = w.age / w.life
        const fade = Math.min(1, q * 5, (1 - q) * 4)
        const flicker = 0.75 + 0.25 * Math.sin(t * 4.7 + w.ph) * Math.sin(t * 2.3 + w.ph * 2)
        const p = view.map(w.u, w.v)
        const x = p.x + Math.sin(t * 0.4 + w.ph) * 26 * view.u
        const y = p.y + Math.sin(t * 0.9 + w.ph * 3) * 7 * view.u
        const rad = 24 * w.size * view.u
        ctx.globalAlpha = clamp01(0.6 * fade * flicker * Math.min(1.3, k))
        ctx.drawImage(sp.wisp, x - rad, y - rad, 2 * rad, 2 * rad)
        ctx.globalAlpha = clamp01(0.9 * fade * flicker)
        ctx.drawImage(sp.glow, x - 4 * view.u, y - 4 * view.u, 8 * view.u, 8 * view.u)
      }
    },
  }
}

/** Les coulées de lave de la peinture rougeoient et respirent. */
function lava(sky) {
  return {
    draw(ctx, view, t, motion, k) {
      if (!sky.data.lava) return
      const pulse = 0.5 + 0.3 * Math.sin(t * 2.1) + 0.2 * Math.sin(t * 0.8 + 1.3)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = clamp01((0.12 + 0.2 * pulse) * k)
      ctx.drawImage(sky.data.lava, view.x0, view.y0, view.iw, view.ih)
    },
  }
}

/** La fumée du volcan roule et s'élève. */
function smoke(sky) {
  const r = sky.rand
  let list = []
  let next = 0
  return {
    update(dt, view, k) {
      if ((next -= dt * k) <= 0) {
        list.push({ age: 0, life: r.range(10, 14), x: 0, y: 0, vx: sky.dir * r.range(3, 9), vy: -r.range(10, 16), r0: r.range(26, 40), i: r.next() < 0.5 ? 0 : 1 })
        next = r.range(0.7, 1.1)
      }
      for (const p of list) {
        p.age += dt
        p.x += p.vx * view.u * dt
        p.y += p.vy * view.u * dt
        p.vx += sky.dir * 0.4 * dt
      }
      list = list.filter((p) => p.age < p.life)
    },
    draw(ctx, view, t, motion, k) {
      const sp = skySprites().smoke
      const base = view.map(sky.cfg.crater[0], sky.cfg.crater[1])
      for (const p of list) {
        const q = p.age / p.life
        const rad = (p.r0 + 150 * q) * view.u
        ctx.globalAlpha = clamp01(Math.sin(Math.PI * Math.min(1, q * 1.4)) * 0.75 * Math.min(1.2, k))
        ctx.drawImage(sp[p.i], base.x + p.x - rad, base.y + p.y - rad, 2 * rad, 2 * rad)
      }
    },
  }
}

/** Des braises montent de la lave, portées par la chaleur. */
function embers(sky) {
  const r = sky.rand
  let list = []
  return {
    update(dt, view, k) {
      const spots = sky.data.spots
      if (!spots?.length) return
      for (let n = 26 * k * dt; n > 0; n--) {
        if (r.next() < n) {
          const s = r.pick(spots)
          const p = view.map(s.u, s.v)
          list.push({ x: p.x, y: p.y, vx: sky.dir * r.range(4, 18), vy: -r.range(22, 58), age: 0, life: r.range(2, 4.5), size: r.range(0.9, 2.3), ph: r.next() * 6.28 })
        }
      }
      for (const e of list) {
        e.age += dt
        e.x += (e.vx + Math.sin(sky.t * 2.2 + e.ph) * 9) * view.u * dt
        e.y += e.vy * view.u * dt
        e.vy *= 0.995
      }
      list = list.filter((e) => e.age < e.life).slice(-160)
    },
    draw(ctx, view, t, motion, k) {
      const sp = skySprites()
      ctx.globalCompositeOperation = 'lighter'
      for (const e of list) {
        const q = e.age / e.life
        const rad = e.size * view.u * 2.4
        ctx.globalAlpha = clamp01(Math.sin(Math.PI * q) * 0.9 * Math.min(1.2, k))
        ctx.drawImage(q < 0.5 ? sp.emberHot : sp.emberCool, e.x - rad, e.y - rad, 2 * rad, 2 * rad)
      }
    },
  }
}

/** Une cendre fine retombe sur toute la scène. */
function ash(sky) {
  const r = sky.rand
  let flakes = null
  return {
    update(dt, view) {
      flakes ??= Array.from({ length: 46 }, () => ({ x: r.next() * view.W, y: r.next() * view.ground, vy: r.range(8, 20), vx: sky.dir * r.range(-4, 12), s: r.range(1.2, 2.6), ph: r.next() * 6.28 }))
      for (const f of flakes) {
        f.y += f.vy * view.u * dt
        f.x += (f.vx + Math.sin(sky.t * 0.9 + f.ph) * 6) * view.u * dt
        if (f.y > view.ground) Object.assign(f, { y: -4, x: r.next() * view.W })
        if (f.x < -10) f.x += view.W + 20
        else if (f.x > view.W + 10) f.x -= view.W + 20
      }
    },
    draw(ctx, view, t, motion, k) {
      if (!flakes) return
      ctx.fillStyle = '#b9aec8'
      ctx.globalAlpha = clamp01(0.35 * Math.min(1.3, k))
      for (const f of flakes) ctx.fillRect(f.x, f.y, f.s * view.u, f.s * view.u * 0.7)
    },
  }
}

/** Quelques poussières de lune volent au ras du sol. */
function motes(sky) {
  const r = sky.rand
  let list = null
  return {
    update(dt, view) {
      list ??= Array.from({ length: 22 }, () => ({ x: r.next() * view.W, y: r.range(0.66, 0.84) * view.H, v: r.range(40, 90), s: r.range(0.8, 1.8), ph: r.next() * 6.28 }))
      for (const m of list) {
        m.x += sky.dir * m.v * view.u * dt
        m.y += Math.sin(sky.t * 1.7 + m.ph) * 6 * view.u * dt
        if (sky.dir < 0 && m.x < -10) Object.assign(m, { x: view.W + 10, y: r.range(0.66, 0.84) * view.H })
        if (sky.dir > 0 && m.x > view.W + 10) Object.assign(m, { x: -10, y: r.range(0.66, 0.84) * view.H })
      }
    },
    draw(ctx, view, t, motion, k) {
      if (!list) return
      const glow = skySprites().glow
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = clamp01(0.35 * k)
      for (const m of list) ctx.drawImage(glow, m.x - 3 * view.u * m.s, m.y - 3 * view.u * m.s, 6 * view.u * m.s, 6 * view.u * m.s)
    },
  }
}

/** Pluie : deux nappes, dans le sens du vent. */
function rain(sky) {
  const r = sky.rand
  let layers = null
  let width = 0
  return {
    update(dt, view) {
      if (!layers || width !== view.W) {
        width = view.W
        const mk = (n, vy, vx, len, w, a) => ({ vy: vy * view.u, vx: vx * view.u, len: len * view.u, w: w * view.u, a, drops: Array.from({ length: n }, () => ({ x: r.range(-0.1, 1.15) * view.W, y: r.next() * view.ground })) })
        layers = [mk(190, 780, 150, 13, 1, 0.2), mk(110, 1250, 240, 24, 1.4, 0.3)]
      }
      for (const layer of layers) {
        for (const d of layer.drops) {
          d.y += layer.vy * dt
          d.x += sky.dir * layer.vx * dt
          if (d.y > view.ground) Object.assign(d, { y: d.y - (view.ground + 40 * view.u), x: r.range(-0.1, 1.15) * view.W })
        }
      }
    },
    draw(ctx, view, t, motion, k) {
      if (!motion || !layers) return
      ctx.strokeStyle = '#d4e4ff'
      ctx.lineCap = 'round'
      for (const layer of layers) {
        ctx.globalAlpha = clamp01(layer.a * Math.min(1.4, k))
        ctx.lineWidth = layer.w
        ctx.beginPath()
        const nx = (sky.dir * layer.vx) / layer.vy
        const count = Math.round(layer.drops.length * Math.min(1, 0.45 + 0.4 * k))
        for (let i = 0; i < count; i++) {
          const d = layer.drops[i]
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x - nx * layer.len, d.y - layer.len)
        }
        ctx.stroke()
      }
    },
  }
}

/** Neige : trois profondeurs, de la fine poussière au gros flocon flou. */
function snow(sky) {
  const r = sky.rand
  let layers = null
  let width = 0
  return {
    update(dt, view) {
      if (!layers || width !== view.W) {
        width = view.W
        const mk = (n, rad, vy, vx, sway, a, soft) => ({ r: rad * view.u, vy: vy * view.u, vx: vx * view.u, sway: sway * view.u, a, soft, flakes: Array.from({ length: n }, () => ({ x: r.next() * view.W, y: r.next() * view.ground, ph: r.next() * TAU, f: r.range(0.6, 1.4) })) })
        layers = [mk(120, 1, 20, 6, 8, 0.55), mk(60, 1.7, 34, 10, 12, 0.7), mk(18, 4.2, 58, 16, 18, 0.75, true)]
      }
      for (const layer of layers) {
        for (const f of layer.flakes) {
          f.y += layer.vy * dt
          f.x += (sky.dir * layer.vx + Math.sin(sky.t * f.f + f.ph) * layer.sway) * dt
          if (f.y > view.ground) Object.assign(f, { y: -6 * view.u, x: r.next() * view.W })
          if (f.x < -10) f.x += view.W + 20
          else if (f.x > view.W + 10) f.x -= view.W + 20
        }
      }
    },
    draw(ctx, view, t, motion, k) {
      if (!motion || !layers) return
      const glow = skySprites().glow
      ctx.fillStyle = '#ffffff'
      for (const layer of layers) {
        const count = Math.round(layer.flakes.length * Math.min(1, 0.45 + 0.4 * k))
        ctx.globalAlpha = clamp01(layer.a * Math.min(1.2, k))
        if (layer.soft) {
          for (let i = 0; i < count; i++) {
            const f = layer.flakes[i]
            ctx.drawImage(glow, f.x - layer.r, f.y - layer.r, 2 * layer.r, 2 * layer.r)
          }
          continue
        }
        ctx.beginPath()
        for (let i = 0; i < count; i++) {
          const f = layer.flakes[i]
          ctx.moveTo(f.x + layer.r, f.y)
          ctx.arc(f.x, f.y, layer.r, 0, TAU)
        }
        ctx.fill()
      }
    },
  }
}

/** Les effets, par nom. */
export const EFFECTS = /* @__PURE__ */ Object.freeze({
  moon, stars, meteors, sun, rays, flare, veil, lightning, glints, diamond, dust, fireflies,
  shadows, gusts, leaves, scud, mist, fogroll, veils, haze, devil,
  falls, ripples, wisps, lava, smoke, embers, ash, motes, rain, snow,
})
