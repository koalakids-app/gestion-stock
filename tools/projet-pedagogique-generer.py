#!/usr/bin/env python3
"""Régénère les pages en images et l'index de recherche du livre du projet pédagogique.
Usage (depuis la racine du dépôt, poppler-utils requis) : python3 tools/projet-pedagogique-generer.py
Puis ajuster NB_PAGES dans js/pages/projet-pedagogique.js si le nombre de pages change."""
import json, re, shutil, subprocess, html, pathlib

PDF = 'projet-pedagogique-koalakids.pdf'
DOSSIER = pathlib.Path('projet-pedagogique-pages')
shutil.rmtree(DOSSIER, ignore_errors=True)
DOSSIER.mkdir()
subprocess.run(['pdftoppm', '-jpeg', '-jpegopt', 'quality=70,optimize=y', '-scale-to-x', '1200',
                '-scale-to-y', '-1', PDF, str(DOSSIER / 'p')], check=True)

raw = subprocess.run(['pdftotext', '-bbox', PDF, '-'], capture_output=True, text=True, check=True).stdout
pages = []
for pg in re.split(r'<page ', raw)[1:]:
    w = float(re.search(r'width="([\d.]+)"', pg).group(1))
    h = float(re.search(r'height="([\d.]+)"', pg).group(1))
    mots = []
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pg):
        x0, y0, x1, y1 = (float(m.group(i)) for i in range(1, 5))
        t = html.unescape(m.group(5))
        if re.fullmatch(r'[.…·_]{3,}', t):
            continue
        # [mot, x, y, largeur, hauteur] en millièmes de la page
        mots.append([t, round(x0 / w * 1000), round(y0 / h * 1000), round((x1 - x0) / w * 1000), round((y1 - y0) / h * 1000)])
    pages.append(mots)
json.dump(pages, open('projet-pedagogique-mots.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(pages), 'pages')
