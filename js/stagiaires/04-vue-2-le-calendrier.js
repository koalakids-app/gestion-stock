
// ── Vue 2 : le calendrier ─────────────────────────────────────────────────

function stgCalMois(delta){
  if(!stgCalRef){const n=new Date();stgCalRef=new Date(n.getFullYear(),n.getMonth(),1);}
  if(delta===0){const n=new Date();stgCalRef=new Date(n.getFullYear(),n.getMonth(),1);}
  else stgCalRef=new Date(stgCalRef.getFullYear(),stgCalRef.getMonth()+delta,1);
  stgRenderCal();
}

function stgRenderCal(){
  const box=document.getElementById('stg-cal');
  if(!box)return;
  if(!stgCalRef){const n=new Date();stgCalRef=new Date(n.getFullYear(),n.getMonth(),1);}

  const an=stgCalRef.getFullYear(),mois=stgCalRef.getMonth();
  const nb=new Date(an,mois+1,0).getDate();
  const titre=document.getElementById('stg-cal-titre');
  if(titre)titre.textContent=stgCalRef.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});

  const premier=ipDateToLocalISO(new Date(an,mois,1));
  const dernier=ipDateToLocalISO(new Date(an,mois,nb));
  const creche=(document.getElementById('stg-f-creche-cal')||{}).value||'';

  /* On affiche une stagiaire si son stage touche le mois, OU si elle a un jour
     saisi dedans — une journée isolée hors période reste visible. */
  const lignes=stgCache.filter(s=>{
    if(creche&&String(s.creche_id||'')!==String(creche))return false;
    if(s.statut==='refuse'||s.statut==='annule')return false;
    const chevauche=s.date_debut&&s.date_fin&&s.date_debut<=dernier&&s.date_fin>=premier;
    const aDesJours=stgJoursDe(s.id).some(j=>String(j.jour)>=premier&&String(j.jour)<=dernier);
    return chevauche||aDesJours;
  }).sort((a,b)=>String(stgCrecheName(a.creche_id)+stgNomComplet(a))
    .localeCompare(String(stgCrecheName(b.creche_id)+stgNomComplet(b)),'fr'));

  if(!lignes.length){
    /* Un écran vide ne dit pas POURQUOI il est vide : filtre de crèche, fiche
       pas encore orientée, ou jours saisis sur d'autres mois. Chacune de ces
       trois raisons se répare différemment, alors on les nomme. */
    const vivantes=stgCache.filter(s=>s.statut!=='refuse'&&s.statut!=='annule');
    const pistes=[];
    if(creche){
      const ailleurs=vivantes.filter(s=>s.creche_id&&String(s.creche_id)!==String(creche)).length;
      const orphelines=vivantes.filter(s=>!s.creche_id).length;
      if(ailleurs)pistes.push(ailleurs+' fiche'+(ailleurs>1?'s':'')+' sur une autre crèche — choisissez « Toutes les crèches ».');
      if(orphelines)pistes.push(orphelines+' fiche'+(orphelines>1?'s':'')+' pas encore orientée'+(orphelines>1?'s':'')
        +' vers une crèche : tant qu\'aucune crèche n\'est choisie sur la fiche, un filtre par crèche l\'écarte.');
    }
    const muettes=vivantes.filter(s=>!stgJoursDe(s.id).length&&!(s.date_debut&&s.date_fin)).length;
    if(muettes)pistes.push(muettes+' fiche'+(muettes>1?'s':'')+' sans dates ni jours saisis : une fiche n\'apparaît ici '
      +'qu\'avec des dates de début et de fin, ou des jours de présence.');
    /* Les mois où il se passe quelque chose : le plus utile est souvent
       simplement d'aller voir ailleurs. */
    const tousJours=vivantes.flatMap(s=>stgJoursDe(s.id).map(j=>String(j.jour))).sort();
    if(tousJours.length&&(tousJours[tousJours.length-1]<premier||tousJours[0]>dernier))
      pistes.push('Les jours saisis vont du '+stgDateFr(tousJours[0])+' au '+stgDateFr(tousJours[tousJours.length-1])
        +' : utilisez les flèches pour changer de mois.');
    box.innerHTML='<div style="text-align:center;padding:34px 20px;color:var(--muted);font-size:13px;line-height:1.6">'
      +'Aucun stage ni alternance sur ce mois.'
      +(pistes.length?'<div style="margin-top:10px;font-size:12.5px;color:var(--orange-dark);max-width:620px;margin-left:auto;margin-right:auto">'
        +pistes.map(p=>'<div style="margin-top:5px">'+p+'</div>').join('')+'</div>':'')
      +'</div>';
    return;
  }

  const auj=todayStr();
  let h='<table style="border-collapse:collapse;font-size:11.5px;min-width:'+(200+nb*26)+'px">'
    +'<tr><th style="position:sticky;left:0;background:var(--koala-light);z-index:2;text-align:left;'
    +'padding:6px 9px;border:1px solid var(--border);min-width:190px">Stagiaire / alternant</th>';
  for(let d=1;d<=nb;d++){
    const dt=new Date(an,mois,d);
    const we=dt.getDay()===0||dt.getDay()===6;
    const iso=ipDateToLocalISO(dt);
    h+='<th style="width:26px;padding:4px 0;border:1px solid var(--border);font-weight:600;'
      +'background:'+(iso===auj?'var(--orange-light)':we?'#F4F4F6':'var(--koala-light)')+';'
      +'color:'+(we?'var(--muted)':'var(--koala-dark)')+'">'
      +'<div style="font-size:9.5px;opacity:.8">'+STG_JOURS_FR[dt.getDay()].slice(0,1).toUpperCase()+'</div>'
      +d+'</th>';
  }
  h+='</tr>';

  lignes.forEach(s=>{
    const prof=stgProfil(s);
    const jours={};
    stgJoursDe(s.id).forEach(j=>{jours[String(j.jour)]=j;});
    h+='<tr>'
      +'<td onclick="stgOpenFiche(\''+s.id+'\')" style="position:sticky;left:0;background:#fff;z-index:1;'
      +'cursor:pointer;padding:5px 9px;border:1px solid var(--border);white-space:nowrap;'
      +'overflow:hidden;text-overflow:ellipsis;max-width:230px">'
      +'<i class="ti '+prof.ic+'" style="color:'+prof.couleur+'" title="'+prof.lib+'"></i> '
      +'<span style="font-weight:600">'+escHtml(stgNomComplet(s))+'</span>'
      +'<span style="color:var(--muted)"> · '+escHtml(stgCrecheName(s.creche_id)||'—')+'</span></td>';
    for(let d=1;d<=nb;d++){
      const iso=ipDateToLocalISO(new Date(an,mois,d));
      const j=jours[iso];
      const dansPeriode=s.date_debut&&s.date_fin&&iso>=s.date_debut&&iso<=s.date_fin;
      let fond='#fff',txt='',titre2='';
      if(j&&j.absent){fond='var(--red-light)';txt='<span style="color:var(--red);font-weight:700">×</span>';
        titre2=(j.motif||'absente');}
      else if(j){fond=prof.couleur;titre2=[j.debut,j.fin].filter(Boolean).join(' – ');}
      else if(dansPeriode){fond='var(--koala-light)';titre2='période prévue, jour non saisi';}
      h+='<td onclick="stgCalClic(\''+s.id+'\',\''+iso+'\')" title="'+escHtml(titre2)+'" '
        +'style="cursor:pointer;border:1px solid var(--border);background:'+fond+';height:26px;text-align:center">'
        +txt+'</td>';
    }
    h+='</tr>';
  });
  h+='</table>';
  box.innerHTML=h;
}

/* Cliquer une case du calendrier ouvre le jour dans la fiche : c'est le même
   écran que depuis la fiche, donc une seule façon de saisir un horaire. */
function stgCalClic(id,iso){
  stgFicheId=id;
  stgJourCourant={stagiaire_id:id,jour:iso};
  const j=stgJoursDe(id).find(x=>String(x.jour)===String(iso));
  stgJourCourant.nouveau=!j;
  stgOuvrirModalJour(j,iso);
}

// ── Vue : les disponibilités par crèche ───────────────────────────────────

/* La fiche occupe-t-elle une place ce jour-là ? Un jour saisi dit oui, une
   absence dit non. Sans aucun jour saisi, la période prévue occupe les jours
   ouvrés ; dès qu'un planning précis existe, ce qui n'y figure pas est libre. */
function stgOccupe(s,iso){
  const jours=stgJoursDe(s.id);
  const j=jours.find(x=>String(x.jour)===iso);
  if(j)return !j.absent;
  if(jours.length)return false;
  if(!(s.date_debut&&s.date_fin&&iso>=s.date_debut&&iso<=s.date_fin))return false;
  const g=new Date(iso+'T12:00:00').getDay();
  return g!==0&&g!==6;
}

function stgRenderDispo(){
  const box=document.getElementById('stg-dispo');
  if(!box)return;
  const el=id=>document.getElementById(id);
  const debut=el('stg-d-debut').value;
  if(!debut){
    box.innerHTML='<div style="text-align:center;padding:34px 20px;color:var(--muted);font-size:13px">'
      +'Choisissez une date (ou une période) pour voir quelles crèches ont encore de la place.</div>';
    return;
  }
  let fin=el('stg-d-fin').value||debut;
  if(fin<debut)fin=debut;
  const type=el('stg-d-type').value;

  /* Les jours ouvrés de la période demandée (plafonnée à un an). */
  const jours=[];
  for(let d=new Date(debut+'T12:00:00');ipDateToLocalISO(d)<=fin&&jours.length<370;d.setDate(d.getDate()+1)){
    if(d.getDay()!==0&&d.getDay()!==6)jours.push(ipDateToLocalISO(d));
  }
  if(!jours.length){
    box.innerHTML='<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Cette période ne contient que des week-ends.</div>';
    return;
  }

  const ferme=['accepte','en_cours','termine'];
  const base=stgCache.filter(s=>s.creche_id&&(!type||stgType(s)===type));
  const cartes=stgCrechesVisibles().map(c=>{
    const siennes=base.filter(s=>String(s.creche_id)===String(c.id));
    const fermes=siennes.filter(s=>ferme.includes(s.statut));
    const attente=siennes.filter(s=>s.statut==='demande'||s.statut==='contact')
      .filter(s=>jours.some(iso=>stgOccupe(s,iso)));
    /* Capacité et chevauchement viennent des paramètres de la crèche. Un
       chevauchement de N semaines autorise UN stagiaire de plus que la
       capacité, pendant N×5 jours ouvrés au plus (passation). */
    const cap=Math.max(1,Number(c.stagiaires_capacite)||1);
    const tol=Math.max(0,Number(c.stagiaires_chevauchement_semaines)||0)*5;
    let pic=0,pleins=0;const presents=new Map();
    jours.forEach(iso=>{
      const la=fermes.filter(s=>stgOccupe(s,iso));
      la.forEach(s=>{(presents.get(s.id)||presents.set(s.id,[]).get(s.id)).push(iso);});
      pic=Math.max(pic,la.length);
      if(la.length>=cap)pleins++;
    });
    let etat='complet';
    if(pic<cap)etat='libre';
    else if(pic===cap&&tol>0&&pleins<=tol)etat='chevauche';
    return {c,cap,pic,pleins,presents,attente,etat,reste:cap-pic};
  }).sort((a,b)=>{
    const o={libre:0,chevauche:1,complet:2};
    return o[a.etat]-o[b.etat]||b.reste-a.reste||String(a.c.name).localeCompare(String(b.c.name),'fr');
  });

  const libres=cartes.filter(x=>x.etat!=='complet').length;
  const quand=stgDateFr(debut)+(fin!==debut?' → '+stgDateFr(fin):'');
  let h='<div style="font-size:13px;margin-bottom:10px"><b>'+libres+' crèche'+(libres>1?'s':'')+' avec de la place</b> sur '
    +escHtml(quand)+' <span style="color:var(--muted)">('+jours.length+' jour'+(jours.length>1?'s':'')+' ouvré'+(jours.length>1?'s':'')+')</span></div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px">';
  cartes.forEach(x=>{
    const coul=x.etat==='libre'?'var(--green)':x.etat==='chevauche'?'var(--orange-dark)':'var(--red)';
    h+='<div style="border:1px solid var(--border);border-left:4px solid '+coul+';border-radius:10px;padding:10px 12px;background:#fff">'
      +'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'
      +'<b>'+escHtml(x.c.name)+'</b>'
      +'<span style="font-size:11px;font-weight:700;color:'+coul+'">'
      +(x.etat==='libre'?(x.pic?x.reste+' place'+(x.reste>1?'s':'')+' libre'+(x.reste>1?'s':''):'Libre')
      :x.etat==='chevauche'?'Possible en chevauchement ('+x.pleins+' j)':'Complet')+'</span></div>'
      +'<div style="font-size:11px;color:var(--muted)">Capacité : '+x.cap+(x.c.stagiaires_chevauchement_semaines?' · chevauchement toléré '+x.c.stagiaires_chevauchement_semaines+' sem.':'')+'</div>';
    if(x.presents.size){
      h+='<div style="margin-top:6px;font-size:12px">';
      x.presents.forEach((isos,id)=>{
        const s=stgCache.find(y=>String(y.id)===String(id));
        const p=stgProfil(s);
        h+='<div onclick="stgOpenFiche(\''+id+'\')" style="cursor:pointer;margin-top:2px">'
          +'<i class="ti '+p.ic+'" style="color:'+p.couleur+'"></i> '+escHtml(stgNomComplet(s))
          +' <span style="color:var(--muted)">· '+isos.length+' j'
          +(s.date_debut?' ('+escHtml(stgDateFr(s.date_debut))+(s.date_fin?' → '+escHtml(stgDateFr(s.date_fin)):'')+')':'')+'</span></div>';
      });
      h+='</div>';
    }
    if(x.attente.length){
      h+='<div style="margin-top:6px;font-size:11.5px;color:var(--orange-dark)"><i class="ti ti-clock"></i> En attente (non comptée'
        +(x.attente.length>1?'s':'')+') : '+x.attente.map(s=>escHtml(stgNomComplet(s))).join(', ')+'</div>';
    }
    h+='</div>';
  });
  box.innerHTML=h+'</div>';
}

// ── Vue 3 : les pièces demandées ──────────────────────────────────────────

function stgRenderTypes(){
  const box=document.getElementById('stg-types-list');
  if(!box)return;
  if(!stgTypes.length){
    box.innerHTML='<div style="color:var(--muted);font-size:13px">Aucune pièce définie.</div>';
    return;
  }
  const POUR={tous:{lib:'Stagiaires et alternants',c:'var(--muted)'},
              stagiaire:{lib:'Stagiaires',c:'var(--koala)'},
              alternant:{lib:'Alternants',c:'var(--orange-dark)'}};
  box.innerHTML=stgTypes.map(t=>{
   const pr=POUR[t.pour_type]||POUR.tous;
   return '<div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1.5px solid var(--border);'
    +'border-radius:9px;padding:9px 12px;'+(t.actif?'':'opacity:.55')+'">'
    +'<i class="ti ti-'+(t.obligatoire?'asterisk':'circle-dashed')+'" style="color:'+(t.obligatoire?'var(--koala)':'var(--muted)')+'"></i>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-weight:600;font-size:13px">'+escHtml(t.libelle)
    +' <span style="background:'+pr.c+';color:#fff;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700;white-space:nowrap">'+pr.lib+'</span>'
    +(t.obligatoire?'':'<span style="color:var(--muted);font-weight:400"> — facultatif</span>')
    +(t.actif?'':'<span style="color:var(--red);font-weight:400"> — désactivée</span>')+'</div>'
    +(t.aide?'<div style="font-size:11.5px;color:var(--muted)">'+escHtml(t.aide)+'</div>':'')
    +(t.lien?'<a href="'+escHtml(t.lien)+'" target="_blank" rel="noopener" style="font-size:11.5px">'
      +'<i class="ti ti-external-link"></i> '+escHtml(t.lien)+'</a>':'')
    +'</div>'
    +'<button class="ibtn" title="Monter" onclick="stgDeplacerType(\''+t.id+'\',-1)"><i class="ti ti-chevron-up"></i></button>'
    +'<button class="ibtn" title="Descendre" onclick="stgDeplacerType(\''+t.id+'\',1)"><i class="ti ti-chevron-down"></i></button>'
    +'<button class="ibtn" title="Obligatoire / facultatif" onclick="stgBasculerType(\''+t.id+'\',\'obligatoire\')"><i class="ti ti-asterisk"></i></button>'
    +'<button class="ibtn" title="Demandée à : tous, stagiaires, alternants" onclick="stgCyclerPour(\''+t.id+'\')"><i class="ti ti-users-group"></i></button>'
    +'<button class="ibtn" title="'+(t.actif?'Désactiver':'Réactiver')+'" onclick="stgBasculerType(\''+t.id+'\',\'actif\')">'
    +'<i class="ti ti-'+(t.actif?'eye-off':'eye')+'"></i></button>'
    +'</div>';}).join('');
}

/* Trois valeurs seulement : le bouton tourne plutôt que d'ouvrir un menu pour
   un choix à trois branches. */
async function stgCyclerPour(id){
  const t=stgTypes.find(x=>String(x.id)===String(id));
  if(!t)return;
  const suite={tous:'stagiaire',stagiaire:'alternant',alternant:'tous'};
  const val=suite[t.pour_type||'tous']||'stagiaire';
  const ok=await dbUpdate('stagiaires_docs_types',id,{pour_type:val});
  if(!ok)return showBanner('Modification impossible'
    +(window._lastDbError?' : '+window._lastDbError:' (réservée à la direction, ou script 31 non exécuté)')+'.','error');
  t.pour_type=val;
  stgRenderTypes();stgRender();
}

async function stgAjouterType(){
  const lib=(document.getElementById('stg-t-libelle')||{}).value.trim();
  if(!lib)return showBanner('Indiquez le nom de la pièce.','error');
  const base={
    libelle:lib,
    aide:(document.getElementById('stg-t-aide')||{}).value.trim()||null,
    lien:(document.getElementById('stg-t-lien')||{}).value.trim()||null,
    obligatoire:(document.getElementById('stg-t-oblig')||{}).checked,
    pour_type:(document.getElementById('stg-t-pour')||{}).value||'tous',
    ordre:stgTypes.reduce((m,t)=>Math.max(m,t.ordre||0),0)+10,
    actif:true
  };
  let saved=await dbInsert('stagiaires_docs_types',base);
  /* Colonne absente = script 31 non exécuté : on ajoute quand même la pièce,
     elle vaudra pour tout le monde. */
  if(!saved&&/pour_type/i.test(window._lastDbError||'')){
    delete base.pour_type;
    saved=await dbInsert('stagiaires_docs_types',base);
    if(saved)showBanner('Pièce ajoutée, mais demandée à tout le monde : le script 31 n\'a pas encore été exécuté sur Supabase.','error');
  }
  if(!saved)return showBanner('Ajout impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  ['stg-t-libelle','stg-t-aide','stg-t-lien'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  stgTypes.push(saved);
  stgTypes.sort((a,b)=>(a.ordre||0)-(b.ordre||0));
  stgRenderTypes();stgRender();
  showBanner('Pièce ajoutée ✅');
}

async function stgBasculerType(id,champ){
  const t=stgTypes.find(x=>String(x.id)===String(id));
  if(!t)return;
  const ok=await dbUpdate('stagiaires_docs_types',id,{[champ]:!t[champ]});
  if(!ok)return showBanner('Modification impossible (réservée à la direction).','error');
  t[champ]=!t[champ];
  stgRenderTypes();stgRender();
}

/* L'ordre est celui de la liste que voit la stagiaire : on échange les valeurs
   de `ordre` avec la voisine plutôt que de renuméroter toute la table. */
async function stgDeplacerType(id,sens){
  const i=stgTypes.findIndex(x=>String(x.id)===String(id));
  const j=i+sens;
  if(i<0||j<0||j>=stgTypes.length)return;
  const a=stgTypes[i],b=stgTypes[j];
  const oa=a.ordre||0,ob=b.ordre||0;
  const ok1=await dbUpdate('stagiaires_docs_types',a.id,{ordre:ob});
  const ok2=await dbUpdate('stagiaires_docs_types',b.id,{ordre:oa});
  if(!ok1||!ok2)return showBanner('Déplacement impossible (réservé à la direction).','error');
  a.ordre=ob;b.ordre=oa;
  stgTypes.sort((x,y)=>(x.ordre||0)-(y.ordre||0));
  stgRenderTypes();
}


// ── Vue 4 : les documents à transmettre (direction) ───────────────────────

/* Le pendant exact des pièces demandées, dans l'autre sens. Deux natures
   seulement :
     'fichier' — déposé dans le bucket PRIVÉ, sous le préfixe `_ressources/`.
                 La personne n'en reçoit jamais l'emplacement : la page lui
                 demande une URL signée de 5 minutes au moment du clic. Un PDF
                 envoyé en pièce jointe d'un mail, lui, circule ensuite sans
                 nous et reste à jamais la version de ce jour-là.
     'lien'    — une adresse externe (questionnaire), publique par nature.

   Un préfixe qui commence par un souligné ne peut pas entrer en collision avec
   un dossier de stagiaire, dont le nom est toujours un uuid. */

const STG_RESS_PREFIXE = '_ressources/';

const stgRessNature = r => (r&&r.nature==='lien')?'lien':'fichier';

/* Qui peut modifier quoi (script 36c) : la direction, tout ; une directrice technique,
   uniquement ce qui est rattaché à sa crèche. Une ressource « toutes les
   crèches » engage le réseau et lui reste fermée. Le même calcul est refait en
   base — ici, c'est pour ne pas proposer un bouton qui échouera. */
function stgRessModifiable(r){
  if(isDirection)return true;
  if(!r||!r.creche_id)return false;
  const mien=currentProfile&&currentProfile.creche_id;
  return String(r.creche_id)===String(mien||'');
}

/* Les ressources destinées à CETTE fiche : actives, prévues pour son profil,
   et valables soit pour tout le réseau, soit pour sa crèche. Le même filtre
   est refait côté edge function — ici c'est de l'affichage, là-bas c'est la
   règle. */
function stgRessPour(s,typeForce){
  const type=typeForce||stgType(s);
  return stgRess.filter(r=>r.actif
    && (!r.pour_type||r.pour_type==='tous'||r.pour_type===type)
    && (!r.creche_id||String(r.creche_id)===String(s.creche_id||'')));
}

function stgRessVue(stagiaireId,ressourceId){
  return stgRessVues.find(v=>String(v.stagiaire_id)===String(stagiaireId)
                          && String(v.ressource_id)===String(ressourceId));
}

/* ── Dans la fiche : qui a lu quoi ──────────────────────────────────────── */

function stgRenderRessFicheBase(typeForce){
  const zone=document.getElementById('stg-ressources-zone');
  if(!zone||!stgFicheId)return;
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(!s){zone.innerHTML='';return;}
  const liste=stgRessPour(s,typeForce);

  let h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">'
    +'<div style="font-weight:700;font-size:13px"><i class="ti ti-send" style="color:var(--orange-dark)"></i> '
    +'Ce qu\'elle reçoit sur son lien</div>';
  const aConfirmer=liste.filter(r=>r.accuse);
  const confirmes=aConfirmer.filter(r=>{const v=stgRessVue(s.id,r.id);return v&&v.accuse_le;}).length;
  if(aConfirmer.length){
    h+='<span style="font-size:12px;font-weight:600;color:'
      +(confirmes===aConfirmer.length?'var(--green)':'var(--muted)')+'">'
      +confirmes+' / '+aConfirmer.length+' confirmé'+(aConfirmer.length>1?'s':'')+'</span>';
  }
  h+='</div>';

  if(!stgRessOk){
    h+='<p style="font-size:12.5px;color:var(--muted);margin:0">Le script <code>36a</code> n\'a pas '
      +'encore été exécuté sur Supabase : rien n\'est transmis pour le moment.</p>';
    zone.innerHTML=h;return;
  }
  if(!liste.length){
    h+='<p style="font-size:12.5px;color:var(--muted);margin:0">Rien à transmettre pour ce profil '
      +'— le projet pédagogique et le questionnaire se règlent dans l\'onglet '
      +'« Documents à transmettre ».</p>';
    zone.innerHTML=h;return;
  }

  h+=liste.map(r=>{
    const v=stgRessVue(s.id,r.id);
    const lien=stgRessNature(r)==='lien';
    const fait=r.accuse?!!(v&&v.accuse_le):!!(v&&v.ouvert_le);
    let etat;
    if(v&&v.accuse_le)      etat='<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">Confirmé le '+escHtml(stgDateFr(v.accuse_le))+'</span>';
    else if(v&&v.ouvert_le) etat='<span style="background:var(--orange-light);color:var(--orange-dark);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">'+(lien?'Ouvert':'Consulté')+' le '+escHtml(stgDateFr(v.ouvert_le))+'</span>';
    else                    etat='<span style="background:#EFEEF6;color:var(--muted);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">Pas encore ouvert</span>';
    return '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:9px;'
      +'padding:9px 11px;margin-bottom:7px;flex-wrap:wrap;background:'+(fait?'#FCFEFC':'#fff')+'">'
      +'<i class="ti ti-'+(lien?'clipboard-list':'file-text')+'" style="color:'+(fait?'var(--green)':'var(--muted)')+'"></i>'
      +'<span style="font-weight:600;font-size:12.5px;flex:1;min-width:120px">'+escHtml(r.libelle)
      +(r.accuse?'':'<span style="color:var(--muted);font-weight:400"> (sans confirmation)</span>')+'</span>'
      +etat
      +'<button class="ibtn" style="width:26px;height:26px;font-size:13px" title="Ouvrir" '
      +'onclick="stgOuvrirRess(\''+r.id+'\')"><i class="ti ti-external-link"></i></button>'
      +'</div>';
  }).join('');

  h+='<p style="font-size:11.5px;color:var(--muted);margin:2px 0 0">Ces documents s\'affichent en haut '
    +'de son lien de dépôt. La confirmation est déclarative : elle dit que la personne a coché la case, '
    +'pas qu\'elle a tout lu.</p>';
  zone.innerHTML=h;
}

/* Dans la fiche : les documents préparés dans documents.html (livret d'accueil)
   et mis à signer sur le lien, avec l'état de la signature. */
async function stgRenderRessFiche(typeForce){
  stgRenderRessFicheBase(typeForce);
  const zone=document.getElementById('stg-ressources-zone');
  const id=stgFicheId;
  if(!zone||!id)return;
  const{data}=await sb.from('documents_reponses').select('id,document_id,statut,donnees,updated_at')
    .filter('donnees->>lv_stagiaire_id','eq',String(id)).filter('donnees->>lv_envoye','eq','true');
  if(!data||!data.length||String(stgFicheId)!==String(id)||!document.body.contains(zone))return;
  /* La fiche est redessinée plusieurs fois à l'ouverture et ce bloc arrive en
     différé : on remplace l'éventuel bloc déjà posé au lieu d'en ajouter un. */
  const ancien=document.getElementById('stg-livrets-bloc');
  if(ancien)ancien.remove();
  zone.insertAdjacentHTML('beforeend','<div id="stg-livrets-bloc"><div style="margin-top:14px;font-weight:700;font-size:13px">'
    +'<i class="ti ti-signature" style="color:var(--orange-dark)"></i> Documents envoyés à signer</div>'
    +data.map(r=>{
      const d=r.donnees||{},signe=r.statut==='signe';
      const b=signe
        ?'<span style="background:var(--green-light);color:var(--green);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">Signé le '
          +escHtml(stgDateFr((d._signature&&d._signature.signe_le)||r.updated_at))+'</span>'
        :'<span style="background:var(--orange-light);color:var(--orange-dark);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">En attente de signature</span>';
      return '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:9px;padding:9px 11px;margin-top:7px;flex-wrap:wrap">'
        +'<i class="ti ti-file-text" style="color:'+(signe?'var(--green)':'var(--muted)')+'"></i>'
        +'<span style="font-weight:600;font-size:12.5px;flex:1;min-width:120px">Livret d\'accueil — Koalakids '+escHtml(d.lv_creche||'')+'</span>'+b
        +'<a class="ibtn" style="width:26px;height:26px;font-size:13px;display:inline-grid;place-items:center" title="Ouvrir dans Documents" '
        +'href="documents.html?doc='+encodeURIComponent(r.document_id)+'&rep='+encodeURIComponent(r.id)+'"><i class="ti ti-external-link"></i></a></div>';
    }).join('')+'</div>');
}

/* ── L'écran de réglage ─────────────────────────────────────────────────── */

function stgRessNatureChange(){
  const lien=(document.getElementById('stg-r-nature')||{}).value==='lien';
  const f=document.getElementById('stg-r-fichier-wrap');
  const u=document.getElementById('stg-r-url-wrap');
  if(f)f.style.display=lien?'none':'';
  if(u)u.style.display=lien?'':'none';
  /* Un document n'a pas d'adresse : rien à lui transmettre. */
  const id=document.getElementById('stg-r-identite');
  if(id){id.disabled=!lien;if(!lien)id.checked=false;
         if(id.parentElement)id.parentElement.style.opacity=lien?'':'.5';}
}

function stgRenderRess(){
  const box=document.getElementById('stg-ress-list');
  if(!box)return;
  if(!stgRessOk){
    box.innerHTML='<div style="color:var(--red);font-size:13px">Les scripts <code>36a</code> et '
      +'<code>36b</code> n\'ont pas encore été exécutés sur Supabase.</div>';
    return;
  }
  if(!stgRess.length){
    box.innerHTML='<div style="color:var(--muted);font-size:13px">Rien à transmettre pour le moment.</div>';
    return;
  }
  const POUR={tous:{lib:'Stagiaires et alternants',c:'var(--muted)'},
              stagiaire:{lib:'Stagiaires',c:'var(--koala)'},
              alternant:{lib:'Alternants',c:'var(--orange-dark)'}};
  box.innerHTML=stgRess.map(r=>{
    const pr=POUR[r.pour_type]||POUR.tous;
    const lien=stgRessNature(r)==='lien';
    const vide=lien?!r.url:!r.path;
    const vues=stgRessVues.filter(v=>String(v.ressource_id)===String(r.id));
    const lus=vues.filter(v=>v.ouvert_le).length;
    const confirmes=vues.filter(v=>v.accuse_le).length;
    return '<div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1.5px solid var(--border);'
      +'border-radius:9px;padding:9px 12px;flex-wrap:wrap;'+(r.actif?'':'opacity:.55')+'">'
      +'<i class="ti ti-'+(lien?'clipboard-list':'file-text')+'" style="color:'+(lien?'var(--orange-dark)':'var(--koala)')+'"></i>'
      +'<div style="flex:1;min-width:180px">'
      +'<div style="font-weight:600;font-size:13px">'+escHtml(r.libelle)
      +' <span style="background:'+pr.c+';color:#fff;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700;white-space:nowrap">'+pr.lib+'</span>'
      +(r.creche_id?' <span style="background:var(--koala-light);color:var(--koala-dark);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">'+escHtml(stgCrecheName(r.creche_id))+'</span>':'')
      +(r.accuse?'':'<span style="color:var(--muted);font-weight:400"> — sans confirmation</span>')
      +(r.transmet_identite?' <span style="background:var(--koala);color:#fff;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:700">identité transmise</span>':'')
      +(r.actif?'':'<span style="color:var(--red);font-weight:400"> — désactivé</span>')
      +(vide?'<span style="color:var(--red);font-weight:400"> — '+(lien?'adresse manquante':'fichier manquant')+'</span>':'')
      +'</div>'
      +(r.description?'<div style="font-size:11.5px;color:var(--muted)">'+escHtml(r.description)+'</div>':'')
      +(lien&&r.url?'<a href="'+escHtml(r.url)+'" target="_blank" rel="noopener" style="font-size:11.5px">'
        +'<i class="ti ti-external-link"></i> '+escHtml(r.url)+'</a>'
        :(!lien&&r.filename?'<div style="font-size:11.5px;color:var(--muted)"><i class="ti ti-paperclip"></i> '+escHtml(r.filename)+'</div>':''))
      +'<div style="font-size:11px;color:var(--muted);margin-top:2px">'
      +lus+' ouverture'+(lus>1?'s':'')+(r.accuse?' · '+confirmes+' confirmation'+(confirmes>1?'s':''):'')+'</div>'
      +'</div>'
      +(vide?'':'<button class="ibtn" title="Ouvrir" onclick="stgOuvrirRess(\''+r.id+'\')"><i class="ti ti-eye"></i></button>')
      +(stgRessModifiable(r)
        ? '<button class="ibtn" title="Monter" onclick="stgDeplacerRess(\''+r.id+'\',-1)"><i class="ti ti-chevron-up"></i></button>'
          +'<button class="ibtn" title="Descendre" onclick="stgDeplacerRess(\''+r.id+'\',1)"><i class="ti ti-chevron-down"></i></button>'
          +'<button class="ibtn" title="'+(lien?'Remplacer l\'adresse':'Remplacer le fichier')+'" onclick="stgRemplacerRess(\''+r.id+'\')"><i class="ti ti-refresh"></i></button>'
          +'<button class="ibtn" title="Demander ou non une confirmation" onclick="stgBasculerRess(\''+r.id+'\',\'accuse\')"><i class="ti ti-checkbox"></i></button>'
          +(lien?'<button class="ibtn" title="Transmettre ou non l\'identité au lien" onclick="stgBasculerRess(\''+r.id+'\',\'transmet_identite\')"><i class="ti ti-user-check"></i></button>':'')
          +'<button class="ibtn" title="'+(r.actif?'Désactiver':'Réactiver')+'" onclick="stgBasculerRess(\''+r.id+'\',\'actif\')">'
          +'<i class="ti ti-'+(r.actif?'eye-off':'eye')+'"></i></button>'
          +'<button class="ibtn" style="color:var(--red)" title="Supprimer" onclick="stgSupprimerRess(\''+r.id+'\')"><i class="ti ti-trash"></i></button>'
        /* Ni bouton grisé ni message d'erreur au clic : on dit simplement d'où
           vient la ligne. */
        : '<span style="font-size:11px;color:var(--muted);white-space:nowrap">'
          +'<i class="ti ti-lock"></i> '+(r.creche_id?'autre crèche':'réseau')+'</span>')
      +'</div>';
  }).join('');
}

/* Le fichier part dans le bucket privé avant l'écriture de la ligne : sans
   chemin, la ligne ne servirait à rien. L'inverse — une ligne perdue et un
   fichier orphelin — est rattrapé en supprimant le fichier. */
async function stgRessUpload(file){
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'bin';
  const path=STG_RESS_PREFIXE+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
  const {error}=await sb.storage.from(STG_BUCKET).upload(path,file,
    {contentType:file.type||'application/octet-stream',upsert:false});
  if(error)throw new Error(error.message||'Envoi impossible');
  return {bucket:STG_BUCKET,path,filename:file.name.slice(0,180),
          mime:file.type||null,taille:file.size};
}

async function stgAjouterRess(){
  const lib=((document.getElementById('stg-r-libelle')||{}).value||'').trim();
  const st=document.getElementById('stg-r-status');
  const dire=m=>{if(st)st.textContent=m||'';};
  if(!lib)return showBanner('Indiquez un titre.','error');

  const nature=(document.getElementById('stg-r-nature')||{}).value==='lien'?'lien':'fichier';
  const creche=(document.getElementById('stg-r-creche')||{}).value
              ||(isDirection?'':((currentProfile&&currentProfile.creche_id)||''));
  /* La policy le refuserait de toute façon (36c) ; autant le dire ici, avec la
     raison plutôt qu'un code d'erreur. */
  if(!isDirection&&!creche)
    return showBanner('Un document valable pour toutes les crèches est ajouté par la direction. '
      +'Le vôtre sera rattaché à votre crèche.','error');
  const base={
    libelle:lib,
    description:((document.getElementById('stg-r-desc')||{}).value||'').trim()||null,
    nature:nature,
    pour_type:(document.getElementById('stg-r-pour')||{}).value||'tous',
    creche_id:creche||null,
    accuse:(document.getElementById('stg-r-accuse')||{}).checked,
    /* Réservé à nos propres outils : un formulaire hébergé ailleurs recevrait
       sinon le nom d'une stagiaire dans son adresse. Ignoré pour un fichier. */
    transmet_identite:nature==='lien'&&(document.getElementById('stg-r-identite')||{}).checked,
    ordre:stgRess.reduce((m,r)=>Math.max(m,r.ordre||0),0)+10,
    actif:true
  };

  let depose=null;
  if(nature==='lien'){
    const url=((document.getElementById('stg-r-url')||{}).value||'').trim();
    if(!/^https?:\/\//i.test(url))
      return showBanner('L\'adresse doit commencer par http:// ou https://.','error');
    base.url=url;
  }else{
    const file=((document.getElementById('stg-r-fichier')||{}).files||[])[0];
    if(!file)return showBanner('Choisissez le fichier à transmettre.','error');
    if(file.size>12*1024*1024)return showBanner('Fichier trop lourd (12 Mo maximum).','error');
    dire('⏳ Envoi de '+file.name+'…');
    try{depose=await stgRessUpload(file);}
    catch(e){dire('');return showBanner('Envoi du fichier impossible : '+e.message,'error');}
    Object.assign(base,depose);
  }

  let saved=await dbInsert('stagiaires_ressources',base);
  /* Colonne absente = script 36d non exécuté : on ajoute quand même, sans la
     transmission d'identité. */
  if(!saved&&/transmet_identite/i.test(window._lastDbError||'')){
    delete base.transmet_identite;
    saved=await dbInsert('stagiaires_ressources',base);
    if(saved)showBanner('Ajouté, mais sans transmettre l\'identité : le script 36d n\'a pas encore été exécuté sur Supabase.','error');
  }
  if(!saved){
    /* La ligne n'existe pas : le fichier serait invisible et impossible à
       retrouver. On le retire. */
    if(depose)await sb.storage.from(STG_BUCKET).remove([depose.path]);
    dire('');
    return showBanner('Ajout impossible'
      +(window._lastDbError?' : '+window._lastDbError
        :(isDirection?'.':' — un/une directeur/trice technique ne peut ajouter que pour sa crèche (script 36c).'))+'','error');
  }
  dire('');
  ['stg-r-libelle','stg-r-desc','stg-r-url'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const f=document.getElementById('stg-r-fichier');if(f)f.value='';
  stgRess.push(saved);
  stgRess.sort((a,b)=>(a.ordre||0)-(b.ordre||0));
  stgRenderRess();
  showBanner('Ajouté — visible sur les liens de dépôt ✅');
}

/* Remplacer, plutôt que supprimer puis recréer : la ligne garde son suivi de
   lecture, et l'ordre d'affichage ne bouge pas. */
async function stgRemplacerRess(id){
  const r=stgRess.find(x=>String(x.id)===String(id));
  if(!r)return;
  if(stgRessNature(r)==='lien'){
    const url=prompt('Nouvelle adresse du lien :',r.url||'https://');
    if(url===null)return;
    if(!/^https?:\/\//i.test(url.trim()))return showBanner('L\'adresse doit commencer par http:// ou https://.','error');
    const ok=await dbUpdate('stagiaires_ressources',id,{url:url.trim()});
    if(!ok)return showBanner('Modification impossible (réservée à la direction).','error');
    r.url=url.trim();
    stgRenderRess();
    return showBanner('Adresse mise à jour ✅');
  }
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/*,application/pdf';
  inp.onchange=async()=>{
    const file=(inp.files||[])[0];
    if(!file)return;
    if(file.size>12*1024*1024)return showBanner('Fichier trop lourd (12 Mo maximum).','error');
    let depose=null;
    try{depose=await stgRessUpload(file);}
    catch(e){return showBanner('Envoi impossible : '+e.message,'error');}
    const ancien=r.path;
    const ok=await dbUpdate('stagiaires_ressources',id,depose);
    if(!ok){
      await sb.storage.from(STG_BUCKET).remove([depose.path]);
      return showBanner('Modification impossible (réservée à la direction).','error');
    }
    Object.assign(r,depose);
    /* L'ancien fichier ne sert plus à rien : plus aucune ligne ne le désigne. */
    if(ancien)await sb.storage.from(STG_BUCKET).remove([ancien]);
    stgRenderRess();
    showBanner('Document remplacé — la nouvelle version est en ligne ✅');
  };
  inp.click();
}

async function stgBasculerRess(id,champ){
  const r=stgRess.find(x=>String(x.id)===String(id));
  if(!r)return;
  const ok=await dbUpdate('stagiaires_ressources',id,{[champ]:!r[champ]});
  if(!ok)return showBanner('Modification impossible (réservée à la direction).','error');
  r[champ]=!r[champ];
  stgRenderRess();
  stgRenderRessFiche();
}

async function stgDeplacerRess(id,sens){
  const i=stgRess.findIndex(x=>String(x.id)===String(id));
  const j=i+sens;
  if(i<0||j<0||j>=stgRess.length)return;
  const a=stgRess[i],b=stgRess[j];
  const oa=a.ordre||0,ob=b.ordre||0;
  const ok1=await dbUpdate('stagiaires_ressources',a.id,{ordre:ob});
  const ok2=await dbUpdate('stagiaires_ressources',b.id,{ordre:oa});
  if(!ok1||!ok2)return showBanner('Déplacement impossible (réservé à la direction).','error');
  a.ordre=ob;b.ordre=oa;
  stgRess.sort((x,y)=>(x.ordre||0)-(y.ordre||0));
  stgRenderRess();
}

async function stgSupprimerRess(id){
  const r=stgRess.find(x=>String(x.id)===String(id));
  if(!r)return;
  const vues=stgRessVues.filter(v=>String(v.ressource_id)===String(r.id)).length;
  if(!confirm('Supprimer « '+r.libelle+' » ?\n\n'
    +(vues?'Le suivi de lecture de '+vues+' personne(s) sera effacé.\n':'')
    +'Pour le retirer des nouveaux dossiers sans rien effacer, désactivez-le plutôt.'))return;
  const ok=await dbDelete('stagiaires_ressources',id);
  if(!ok)return showBanner('Suppression impossible (réservée à la direction).','error');
  if(r.path){
    const {error}=await sb.storage.from(r.bucket||STG_BUCKET).remove([r.path]);
    if(error)console.warn('[Stagiaires] fichier non supprimé',error.message);
  }
  stgRess=stgRess.filter(x=>String(x.id)!==String(id));
  stgRessVues=stgRessVues.filter(v=>String(v.ressource_id)!==String(id));
  stgRenderRess();
  showBanner('Supprimé.');
}

/* Côté application, on ouvre le fichier comme n'importe quelle pièce : URL
   signée de 5 minutes. Ouvrir depuis ici ne compte pas comme une lecture de la
   stagiaire — seul son propre lien écrit dans le suivi. */
async function stgOuvrirRess(id){
  const r=stgRess.find(x=>String(x.id)===String(id));
  if(!r)return;
  if(stgRessNature(r)==='lien'){
    if(!r.url)return showBanner('Aucune adresse enregistrée.','error');
    return window.open(r.url,'_blank','noopener');
  }
  if(!r.path)return showBanner('Aucun fichier enregistré.','error');
  const {data,error}=await sb.storage.from(r.bucket||STG_BUCKET).createSignedUrl(r.path,STG_URL_TTL);
  if(error||!data)return showBanner('Ouverture impossible : '+((error&&error.message)||'erreur inconnue'),'error');
  window.open(data.signedUrl,'_blank','noopener');
}

// ── Export ────────────────────────────────────────────────────────────────

function stgExportExcel(){
  if(!stgCache.length)return showBanner('Rien à exporter.','error');
  const aoa=[['Type','Prénom','Nom','Crèche','Statut','École','Formation','Niveau',
              'Début','Fin','Jours prévus','Absences','Pièces reçues','Pièces attendues',
              'Convention / contrat','E-mail','Téléphone','Bilan rédigé le']];
  stgFiltrees().forEach(s=>{
    const av=stgAvancement(s.id);
    const js=stgJoursDe(s.id);
    aoa.push([
      stgProfil(s).lib,
      s.prenom||'', s.nom||'', stgCrecheName(s.creche_id)||'', stgMeta(s.statut).lib,
      s.ecole||'', s.formation||'', s.niveau||'',
      stgDateFr(s.date_debut), stgDateFr(s.date_fin),
      js.filter(j=>!j.absent).length, js.filter(j=>j.absent).length,
      av.faits, av.total,
      STG_CONV[s.convention_statut]||'',
      s.email||'', s.telephone||'', stgDateFr(s.bilan_le)
    ]);
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:11},{wch:14},{wch:16},{wch:12},{wch:18},{wch:24},{wch:18},{wch:12},
               {wch:11},{wch:11},{wch:12},{wch:10},{wch:13},{wch:15},{wch:12},
               {wch:26},{wch:14},{wch:14}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Stagiaires et alternants');
  XLSX.writeFile(wb,'stagiaires-alternants-'+todayStr()+'.xlsx');
  showBanner('Export Excel généré ✅');
}

// ── Exposition (les onclick du HTML passent par window) ───────────────────

window.stgInit=stgInit;window.stgShowView=stgShowView;window.stgSetFilter=stgSetFilter;
window.stgRender=stgRender;window.stgRenderCal=stgRenderCal;window.stgOpenFiche=stgOpenFiche;
window.stgSave=stgSave;window.stgSupprimer=stgSupprimer;window.stgStatutChange=stgStatutChange;
window.stgCreerLien=stgCreerLien;window.stgCopierLien=stgCopierLien;
window.stgUpload=stgUpload;window.stgOuvrirDoc=stgOuvrirDoc;window.stgStatutDoc=stgStatutDoc;
window.stgSupprimerDoc=stgSupprimerDoc;window.stgGenererJours=stgGenererJours;
window.stgAjouterJour=stgAjouterJour;window.stgOuvrirJour=stgOuvrirJour;
window.stgJourAbsentChange=stgJourAbsentChange;window.stgJourEnregistrer=stgJourEnregistrer;
window.stgJourSupprimer=stgJourSupprimer;window.stgCalMois=stgCalMois;window.stgCalClic=stgCalClic;
window.stgAjouterType=stgAjouterType;window.stgBasculerType=stgBasculerType;
window.stgTypeChange=stgTypeChange;window.stgCyclerPour=stgCyclerPour;
window.stgImportPdf=stgImportPdf;window.stgImportRole=stgImportRole;
window.stgImportApercu=stgImportApercu;window.stgImportValider=stgImportValider;
window.stgOuvrirSemaine=stgOuvrirSemaine;window.stgSemaineBascule=stgSemaineBascule;
window.stgSemaineApercu=stgSemaineApercu;window.stgSemaineAjouter=stgSemaineAjouter;
window.stgDeplacerType=stgDeplacerType;window.stgExportExcel=stgExportExcel;
window.stgAjouterRess=stgAjouterRess;window.stgBasculerRess=stgBasculerRess;
window.stgDeplacerRess=stgDeplacerRess;window.stgSupprimerRess=stgSupprimerRess;
window.stgOuvrirRess=stgOuvrirRess;window.stgRemplacerRess=stgRemplacerRess;
window.stgRessNatureChange=stgRessNatureChange;
window.stgRemplirReferents=stgRemplirReferents;

/* ── Compte collaborateur (alternant·e) ──────────────────────────────────
   Un·e alternant·e est aussi salarié·e : plutôt que ressaisir prénom/nom/
   e-mail/crèche une seconde fois dans employes, on relie la fiche stagiaires
   à sa fiche employes via stagiaires.employe_id (cf.
   sql/stagiaires_lien_employe.sql). Une fois liée, ces informations sont
   gérées depuis employes, source de vérité — la fiche alternant ne fait plus
   que refléter la liaison.
   Ouvrir « Mon espace » (planning, pointages, compteur d'heures) à
   l'alternant·e ne demande alors plus rien de neuf : c'est l'infrastructure
   déjà en place pour les collaborateurs/trices (bouton « Créer le compte de
   connexion », identique à l'onglet Collaborateurs). */
function stgEmployeLie(s){
  return (s&&s.employe_id)?cacheEmployes.find(e=>String(e.id)===String(s.employe_id)):null;
}
function stgRenderCollabZone(){
  const zone=document.getElementById('stg-collab-zone');
  if(!zone)return;
  const s=stgFicheId?stgCache.find(x=>String(x.id)===String(stgFicheId)):null;
  const type=(document.getElementById('stg-f-type')||{}).value==='alternant'?'alternant':'stagiaire';
  if(!s||type!=='alternant'){zone.innerHTML='';return;}
  const emp=stgEmployeLie(s);
  const div='<div style="border-top:1.5px solid var(--border);margin:16px 0 14px"></div>';
  if(!emp){
    zone.innerHTML=div+'<div class="fg"><label class="flabel">Compte collaborateur</label>'
      +'<p style="font-size:0.85em;color:#666;margin:2px 0 8px">Un·e alternant·e est aussi salarié·e : créez sa fiche '
      +'collaborateur pour lui ouvrir Mon espace (planning, pointages, compteur d\'heures) sans ressaisir ses informations.</p>'
      +'<button type="button" class="btn-primary" onclick="stgCreerFicheCollab()"><i class="ti ti-user-plus"></i> Créer la fiche collaborateur</button>'
      +'</div>';
    return;
  }
  const compteBadge=emp.user_id
    ?'<span class="badge" style="background:var(--green-light);color:var(--green)"><i class="ti ti-lock-open"></i> Compte actif</span>'
    :'<span class="badge" style="background:#f0f0f5;color:#888">Pas de compte</span>';
  const btnCompte=emp.user_id?'':'<button type="button" class="btn-primary" onclick="stgCreerCompteCollab()" '
    +(emp.email?'':'disabled title="Renseignez un e-mail sur la fiche collaborateur avant de créer le compte"')
    +'><i class="ti ti-mail-forward"></i> Créer le compte de connexion</button>';
  zone.innerHTML=div+'<div class="fg"><label class="flabel">Compte collaborateur</label>'
    +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;background:#f8f8fb;border-radius:10px">'
    +'<div style="flex:1;min-width:160px"><b>'+escHtml(emp.prenom||'')+' '+escHtml(emp.nom||'')+'</b>'
    +(emp.poste?' — '+escHtml(emp.poste):'')
    +(emp.email?'<br><span style="color:#888;font-size:0.85em">'+escHtml(emp.email)+'</span>':'')
    +'</div>'+compteBadge+btnCompte
    +'<button type="button" class="btn-cancel" onclick="stgDelierCollab()" title="Délier la fiche collaborateur"><i class="ti ti-unlink"></i></button>'
    +'</div>'
    +'<p style="font-size:0.8em;color:#888;margin-top:6px">Prénom, nom, e-mail et crèche sont désormais gérés depuis la '
    +'fiche collaborateur — modifiez-les dans l\'onglet Collaborateurs.</p></div>';
}
async function stgCreerFicheCollab(){
  const s=stgFicheId?stgCache.find(x=>String(x.id)===String(stgFicheId)):null;
  if(!s)return;
  if(!s.creche_id)return showBanner('Orientez d\'abord cette personne vers une crèche avant de créer sa fiche collaborateur.','error');
  const row={prenom:s.prenom,nom:s.nom||null,email:s.email||null,creche_id:s.creche_id};
  const saved=await dbInsert('employes',row);
  if(!saved)return showBanner('Création de la fiche collaborateur impossible'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
  cacheEmployes.push(saved);
  const ok=await dbUpdate('stagiaires',stgFicheId,{employe_id:saved.id});
  if(!ok){
    showBanner('Fiche collaborateur créée, mais le lien avec la fiche alternant a échoué'+(window._lastDbError?' : '+window._lastDbError:'')+'.','error');
    return;
  }
  s.employe_id=saved.id;
  showBanner('Fiche collaborateur créée et liée ✅');
  stgRenderCollabZone();
}
async function stgCreerCompteCollab(){
  const s=stgFicheId?stgCache.find(x=>String(x.id)===String(stgFicheId)):null;
  const emp=stgEmployeLie(s);
  if(!emp||!emp.email)return;
  if(!confirm('Envoyer à '+emp.email+' un e-mail d\'invitation pour créer son compte de connexion ?'))return;
  const redirect=location.href.replace(/demandes\.html.*$/,'collaborateur.html');
  const{ok,data}=await callFn('creer-compte-collaborateur',{employe_id:emp.id,redirect_to:redirect});
  if(!ok)return showBanner('Échec : '+(data.error||'erreur inconnue'),'error');
  showBanner('Invitation envoyée à '+emp.email+'.');
  /* Le vrai user_id n'est posé côté base qu'après acceptation de
     l'invitation — pas de mise à jour optimiste ici, juste un rechargement
     pour refléter l'état réel au prochain passage sur la fiche. */
  await stgLoad();
  stgRenderCollabZone();
}
async function stgDelierCollab(){
  if(!stgFicheId)return;
  if(!confirm('Délier cette fiche alternant de sa fiche collaborateur ?\n\nLa fiche collaborateur elle-même n\'est pas supprimée.'))return;
  const ok=await dbUpdate('stagiaires',stgFicheId,{employe_id:null});
  if(!ok)return showBanner('Échec du déliage.','error');
  const s=stgCache.find(x=>String(x.id)===String(stgFicheId));
  if(s)s.employe_id=null;
  showBanner('Fiche déliée.');
  stgRenderCollabZone();
}
window.stgRenderCollabZone=stgRenderCollabZone;
window.stgCreerFicheCollab=stgCreerFicheCollab;
window.stgCreerCompteCollab=stgCreerCompteCollab;
window.stgDelierCollab=stgDelierCollab;
