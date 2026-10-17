import Matter from 'matter-js'
import { WORLD } from './constants.js'
import { ELEMENT_HIT_CAP } from '../entities/catalog.js'
import { canPush, hitDamage, fallDamage, FREEFALL } from './FallingObjects.js'
import { BREACH_HEAVY_MASS, OGRE_SWAT_MS, PUSHED_SAFE_MS, RESTRIKE_MS, KNOCKDOWN_SHARE } from './physicsRules.js'

const { Body, Sleeping, Query, Vertices } = Matter

/**
 * Événement `hurt` d'un défenseur blessé (v6.2 : le même pour tous les coups).
 * @param {any} t défenseur
 * @param {number} amount points de vie perdus (affichés)
 * @param {string} cause
 * @param {boolean} died vrai si ce coup vient de l'achever
 * @param {number} dir sens du coup (-1, 0, 1)
 */
export function hurtEvent(t, amount, cause, died, dir) {
  return { entity: t, amount, cause, lethal: died || !t.alive, x: t.x, y: t.y - t.height * 0.35, dir }
}

/**
 * Ce que les règles des défenseurs peuvent lire et faire du monde (fourni par PhysicsWorld, v6.2).
 * @typedef {object} DefenderPort
 * @property {number} time ms de monde
 * @property {() => Iterable<any>} entities
 * @property {(predicate: (e: any) => boolean) => any[]} filter
 * @property {(body: any) => any} entityOf entité d'un corps Matter (ou null)
 * @property {(name: string, data: object) => void} emit
 */

/**
 * Contacts des défenseurs (v6.2, sortis de PhysicsWorld) : ce qui arrive à un
 * défenseur quand quelque chose le touche (voir FallingObjects.js) :
 *  - ce qui lui arrive dessus lentement, il le repousse ; le reste le blesse
 *    selon l'énergie du coup, le repousse et le sonne ; une chute coûte selon
 *    sa vitesse ; renversé, il perd des points de vie et se relève ;
 *  - coincé sous une charge qu'il ne peut soulever, ou pris entre deux blocs,
 *    il meurt écrasé ;
 *  - l'ogre renvoie les tirs légers d'un revers, le pavoisier les arrête de face.
 * Le monde physique décide quand (premier tir, contacts) ; les règles sont ici.
 */
export class DefenderContacts {
  /** @type {DefenderPort} */
  #port
  /** Dernier coup reçu par chaque défenseur (contacts prolongés) : { o, at }. */
  #struckAt = new WeakMap()

  /** @param {DefenderPort} port */
  constructor(port) {
    this.#port = port
  }

  /**
   * Cible renversée (v6.1) : au bout de KNOCKOUT_MS à terre, elle perd une part
   * de ses points de vie (KNOCKDOWN_SHARE), puis se relève (UnitDirector) ; si
   * c'était de trop, elle est hors de combat.
   */
  checkKnockouts(dtMs) {
    for (const t of this.#port.entities()) {
      if (t.kind !== 'target' || !t.alive || t.climbing) continue
      const tilt = Math.abs(Math.atan2(Math.sin(t.angle), Math.cos(t.angle)))
      t.downMs = tilt > WORLD.KNOCKOUT_ANGLE ? (t.downMs || 0) + dtMs : 0
      if (tilt <= WORLD.KNOCKOUT_ANGLE * 0.6) t.knockedDown = false
      if (t.downMs >= WORLD.KNOCKOUT_MS && !t.knockedDown) {
        t.knockedDown = true
        this.hurt(t, t.maxHp * KNOCKDOWN_SHARE, 'knockout', 0, { knock: false })
      }
    }
  }

  /**
   * Cibles coincées. On place des points de contrôle juste au-dessus et de part
   * et d'autre de chaque cible (dans le repère du monde) :
   *  - un bloc qui occupe un point du dessus repose sur la cible → écrasée ;
   *  - des blocs qui occupent à la fois la gauche et la droite → prise en étau.
   */
  checkPinned() {
    const blocks = this.#port.filter((e) => e.kind === 'block' && e.alive).map((e) => e.body)
    if (!blocks.length) return
    const d = WORLD.PIN_PROBE
    // À l'échelle (v5.8), un défenseur longe la roche : il n'y est pas coincé.
    for (const t of this.#port.filter((e) => e.kind === 'target' && e.alive && e.type !== 'ogre' && !e.climbing)) {
      const b = t.body.bounds
      const w = b.max.x - b.min.x
      const h = b.max.y - b.min.y
      const near = Query.region(blocks, { min: { x: b.min.x - d * 2, y: b.min.y - d * 2 }, max: { x: b.max.x + d * 2, y: b.max.y + d * 2 } })
      if (!near.length) continue
      const hit = (pts) => near.some((body) => pts.some((p) => Vertices.contains(body.vertices, p)))
      const top = [0.3, 0.5, 0.7].map((k) => ({ x: b.min.x + w * k, y: b.min.y - d }))
      const left = [0.35, 0.65].map((k) => ({ x: b.min.x - d, y: b.min.y + h * k }))
      const right = [0.35, 0.65].map((k) => ({ x: b.max.x + d, y: b.min.y + h * k }))
      const load = near.find((body) => top.some((p) => Vertices.contains(body.vertices, p)))
      if (load) {
        // Une charge assez légère (v6.1) : il la soulève et la rejette de côté (sonné,
        // il attend d'avoir repris ses esprits ; elle ne l'écrase pas pour autant).
        const e = this.#port.entityOf(load)
        // Un tablier sur sa charnière, une charge à sa corde : on ne les soulève pas.
        const liftable = e && e.mass <= t.pushCapacity && !e.hinged && !(e.tethered > 0) && !e.body.isStatic
        if (liftable) {
          if (t.ableAt(this.#port.time)) this.#push(t, e, null)
        } else t.kill('pinned')
      } else if (hit(left) && hit(right)) t.kill('squeezed')
    }
  }

  /**
   * L'ogre (v5.1) réagit à ce qui le heurte :
   *  - un projectile LÉGER (pierre, mitraille ; ni bombe, ni feu, ni givre, ni
   *    boulet lourd) est renvoyé d'un revers, sans lui faire de mal ;
   *  - un bloc qui lui tombe dessus est repoussé de côté (il ne meurt pas écrasé).
   * Gelé, il ne réagit plus. Un revers par OGRE_SWAT_MS.
   * @returns {boolean} vrai si le contact est entièrement traité ici
   */
  ogreReacts(ogre, other, pair) {
    if (!ogre.alive || !other || !other.alive || ogre.frozenMs > 0 || this.#port.time < ogre.swatReady) return false
    if (other.kind === 'projectile') {
      if (other.explodes || other.ignites || other.frost || other.diving || other.mass >= BREACH_HEAVY_MASS) return false
      const v = Body.getVelocity(other.body)
      const side = Math.sign(other.x - ogre.x) || -1
      pair.isActive = false
      Body.setVelocity(other.body, { x: side * Math.max(5, Math.abs(v.x) * 0.75), y: -Math.max(4, Math.abs(v.y) * 0.45) })
      other.hasImpacted = true
      this.#swatted(ogre, 'swat', other)
      return true
    }
    if (other.kind === 'block' && !other.terrain && other.y < ogre.y - ogre.height * 0.25 && other.speed > 0.3) {
      const side = Math.sign(other.x - ogre.x) || 1
      pair.isActive = false
      Sleeping.set(other.body, false)
      Body.setVelocity(other.body, { x: side * Math.max(3, 9 / Math.sqrt(Math.max(1, other.mass / 20))), y: -2.5 })
      Body.setAngularVelocity(other.body, side * 0.08)
      this.#swatted(ogre, 'shove', other)
      return true
    }
    return false
  }

  /**
   * Pavois (v5.8) : un projectile léger (pierre, mitraille) qui frappe le
   * pavoisier DE FACE et de biais (moins de 50° sous l'horizontale) ricoche
   * sur le pavois. Un tir plongeant, un tir dans le dos, un boulet lourd, la
   * poudre, le feu ou le givre passent : il faut le prendre par le haut.
   * @returns {boolean} vrai si le choc est entièrement traité ici
   */
  shieldReacts(bearer, other, pair) {
    if (!bearer.alive || bearer.frozenMs > 0 || other?.kind !== 'projectile' || !other.alive) return false
    if (other.explodes || other.ignites || other.frost || other.diving || other.mass >= BREACH_HEAVY_MASS) return false
    const v = Body.getVelocity(other.body)
    const front = bearer.facing || -1
    const fromFront = Math.sign(other.x - bearer.x) === front && Math.sign(v.x) === -front
    const flat = Math.abs(v.y) < Math.abs(v.x) * Math.tan((50 * Math.PI) / 180)
    if (!fromFront || !flat) return false
    pair.isActive = false
    Body.setVelocity(other.body, { x: front * Math.max(2, Math.abs(v.x) * 0.3), y: -Math.max(1.5, Math.abs(v.y) * 0.3) })
    other.hasImpacted = true
    this.#port.emit('unit', { kind: 'shieldBlock', entity: bearer, x: bearer.x + front * bearer.width * 0.5, y: bearer.y - bearer.height * 0.15 })
    return true
  }

  #swatted(ogre, kind, other) {
    ogre.swatAt = this.#port.time
    ogre.swatReady = this.#port.time + OGRE_SWAT_MS
    ogre.facing = Math.sign(other.x - ogre.x) || -1
    this.#port.emit('ogre', { kind, entity: ogre, other, x: ogre.x, y: ogre.y - ogre.height / 2 })
  }

  /**
   * Contact d'un défenseur (v6.1, voir FallingObjects.js), après le premier tir.
   * Celui qui va le plus vite frappe : un objet qui arrive sur le défenseur le
   * blesse (ou il le repousse, s'il est lent) ; un défenseur projeté contre un
   * obstacle immobile (sol, mur, roche) encaisse sa chute.
   */
  contact(a, b, rel, pair) {
    if (rel <= WORLD.HIT.SAFE) return
    for (const [t, o] of [[a, b], [b, a]]) {
      if (t?.kind !== 'target' || !t.alive) continue
      // Défenseur contre défenseur, ou contre une créature volante : rien.
      if (o?.kind === 'target' || o?.kind === 'flyer') continue
      const striker = o && o.alive !== false && !o.body.isStatic && o.speed >= t.speed * 0.6
      if (striker) this.#struck(t, o, rel, pair)
      else this.#slam(t, rel)
    }
  }

  /**
   * Contact prolongé entre un défenseur et un objet (a ou b est un défenseur) :
   * un objet déjà au contact qui se met à bouger frappe aussi ; s'il presse
   * doucement, le défenseur le repousse.
   */
  activeContact(a, b, pair) {
    const t = a.kind === 'target' ? a : b
    const o = t === a ? b : a
    if (!t.alive || !o.alive || o.kind === 'target' || o.kind === 'flyer' || o.speed < 0.6) return
    const va = Body.getVelocity(pair.bodyA.parent || pair.bodyA)
    const vb = Body.getVelocity(pair.bodyB.parent || pair.bodyB)
    const n = pair.collision.normal
    const rel = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y)
    if (rel <= WORLD.HIT.SAFE) {
      // Il presse doucement : le défenseur le repousse, s'il le peut.
      if (o.speed <= WORLD.PUSH.SPEED && this.#port.time - (o.pushedAt ?? -Infinity) >= PUSHED_SAFE_MS && canPush(t, o, o.speed, this.#port.time)) this.#push(t, o, pair)
      return
    }
    if (o.speed >= t.speed * 0.6) this.#struck(t, o, rel, pair)
  }

  /** Un objet frappe un défenseur : il le repousse s'il le peut, sinon il encaisse. */
  #struck(t, o, rel, pair) {
    const time = this.#port.time
    // Rejeté par un camarade il y a un instant : il ne blesse personne.
    if (time - (o.pushedAt ?? -Infinity) < PUSHED_SAFE_MS) return
    const last = this.#struckAt.get(t)
    if (last && last.o === o && time - last.at < RESTRIKE_MS) return
    this.#struckAt.set(t, { o, at: time })
    if (canPush(t, o, rel, time)) {
      this.#push(t, o, pair)
      return
    }
    let dmg = hitDamage(o, rel)
    // Tir élémentaire : il frappe mou, c'est l'élément qui agit (et on le voit).
    if (o.kind === 'projectile' && o.element) dmg = Math.min(dmg, t.maxHp * ELEMENT_HIT_CAP)
    if (dmg < 1) return
    const v = Body.getVelocity(o.body)
    this.hurt(t, dmg, 'crush', Math.sign(t.x - o.x) || Math.sign(v.x) || 1)
  }

  /** Défenseur projeté contre un obstacle immobile, ou qui retombe : dégâts de chute. */
  #slam(t, rel) {
    // Chute libre (v6.2) : il retombe bien plus bas que son perchoir.
    if (rel >= WORLD.FALL.SAFE && t.y - (t.homeY ?? t.y) >= FREEFALL.DROP) t.fallenAt = this.#port.time
    const dmg = fallDamage(t, rel)
    if (dmg >= 1) this.hurt(t, dmg, 'fall', 0, { knock: false })
  }

  /**
   * Blessure d'un défenseur : points de vie, puis (s'il tient debout) il est
   * repoussé dans le sens du coup et sonné un instant.
   * @param {number} dir sens du recul (-1, 0, 1)
   */
  hurt(t, dmg, cause, dir, { knock = true } = {}) {
    const before = t.hp
    const lives = t.lives
    const died = t.damage(dmg, cause)
    const lost = before - Math.max(0, t.hp)
    if (!died && lost <= 0 && t.lives === lives) return
    this.#port.emit('hurt', hurtEvent(t, died ? before : lost > 0 ? lost : dmg, cause, died, dir))
    if (died || !t.alive || t.lives !== lives) return
    t.stunUntil = Math.max(t.stunUntil, this.#port.time + WORLD.STAGGER_MS)
    t.stunKind = 'hit'
    if (!knock || !dir) return
    const kick = Math.min(WORLD.KNOCK_MAX, WORLD.KNOCK * Math.min(1, dmg / t.maxHp))
    if (kick < 0.3) return
    Sleeping.set(t.body, false)
    const v = Body.getVelocity(t.body)
    Body.setVelocity(t.body, { x: v.x + dir * kick, y: Math.min(v.y, 0) - kick * 0.45 })
  }

  /**
   * Le défenseur repousse un objet lent (v6.1) : il le rejette de côté (et
   * vers le haut s'il lui tombait dessus), sans dégâts ; l'objet ne blessera
   * personne pendant PUSHED_SAFE_MS.
   * @param {Matter.Pair | null} pair contact à ignorer pour ce pas
   */
  #push(t, o, pair) {
    const time = this.#port.time
    if (pair) pair.isActive = false
    const dir = Math.sign(o.x - t.x) || t.facing || 1
    const above = o.y < t.y - t.height * 0.25
    const k = WORLD.PUSH.SHOVE / Math.sqrt(Math.max(1, o.mass / 8))
    const v = Body.getVelocity(o.body)
    Sleeping.set(o.body, false)
    Body.setVelocity(o.body, { x: dir * Math.max(Math.abs(v.x) * 0.4, k), y: above ? Math.min(v.y * 0.2, -k * 0.55) : Math.min(v.y, -k * 0.2) })
    Body.setAngularVelocity(o.body, dir * Math.min(0.12, 0.6 / Math.sqrt(Math.max(1, o.mass))))
    o.pushedAt = time
    t.pushReady = time + WORLD.PUSH.COOLDOWN_MS
    t.pushAt = time
    t.facing = dir
    this.#port.emit('unit', { kind: 'push', entity: t, other: o, x: (t.x + o.x) / 2, y: Math.min(t.y - t.height * 0.3, o.y) })
  }
}
