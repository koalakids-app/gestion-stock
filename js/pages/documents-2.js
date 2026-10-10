const NOTICE_DOC = {

principe: `
<h3>💡 Comment fonctionne cet outil</h3>
<div class="tip">Cette page rassemble tous les documents du réseau, classés par catégorie. Certains se téléchargent simplement, d’autres se remplissent et se signent directement en ligne.</div>
<div class="st">📁 Deux types de documents</div>
<ul>
  <li><strong>À télécharger</strong> — un fichier (PDF, Word…) mis à disposition. On clique, on récupère le fichier.</li>
  <li><strong>À remplir en ligne</strong> — un formulaire dont les champs ont été définis à l’avance. On le remplit à l’écran, on le signe, et on l’exporte en PDF.</li>
</ul>
<div class="st">🔍 Retrouver un document</div>
<ul>
  <li>Les catégories se déplient d’un clic sur leur titre.</li>
  <li>La barre de recherche en haut filtre sur le titre du document.</li>
  <li>Un document peut être rattaché à une crèche précise, ou rester commun à tout le réseau.</li>
</ul>
`,

categories: `
<h3>🗂️ Organiser les catégories</h3>
<div class="tip">Les catégories structurent la bibliothèque. Elles peuvent s’emboîter sur <strong>trois niveaux</strong> : catégorie › sous-catégorie › sous-sous-catégorie (par exemple Protocoles › Santé › Fièvre).</div>
<div class="st">➕ Créer une catégorie</div>
<ul>
  <li>Bouton <strong>Nouvelle catégorie</strong>.</li>
  <li>Renseigner le <strong>nom</strong>, choisir une <strong>couleur</strong> — elle sert de repère visuel dans la liste.</li>
  <li>Laisser <strong>Catégorie parente</strong> vide pour une catégorie de premier niveau, ou en choisir une pour créer une sous-catégorie. La liste affiche le chemin complet (« Protocoles › Santé ») ; seules les catégories où un niveau supplémentaire reste possible y figurent.</li>
</ul>
<div class="st">✏️ Modifier ou déplacer une catégorie</div>
<ul>
  <li>Bouton <strong>Gérer catégories</strong> : la liste complète s’affiche, y compris les catégories encore vides.</li>
  <li>Icône <strong>crayon</strong> pour renommer, changer la couleur, ou choisir une <strong>catégorie parente</strong> — c’est ainsi qu’on déplace une catégorie sous une autre (par exemple : Stagiaires sous Ressources humaines). Les documents suivent automatiquement.</li>
  <li>Une catégorie emporte ses sous-catégories avec elle lors d’un déplacement, à condition que le total reste dans les trois niveaux. Exemple : une catégorie qui contient déjà des sous-catégories peut passer au niveau 2, mais pas au niveau 3.</li>
  <li>Une catégorie ne peut pas être placée sous une de ses propres sous-catégories.</li>
  <li>Icône <strong>corbeille</strong> pour supprimer : les documents concernés basculent en « Sans catégorie », ils ne sont jamais perdus.</li>
</ul>
<div class="st">💡 Conseil d’organisation</div>
<ul>
  <li>Rester sur un nombre limité de catégories principales : une bibliothèque trop découpée devient difficile à parcourir.</li>
  <li>Utiliser les sous-catégories pour les regroupements fins (par exemple : Ressources humaines › Entretiens annuels).</li>
  <li>Ne descendre au troisième niveau que si une sous-catégorie dépasse une dizaine de documents — au-delà, la navigation devient plus lente qu’une simple recherche par mot-clé.</li>
</ul>
`,

documents: `
<h3>📄 Ajouter et gérer les documents</h3>
<div class="warn">🔒 <strong>Réservé à la direction.</strong> L’ajout, la modification et la suppression de documents et de catégories, ainsi que l’import de dossier, sont accessibles aux seuls comptes <strong>direction</strong>. Les directeurs/trices techniques disposent d’un accès en lecture : elles consultent, remplissent en ligne, signent et téléchargent, mais ne déposent pas de nouveau document.</div>
<div class="st">➕ Nouveau document</div>
<ul>
  <li>Bouton <strong>Nouveau document</strong>, puis renseigner le titre, la description, la catégorie et éventuellement la crèche.</li>
  <li>Choisir le <strong>type</strong> :
    <ul>
      <li><strong>À télécharger</strong> → joindre le fichier. Il est stocké en ligne et reste accessible à tous.</li>
      <li><strong>À remplir en ligne</strong> → définir les champs du formulaire.</li>
    </ul>
  </li>
</ul>
<div class="st">🧱 Construire un formulaire</div>
<ul>
  <li>Bouton <strong>Ajouter un champ</strong> pour chaque information à recueillir.</li>
  <li>Donner un <strong>libellé</strong> clair — c’est ce que la personne lira.</li>
  <li>Choisir le type adapté : texte court, zone de texte long, date, e-mail, nombre ou case à cocher.</li>
  <li>L’ordre des champs à l’écran correspond à l’ordre de saisie ici.</li>
</ul>
<div class="warn">⚠️ Modifier les champs d’un document déjà utilisé n’efface pas les réponses existantes, mais les anciennes réponses ne contiendront pas les nouveaux champs. Mieux vaut stabiliser un formulaire avant de le diffuser largement.</div>
<div class="st">🗑️ Supprimer</div>
<ul>
  <li>La suppression retire le document de la liste sans détruire les réponses déjà enregistrées.</li>
</ul>
`,

remplir: `
<h3>✍️ Remplir un document en ligne</h3>
<div class="tip">Un document de type « à remplir » s’ouvre comme un formulaire. Il peut être complété en une fois ou repris plus tard.</div>
<div class="st">📝 La saisie</div>
<ul>
  <li>Cliquer sur le document pour ouvrir le formulaire.</li>
  <li>Remplir les champs, puis <strong>Enregistrer</strong>.</li>
  <li>Tant que la réponse n’est pas exportée, elle reste modifiable : on peut rouvrir et compléter.</li>
</ul>
<div class="st">📤 Exporter en PDF</div>
<ul>
  <li>L’export produit un PDF propre, à l’en-tête du réseau, reprenant les champs remplis et les signatures.</li>
  <li>C’est cette version PDF qui fait foi : la conserver ou la transmettre.</li>
  <li>Il est également possible d’exporter le document <strong>vierge</strong>, pour disposer d’une trame papier.</li>
</ul>
<div class="st">👶 Rattacher le document à un enfant</div>
<ul>
  <li>Le sélecteur <strong>Enfant</strong>, en haut du formulaire, rattache le document au dossier de l’enfant concerné.</li>
  <li>À l’enregistrement, le document <strong>quitte cette page</strong> : il est classé dans la fiche de l’enfant (module Enfants, onglet Documents), et le formulaire redevient vierge ici.</li>
  <li>Le modèle est donc immédiatement réutilisable pour un autre enfant, sans risque d’écraser le document précédent.</li>
  <li>Pour le rouvrir, le compléter ou le faire signer plus tard : passer par la fiche de l’enfant, bouton <strong>Ouvrir / signer</strong>.</li>
</ul>
<div class="tip">Les documents sans enfant rattaché — l’entretien annuel par exemple — restent, eux, repris automatiquement ici tant qu’ils ne sont pas terminés.</div>
`,

signature: `
<h3>🖊️ Les signatures</h3>
<div class="tip">Un document peut recueillir plusieurs signatures — par exemple celle du salarié et celle de la personne menant l’entretien. Deux méthodes existent, au choix pour chaque signataire.</div>
<div class="st">✍️ Signer directement à l’écran</div>
<ul>
  <li>Signer avec le doigt ou un stylet dans le cadre prévu.</li>
  <li>Le bouton <strong>Effacer</strong> permet de recommencer autant de fois que nécessaire.</li>
  <li>Pratique sur tablette, quand les deux personnes sont côte à côte.</li>
</ul>
<div class="st">📱 Signature à distance par QR code</div>
<ul>
  <li>Cliquer sur <strong>Signer sur mobile</strong> en face du signataire concerné.</li>
  <li>Un <strong>QR code</strong> s’affiche : la personne le scanne avec l’appareil photo de son téléphone.</li>
  <li>Une page de signature s’ouvre sur son téléphone. Elle signe, valide, et c’est terminé.</li>
  <li>La signature apparaît <strong>automatiquement</strong> sur le document, sans rien faire de plus : la page vérifie toutes les trois secondes.</li>
  <li>Si le scan pose problème, le bouton <strong>Copier le lien</strong> permet de transmettre l’adresse par SMS ou par mail.</li>
</ul>
<div class="warn">⏱️ Le lien de signature est valable <strong>30 minutes</strong>. Passé ce délai, relancer simplement l’opération pour générer un nouveau QR code.</div>
<div class="st">🏷️ Le statut « Préparé » ou « Signé »</div>
<ul>
  <li>Le document bascule sur <strong>Signé</strong> dès qu’une signature est tracée à l’écran ou reçue par QR code.</li>
  <li>Un simple appui sur le cadre ne suffit pas : il faut un tracé réel. Un effleurement accidentel laisse le document en <strong>Préparé</strong>.</li>
  <li>Effacer la dernière signature fait redescendre le statut sur <strong>Préparé</strong>.</li>
  <li>Pour un document signé sur papier, basculer soi-même le sélecteur de statut sur <strong>Signé</strong> : ce choix est conservé.</li>
</ul>
<div class="tip">C’est ce statut qui s’affiche dans la fiche de l’enfant : ✅ Signé ou 🕓 Préparé.</div>
<div class="st">💡 Bon à savoir</div>
<ul>
  <li>La personne qui signe à distance n’a besoin d’aucun compte ni d’aucune application : un simple navigateur suffit.</li>
  <li>Le lien est propre à ce document et à ce signataire : il ne donne accès à rien d’autre.</li>
  <li>Une signature reçue peut être effacée et refaite avant l’export final.</li>
</ul>
`,

reponses: `
<h3>📋 Consulter les réponses</h3>
<div class="tip">Chaque formulaire rempli est archivé. On retrouve l’ensemble des réponses d’un document au même endroit.</div>
<div class="st">👁️ Consulter</div>
<ul>
  <li>Ouvrir la liste des <strong>réponses enregistrées</strong> depuis le document concerné.</li>
  <li>Les réponses sont datées et identifiées par le nom du signataire.</li>
  <li>Une étiquette <strong>Dossier + prénom</strong> signale les réponses classées dans la fiche d’un enfant, aux côtés de leur statut.</li>
  <li>Ces réponses-là ne sont plus rouvertes automatiquement depuis le modèle : elles se consultent ici ou depuis la fiche de l’enfant.</li>
  <li>Cliquer sur une réponse pour la rouvrir, la compléter ou la réexporter en PDF.</li>
</ul>
<div class="st">🗑️ Supprimer</div>
<ul>
  <li>Une réponse peut être supprimée définitivement — l’action est irréversible.</li>
  <li>Penser à exporter le PDF avant toute suppression si le document doit être conservé.</li>
  <li><strong>Direction</strong> — peut supprimer n’importe quelle réponse.</li>
  <li><strong>Directeur/trice technique</strong> — uniquement une réponse encore au statut <strong>Préparé</strong> et rattachée à sa propre crèche. Une réponse <strong>Signée</strong>, ou celle d’un autre site, n’affiche pas la corbeille.</li>
</ul>
<div class="tip">🖨️ La fonction <strong>Éditer le PDF</strong> reste disponible pour tous : elle génère le PDF puis vide le formulaire en cours de saisie, y compris s’il vient d’être signé.</div>
<div class="warn">📁 Pour les documents à valeur administrative (entretiens annuels notamment), conserver systématiquement l’export PDF en dehors de l’application.</div>
`,

eaje: `
<div class="st">📋 Support de contrôle EAJE</div>
<p>Grille d’auto-contrôle réglementaire reprenant les points vérifiés lors d’une inspection PMI. Utile pour préparer une visite ou faire un point annuel. Elle se trouve dans les documents à remplir, sous « Support de contrôle EAJE ».</p>
<div class="st">🆕 Renseigner une fiche</div>
<ul>
  <li>Ouvrir le document « À remplir » : choisir la crèche et la date de la visite en haut de la fiche.</li>
  <li>Le formulaire est découpé en sections thématiques repliables : locaux, sécurité, hygiène, santé, extérieurs, personnel, conclusion…</li>
  <li>Chaque point se répond par Oui / Non, une valeur chiffrée ou du texte libre.</li>
  <li>Les points marqués <strong>(*)</strong> sont ceux exigés par la réglementation : ils méritent une attention particulière.</li>
</ul>
<div class="st">💾 Enregistrement et export</div>
<ul>
  <li>La saisie est sauvegardée automatiquement au fil de la frappe : aucun risque de perte.</li>
  <li>Une barre de progression indique le pourcentage de points renseignés, et chaque section affiche son propre compteur.</li>
  <li>La partie <strong>Conclusion</strong> permet de formaliser points forts, points faibles et axes de progrès.</li>
  <li>Le bouton PDF exporte la fiche complète pour archivage ou transmission.</li>
  <li>Les fiches déjà saisies se retrouvent via le bouton « Réponses » du document.</li>
</ul>
<div class="warn">⚠️ Un/une directeur/trice technique ne voit que les fiches de sa crèche. La direction accède à l’ensemble des établissements.</div>
`,

registre: `
<h3>🛡️ Le registre de sécurité</h3>
<div class="tip">Le second onglet de cette page tient le registre de sécurité obligatoire de chaque crèche, au titre de l’article R.143-44 du code de la construction et de l’habitation. Il est présenté à la commission de sécurité, au maire, à la PMI ou à l’assureur sur simple demande.</div>
<div class="st">🧭 Se repérer</div>
<ul>
  <li>Le sélecteur en haut choisit la crèche. Un/une directeur/trice technique ne voit et ne modifie que la sienne ; la direction accède aux six.</li>
  <li><strong>Synthèse</strong> — le tableau de bord : contrôles en retard, échéances proches, réserves ouvertes, obligation d’exercices remplie ou non.</li>
  <li><strong>Identité ERP</strong> — type, catégorie, effectifs, avis de la commission de sécurité, chargé de sécurité désigné, assurance.</li>
  <li><strong>Vérifications</strong> — l’échéancier réglementaire (27 contrôles pré-paramétrés) et l’historique des contrôles consignés.</li>
  <li><strong>Exercices</strong> — évacuation et mise en sûreté, avec scénario, durée, difficultés et actions correctives.</li>
  <li><strong>Formations</strong> — SST, PSC1, extincteurs… avec suivi automatique des recyclages.</li>
  <li><strong>Travaux</strong> — mention obligatoire de tout aménagement ou transformation, avec l’entreprise et les dates.</li>
  <li><strong>Réserves</strong> — prescriptions issues des visites, suivies jusqu’à leur levée.</li>
  <li><strong>Journal</strong> — la trace horodatée de toutes les écritures.</li>
</ul>
<div class="st">⏱️ L’échéancier</div>
<ul>
  <li>Chaque type de contrôle porte sa périodicité réglementaire. Dès qu’un contrôle est consigné, la prochaine échéance se calcule seule.</li>
  <li>Un badge rouge signale un contrôle échu, orange une échéance sous 30 jours, gris un contrôle jamais réalisé.</li>
  <li>Le compteur rouge sur les onglets « Vérifications » et « Réserves » indique ce qui reste à traiter.</li>
</ul>
<div class="st">📄 L’export</div>
<ul>
  <li>« Exporter le registre » produit le registre complet en PDF, dans l’ordre des sept parties, prêt à être présenté ou archivé.</li>
  <li>« Aperçu » l’affiche à l’écran sans rien enregistrer sur le disque.</li>
</ul>
<div class="warn">⚠️ Les écritures sont horodatées et nominatives, et ne peuvent être ni modifiées ni supprimées après coup dans le journal : c’est cette inaltérabilité qui rend le registre numérique opposable. Une correction se fait en ajoutant une écriture, jamais en effaçant la précédente.</div>
`

};

function openNotice(){
  document.getElementById('ovNotice').classList.add('on');
  switchNoticeTab('principe', document.querySelector('.ntab'));
}
function switchNoticeTab(tab, btn){
  document.querySelectorAll('.ntab').forEach(b=>b.classList.remove('on'));
  if(btn) btn.classList.add('on');
  document.getElementById('noticeBody').innerHTML = NOTICE_DOC[tab] || '';
}
