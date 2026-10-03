#!/usr/bin/env python3
"""
Transforme une illustration pixel art (grande image, fond en damier) en
« maître » de portrait : art/portraits/<id>.png, petit (≈ 100 × 120 pixels),
détouré, au plus 52 couleurs. Étape suivante : encode.py.

Usage : python3 scripts/portraits/convert.py <image.png> <id> [--dark-bg] [--cut-bottom]
  --dark-bg     : le damier de fond est sombre (sinon clair)
  --cut-bottom  : le personnage est coupé par le bas de l'image (ne pas
                  chercher de fond par le bas)

Étapes :
 1. réduction par cellules de 16 × 16 pixels (couleur majoritaire de chaque cellule) ;
 2. détourage : remplissage depuis les bords sur les teintes du damier et des
    ombres au sol ; les poches de damier enfermées (entre les jambes…) sont
    retirées si elles ont exactement les teintes du fond ;
 3. suppression du filigrane en bas à droite et des îlots isolés ;
 4. palette de 48 couleurs + 4 couleurs d'accent (yeux, lueurs) que la
    quantification aurait noyées.
"""
import sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
CELL = 16
NCOL = 52


def reduce(im):
    h, w, _ = im.shape
    gh, gw = h // CELL, w // CELL
    out = np.zeros((gh, gw, 3), np.int32)
    q = im // 12
    key = q[..., 0] * 10000 + q[..., 1] * 100 + q[..., 2]
    for y in range(gh):
        for x in range(gw):
            k = key[y * CELL:(y + 1) * CELL, x * CELL:(x + 1) * CELL]
            vals, counts = np.unique(k.ravel(), return_counts=True)
            m = k == vals[counts.argmax()]
            out[y, x] = im[y * CELL:(y + 1) * CELL, x * CELL:(x + 1) * CELL][m].mean(axis=0)
    return out


def bglike(c, dark):
    r, g, b = (int(v) for v in c)
    if dark:
        return abs(r - g) < 20 and b - r < 35 and b >= r - 5 and 80 < r < 140 and 85 < g < 145
    mx, mn, lum = max(c), min(c), (r + g + b) / 3
    if mx - mn < 30 and lum > 205:
        return True
    if mx - mn < 35 and 120 < lum <= 230:
        return True
    return b >= r - 5 and b >= g and mx - mn < 70 and 135 < lum <= 230


def cutout(s, dark, cut_bottom):
    h, w, _ = s.shape
    bg = np.zeros((h, w), bool)
    wm = np.zeros((h, w), bool)
    wm[int(h * 0.83):int(h * 0.89), int(w * 0.77):int(w * 0.92)] = True
    q = deque()
    for y in range(h):
        for x in range(w):
            edge = y == 0 or x in (0, w - 1) or (y == h - 1 and not cut_bottom)
            if edge and bglike(s[y, x], dark):
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx]:
                c = s[ny, nx]
                if bglike(c, dark) or (wm[ny, nx] and c.mean() > 150):
                    bg[ny, nx] = True
                    q.append((ny, nx))
    if not dark:
        keys, cnt = np.unique((s[bg] // 6).reshape(-1, 3), axis=0, return_counts=True)
        tones = keys[np.argsort(-cnt)[:3]] * 6 + 3
        near = np.zeros((h, w), bool)
        for t in tones:
            near |= np.abs(s - t).max(axis=2) <= 9
        lab, n = ndimage.label(near & ~bg)
        for i in range(1, n + 1):
            if (lab == i).sum() >= 6:
                bg |= lab == i
    lab, n = ndimage.label(~bg)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= max(sizes) * 0.02 and sz > 6])
    return bg | ~keep


def quantize(s, bg):
    fg = s[~bg].reshape(1, -1, 3).astype(np.uint8)
    q = Image.fromarray(fg).quantize(colors=NCOL - 4, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[:(NCOL - 4) * 3]).reshape(-1, 3)
    px = fg.reshape(-1, 3).astype(int)
    for _ in range(4):
        dist = ((px[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2).min(axis=1)
        score = dist * ((px.max(axis=1) - px.min(axis=1)) > 70)
        k = score.argmax()
        if score[k] < 2500:
            break
        pal = np.vstack([pal, px[k]])
    flat = s.reshape(-1, 3).astype(int)
    idx = ((flat[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2).argmin(axis=1).reshape(s.shape[:2])
    out = np.zeros((*s.shape[:2], 4), np.uint8)
    out[..., :3] = pal[idx]
    out[..., 3] = np.where(bg, 0, 255)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 2:
        raise SystemExit(__doc__)
    src, cid = args
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.int32)
    s = reduce(im)
    bg = cutout(s, '--dark-bg' in sys.argv, '--cut-bottom' in sys.argv)
    ys, xs = np.where(~bg)
    s, bg = s[ys.min():ys.max() + 1, xs.min():xs.max() + 1], bg[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    out = ROOT / 'art' / 'portraits' / f'{cid}.png'
    Image.fromarray(quantize(s, bg), 'RGBA').save(out)
    print(f'{out.relative_to(ROOT)} : {s.shape[1]}×{s.shape[0]}')


if __name__ == '__main__':
    main()
