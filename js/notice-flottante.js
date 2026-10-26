/* Bouton « ? » flottant de la notice, présent sur toutes les pages de l'application.
   - Si la page a déjà son propre « ? » flottant (Demandes, Documents, Stock), on n'ajoute rien.
   - Sinon il ouvre la notice de la page (openNotice() ou #btnNotice), à défaut un court mode d'emploi ci-dessous. */
(function () {
  'use strict';

  var PAGES = {
    index: {
      titre: 'Accueil',
      html: '<p>Chaque tuile ouvre un module : <strong>Gestion des stocks</strong>, <strong>Ludothèque</strong>, <strong>Gestion crèches</strong> (Demandes), <strong>Suivi de l’enfant</strong>, <strong>Familles &amp; contrats</strong> (Devis, Contrats d’accueil, Facturation), <strong>Base documentaire</strong> (Documents, Base réglementaire), <strong>Équipe</strong> (Mon espace, Accès terrain) et <strong>Paramètres</strong>.</p>' +
        '<p>Les liens annexes (Padlets, Genially, site internet…) ouvrent des outils extérieurs.</p>'
    },
    collaborateur: {
      titre: 'Mon espace',
      html: '<p>Votre espace personnel. Les messages de la direction et des référents s’affichent ici : ils sont à lecture seule, vous ne pouvez pas y répondre depuis cette page.</p>' +
        '<p><strong>Planning des quiz</strong> : deux quiz par semaine (un sur le projet pédagogique, un sur les protocoles), du 26 octobre au 18 décembre 2026. La semaine en cours est surlignée ; « Passer le quiz » ouvre votre lien personnel. Ces quiz sont sans note.</p>'
    },
    employes: {
      titre: 'Collaborateurs',
      html: '<p>Les fiches des collaborateurs de la crèche et leurs documents. Ouvrez une fiche pour la consulter ou la mettre à jour.</p>' +
        '<p>Dans la fiche, « Planning des quiz » montre, semaine par semaine, les quiz faits, à faire ou en retard de la personne (lecture seule).</p>' +
        '<p><strong>Compte de connexion et accès terrain</strong> : le bouton d’invitation envoie un e-mail ; « Partager le lien » donne un lien à transmettre (WhatsApp, SMS). Le collaborateur ouvre le lien, choisit son mot de passe (8 caractères minimum), configure la double authentification, puis entre. Le lien ne sert qu’une fois : s’il est expiré, repartagez-en un depuis la fiche.</p>' +
        '<p><strong>Départ d’un collaborateur</strong> : renseignez la « Date de fin » dans la fiche ; une fois cette date passée, « Archiver ce dossier » sort la fiche des listes actives (« Voir les archives » pour la retrouver) et <strong>bloque son compte de connexion</strong> (Mon espace et accès terrain). « Réactiver ce dossier » rétablit les deux.</p>'
    },
    factures: {
      titre: 'Facturation',
      html: '<p>Trois onglets :</p><ul><li><strong>Le mois</strong> : les factures du mois en cours.</li><li><strong>Toutes les factures</strong> : l’historique complet.</li><li><strong>Impayés et relances</strong> : les factures à relancer.</li></ul>'
    },
    parametres: {
      titre: 'Paramètres',
      html: '<p>Deux onglets : <strong>Les établissements</strong> (réglages de chaque crèche, archives sur disque dur, lien de la tablette de pointage) et <strong>Le réseau</strong>.</p>' +
        '<p>Le journal d’accès aux documents sensibles se consulte ici, avec les archives (direction uniquement).</p>'
    },
    suivi: {
      titre: 'Suivi de l’enfant',
      html: '<p>Le suivi de l’enfant. L’accès est protégé par une <strong>double authentification</strong> : saisissez le code demandé à l’ouverture.</p>'
    },
    terrain: {
      titre: 'Accès terrain',
      html: '<p>L’accès réservé aux équipes de terrain. L’accès est protégé par une <strong>double authentification</strong> : saisissez le code demandé à l’ouverture.</p>' +
        '<p>Première connexion : ouvrez le lien reçu, choisissez votre mot de passe, puis configurez la double authentification. Lien expiré : demandez-en un nouveau à la direction.</p>' +
        '<p><strong>Nettoyages</strong> : la tuile affiche le plan de nettoyage des jeux et des espaces de votre crèche. « Noter » enregistre un nettoyage avec la date, <strong>qui l’a fait</strong>, le produit et une observation ; le plan de maîtrise sanitaire (Documents) reprend ce registre. Le plan se modifie dans Stock › Nettoyages (direction et référent·e·s).</p>' +
        '<p><strong>Remise en température</strong> : la « Fiche de contrôle de la remise en températures » remplie en ligne par la personne qui s’occupe de la cuisine. « Saisir le service du jour » reprend automatiquement les plats du <strong>menu du traiteur</strong> du jour (Demandes › MCM › Menus) : les plats froids (fruit, laitage, entrée…) sont décochés, il suffit de renseigner chaque plat réchauffé : la <strong>température de fin de réchauffe</strong> (boutons − / + par 1 °C, « − 0,1 » / « + 0,1 » pour affiner au dixième, ou valeur rapide, autour de 70 °C) et la <strong>température à la mise en chauffe</strong> (autour de 1 à 4 °C), puis les heures en un tap (« il y a 15 / 30 / 45 / 60 min » pour le début de chauffe, « Fin = maintenant » ; l’heure de fin se remplit aussi seule). « Plus de détails » permet d’ajouter la température après mixage et les observations ; « Autre plat » ajoute un plat absent du menu. Le <strong>visa</strong> est votre nom, prérempli. La conformité se calcule seule (63 °C en fin de réchauffe, en moins d’1 heure) ; si le plat n’est pas conforme, l’<strong>observation</strong> est obligatoire. Les plats s’affichent regroupés par jour. « Imprimer / PDF » (bloc Fiche de la semaine) génère la fiche de la semaine choisie, lundi → vendredi, présentée comme la fiche papier : à imprimer ou à enregistrer en PDF. Un relevé ne se modifie pas : seule la direction peut le supprimer (l’auteur dans les 15 minutes).</p>' +
        '<p><strong>Couches</strong> : la tuile liste les enfants de votre crèche ; − et + règlent le nombre de couches utilisées dans la journée (jour modifiable, pas dans le futur). Le stock de couches de la crèche (Stock › Couches) se décompte automatiquement.</p>'
    }
  };

  function page() {
    var n = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
    return n || 'index';
  }

  function ouvrirGenerique() {
    var p = PAGES[page()] || { titre: 'Aide', html: '<p>Pas encore de notice pour cette page.</p>' };
    var ov = document.getElementById('kk-notice-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'kk-notice-ov';
      ov.innerHTML = '<div class="kk-notice-box"><button type="button" class="kk-notice-x" aria-label="Fermer">✕</button>' +
        '<h3 id="kk-notice-t"></h3><div id="kk-notice-b"></div>' +
        '<p class="kk-notice-pied"><i class="ti ti-layout-navbar"></i> La barre verticale au-dessus du koala garde les derniers modules consultés (le plus récent en tête) pour y revenir en un clic ; la grille ouvre tous les modules, la flèche replie la barre.<br>💬 Un problème ? Cliquez sur la bulle koala pour nous écrire.<br>La notice détaillée de la gestion des crèches se trouve dans <strong>Demandes</strong>.</p>' +
        '<div style="text-align:right"><button type="button" class="kk-notice-ok">J’ai compris</button></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) {
        if (e.target === ov || e.target.closest('.kk-notice-x, .kk-notice-ok')) ov.style.display = 'none';
      });
    }
    document.getElementById('kk-notice-t').textContent = p.titre;
    document.getElementById('kk-notice-b').innerHTML = p.html;
    ov.style.display = 'flex';
  }

  function ouvrir() {
    if (typeof window.openNotice === 'function') return window.openNotice();
    var b = document.getElementById('btnNotice');
    if (b) return b.click();
    ouvrirGenerique();
  }

  function init() {
    if (document.getElementById('kk-notice-btn')) return;
    // la page a déjà son « ? » flottant
    var existants = document.querySelectorAll('button[onclick="openNotice()"]');
    for (var i = 0; i < existants.length; i++) {
      if (/position:\s*fixed/.test(existants[i].getAttribute('style') || '')) return;
    }
    var st = document.createElement('style');
    st.textContent =
      '#kk-notice-btn{position:fixed;bottom:24px;right:24px;width:48px;height:48px;border-radius:50%;background:var(--koala,#3D3580);color:#fff;border:none;cursor:pointer;font-size:20px;font-weight:700;font-family:inherit;box-shadow:0 4px 16px rgba(61,53,128,.35);z-index:9980;display:flex;align-items:center;justify-content:center;transition:transform .15s}' +
      '#kk-notice-btn:hover{transform:scale(1.1)}' +
      '#kk-notice-ov{position:fixed;inset:0;background:rgba(20,18,50,.5);z-index:10000;display:none;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Nunito,sans-serif}' +
      '.kk-notice-box{position:relative;background:#fff;color:#1a1a1a;border-radius:16px;border-top:4px solid var(--koala,#3D3580);max-width:520px;width:100%;max-height:85vh;overflow-y:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-size:13.5px;line-height:1.6}' +
      '.kk-notice-box h3{margin:0 0 12px;font-size:17px}.kk-notice-box ul{padding-left:20px;margin:6px 0}' +
      '.kk-notice-x{position:absolute;top:12px;right:12px;width:28px;height:28px;border:none;border-radius:50%;background:#F0EDE8;cursor:pointer}' +
      '.kk-notice-pied{font-size:12.5px;color:#666;border-top:1px solid #eee;padding-top:10px;margin-top:14px}' +
      '.kk-notice-ok{padding:8px 18px;border:none;border-radius:8px;background:var(--koala,#3D3580);color:#fff;font-weight:600;cursor:pointer;font-family:inherit}' +
      '@media (max-width:768px){#kk-notice-btn{bottom:76px;right:16px}}';
    document.head.appendChild(st);
    var btn = document.createElement('button');
    btn.id = 'kk-notice-btn';
    btn.type = 'button';
    btn.title = 'Aide & notice d’utilisation';
    btn.textContent = '?';
    btn.addEventListener('click', ouvrir);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
