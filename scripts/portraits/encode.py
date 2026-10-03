#!/usr/bin/env python3
"""
Encode les portraits pixel art (art/portraits/*.png) en données JavaScript.

Pourquoi : le jeu n'embarque aucune image pour ses personnages. Chaque portrait
est décrit par une palette (au plus 52 couleurs) et une suite de pixels
compressée par plages (« RLE »), puis redessiné par le code dans un <canvas>.
Résultat : quelques kilo-octets, aucun téléchargement d'image, et un rendu net
à toutes les tailles (agrandissement « pixelated »).

Format d'un portrait : { w, h, palette: ['rrggbb', …], data: 'A3B.12C…' }
  - une lettre (A–Z puis a–z) = l'indice de la couleur dans la palette ;
  - '.' = pixel transparent ;
  - un nombre après le symbole = le nombre de répétitions (absent = 1).
Les pixels sont lus ligne par ligne, de gauche à droite.

Usage : python3 scripts/portraits/encode.py
Les « maîtres » art/portraits/*.png peuvent être retouchés dans n'importe quel
éditeur de pixel art (Aseprite, Piskel, LibreSprite…) : relancer ce script
régénère src/game/story/portraits.data.js.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art' / 'portraits'
OUT = ROOT / 'src' / 'game' / 'story' / 'portraits.data.js'
ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'


def encode(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    raw = im.tobytes()
    px = [tuple(raw[i:i + 4]) for i in range(0, len(raw), 4)]
    palette, index, chars = [], {}, []
    for r, g, b, a in px:
        if a < 128:
            chars.append('.')
            continue
        key = f'{r:02x}{g:02x}{b:02x}'
        if key not in index:
            if len(palette) == len(ALPH):
                raise SystemExit(f'{path.name} : plus de {len(ALPH)} couleurs, réduisez la palette')
            index[key] = len(palette)
            palette.append(key)
        chars.append(ALPH[index[key]])
    out, i = [], 0
    while i < len(chars):
        j = i
        while j < len(chars) and chars[j] == chars[i]:
            j += 1
        out.append(chars[i] + (str(j - i) if j - i > 1 else ''))
        i = j
    return {'w': w, 'h': h, 'palette': palette, 'data': ''.join(out)}


def main():
    portraits = {p.stem: encode(p) for p in sorted(SRC.glob('*.png'))}
    lines = [
        '// Fichier généré par scripts/portraits/encode.py à partir de art/portraits/*.png.',
        '// Ne pas modifier à la main : retoucher le PNG puis relancer le script.',
        '/* eslint-disable */',
        'export const PORTRAIT_DATA = Object.freeze({',
    ]
    for cid, p in portraits.items():
        lines.append(f'  {cid}: {json.dumps(p, separators=(",", ":"))},')
    lines.append('})')
    OUT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    for cid, p in portraits.items():
        print(f"{cid:8s} {p['w']}×{p['h']}  {len(p['palette'])} couleurs  {len(p['data'])} caractères")


if __name__ == '__main__':
    main()
