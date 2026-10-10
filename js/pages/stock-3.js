// ── NOTICE D'UTILISATION ─────────────────────────────────────────────────

const NOTICE_CONTENT = {

inventaire: `
<h3 style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">📦 Gestion de l'inventaire</h3>

<div style="background:var(--accent-lt);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#1E40AF">
  💡 L'inventaire est divisé en deux onglets : <strong>Matériel pédagogique</strong> (articles dépréciables) et <strong>Consommables</strong> (gel, couches, peintures...).
</div>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">🧸 Ajouter un article</div>
<ol style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Cliquez sur <strong>+ Ajouter un article</strong> (bouton bleu en bas de la sidebar)</li>
  <li>Remplissez le <strong>Nom</strong>, la <strong>Catégorie</strong> et la <strong>Structure</strong> (obligatoires)</li>
  <li>Indiquez la <strong>Quantité en stock</strong> et le <strong>Prix unitaire</strong></li>
  <li>Pour un consommable : décochez <strong>Article dépréciable</strong> et renseignez le <strong>Stock minimum</strong></li>
  <li>Pour du matériel : renseignez la <strong>Date d'achat</strong> pour activer la dépréciation automatique</li>
  <li>Cliquez sur <strong>💾 Enregistrer</strong></li>
</ol>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">✏️ Modifier ou ajuster le stock</div>
<ol style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Cliquez sur une ligne du tableau pour ouvrir la <strong>fiche détail</strong></li>
  <li>Utilisez les boutons <strong>− Retirer 1</strong> / <strong>+ Ajouter 1</strong> pour ajuster rapidement</li>
  <li>Ou saisissez une quantité et cliquez <strong>Valider</strong></li>
  <li>Pour modifier toutes les infos : cliquez sur ✏️ dans la fiche ou dans le tableau</li>
</ol>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">🔍 Filtres et recherche</div>
<ul style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Utilisez la <strong>barre de recherche</strong> en haut pour trouver un article par nom</li>
  <li>Filtrez par <strong>catégorie</strong> avec les chips (Sensoriel, Motricité...)</li>
  <li>Filtrez par <strong>structure</strong> en cliquant sur une crèche dans la sidebar</li>
  <li>Cliquez sur les en-têtes de colonnes pour <strong>trier</strong> le tableau</li>
</ul>

<div style="background:var(--amber-lt);border-left:4px solid var(--amber);border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#92400E">
  ⚠ <strong>Stock bas :</strong> quand le stock d'un consommable passe sous son minimum, une alerte 🔴 apparaît dans le badge de navigation.
</div>

<hr style="border:none;border-top:1px solid var(--border);margin:24px 0">

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">❓ Questions fréquentes</div>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Pourquoi mon article n'apparaît pas dans l'inventaire ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Vérifiez que vous n'avez pas un filtre actif (catégorie ou crèche). Cliquez sur "Tout" dans les chips de catégorie et sur "Toutes les crèches" dans la sidebar. Vérifiez aussi que vous êtes sur le bon onglet (Matériel ou Consommables).</div>
</details>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Comment ajouter une photo à un article existant ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Cliquez sur la ligne de l'article pour ouvrir la fiche détail. Si aucune photo n'est présente, cliquez sur le cadre photo avec l'icône 📷. Vous pouvez aussi modifier l'article avec ✏️ et uploader une photo dans le formulaire.</div>
</details>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Quelle est la différence entre Matériel et Consommable ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7"><strong>Matériel pédagogique</strong> : jouets, portiques, tapis... Ces articles se déprécie de 20% par an. Leur état (Neuf, Bon état, Usagé, À remplacer) est calculé automatiquement à partir de la date d'achat.<br><br><strong>Consommables</strong> : gel hydroalcoolique, couches, peintures... Ces articles ne se déprécient pas. On surveille leur stock minimum et leur date de péremption.</div>
</details>`,

commandes: `
<h3 style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🛒 Gestion des commandes</h3>

<div style="background:var(--accent-lt);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#1E40AF">
  💡 Les commandes passent par 3 états : <strong>En cours</strong> → <strong>Livrée</strong> → <strong>Annulée</strong>. La confirmation de livraison met automatiquement à jour les stocks.
</div>

<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:var(--ink2);line-height:1.7">
  🧼 <strong>Produits d'hygiène :</strong> le bouton <strong>Commander les produits d'hygiène</strong>, en haut de la page Commandes, ouvre directement le site du fournisseur (Cap Hygiène) dans un nouvel onglet. Pensez à créer ensuite la commande correspondante ici pour que les stocks soient mis à jour à la réception.
</div>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">📝 Créer une commande</div>
<ol style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Cliquez sur <strong>+ Nouvelle commande</strong></li>
  <li>Le numéro de bon de commande est <strong>généré automatiquement</strong></li>
  <li>Ajoutez les articles ligne par ligne : quantité, nom, fournisseur, catégorie, prix</li>
  <li>Le montant total est <strong>calculé automatiquement</strong></li>
  <li>Ajoutez une note si nécessaire, puis cliquez <strong>🛒 Passer la commande</strong></li>
</ol>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">✅ Confirmer une livraison</div>
<ol style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Dans l'onglet <strong>En cours</strong>, cliquez sur <strong>✅ Marquer livré</strong></li>
  <li>Vérifiez les quantités reçues (modifiables si livraison partielle)</li>
  <li>Cliquez <strong>✅ Confirmer la réception</strong></li>
  <li>Les stocks sont mis à jour automatiquement, et la <strong>date d'achat</strong> est enregistrée</li>
</ol>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">🖨 Exporter un bon de commande</div>
<ul style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li><strong>⬇ Excel</strong> : génère un fichier .xlsx au format bon de commande</li>
  <li><strong>🖨 PDF / Imprimer</strong> : ouvre une prévisualisation imprimable</li>
  <li><strong>✉️ Mail</strong> : prépare un e-mail avec le bordereau en pièce jointe</li>
</ul>

<hr style="border:none;border-top:1px solid var(--border);margin:24px 0">
<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">❓ Questions fréquentes</div>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Puis-je modifier une commande après l'avoir créée ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Oui, tant qu'elle est <strong>En cours</strong>. Cliquez sur ✏️ Modifier sur la carte de la commande. Une commande livrée ou annulée ne peut plus être modifiée.</div>
</details>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Que se passe-t-il si un article de la commande n'existe pas encore dans l'inventaire ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Il est <strong>créé automatiquement</strong> lors de la confirmation de livraison, avec les informations saisies dans la commande (nom, prix, fournisseur, catégorie).</div>
</details>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Comment commander un article directement depuis sa fiche ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Ouvrez la fiche détail de l'article, puis cliquez sur <strong>🛒 Commander</strong>. Le formulaire de commande s'ouvre pré-rempli avec cet article.</div>
</details>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Puis-je enregistrer le lien du panier en ligne d'une commande ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Oui. Renseignez le champ <strong>URL / lien</strong> de la commande (ou d'une ligne d'article). Un bouton <strong>🔗 Accéder à la commande en ligne</strong> apparaît alors sur la carte, et le lien est aussi cliquable dans le bon de commande Excel exporté.</div>
</details>`,

fournisseurs: `
<h3 style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🏭 Gestion des fournisseurs</h3>

<div style="background:var(--accent-lt);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#1E40AF">
  💡 Les fournisseurs enregistrés apparaissent automatiquement dans les listes déroulantes lors de la création d'articles et de commandes.
</div>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">➕ Ajouter un fournisseur</div>
<ol style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Allez dans <strong>🏭 Fournisseurs</strong> dans la sidebar</li>
  <li>Cliquez sur <strong>+ Ajouter fournisseur</strong></li>
  <li>Remplissez au minimum le <strong>Nom</strong> (obligatoire)</li>
  <li>Ajoutez contact, email, site web, délai de livraison et spécialité</li>
  <li>Enregistrez — le fournisseur est disponible immédiatement dans tous les formulaires</li>
</ol>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">🌐 Accéder au catalogue</div>
<ul style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Si un site web est renseigné, le bouton <strong>🌐 Site</strong> apparaît sur la fiche</li>
  <li>Il s'ouvre dans un nouvel onglet pour consulter le catalogue</li>
</ul>

<hr style="border:none;border-top:1px solid var(--border);margin:24px 0">
<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">❓ Questions fréquentes</div>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Que se passe-t-il si je supprime un fournisseur qui est lié à des articles ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Un message vous prévient du nombre d'articles concernés. Si vous confirmez, le fournisseur est retiré de ces articles (champ vide) mais les articles ne sont pas supprimés.</div>
</details>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Comment changer le nom d'un fournisseur sans perdre les liens avec les articles ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Utilisez le bouton ✏️ Modifier sur la fiche fournisseur. Le nouveau nom est automatiquement répercuté sur tous les articles liés.</div>
</details>`,

depreciation: `
<h3 style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">🔄 État et dépréciation des articles</h3>

<div style="background:var(--accent-lt);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#1E40AF">
  💡 La dépréciation est <strong>automatique</strong> : il suffit de renseigner la date d'achat. L'état est recalculé chaque jour sans intervention.
</div>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">📊 Comment fonctionne la dépréciation ?</div>
<div style="font-size:13px;color:var(--ink2);line-height:1.8;margin-bottom:16px">
  Chaque article perd <strong>20% de sa valeur par an</strong>. L'état est calculé selon la valeur résiduelle :
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">
  <div style="background:#D1FAE5;border-radius:8px;padding:10px 14px;font-size:13px"><strong style="color:#065F46">🟢 Neuf</strong><br><span style="color:#065F46;font-size:12px">0 à 1 an — résiduel ≥ 80%</span></div>
  <div style="background:#DBEAFE;border-radius:8px;padding:10px 14px;font-size:13px"><strong style="color:#1E40AF">🔵 Bon état</strong><br><span style="color:#1E40AF;font-size:12px">1 à 2 ans — résiduel 60–80%</span></div>
  <div style="background:#FEF3C7;border-radius:8px;padding:10px 14px;font-size:13px"><strong style="color:#92400E">🟠 Usagé</strong><br><span style="color:#92400E;font-size:12px">2 à 3 ans — résiduel 40–60%</span></div>
  <div style="background:#FEE2E2;border-radius:8px;padding:10px 14px;font-size:13px"><strong style="color:#991B1B">🔴 À remplacer</strong><br><span style="color:#991B1B;font-size:12px">3+ ans — résiduel &lt; 40%</span></div>
</div>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">⚙️ Activer la dépréciation sur un article</div>
<ol style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Modifiez l'article (✏️)</li>
  <li>Renseignez la <strong>Date d'achat</strong></li>
  <li>Laissez <strong>État</strong> sur "Auto" — le calcul est automatique</li>
  <li>Enregistrez</li>
</ol>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">🔧 Forcer un état manuellement</div>
<div style="font-size:13px;color:var(--ink2);line-height:1.7;margin-bottom:20px">
  Si un article est abîmé prématurément, vous pouvez forcer son état dans le formulaire via le champ <strong>🏷 État</strong>. Choisissez "À remplacer" indépendamment de la date d'achat. L'état manuel a toujours la priorité sur le calcul automatique.
</div>

<div style="background:var(--amber-lt);border-left:4px solid var(--amber);border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#92400E;margin-bottom:20px">
  ⚠ Quand une commande est <strong>confirmée livrée</strong>, la date d'achat des articles reçus est automatiquement mise à jour. L'état repart à 🟢 Neuf.
</div>

<hr style="border:none;border-top:1px solid var(--border);margin:24px 0">
<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">❓ Questions fréquentes</div>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Un article n'a pas de badge d'état — pourquoi ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Deux raisons possibles : soit la <strong>date d'achat n'est pas renseignée</strong> (aucun calcul possible), soit l'article est un <strong>consommable</strong> (dépréciation désactivée). Modifiez l'article et renseignez la date d'achat pour activer le suivi.</div>
</details>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Où voir tous les articles à remplacer ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">La tuile <strong>🔴 À remplacer</strong> sur la page Inventaire affiche le nombre d'articles concernés. Les détails apparaissent aussi dans le badge rouge de la sidebar. Filtrez par crèche pour cibler une structure.</div>
</details>`,

historique: `
<h3 style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">📋 Historique</h3>

<div style="background:var(--accent-lt);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#1E40AF">
  💡 L’historique conserve la trace de toutes les commandes passées, quel que soit leur statut. C’est la mémoire du service.
</div>

<div style="font-weight:700;font-size:14px;margin-bottom:10px">🔍 Consulter</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Les commandes sont classées de la plus récente à la plus ancienne.</li>
  <li>Les filtres en haut permettent d’isoler les commandes <strong>en cours</strong>, <strong>livrées</strong> ou <strong>annulées</strong>.</li>
  <li>Cliquer sur une commande pour en afficher le détail : articles, quantités, fournisseur, date.</li>
</ul>

<div style="font-weight:700;font-size:14px;margin-bottom:10px">♻️ Réutiliser une commande</div>
<ul style="font-size:13px;line-height:1.9;margin:0 0 18px 18px;padding:0">
  <li>Depuis une nouvelle commande, le bouton de sélection d’une commande précédente permet de reprendre une liste d’articles déjà constituée.</li>
  <li>Très utile pour les réassorts récurrents de consommables : on repart de l’existant et on ajuste les quantités.</li>
</ul>

<div style="border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-size:13px;color:var(--ink3)">
  ℹ️ L’historique est alimenté automatiquement : aucune saisie manuelle n’est nécessaire.
</div>
`,

sauvegardes: `
<h3 style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;margin-bottom:16px">💾 Sauvegardes & restauration</h3>

<div style="background:var(--green-lt);border-left:4px solid var(--green);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#065F46">
  ✅ Vos données sont <strong>sauvegardées automatiquement</strong> dans Supabase à chaque action. Pas besoin d'appuyer sur Sauvegarder pour ne pas perdre vos données.
</div>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">🗂 Les 3 niveaux de sauvegarde</div>
<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
  <div style="border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-size:13px">
    <strong>☁️ Supabase</strong> — automatique, en temps réel<br>
    <span style="color:var(--ink3)">Toutes vos données synchronisées dans le cloud à chaque modification. Accessible depuis n'importe quel appareil.</span>
  </div>
  <div style="border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-size:13px">
    <strong>💻 Cache local</strong> — automatique, dans votre navigateur<br>
    <span style="color:var(--ink3)">Copie locale pour un chargement rapide, même en cas de connexion lente. Limité à 5 Mo.</span>
  </div>
  <div style="border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-size:13px">
    <strong>📄 Export JSON</strong> — manuel, sur votre disque<br>
    <span style="color:var(--ink3)">Sauvegarde complète téléchargeable. Recommandé une fois par semaine.</span>
  </div>
</div>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">📥 Faire une sauvegarde manuelle</div>
<ol style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Cliquez sur <strong>💾 Sauvegarder</strong> dans la barre du haut</li>
  <li>Un fichier <code style="background:var(--bg);padding:1px 6px;border-radius:4px">sauvegarde-[nom]-[date].json</code> est téléchargé</li>
  <li>Conservez-le dans un dossier dédié ou sur Google Drive / OneDrive</li>
</ol>

<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">📤 Restaurer une sauvegarde</div>
<ol style="font-size:13px;line-height:2;color:var(--ink2);padding-left:20px;margin-bottom:20px">
  <li>Cliquez sur <strong>📂 Restaurer</strong> dans la barre du haut</li>
  <li>Sélectionnez votre fichier JSON</li>
  <li>Confirmez — les données sont restaurées localement ET re-synchronisées vers Supabase</li>
</ol>

<div style="background:var(--red-lt);border-left:4px solid var(--red);border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#991B1B;margin-bottom:20px">
  ⚠ Le bouton <strong>🗑 Reset</strong> supprime <em>toutes</em> les données locales sans possibilité d'annuler. Ne l'utilisez qu'en cas de problème grave, après avoir fait une sauvegarde.
</div>

<hr style="border:none;border-top:1px solid var(--border);margin:24px 0">
<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">❓ Questions fréquentes</div>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Le statut affiche "⚠️ Hors ligne" — mes données sont-elles perdues ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Non. Vos données sont conservées dans le cache local du navigateur. Dès que la connexion revient, l'app se re-synchronise automatiquement avec Supabase. Vous pouvez continuer à travailler en mode hors-ligne.</div>
</details>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">Puis-je utiliser l'app sur plusieurs appareils en même temps ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Oui. Supabase synchronise les données entre tous les appareils. L'app se rafraîchit automatiquement toutes les 60 secondes pour récupérer les modifications faites depuis un autre appareil.</div>
</details>

<details style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
  <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;background:var(--bg)">À quelle fréquence faire une sauvegarde JSON ?</summary>
  <div style="padding:12px 16px;font-size:13px;color:var(--ink2);line-height:1.7">Une fois par semaine est recommandé. Supabase conserve ses propres sauvegardes automatiques sur 7 jours, mais le fichier JSON vous garantit une copie indépendante sur votre propre disque.</div>
</details>

<hr style="border:none;border-top:1px solid var(--border);margin:24px 0">
<div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--ink)">🏠 Navigation entre les applications</div>
<div style="font-size:13px;color:var(--ink2);line-height:1.7;margin-bottom:12px">
  Le réseau Koala Kids dispose de deux applications complémentaires accessibles depuis le portail d'accueil :
</div>
<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
  <div style="border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-size:13px">
    <strong>📦 Stock pédagogique</strong> — cette application<br>
    <span style="color:var(--ink3)">Inventaire, commandes, fournisseurs, historique.</span>
  </div>
  <div style="border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-size:13px">
    <strong>💬 Demandes RT</strong> — application complémentaire<br>
    <span style="color:var(--ink3)">Demandes terrain, incidents, présences, planning, directeurs/trices techniques.</span>
  </div>
</div>
<div style="font-size:13px;color:var(--ink2)">Utilisez le bouton <strong>← Accueil</strong> en haut à gauche pour revenir au portail à tout moment.</div>`

};

function openNotice() {
  switchNoticeTab('inventaire', document.querySelector('.notice-tab'));
  document.getElementById('modal-notice').classList.add('open');
  if (window.innerWidth > 768) document.body.style.overflow = 'hidden';
}

function switchNoticeTab(tab, btn) {
  document.querySelectorAll('.notice-tab').forEach(b => {
    b.style.borderBottomColor = 'transparent';
    b.style.color = 'var(--ink3)';
  });
  if (btn) {
    btn.style.borderBottomColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
  }
  const content = document.getElementById('notice-content');
  if (content) content.innerHTML = NOTICE_CONTENT[tab] || '';
}


