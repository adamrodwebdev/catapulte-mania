import { WORLD } from '../physics/constants.js'

/**
 * Ce qui tient le château et ce que les pillards y ajoutent (v6.2, sorti du
 * Renderer) : échelles et pont des pillards, cordes, chaînes et charnières des
 * mécanismes, jonctions de l'assemblage et leurs lézardes. Dessin seulement, en
 * repère du monde ; aucun état d'une image à l'autre.
 */

/**
 * Les trois, dans l'ordre du dessin : ouvrages des pillards, mécanismes, jonctions.
 * @param {CanvasRenderingContext2D} ctx repère monde
 * @param {{ works?: object[], tethers?: object, joints?: object[] }} scene
 */
export function drawStructure(ctx, scene, time, pixel) {
  drawWorks(ctx, scene.works, time, pixel)
  drawTethers(ctx, scene.tethers, pixel)
  drawJoints(ctx, scene.joints, pixel)
}

/**
 * Ouvrages des pillards (v5.8) : échelles dressées (montants et barreaux le
 * long de l'itinéraire), et chantiers en cours, en fantôme qui se construit.
 */
export function drawWorks(ctx, works, time, pixel) {
  if (!works?.length) return
  const px = Math.max(1, pixel)
  for (const w of works) {
    ctx.save()
    ctx.globalAlpha = w.building ? 0.45 + 0.15 * Math.sin(time / 160) : 1
    if (w.kind === 'ladder' && w.route) ladder(ctx, w.route, w.progress, px)
    else if (w.kind === 'bridge' && w.span) {
      // Pont en chantier : les planches avancent depuis la berge.
      const len = (w.span.x1 - w.span.x0 + 32) * w.progress
      const x0 = w.span.x1 + 16 - len
      for (let x = x0; x < w.span.x1 + 16; x += 13) {
        ctx.fillStyle = '#9b7044'
        ctx.fillRect(x, WORLD.GROUND_Y - 3, 11, 10)
        ctx.strokeStyle = '#1e1a2b'
        ctx.lineWidth = px
        ctx.strokeRect(x, WORLD.GROUND_Y - 3, 11, 10)
      }
    }
    ctx.restore()
  }
}

/** Une échelle le long d'un itinéraire, construite jusqu'à `progress` (0..1). */
function ladder(ctx, route, progress, px) {
  let total = 0
  for (let i = 1; i < route.length; i++) total += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y)
  let budget = total * Math.max(0, Math.min(1, progress))
  ctx.lineCap = 'round'
  for (let i = 1; i < route.length && budget > 0; i++) {
    const a = route[i - 1]
    const b = route[i]
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    const len = Math.min(seg, budget)
    budget -= len
    const ux = (b.x - a.x) / seg
    const uy = (b.y - a.y) / seg
    // Perpendiculaire : écart des montants.
    const nx = -uy * 7
    const ny = ux * 7
    const ex = a.x + ux * len
    const ey = a.y + uy * len
    for (const [w, col] of [[5 * px, '#1e1a2b'], [3 * px, '#9b7044']]) {
      ctx.strokeStyle = col
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.moveTo(a.x + nx, a.y + ny)
      ctx.lineTo(ex + nx, ey + ny)
      ctx.moveTo(a.x - nx, a.y - ny)
      ctx.lineTo(ex - nx, ey - ny)
      ctx.stroke()
    }
    ctx.strokeStyle = '#7a5530'
    ctx.lineWidth = 2.2 * px
    ctx.beginPath()
    for (let d = 8; d < len; d += 14) {
      const x = a.x + ux * d
      const y = a.y + uy * d
      ctx.moveTo(x + nx, y + ny)
      ctx.lineTo(x - nx, y - ny)
    }
    ctx.stroke()
  }
}

/**
 * Assemblage (v6.2, voir CastleJoints.js) : les jonctions du château, une
 * marque par liant — joint de mortier clair, chevilles de bois, ligatures de
 * paille, rivets de fer, joint de glace, baguette de plomb du vitrail. Une
 * jonction usée se lézarde, de plus en plus profondément.
 */
export function drawJoints(ctx, joints, pixel) {
  if (!joints?.length) return
  const px = Math.max(1, pixel)
  const at = (c) => ({ x: c.bodyA.position.x + c.pointA.x, y: c.bodyA.position.y + c.pointA.y })
  ctx.save()
  ctx.lineCap = 'round'
  for (const j of joints) {
    if (j.bond === 'footing') {
      if (j.cracked) drawJointCrack(ctx, j, at(j.cs[0]), at(j.cs[1]), px)
      continue
    }
    const a = at(j.cs[0])
    const b = at(j.cs[1])
    if (j.bond === 'mortar' || j.bond === 'frost' || j.bond === 'lead') {
      // Un joint continu le long du contact : ombre fine, puis le liant.
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineWidth = 2.6 * px
      ctx.strokeStyle = j.bond === 'lead' ? 'rgba(28,30,36,0.9)' : 'rgba(40,32,24,0.28)'
      ctx.stroke()
      if (j.bond !== 'lead') {
        ctx.lineWidth = 1.4 * px
        ctx.strokeStyle = j.bond === 'frost' ? 'rgba(226,246,255,0.8)' : 'rgba(226,214,190,0.62)'
        ctx.stroke()
      }
    } else {
      for (const p of [a, b]) {
        if (j.bond === 'peg') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 2.3 * px, 0, Math.PI * 2)
          ctx.fillStyle = '#4e321a'
          ctx.fill()
          ctx.fillStyle = 'rgba(255,214,160,0.55)'
          ctx.fillRect(p.x - 0.7 * px, p.y - 0.9 * px, 1.1 * px, 1.1 * px)
        } else if (j.bond === 'rivet') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 2.1 * px, 0, Math.PI * 2)
          ctx.fillStyle = '#2b2f36'
          ctx.fill()
          ctx.beginPath()
          ctx.arc(p.x - 0.6 * px, p.y - 0.6 * px, 0.8 * px, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(200,210,222,0.85)'
          ctx.fill()
        } else {
          // Ligature : deux tours de corde en travers du contact.
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy) || 1
          const nx = (-dy / len) * 3 * px
          const ny = (dx / len) * 3 * px
          ctx.lineWidth = 1.2 * px
          ctx.strokeStyle = '#b48d52'
          for (const k of [-1, 1]) {
            ctx.beginPath()
            ctx.moveTo(p.x - nx + (k * dx) / len, p.y - ny + (k * dy) / len)
            ctx.lineTo(p.x + nx + (k * dx) / len, p.y + ny + (k * dy) / len)
            ctx.stroke()
          }
        }
      }
    }
    if (j.cracked) drawJointCrack(ctx, j, a, b, px)
  }
  ctx.restore()
}

/** Lézarde d'une jonction usée : elle traverse le joint, d'autant plus longue qu'elle est usée. */
function drawJointCrack(ctx, j, a, b, px) {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const k = Math.min(1, j.damage)
  const reach = (4 + k * 15) * px
  let seed = (j.id * 7919) % 233280
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  ctx.lineWidth = (0.9 + k * 0.7) * px
  ctx.strokeStyle = 'rgba(26,18,12,0.85)'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(mx, my)
    const steps = 3 + Math.floor(k * 3)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const wob = (rnd() - 0.5) * 5 * px
      ctx.lineTo(mx - uy * side * reach * t + ux * wob, my + ux * side * reach * t + uy * wob)
    }
    ctx.stroke()
  }
}

/**
 * Mécanismes (v6.0) : cordes de chanvre (légèrement détendues, torsadées),
 * chaînes de fer (maillons alternés), boulons des charnières.
 */
export function drawTethers(ctx, view, pixel) {
  if (!view || (!view.links.length && !view.hinges.length)) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const l of view.links) {
    if (l.kind === 'chain') {
      const len = Math.hypot(l.bx - l.ax, l.by - l.ay)
      const n = Math.max(2, Math.round(len / 7))
      const a = Math.atan2(l.by - l.ay, l.bx - l.ax)
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n
        ctx.save()
        ctx.translate(l.ax + (l.bx - l.ax) * u, l.ay + (l.by - l.ay) * u)
        ctx.rotate(a)
        ctx.beginPath()
        // Un maillon sur deux de face (anneau), l'autre de profil (barrette).
        if (i % 2) ctx.rect(-4.2, -0.9, 8.4, 1.8)
        else ctx.ellipse(0, 0, 4.6, 2.6, 0, 0, Math.PI * 2)
        ctx.lineWidth = 2.6
        ctx.strokeStyle = '#2b2d33'
        ctx.stroke()
        ctx.lineWidth = 1.3
        ctx.strokeStyle = '#9aa1ad'
        ctx.stroke()
        ctx.restore()
      }
      continue
    }
    // Corde : un léger ventre quand elle a du mou, une torsade sombre.
    const mx = (l.ax + l.bx) / 2
    const my = (l.ay + l.by) / 2 + Math.min(18, l.slack * 0.6)
    const path = () => {
      ctx.beginPath()
      ctx.moveTo(l.ax, l.ay)
      ctx.quadraticCurveTo(mx, my, l.bx, l.by)
    }
    path()
    ctx.lineWidth = 4.4
    ctx.strokeStyle = '#3a2614'
    ctx.stroke()
    path()
    ctx.lineWidth = 2.8
    ctx.strokeStyle = '#b08a55'
    ctx.stroke()
    path()
    ctx.setLineDash([2.2, 3.2])
    ctx.lineWidth = 2.8
    ctx.strokeStyle = 'rgba(70,46,22,0.75)'
    ctx.stroke()
    ctx.setLineDash([])
    if (l.stub) {
      // Bout effiloché de la corde tranchée.
      ctx.lineWidth = 1
      ctx.strokeStyle = '#8a6a40'
      for (const d of [-2.5, 0, 2.5]) {
        ctx.beginPath()
        ctx.moveTo(l.bx, l.by)
        ctx.lineTo(l.bx + d, l.by + 5)
        ctx.stroke()
      }
    }
  }
  for (const h of view.hinges) {
    ctx.beginPath()
    ctx.arc(h.x, h.y, 4.2, 0, Math.PI * 2)
    ctx.fillStyle = '#4b515b'
    ctx.fill()
    ctx.lineWidth = 1.4 * Math.max(1, pixel)
    ctx.strokeStyle = '#1e1a2b'
    ctx.stroke()
  }
  ctx.restore()
}
