#!/usr/bin/env python3
"""Ajoute l'envoi direct par mail à admin.html (projet quiz-protocoles).
Usage : python appliquer.py admin.html   ->  écrit admin.html (sauvegarde admin.html.bak)."""
import sys, shutil, pathlib
chemin = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'admin.html')
bloc = (pathlib.Path(__file__).parent / 'envoi-bloc.js').read_text(encoding='utf-8')
src = chemin.read_text(encoding='utf-8')

def remplacer(ancien, nouveau):
    global src
    if src.count(ancien) != 1:
        sys.exit("ERREUR : motif attendu une seule fois, trouvé %d fois :\n%s" % (src.count(ancien), ancien[:120]))
    src = src.replace(ancien, nouveau)

# 1. nouvelle vue
remplacer("  else if(view==='blocs')renderBlocs();\n}", "  else if(view==='blocs')renderBlocs();\n  else if(view==='envoi')renderEnvoi();\n}")
# 2. le bloc de code, avant la navigation par onglets
remplacer("/* ===== NAVIGATION ONGLETS ===== */", bloc + "/* ===== NAVIGATION ONGLETS ===== */")
# 3. bouton des quiz : envoi direct au lieu du mailto
remplacer("""onclick="mailCandidat('${q.id}')">✉ Mail candidat</button>""",
          """onclick="openEnvoi('quiz','${q.id}')">✉ Envoyer par mail</button>""")
# 4. bouton des modules
remplacer("""onclick="copyModuleLink('${m.id}')">Copier le lien</button>""",
          """onclick="copyModuleLink('${m.id}')">Copier le lien</button>
        <button class="btn" style="padding:7px 14px;font-size:13px" onclick="openEnvoi('module','${m.id}')">✉ Envoyer par mail</button>""")
shutil.copy(chemin, str(chemin) + '.bak')
chemin.write_text(src, encoding='utf-8')
print("OK :", chemin)
