/**
 * Boutique premium (achats avec de l'argent réel) — PRÉPARÉE, DÉSACTIVÉE.
 *
 * Le jeu n'a pas de serveur : un achat réel ne peut pas être vérifié de façon
 * sûre dans le navigateur seul. Cette classe définit donc seulement le point
 * de branchement. Pour vendre le jeu sur le Play Store ou un site :
 *
 *  1. Écrire un fournisseur qui respecte l'interface StoreProvider ci-dessous,
 *     par exemple avec Google Play Billing (application Android empaquetée via
 *     Capacitor ou une Trusted Web Activity), ou un prestataire web (Stripe…).
 *  2. Faire valider chaque reçu d'achat par un petit serveur avant de créditer
 *     le profil (sinon, n'importe qui peut simuler un achat).
 *  3. Passer `StoreService.provider = monFournisseur` au démarrage : la section
 *     « Boutique » de l'atelier apparaît alors automatiquement.
 *
 * Produits envisagés (identifiants à déclarer dans la console du magasin) :
 *   gold_small, gold_large (or), skins_pack (toutes les apparences),
 *   supporter (soutien sans contrepartie en jeu).
 *
 * @typedef {object} StoreProvider
 * @property {() => Promise<Array<{ id: string, price: string }>>} products
 * @property {(id: string) => Promise<{ receipt: string }>} purchase
 */
class NullStoreProvider {
  available = false
  async products() {
    return []
  }
  async purchase() {
    throw new Error('store disabled')
  }
}

export class StoreService {
  /** @type {StoreProvider & { available: boolean }} */
  static provider = new NullStoreProvider()

  static get enabled() {
    return Boolean(StoreService.provider?.available)
  }
}
