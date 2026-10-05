/**
 * Fonction edge Netlify : verrou d'accès du site (voir netlify/gate/AccessGate.js).
 *
 * Variables d'environnement (Netlify > Project configuration > Environment
 * variables, portée « Functions ») :
 *  - ACCESS_KEYS : les clés d'invitation, séparées par des virgules (une par appareil) ;
 *  - GATE_SECRET : un secret d'au moins 32 caractères qui signe les cookies.
 * Sans ces variables, le site reste fermé (sécurité par défaut).
 *
 * Ne concerne que notre site Netlify : la démo et les versions portails
 * (CrazyGames, Poki) n'ont pas de verrou.
 */
import { getStore } from 'https://esm.sh/@netlify/blobs@8'
import { AccessGate, readConfig, gatePage, pickLang, COOKIE, CLAIM_PATH, COOKIE_MAX_AGE } from '../gate/AccessGate.js'

const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'referrer-policy': 'no-referrer',
}

let gate = null
let gateFor = ''

function page(lang, status, message, extra = {}) {
  return new Response(gatePage(lang, message), { status, headers: { ...PAGE_HEADERS, ...extra } })
}

function cookieHeader(value) {
  return `${COOKIE}=${value}; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`
}

export default async function handler(request, context) {
  const lang = pickLang(request.headers.get('accept-language'))
  const config = readConfig({ ACCESS_KEYS: Netlify.env.get('ACCESS_KEYS'), GATE_SECRET: Netlify.env.get('GATE_SECRET') })
  if (!config) return page(lang, 503, 'config')
  const fingerprint = `${config.keys.join(',')}|${config.secret}`
  if (!gate || gateFor !== fingerprint) {
    const store = getStore({ name: 'acces-appareils', consistency: 'strong' })
    gate = new AccessGate(config, { get: (k) => store.get(k), set: (k, v) => store.set(k, v) })
    gateFor = fingerprint
  }

  const url = new URL(request.url)
  const current = context.cookies.get(COOKIE) ?? ''

  try {
    if (url.pathname === CLAIM_PATH) {
      if (request.method !== 'POST') return Response.redirect(new URL('/', url), 303)
      const length = Number(request.headers.get('content-length') ?? 0)
      if (!(length > 0 && length <= 1024) || !String(request.headers.get('content-type')).startsWith('application/x-www-form-urlencoded')) return page(lang, 400, 'invalid')
      const form = new URLSearchParams(await request.text())
      const result = await gate.claim(form.get('cle'), current)
      if (result.status === 'granted') {
        return new Response(null, { status: 303, headers: { location: '/', 'cache-control': 'no-store', 'set-cookie': cookieHeader(result.cookie) } })
      }
      return page(lang, result.status === 'taken' ? 403 : 401, result.status)
    }

    if (await gate.allows(current)) {
      const response = await context.next()
      response.headers.set('x-robots-tag', 'noindex, nofollow')
      return response
    }
    return page(lang, 401, null)
  } catch {
    // Stockage indisponible : on reste fermé plutôt que d'ouvrir le site.
    return page(lang, 503, 'config')
  }
}

export const config = { path: '/*' }
