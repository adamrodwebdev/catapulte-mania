/**
 * Effets de la partie (v6.2) : ce que le joueur voit, entend et lit quand le
 * monde réagit — éclats, poussière, sang, flammes, secousses, arrêts sur image,
 * sons, sous-titres, annonces dans la scène, répliques des défenseurs.
 * GameSession décide (score, renommée, jauge de destruction, dégâts de l'engin)
 * puis lui passe la main ; ici, rien ne touche aux règles du jeu. Particules et
 * répliques ont leurs propres tirages : la simulation n'en dépend pas.
 *
 * La partie lui prête un accès en lecture (`port`) : temps de la partie (ms),
 * tir en vol ou non, défenseurs restants, place de l'engin, monde, état de
 * l'engin, souffle du chapitre, face-à-face ou non.
 */
import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { clamp } from '../../core/utils/math.js'
import { WORLD } from '../physics/constants.js'
import { THERMAL } from '../physics/WorldWinds.js'

/** Gros plan sur le premier gros choc d'un tir (ms). */
export const PUNCH_MS = 1000
/** Répliques (bulles) : délai entre deux, chance selon l'occasion, nombre de variantes. */
export const BARK = Object.freeze({ COOLDOWN_MS: 3500, LINES: 4, CHANCE: Object.freeze({ incoming: 0.3, lost: 0.35, missed: 0.55, hurt: 0.35, push: 0.4 }) })

export class SessionEffects {
  #particles
  #camera
  #emit
  #options
  #feel
  #port
  #barkRng
  #barkAt = -Infinity
  /** Enchaînement du tir en cours (doublé, triplé, carnage). */
  #chain = { count: 0, at: -Infinity }
  /** Dernière annonce de chaque combo, dernier craquement, dernière rupture (temps de la partie). */
  #comboAt = {}
  #creakAt = -Infinity
  #snapAt = -Infinity

  /**
   * @param {{ particles: object, camera: object, emit: (event: string, payload?: any) => void, options: object, feel: import('../feel/GameFeel.js').GameFeel, port: object, barkSeed: number }} deps
   */
  constructor({ particles, camera, emit, options, feel, port, barkSeed }) {
    this.#particles = particles
    this.#camera = camera
    this.#emit = emit
    this.#options = options
    this.#feel = feel
    this.#port = port
    this.#barkRng = new SeededRandom(barkSeed)
  }

  /** Nouveau tir : l'enchaînement repart de zéro. */
  newShot() {
    this.#chain = { count: 0, at: -Infinity }
  }

  #feedback(f) {
    this.#emit('feedback', f)
  }

  /* ---------- Destructions (la partie a compté les points) ---------- */

  /** Pont des pillards rompu (v5.8). */
  bridgeDown(entity) {
    this.#particles.debris(entity.x, entity.y, 'wood', 80)
    this.#feedback({ sound: 'wood', x: entity.x, intensity: 1, caption: 'unit.bridgeDown', haptic: 'impact' })
  }

  /** Un défenseur abattu : ses points, son sang, son cri, sa chute, et l'enchaînement. */
  targetDown(entity, cause, gained) {
    if (gained) this.#particles.text(entity.x, entity.y - 40, `+${gained}`)
    if (this.#options.blood) {
      const vx = entity.body.velocity.x
      this.#particles.blood(entity.x, entity.y, WORLD.GROUND_Y, Math.abs(vx) > 0.5 ? Math.sign(vx) : 0)
    } else {
      this.#particles.dust(entity.x, entity.y, 10)
    }
    this.#feedback({ sound: 'down', x: entity.x, caption: `down.${entity.type}`, haptic: 'kill' })
    // Assommé (v6.0) : le dessin bascule et s'efface (sauf chute hors du monde ou noyade).
    if (cause !== 'fall' && cause !== 'out' && cause !== 'drown') {
      this.#particles.knockout(entity.x, entity.y, {
        key: entity.assetKey, w: entity.width, h: entity.height, angle: entity.angle, vx: entity.body.velocity.x,
        extra: { team: entity.team, general: entity.generalId, facing: entity.facing }, still: this.#options.reducedMotion,
      })
    }
    this.bark('lost', entity)
    // Un général tombe pour de bon (v6.0) : l'interface le célèbre.
    if (entity.type === 'general') {
      this.#emit('general', { kind: 'fallen', id: entity.generalId, x: entity.x, y: entity.y })
      this.#emit('announce', { key: 'a11y.generalFallen', params: { general: entity.generalId } })
    }
    // Cri du défenseur (réglage « Cris des soldats ») : voix selon le personnage.
    if (this.#options.screams) this.#feedback({ sound: 'scream', x: entity.x, intensity: entity.type === 'knight' || entity.type === 'ogre' ? 1.3 : entity.type === 'king' ? 0.5 : 1, caption: 'scream' })
    this.#emit('announce', { key: 'a11y.targetDown', params: { left: this.#port.targetsLeft } })
    this.#countChain(entity)
    if (this.#port.targetsLeft === 0 && !this.#options.reducedMotion) this.#feel.slow(900)
  }

  /** Une créature volante abattue. */
  flyerDown(entity, gained) {
    if (gained) this.#particles.text(entity.x, entity.y - 30, `+${gained}`, '#cfe6ff')
  }

  /** Un bloc brisé : ses éclats, ses points, son bruit. */
  blockDown(entity, cause, gained) {
    this.#particles.debris(entity.x, entity.y, entity.material, Math.max(entity.width, entity.height))
    if (gained && entity.scoreValue >= 100) this.#particles.text(entity.x, entity.y - 20, `+${gained}`, '#e8eef7')
    this.#feedback({ sound: entity.sound, x: entity.x, intensity: 0.8, caption: cause === 'fire' ? null : `break.${entity.material}` })
  }

  /* ---------- L'engin et les généraux (la partie a appliqué les dégâts) ---------- */

  /** Un pillard vient de frapper l'engin (v5.8) : givre, éclats, secousse ; son coup dit et sous-titré. */
  engineStruck(payload, spot, x) {
    if (payload === 'frost') {
      this.#particles.frost(spot.front, spot.y - 50, 60)
    } else if (payload !== 'fire') {
      this.#particles.impact(spot.front, spot.y - 45, 'wood', payload === 'smash' ? 700 : 400)
      this.#camera.shake(payload === 'smash' ? 6 : 3)
    }
    this.#feedback({ sound: payload === 'smash' ? 'stone' : payload === 'blow' ? 'hammer' : payload === 'frost' ? 'frost' : 'wood', x, intensity: 1, caption: `unit.strike.${payload}`, haptic: 'impact' })
  }

  /** Avaries de l'engin : son, sous-titre, annonce pour les lecteurs d'écran ; l'explosion s'il est détruit. */
  engineCondition(kind, data, x, spot) {
    const sounds = { ignite: 'fire', fireUp: 'fire', freeze: 'frost', crack: 'breach', destroyed: 'explosion', extinguish: data.by === 'water' ? 'splash' : 'steam' }
    const haptic = kind === 'destroyed' ? 'explosion' : kind === 'ignite' || kind === 'crack' ? 'impact' : null
    this.#feedback({ sound: sounds[kind], x, intensity: kind === 'fireUp' ? 0.6 + (data.level ?? 1) * 0.2 : 1, caption: `engine.${kind}`, haptic })
    if (['ignite', 'fireUp', 'freeze', 'crack', 'rust', 'destroyed'].includes(kind)) this.#emit('announce', { key: `captions.engine.${kind}`, params: data })
    if (kind === 'crack') this.#camera.shake(5)
    if (kind === 'destroyed') {
      this.#particles.explosion(spot.x, spot.y - 60, 140)
      this.#particles.debris(spot.x, spot.y - 60, 'wood', 120)
      this.#camera.shake(14)
    }
  }

  /** Un général perd une vie (v6.0) : ses points, l'onde de choc, son cri. */
  generalHurt(data, gained) {
    if (gained) this.#particles.text(data.x, data.y - 50, `+${gained}`)
    this.#particles.shockwave(data.x, data.y, 120)
    this.#feedback({ sound: 'iron', x: data.x, intensity: 1.2, caption: `general.hurt`, haptic: 'kill' })
    this.#emit('bark', { key: `generals.${data.id}.hurt`, x: data.x, y: data.y - 56, tone: 'enemy' })
    this.#emit('announce', { key: 'a11y.generalHurt', params: { count: data.lives } })
  }

  /* ---------- Réactions du monde ---------- */

  /** Corde tranchée, chaîne rompue (v6.0) : la charge tombe, le tablier s'abat. */
  tetherCut({ kind, x, y }) {
    if (kind === 'chain') this.#particles.impact(x, y, 'iron', 260)
    else this.#particles.debris(x, y, 'straw', 16)
    this.#feedback({ sound: kind === 'chain' ? 'iron' : 'wood', x, intensity: 0.9, caption: `contraption.${kind}Cut`, haptic: 'impact' })
  }

  impact({ entity, energy, x, y, material }) {
    if (energy < 25) return
    // Premier gros choc du tir sur le château : bref gros plan sur l'impact.
    if (!this.#feel.closeUpUsed && energy > 120 && entity.kind !== 'projectile' && this.#port.flying && !this.#options.reducedMotion) this.#feel.closeUp(x, y, PUNCH_MS)
    // Éclats, étincelles, gerbes de terre : la matière réagit au choc.
    if (energy > 60) {
      if (entity.kind === 'projectile') {
        if (y > WORLD.GROUND_Y - 30) this.#particles.groundHit(x, energy)
      } else if (entity.kind === 'block' || entity.kind === 'barrel') {
        this.#particles.impact(x, y, entity.kind === 'barrel' ? 'barrel' : material, energy)
      }
    }
    const sound = entity.kind === 'target' ? 'hit' : entity.kind === 'barrel' ? 'wood' : material
    this.#feedback({ sound, x, intensity: clamp(energy / 400, 0.3, 1.2), caption: null, haptic: energy > 300 ? 'impact' : null })
    if (energy > 400) this.#camera.shake(Math.min(6, energy / 300))
    if (energy > 900 && entity.kind !== 'projectile') this.#freeze(40)
  }

  /** v6.1 : un défenseur encaisse un coup (il survit, ou pas) : son, secousse, arrêt sur image. */
  hurt({ entity, amount, cause, lethal, x, y, dir }) {
    const share = Math.min(1.5, amount / (entity.maxHp || 1))
    if (cause === 'crush' || cause === 'fall' || cause === 'knockout') {
      this.#particles.dust(x, y + entity.height * 0.3, cause === 'fall' ? 6 : 3)
      if (!lethal) this.#particles.burst(x, y - 6, Math.round(3 + share * 6))
    }
    // Sous-titre pour les vrais coups seulement (les petites touches ne bavardent pas).
    this.#feedback({ sound: cause === 'shock' ? null : 'hit', x, intensity: clamp(0.45 + share * 0.6, 0.45, 1.2), caption: lethal || share < 0.4 || cause === 'shock' ? null : `hurt.${cause === 'fall' || cause === 'knockout' ? 'fall' : 'hit'}`, haptic: share > 0.5 ? 'impact' : null })
    if (share >= 0.5) {
      this.#camera.shake(Math.min(5, 1.5 + share * 3))
      this.#freeze(lethal ? 55 : 35)
    }
    // Un rescapé râle (rarement) : « Ouille ! »
    if (!lethal && share >= 0.3) this.bark('hurt', entity, true)
    void dir
  }

  /** v6.1 : orbe d'orage — arcs d'un défenseur à l'autre. */
  thunder({ x, y, path }) {
    this.#particles.arc(x, y - 30, x, y)
    for (const s of path) this.#particles.arc(s.x0, s.y0, s.x1, s.y1)
    this.#camera.shake(path.length ? 4 : 2)
    this.#freeze(path.length ? 45 : 0)
    this.#feedback({ sound: 'zap', x, intensity: Math.min(1.2, 0.6 + path.length * 0.15), caption: path.length ? 'thunder' : 'thunderMiss', haptic: path.length ? 'explosion' : 'impact' })
  }

  /** v6.2 : combos d'éléments, annoncés par leur nom (une annonce par combo et par seconde et demie). */
  combo({ kind, x, y }) {
    if (kind === 'redhot') this.#particles.flame(x, y, 18, 0.8)
    else if (kind === 'charged' || kind === 'wetshock') this.#particles.spark(x, y)
    else if (kind === 'shards') this.#particles.frost(x, y, 60)
    if ((this.#comboAt[kind] ?? -Infinity) > this.#port.time - 1500) return
    this.#comboAt[kind] = this.#port.time
    const sound = { redhot: 'fire', quench: 'steam', charged: 'zap', wetshock: 'thunder', shards: 'glass', steam: 'steam' }[kind]
    this.#emit('callout', { key: `combo.${kind}`, tier: kind === 'quench' || kind === 'wetshock' ? 2 : 1, x, y: y - 120 })
    this.#feedback({ sound, x, intensity: 0.8, caption: `combos.${kind}` })
  }

  /**
   * v6.2 : assemblage du château. Une jonction qui se lézarde craque ; qui cède,
   * lâche poussière et éclats ; une clé de voûte qui cède fait trembler la scène.
   */
  jointCrack({ x, y }) {
    this.#particles.dust(x, y, 2, '200,190,170')
    if (this.#port.time - this.#creakAt < 140) return
    this.#creakAt = this.#port.time
    this.#feedback({ sound: 'creak', x, intensity: 0.35 })
  }

  jointBreak({ x, y, bond }) {
    this.#particles.dust(x, y, 5, bond === 'frost' ? '220,240,255' : '205,190,165')
    if (this.#port.time - this.#snapAt < 90) return
    this.#snapAt = this.#port.time
    const sound = { mortar: 'stone', peg: 'wood', lashing: 'straw', rivet: 'iron', frost: 'glass', lead: 'glass', footing: 'rubble' }[bond] ?? 'stone'
    this.#feedback({ sound, x, intensity: 0.45, caption: 'joint.break' })
  }

  keystone({ x, y, material }) {
    this.#particles.impact(x, y, material, 900)
    this.#particles.dust(x, y, 14, '205,190,165')
    this.#camera.shake(5)
    this.#feedback({ sound: 'rubble', x, intensity: 1.3, caption: 'keystone', haptic: 'impact' })
  }

  /** v6.1 : le souffle du monde marque un tir (givre, braises, sable, orage) ; un tir givré éclate. */
  element({ kind, x, y }) {
    if (kind === 'quench' || kind === 'thaw') this.#particles.steam(x, y, 40)
    else if (kind === 'rime') this.#particles.frost(x, y, 40)
    else if (kind === 'kindle') this.#particles.flame(x, y, 30, 1.2)
    else if (kind === 'smother' || kind === 'sand') this.#particles.dust(x, y, 6, '226,196,140')
    else if (kind === 'charge') this.#particles.arc(x - 14, y - 10, x + 12, y + 8)
    else if (kind === 'shatter') this.#particles.frost(x, y, 55)
    const sound = { quench: 'steam', thaw: 'steam', rime: 'frost', kindle: 'fire', smother: 'snow', sand: 'snow', charge: 'zap', shatter: 'glass' }[kind]
    this.#feedback({ sound, x, intensity: 0.7, caption: `element.${kind}` })
  }

  /** v6.1 : moulins — les ailes s'emballent (préavis), puis la rafale. */
  mill({ kind, x }) {
    this.#feedback({ sound: kind === 'warn' ? 'creak' : 'gust', x, intensity: kind === 'warn' ? 0.7 : 1, caption: `mill.${kind}` })
  }

  /** v6.1 : ouvrages brisés — inondation, braises. */
  prop({ kind, x, y, r, winter }) {
    if (kind === 'flood') {
      this.#particles.water(x, y, r, winter)
      if (winter) this.#particles.frost(x, y + r * 0.4, r)
      this.#feedback({ sound: 'splash', x, intensity: 1, caption: winter ? 'prop.floodIce' : 'prop.flood', haptic: 'impact' })
    } else if (kind === 'embers') {
      this.#particles.burst(x, y, 14)
      this.#feedback({ sound: 'fire', x, intensity: 1, caption: 'prop.embers' })
    }
  }

  /** v6.1 : nuages — le pot éclate, le gaz s'embrase, le givre le fige. */
  cloud({ kind, x, y, r, event }) {
    if (event === 'spawn') {
      this.#particles.puff(x, y, r, kind === 'flour' ? '244,238,222' : kind === 'bees' ? '70,60,40' : '120,200,70')
      this.#feedback({ sound: kind === 'bees' ? 'flyer' : 'hiss', x, intensity: 0.9, caption: `cloud.${kind}` })
    } else if (event === 'disperse') {
      this.#particles.dust(x, y, 6, '90,80,60')
      this.#feedback({ sound: null, x, caption: 'cloud.disperse' })
    } else if (event === 'blast') {
      this.#feedback({ sound: 'explosion', x, intensity: 0.9, caption: 'cloud.blast', haptic: 'explosion' })
    } else if (event === 'freeze') {
      this.#particles.frost(x, y, r * 0.8)
      this.#feedback({ sound: 'frost', x, intensity: 0.6, caption: 'cloud.freeze' })
    }
  }

  /** v6.1 : un tir puissant projette le bloc frappé — onde de choc et coup de boutoir. */
  power({ energy, x, y, vx, vy }) {
    if (energy >= 450) this.#particles.shockwave(x, y, Math.min(220, 90 + energy / 8))
    this.#camera.kick(vx, vy * 0.5, Math.min(12, 3 + energy / 160))
  }

  explosion({ x, y, radius }) {
    this.#particles.explosion(x, y, radius)
    this.#camera.shake(12)
    this.#freeze(90)
    this.#feedback({ sound: 'explosion', x, intensity: 1, caption: 'explosion', haptic: 'explosion' })
  }

  collapse({ entity }) {
    this.#particles.dust(entity.x, entity.y - entity.height / 2, 12)
    this.#particles.dust(entity.x, WORLD.GROUND_Y - 10, 8, '190,175,150')
    this.#camera.shake(5)
    this.#feedback({ sound: entity.sound || 'wood', x: entity.x, intensity: 1, caption: 'collapse', haptic: 'impact' })
  }

  /** v5.0 : percée, givre, vapeur, terrains et créatures volantes. */
  breach({ x, y, material }) {
    this.#particles.impact(x, y, material, 900)
    this.#camera.shake(7)
    this.#freeze(60)
    this.#feedback({ sound: 'breach', x, intensity: 1, caption: 'breach', haptic: 'impact' })
  }

  frost({ x, y, radius }) {
    this.#particles.frost(x, y, radius)
    this.#feedback({ sound: 'frost', x, intensity: 0.9, caption: 'frost', haptic: 'impact' })
  }

  steam({ x, y, radius, entity }) {
    this.#particles.steam(x, y, radius)
    // Vapeur « décorative » (boulet éteint dans l'eau) : sans sous-titre d'alerte.
    this.#feedback({ sound: 'steam', x, intensity: entity ? 1 : 0.5, caption: entity ? 'steam' : null })
  }

  terrain({ kind, x }) {
    if (kind === 'skip') this.#particles.splash(x, false)
    else if (kind === 'drown' || kind === 'thaw') this.#particles.splash(x, true)
    else if (kind === 'melt') this.#particles.melt(x)
    else if (kind === 'crust' || kind === 'freeze') this.#particles.frost(x, WORLD.GROUND_Y - 10, 60)
    else if (kind === 'snow') this.#particles.dust(x, WORLD.GROUND_Y - 6, 6, '245,248,252')
    const sound = { skip: 'splash', drown: 'splash', thaw: 'steam', melt: 'steam', crust: 'frost', freeze: 'frost', snow: 'snow' }[kind]
    this.#feedback({ sound, x, intensity: kind === 'skip' ? 0.6 : 0.9, caption: `terrain.${kind}` })
  }

  flyerHit({ entity, x, y }) {
    this.#particles.feathers(x, y, entity.type === 'wyvern' ? '#4a6b3a' : '#1f1f29', entity.type === 'wyvern' ? 16 : 12)
    this.#feedback({ sound: 'flyer', x, intensity: 0.8, caption: `flyer.${entity.type}`, haptic: 'kill' })
  }

  ogre({ kind, x, y, other }) {
    // Revers de massue : éclats et poussière, gros plan si c'est le tir du joueur.
    this.#particles.impact(other?.x ?? x, other?.y ?? y, 'wood', 400)
    this.#particles.dust(x, y + 20, 4)
    this.#camera.shake(4)
    this.#feedback({ sound: 'breach', x, intensity: 0.7, caption: `ogre.${kind}`, haptic: 'impact' })
  }

  /** v5.8 : capacités des défenseurs (voir ../ai/). */
  unit(data) {
    const { kind, entity, block, x, y } = data
    if (kind === 'dodge') {
      this.#particles.dust(x, entity.y + entity.height / 2 - 4, 4)
      this.#feedback({ sound: 'whoosh', x, intensity: 0.6, caption: 'unit.dodge' })
    } else if (kind === 'push') {
      // v6.1 : il repousse ce qui lui tombait dessus.
      this.#particles.dust(x, y, 4)
      this.#feedback({ sound: 'whoosh', x, intensity: 0.8, caption: 'unit.push' })
      this.bark('push', entity, true)
    } else if (kind === 'shieldBlock') {
      this.#particles.impact(x, y, 'iron', 500)
      this.#camera.shake(3)
      this.#feedback({ sound: 'iron', x, intensity: 1, caption: 'unit.shieldBlock', haptic: 'impact' })
    } else if (kind === 'repair') {
      this.#feedback({ sound: 'hammer', x: block?.x ?? x, intensity: 1, caption: 'unit.repair' })
    } else if (kind === 'repaired') {
      this.#particles.dust(x, y, 6, '220,200,160')
      this.#feedback({ sound: 'hammer', x, intensity: 0.7, caption: 'unit.repaired' })
    } else if (kind === 'raid') {
      this.#feedback({ sound: 'scream', x, intensity: entity.type === 'ogre' ? 1.3 : 1, caption: `unit.raid.${entity.raid}` })
      this.#emit('announce', { key: `captions.unit.raid.${entity.raid}` })
    } else if (kind === 'crew') {
      this.#particles.dust(x, entity.y, 8)
      this.#feedback({ sound: 'hit', x, intensity: 1, caption: 'unit.crew' })
    } else if (kind === 'build') {
      this.#feedback({ sound: 'hammer', x, intensity: 0.8, caption: `unit.build.${data.work}` })
    } else if (kind === 'built') {
      this.#particles.dust(x, WORLD.GROUND_Y - 6, 6, '200,170,120')
      this.#feedback({ sound: 'wood', x, intensity: 0.7, caption: `unit.built.${data.work}` })
    } else if (kind === 'ladderDown') {
      this.#particles.debris(x, y, 'wood', 60)
      this.#feedback({ sound: 'wood', x, intensity: 1, caption: 'unit.ladderDown', haptic: 'impact' })
    } else if (kind === 'torchDrop') {
      this.#particles.flame(x, y - 6, 24)
      this.#feedback({ sound: 'fire', x, intensity: 0.9, caption: 'unit.torchDrop' })
    }
  }

  flyerDrop({ x }) {
    this.#feedback({ sound: 'fire', x, intensity: 0.7, caption: 'flyerDrop' })
  }

  lightning({ x, y }) {
    this.#particles.lightning(x, y, Math.min(-300, y - 700))
    this.#camera.shake(10)
    this.#feedback({ sound: 'thunder', x, intensity: 1, caption: 'lightning', haptic: 'explosion' })
  }

  fireStart({ entity }) {
    this.#feedback({ sound: 'fire', x: entity.x, intensity: 0.6, caption: 'fire' })
  }

  projectileSpent({ entity }) {
    if (entity.alive === false && entity.deathCause === 'out') return
    this.#particles.dust(entity.x, entity.y, 3)
  }

  /* ---------- Chaque image ---------- */

  /** Rafales des moulins (v6.1) : des traînées filent dans la zone, dans le sens du souffle. */
  #gustStreaks() {
    const zones = this.#port.world.props.zones
    if (!zones.length || this.#options.reducedMotion) return
    for (const z of zones) {
      if (((this.#port.time / 16) | 0) % 2) continue
      const d = 40 + ((this.#port.time * 0.37 + z.x) % 480)
      this.#particles.streak(z.x + z.dir * d, z.y + ((((this.#port.time / 23) | 0) % 9) - 4) * 18, z.dir, this.#port.element?.rgb)
    }
  }


  /** Ambiance de chaque image : rafales, air chaud, tirs marqués, flammes, escarbilles, gouttes, toux, étincelles. */
  ambient() {
    this.#gustStreaks()
    // Colonnes d'air chaud (Montagne) : des brins de lumière qui montent.
    if (!this.#options.reducedMotion) {
      for (const c of this.#port.world.thermals) {
        if (((this.#port.time / 16) | 0) % 3) continue
        const k = ((this.#port.time * 0.13 + c.x) % THERMAL.HALF_W) * 2 - THERMAL.HALF_W
        this.#particles.streak(c.x + k * 0.8, WORLD.GROUND_Y - 30 - ((this.#port.time * 0.21) % 500), 0, this.#port.element?.rgb)
      }
    }
    for (const e of this.#port.world.entities()) {
      if (e.kind !== 'projectile' || e.hasImpacted || !e.alive) continue
      // Le tir marqué par le souffle du monde : chargé (étincelles), ensablé (poussière).
      if (e.charged && ((this.#port.time / 16) | 0) % 2 === 0) this.#particles.spark(e.x, e.y)
      if (e.sanded && ((this.#port.time / 16) | 0) % 3 === 0) this.#particles.dust(e.x, e.y, 1, '226,196,140')
    }
    // L'engin en feu (v5.8) : plus le feu est intense, plus il y a de flammes.
    const level = this.#port.condition.fireLevel
    if (level) {
      const spot = this.#port.engineSpot()
      // Deux foyers par niveau d'intensité, des flammes plus grosses à chaque niveau.
      for (let i = 0; i < level * 2; i++) {
        const u = ((this.#port.time / 97 + i * 0.37) % 1) - 0.5
        this.#particles.flame(spot.x + u * 130, spot.y - 25 - ((i * 37) % 70), 30 + level * 12, 1.3 + level * 0.35)
      }
    }
    for (const e of this.#port.world.entities()) {
      if (e.burning > 0 && e.kind !== 'projectile') this.#particles.flame(e.x, e.y - e.height / 2, e.width)
      if (e.kind === 'projectile' && !e.hasImpacted) this.#particles.trail(e.x, e.y, e.ignites, e.frost ? 'snow' : this.#options.trail)
      // Veilleurs (v5.8) : quelques escarbilles s'échappent de la torche.
      if (e.kind === 'target' && e.torch && e.alive && ((this.#port.time / 16) | 0) % 9 === e.id % 9) {
        const tip = e.torchTip
        this.#particles.spark(tip.x, tip.y)
      }
      // Boulet encore brûlant après l'impact : il continue de flamber.
      if (e.kind === 'projectile' && e.hasImpacted && e.heatMs > 0) this.#particles.flame(e.x, e.y - e.radius * 0.6, e.radius * 1.2)
      if (e.kind === 'target' && e.shownDamage > 0) this.#showDamage(e)
      // Forge (v6.1) : ses flammes montent, et crachent dans la rafale d'un moulin.
      if (e.kind === 'block' && e.prop === 'forge' && e.alive && !(e.frozenMs > 0) && !e.quenchedAt(this.#port.world.time)) {
        this.#particles.flame(e.x, e.y - e.height / 2 - 6, 34, 0.9)
        if (this.#port.world.time - (e.jetAt ?? -Infinity) < 60) {
          const dir = Math.sign(this.#port.world.props.gustAt(e.x, e.y - e.height / 2 - 40)) || -1
          for (let i = 1; i <= 3; i++) this.#particles.flame(e.x + dir * i * 60, e.y - e.height / 2 - 30, 40, 1.1)
        }
      }
      // Trempé (citerne) : il dégoutte.
      if (e.kind === 'target' && e.wetMs > 0 && e.alive && ((this.#port.time / 16) | 0) % 11 === e.id % 11) this.#particles.dust(e.x, e.y + e.height * 0.3, 1, '150,190,230')
      if (e.kind === 'target' && e.alive) {
        const wt = this.#port.world.time
        // Empoisonné : il tousse des bulles vertes ; électrisé : des étincelles bleues (v6.1).
        if (e.poisonUntil > wt && ((this.#port.time / 16) | 0) % 14 === e.id % 14) this.#particles.cough(e.x, e.y - e.height * 0.45)
        if (e.stunKind === 'shock' && e.stunUntil > wt && ((this.#port.time / 16) | 0) % 5 === e.id % 5) this.#particles.spark(e.x + (((this.#port.time / 7) | 0) % 3 - 1) * 8, e.y - e.height * 0.2)
      }
    }
  }


  /**
   * Chiffres de dégâts (v6.1) : ce qu'un défenseur vient d'encaisser, regroupé
   * (le feu et le poison rongent par petites touches : un chiffre toutes les
   * 0,3 s). Abattu, il n'en a pas : ses points gagnés s'affichent à la place.
   */
  #showDamage(e) {
    if (!e.alive) {
      e.shownDamage = 0
      return
    }
    const dot = e.shownCause === 'fire' || e.shownCause === 'poison' || e.shownCause === 'sting'
    if (e.shownDamage < 1 || (dot && this.#port.time - (e.numberAt ?? -Infinity) < 300)) return
    if (!dot && this.#port.time - (e.numberAt ?? -Infinity) < 60) return
    e.numberAt = this.#port.time
    this.#particles.damage(e.x, e.y - e.height / 2 - 18, e.shownDamage, e.shownCause, e.shownDamage / e.maxHp)
    e.shownDamage = 0
  }


  /** Arrêt sur image (sauf animations réduites) : jamais cumulé au-delà de 100 ms (voir GameFeel). */
  #freeze(ms) {
    if (this.#options.reducedMotion || !this.#port.flying) return
    this.#feel.freeze(ms)
  }

  /**
   * Enchaînement (v5.7) : deux défenseurs abattus à moins de 1,5 s d'écart
   * pendant le même tir font un « doublé », puis un « triplé », puis un
   * « carnage ». Annonce dans la scène (`callout`), cloche qui monte, sous-titre.
   */
  #countChain(entity) {
    if (!this.#port.flying) return
    const c = this.#chain
    c.count = this.#port.time - c.at <= 1500 ? c.count + 1 : 1
    c.at = this.#port.time
    if (c.count < 2) return
    const tier = Math.min(3, c.count - 1)
    this.#emit('callout', { key: ['double', 'triple', 'rampage'][tier - 1], tier, x: entity.x, y: entity.y - 170 })
    this.#feedback({ sound: 'combo', x: entity.x, intensity: [0.8, 1.1, 1.4][tier - 1], caption: 'combo', haptic: 'kill' })
  }


  /**
   * Réplique d'un défenseur (bulle) : `kind` 'incoming' | 'lost' | 'missed' | 'hurt' | 'push'.
   * Le plus proche de `near` (camarade d'un défenseur abattu), sinon un défenseur au hasard.
   */
  bark(kind, near = null, self = false) {
    if (this.#port.twoCamps || this.#port.time - this.#barkAt < BARK.COOLDOWN_MS) return
    if (this.#barkRng.next() > BARK.CHANCE[kind]) return
    // `self` (v6.1) : c'est le défenseur lui-même qui parle (il a mal, il repousse).
    const crew = this.#port.world.filter((e) => e.kind === 'target' && e.alive && e.type !== 'general' && e.type !== 'ogre' && (self ? e === near : e !== near) && !e.raiding)
    if (!crew.length) return
    let who = crew[Math.floor(this.#barkRng.next() * crew.length)]
    if (near && !self) {
      who = crew.reduce((a, b) => (Math.hypot(b.x - near.x, b.y - near.y) < Math.hypot(a.x - near.x, a.y - near.y) ? b : a))
      if (Math.hypot(who.x - near.x, who.y - near.y) > 260) return
    }
    this.#barkAt = this.#port.time
    const n = 1 + Math.floor(this.#barkRng.next() * BARK.LINES)
    this.#emit('bark', { key: `game.bark.${kind}${n}`, x: who.x, y: who.y - who.height / 2 - 6, tone: 'enemy' })
  }
}
