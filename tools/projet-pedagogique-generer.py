#!/usr/bin/env python3
"""Régénère les pages en images et l'index de recherche d'un livre du lecteur (projet-pedagogique.html).
Usage (depuis la racine du dépôt, poppler-utils requis) :
    python3 tools/projet-pedagogique-generer.py [livre ...]     # sans argument : tous les livres
Le nombre de pages (nb) est à reporter dans LIVRES de js/pages/projet-pedagogique.js."""
import json, re, shutil, subprocess, html, pathlib, sys

LIVRES = {
    'projet-pedagogique': ('projet-pedagogique-koalakids.pdf', 'projet-pedagogique-pages', 'projet-pedagogique-mots.json'),
    'socle': ('socle-connaissances.pdf', 'socle-pages', 'socle-mots.json'),
}

def generer(pdf, dossier, mots_json):
    dossier = pathlib.Path(dossier)
    shutil.rmtree(dossier, ignore_errors=True)
    dossier.mkdir()
    subprocess.run(['pdftoppm', '-jpeg', '-jpegopt', 'quality=70,optimize=y', '-scale-to-x', '1200',
                    '-scale-to-y', '-1', pdf, str(dossier / 'p')], check=True)
    for f in dossier.glob('p-*.jpg'):        # pdftoppm numérote selon le nombre de pages : on force 3 chiffres
        f.rename(dossier / ('p-%03d.jpg' % int(f.stem.split('-')[1])))
    raw = subprocess.run(['pdftotext', '-bbox', pdf, '-'], capture_output=True, text=True, check=True).stdout
    pages = []
    for pg in re.split(r'<page ', raw)[1:]:
        w = float(re.search(r'width="([\d.]+)"', pg).group(1))
        h = float(re.search(r'height="([\d.]+)"', pg).group(1))
        mots = []
        for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pg):
            x0, y0, x1, y1 = (float(m.group(i)) for i in range(1, 5))
            t = html.unescape(m.group(5))
            if re.fullmatch(r'[.\u2026·_]{3,}', t):
                continue
            # [mot, x, y, largeur, hauteur] en millièmes de la page
            mots.append([t, round(x0 / w * 1000), round(y0 / h * 1000), round((x1 - x0) / w * 1000), round((y1 - y0) / h * 1000)])
        pages.append(mots)
    json.dump(pages, open(mots_json, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return len(pages)

for nom in (sys.argv[1:] or LIVRES):
    print(nom, generer(*LIVRES[nom]), 'pages')
