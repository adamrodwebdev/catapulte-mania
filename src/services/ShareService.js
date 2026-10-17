/**
 * Partage d'un lien (v6.2) : défi « Bats mon tir », château de l'atelier,
 * coupe de la semaine. Le lien d'invitation du portail si le portail en
 * donne un, sinon l'adresse de notre site avec le paramètre en ancre
 * (`#defi=…`, `#chateau=…`, `#coupe=…`) ; puis le partage natif (mobile),
 * à défaut la copie dans le presse-papiers, à défaut le lien à copier à la main.
 */
export class ShareService {
  #ads
  #title
  #navigator
  #location

  /**
   * @param {{ inviteLink: (params: Record<string, string>) => Promise<string | null> }} ads service du portail
   * @param {{ title: () => string, navigator?: Navigator, location?: Location }} opts
   *   title : titre du partage natif (le nom du jeu, traduit) ; navigator, location : injectables pour les tests
   */
  constructor(ads, { title, navigator, location } = {}) {
    this.#ads = ads
    this.#title = title
    this.#navigator = navigator
    this.#location = location
  }

  /** Adresse de la page (sans ancre ni paramètres), ou '' hors navigateur. */
  #base() {
    const loc = this.#location ?? globalThis.location
    return loc ? `${loc.origin}${loc.pathname}` : ''
  }

  /**
   * @param {Record<string, string>} param un seul paramètre, ex. { defi: code }
   * @param {string} text message accompagnant le lien
   * @returns {Promise<{ url: string, method: 'shared' | 'copied' | 'manual' }>}
   */
  async share(param, text) {
    const [[key, value]] = Object.entries(param)
    let url = await this.#ads.inviteLink(param)
    if (!url) url = `${this.#base()}#${key}=${value}`
    const nav = this.#navigator ?? globalThis.navigator
    try {
      if (nav?.share) {
        await nav.share({ title: this.#title(), text, url })
        return { url, method: 'shared' }
      }
    } catch (e) {
      if (e?.name === 'AbortError') return { url, method: 'manual' }
    }
    try {
      await nav.clipboard.writeText(`${text} ${url}`)
      return { url, method: 'copied' }
    } catch {
      return { url, method: 'manual' }
    }
  }
}
