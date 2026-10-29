/* ══════════════════════════════════════════════════════════════════════════
   GOÛTERS DE LA CRÈCHE (MCM › Menus › « Goûters de la crèche »)

   Certaines crèches préparent elles-mêmes leurs goûters. Le référent saisit,
   pour une semaine, le goûter de chaque jour (table `menus_gouters_creche`,
   voir sql/menus_gouters_creche.sql). Pour cette crèche, il REMPLACE le goûter
   du traiteur (bb18_gouter / grand_gouter) partout où le menu s'affiche :
   liste MCM › Menus, bandeaux Présences, page publique du QR code. Deux
   goûters par jour, comme le traiteur : « moyens » (bébés 6-18 mois, colonne
   `gouter`) et « grands » (colonne `gouter_grand`) ; pas de goûter avant
   6 mois. Une case permet de saisir le même goûter pour les deux.
   ═════════════════════════════════════════════════════════════════════════ */
const gcCache={}; // crecheId -> { date_debut -> { jour -> {moyen,grand} } }
let mcmGcMap={};  // goûters de la crèche courante, pour la liste MCM › Menus
let mcmGcTous=false; // option « cette crèche fait tous ses goûters » (crèche courante)
const gcTousCache={}; // crecheId -> boolean

/* Crèche dont on affiche les goûters : celle du référent ; pour la direction,
   la crèche sélectionnée dans Présences (sinon aucune : goûters du traiteur). */
function gouterCrecheCourante(){
  if(!isDirection)return currentProfile?.creche_id||null;
  try{return(typeof getPresenceCrecheId==='function'&&getPresenceCrecheId())||null;}catch(e){return null;}
}
function gouterCrechePeutEditer(){
  return isDirection||currentProfile?.role==='referent';
}

async function gouterCrecheMap(crecheId,force){
  if(!crecheId)return{};
  if(!force&&gcCache[crecheId])return gcCache[crecheId];
  const map={};
  try{
    const{data,error}=await sb.from('menus_gouters_creche').select('date_debut,jour,gouter,gouter_grand').eq('creche_id',crecheId);
    if(error)throw error;
    (data||[]).forEach(function(r){(map[r.date_debut]=map[r.date_debut]||{})[r.jour]={moyen:r.gouter||'',grand:r.gouter_grand||'',rm:[],rg:[]};});
    // le titre des recettes choisies s'affiche avec le goûter du jour (gouterAffiche)
    const{data:rr,error:errRec}=await sb.from('gouters_creche_recettes').select('date_debut,jour,profil,recettes(nom)').eq('creche_id',crecheId);
    if(errRec)console.warn('[Goûters crèche] recettes',errRec);
    (rr||[]).forEach(function(r){
      if(!r.recettes)return;
      const sem=map[r.date_debut]=map[r.date_debut]||{};
      const j=sem[r.jour]=sem[r.jour]||{moyen:'',grand:'',rm:[],rg:[]};
      (r.profil==='moyen'?j.rm:j.rg).push(r.recettes.nom);
    });
    const{data:opt,error:errOpt}=await sb.from('gouters_creche_options').select('tous_gouters').eq('creche_id',crecheId).maybeSingle();
    if(errOpt)throw errOpt;
    gcTousCache[crecheId]=!!(opt&&opt.tous_gouters);
  }catch(err){console.warn('[Goûters crèche] lecture',err);}
  gcCache[crecheId]=map;
  return map;
}

/* Profil (« moyen » ou « grand ») d'une colonne de goûter du traiteur. */
function gouterProfil(champ){return champ==='bb18_gouter'?'moyen':'grand';}
/* Goûter à afficher pour un jour et un profil : celui de la crèche s'il existe,
   sinon celui du traiteur. `creche` vaut true quand il vient de la crèche. */
function gouterAffiche(gcSemaine,jour,gouterTraiteur,tous,profil){
  const g=gcSemaine&&gcSemaine[jour];
  const t=g&&[].concat((profil==='moyen'?g.rm:g.rg)||[],g[profil]||[]).filter(Boolean).join(' / ');
  if(t)return{texte:t,creche:true};
  return{texte:tous?'':(gouterTraiteur||''),creche:false}; // « fait tous ses goûters » : jamais celui du traiteur
}
/* Option « cette crèche fait tous ses goûters » (lue après gouterCrecheMap). */
function gouterTous(crecheId){return !!(crecheId&&gcTousCache[crecheId]);}
function gouterLigneHtml(g){
  if(!g.texte)return'';
  return'<div style="margin-top:4px;padding-top:4px;border-top:1px dashed var(--border);color:var(--koala-dark)"><i class="ti ti-cookie" style="font-size:11px"></i> '
    +escHtml(g.texte)+(g.creche?' <span style="font-size:10px;font-weight:700;color:var(--orange-dark)">(crèche)</span>':'')+'</div>';
}

/* Effectifs « goûter » d'une semaine, d'après Présences › Semaine si c'est la semaine
   affichée là (sinon null : à saisir). Moyens = goûter « gbb » (6-18 mois), grands =
   « ggr ». Contrairement au bon traiteur, les enfants en « goûter crèche » sont
   comptés : c'est la crèche qui prépare leur goûter. Retourne aussi, par jour, les
   enfants présents avec leurs allergies (pour l'alerte allergènes). */
function gouterEffectifsDepuisLignes(rows,days5,dateStrs){
  const res={moyen:[],grand:[],enfants:[]};
  days5.forEach(function(d,i){
    let m=0,g=0;const enfs=[];
    rows.forEach(function(r){
      const c=r.cells[i];
      if(!c.present||(c.slot!=='j'&&c.slot!=='a'))return;
      if(c.repas==='BIB'||enfPaiPanier(r.enfant))return;
      if(String(c.repas||'').replace(/(SV|SPV|SPA)$/,'')==='BB')return; // goûter compris dans le repas
      const mois=mcmAgeMois(r.enfant.dob,dateStrs[i]);
      if(mois!==null&&mois<6)return;
      const t=mcmLigne(r.enfant,dateStrs[i]);
      if(!t)return;
      const base=r.enfant.gouter_base;
      const prof=(base&&base!=='creche')?base:(t==='bb6'?null:(t==='bb18'?'gbb':'ggr'));
      if(!prof)return;
      if(prof==='gbb')m++;else g++;
      enfs.push({nom:((r.enfant.prenom||'')+' '+(r.enfant.nom||'').slice(0,1)+'.').trim(),al:rcAllergenesDeTexte([r.enfant.allergies].concat(enfPaiActifs(r.enfant).map(function(p){return p.motif;})).join(' '))});  // fiche + motif des PAI actifs
    });
    res.moyen.push(m);res.grand.push(g);res.enfants.push(enfs);
  });
  return res;
}
/* Effectifs de n'importe quelle semaine, calculés comme Présences › Semaine : présences
   enregistrées, sinon contrat d'accueil, sinon semaine type de l'historique. */
async function gouterEffectifsSemaine(crecheId,semaine){
  const ctx=typeof _hebdoExportCtx!=='undefined'?_hebdoExportCtx:null;
  if(ctx&&ctx.crecheId===crecheId&&ctx.dateStrs&&ctx.dateStrs[0]===semaine)return gouterEffectifsDepuisLignes(ctx.rows,ctx.days5,ctx.dateStrs);
  try{
    if(typeof enfPaiCharger==='function')await enfPaiCharger();
    const enfants=cacheEnfants.filter(function(e){return e.creche_id===crecheId;});
    if(!enfants.length)return null;
    const [y,m,d]=semaine.split('-').map(Number);
    const days5=Array.from({length:5},function(_,i){return new Date(y,m-1,d+i);});
    const dateStrs=days5.map(function(x){return ipDateToLocalISO(x);});
    const ids=enfants.map(function(e){return e.id;});
    const[pr,ct]=await Promise.all([
      sb.from('presences').select('enfant_id,presence_date,slot,status').in('presence_date',dateStrs).in('enfant_id',ids),
      sb.from('enfants_contrats').select('*').in('enfant_id',ids)
    ]);
    if(pr.error)throw pr.error;
    const pres=pr.data||[],pm={};
    pres.forEach(function(p){pm[p.enfant_id+'_'+p.presence_date+'_'+p.slot]=p.status;});
    const ctJ={};
    (ct.data||[]).forEach(function(c){
      const jours=ctParseJours(c.jours);
      dateStrs.forEach(function(ds,i){
        if(c.date_debut&&c.date_debut>ds)return;
        if(c.date_fin&&c.date_fin<ds)return;
        if(jours.indexOf(i+1)<0)return;
        ctJ[String(c.enfant_id)+'_'+i]=true;
      });
    });
    const prevision=pres.length?null:(typeof hebdoPrevision==='function'?await hebdoPrevision(enfants,days5):null);
    const rows=enfants.map(function(e){
      const aPres=pres.some(function(p){return p.enfant_id===e.id;});
      const aContrat=[0,1,2,3,4].some(function(j){return ctJ[String(e.id)+'_'+j];});
      const cells=dateStrs.map(function(ds,i){
        let slot=null;
        if(prevision)slot=aContrat?(ctJ[String(e.id)+'_'+i]?'j':null):(prevision[e.id]||[])[i]||null;
        else if(!aPres&&aContrat)slot=ctJ[String(e.id)+'_'+i]?'j':null;
        else{
          const mm=pm[e.id+'_'+ds+'_M'],aa=pm[e.id+'_'+ds+'_A'];
          const mOk=mm==='present'||mm==='partial',aOk=aa==='present'||aa==='partial';
          slot=mOk&&aOk?'j':mOk?'m':aOk?'a':null;
        }
        return slot?{present:true,slot:slot,repas:enfRepasCode(e,ds)}:{present:false,slot:null,repas:''};
      });
      return{enfant:e,cells:cells};
    });
    return gouterEffectifsDepuisLignes(rows,days5,dateStrs);
  }catch(err){console.warn('[Goûters crèche] effectifs depuis les présences',err);return null;}
}

async function gouterCrecheOuvrir(dateDebut){
  if(!gouterCrechePeutEditer()){showBanner('Réservé aux référents et à la direction.','error');return;}
  const aujourdhui=todayStr();
  const dow=new Date(aujourdhui+'T00:00:00').getDay();
  // Par défaut : la semaine affichée, ou la prochaine si on est le week-end.
  let semaine=dateDebut||(dow===0||dow===6?ipDateToLocalISO(new Date(new Date(menusMondayOf(aujourdhui)+'T00:00:00').getTime()+7*864e5)):menusMondayOf(aujourdhui));
  let crecheId=isDirection?(gouterCrecheCourante()||(cacheCreches[0]&&cacheCreches[0].id)||null):currentProfile?.creche_id||null;
  if(!crecheId){showBanner('Aucune crèche rattachée à votre compte.','error');return;}

  let ov=document.getElementById('modal-gouters-creche-wrap');
  if(ov)ov.remove();
  ov=document.createElement('div');
  ov.className='overlay';ov.id='modal-gouters-creche-wrap';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-gouters-creche-wrap');};
  const selCreche=isDirection&&cacheCreches.length>1
    ?'<div class="fg"><label class="flabel">Crèche</label><select class="finput" id="gc-creche">'
      +cacheCreches.map(function(c){return'<option value="'+escHtml(c.id)+'"'+(c.id===crecheId?' selected':'')+'>'+escHtml(c.name)+'</option>';}).join('')+'</select></div>'
    :'';
  ov.innerHTML='<div class="modal" style="max-width:520px;width:100%">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem"><h3 style="margin:0"><i class="ti ti-cookie"></i> Goûters de la crèche</h3>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-gouters-creche-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
    +'<p style="font-size:12px;color:var(--muted);margin:0 0 10px">Le goûter saisi remplace celui du traiteur pour votre crèche. Il y a un goûter pour les moyens (bébés 6-18 mois) et un pour les grands. Laissez une case vide pour garder le goûter du traiteur, sauf si vous cochez ci-dessous. Pour les moyens, une case par produit ; pour les grands, ajoutez autant de cases que nécessaire avec « + produit » (jusqu’à 6) ou ajoutez une recette : la liste des produits à commander se calcule à partir des effectifs.</p>'
    +selCreche
    +'<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:0 0 10px;cursor:pointer"><input type="checkbox" id="gc-tous" style="margin-top:3px"/><span><strong>Cette crèche fait tous ses goûters</strong><br><span style="color:var(--muted);font-size:12px">Un jour sans goûter saisi n\'affiche aucun goûter (pas celui du traiteur), et le bon de commande ne compte aucun goûter pour cette crèche.</span></span></label>'
    +'<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:0 0 10px;cursor:pointer"><input type="checkbox" id="gc-meme"/><span>Même goûter pour les moyens et les grands</span></label>'
    +'<div class="fg"><label class="flabel">Semaine du (lundi)</label><input class="finput" type="date" id="gc-semaine"/></div>'
    +'<div id="gc-eff" class="fg"></div>'
    +'<div id="gc-jours"></div>'
    +'<div id="gc-produits" style="margin-top:10px"></div>'
    +'<div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;margin-top:12px">'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-cancel" id="gc-recettes"><i class="ti ti-book"></i> Recettes</button>'
    +'<button class="btn-cancel" id="gc-recap"><i class="ti ti-receipt"></i> Récapitulatif 2 semaines</button></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-cancel" id="gc-vider">Tout effacer</button>'
    +'<button class="btn-primary" id="gc-enregistrer"><i class="ti ti-device-floppy"></i> Enregistrer</button></div></div></div>';
  document.body.appendChild(ov);
  const inputSem=document.getElementById('gc-semaine');
  const zone=document.getElementById('gc-jours');
  const tousEl=document.getElementById('gc-tous');
  const memeEl=document.getElementById('gc-meme');
  let rec={};       // jour -> {moyen:[recette], grand:[recette]}
  let enfantsJour=null; // enfants présents par jour (alerte allergènes), si Présences affiche cette semaine
  const recDe=function(j,p){rec[j]=rec[j]||{moyen:[],grand:[]};return memeEl.checked?rec[j].moyen:rec[j][p];};

  async function charger(){
    inputSem.value=semaine;
    zone.innerHTML='<div class="empty-state"><i class="ti ti-loader"></i><p>Chargement…</p></div>';
    let traiteur={};
    try{
      const{data}=await sb.from('menus_semaine').select('jour,bb18_gouter,grand_gouter').eq('date_debut',semaine);
      (data||[]).forEach(function(r){traiteur[r.jour]={moyen:r.bb18_gouter||'',grand:r.grand_gouter||''};});
    }catch(e){console.warn('[Goûters crèche] menu traiteur',e);}
    const existants=(await gouterCrecheMap(crecheId,true))[semaine]||{};
    const recettes=await rcCharger();
    rec={};
    let effSaved={};
    try{
      const[a,b]=await Promise.all([
        sb.from('gouters_creche_recettes').select('jour,profil,recette_id').eq('creche_id',crecheId).eq('date_debut',semaine),
        sb.from('gouters_creche_effectifs').select('jour,moyens,moyens_l1,moyens_l2,grands').eq('creche_id',crecheId).eq('date_debut',semaine)
      ]);
      (a.data||[]).forEach(function(x){if(recettes[x.recette_id]){rec[x.jour]=rec[x.jour]||{moyen:[],grand:[]};rec[x.jour][x.profil].push(recettes[x.recette_id]);}});
      (b.data||[]).forEach(function(x){effSaved[x.jour]=x;});
    }catch(e){console.warn('[Goûters crèche] recettes / effectifs',e);}
    tousEl.checked=gouterTous(crecheId);
    // « Même goûter » décoché par défaut ; coché seulement si des goûters sont saisis et que les moyens et les grands saisis (et leurs recettes) sont identiques.
    memeEl.checked=Object.keys(existants).length>0&&Object.keys(existants).every(function(j){return existants[j].moyen===existants[j].grand;})
      &&Object.keys(rec).every(function(j){return rec[j].moyen.map(function(r){return r.id;}).join()===rec[j].grand.map(function(r){return r.id;}).join();});
    const [y,m,d]=semaine.split('-').map(Number);
    zone.innerHTML=MENU_JOURS.map(function(nom,i){
      const j=i+1,e=existants[j]||{moyen:'',grand:''},t=traiteur[j]||{moyen:'',grand:''};
      const pm=String(e.moyen||'').split('/'),l1=(pm[0]||'').trim(),l2=pm.slice(1).join(' / ').trim();
      const vide=!l1&&!l2; // moyens : toujours yaourt + compote, préremplis tant que rien n'est saisi
      const date=new Date(y,m-1,d+i).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
      return'<div class="fg gc-bloc" data-jour="'+j+'"><label class="flabel">'+nom+' '+escHtml(date)+'</label>'
        +'<div class="gc-moyen-wrap"><span class="gc-lbl gc-lbl-moyen"></span>'
        +'<div class="gc-m-ligne" style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><input class="finput gc-m1" maxlength="100" value="'+escHtml(vide?'Yaourt':l1)+'"/>'
        +'<input class="finput gc-eff-m gc-me1" type="number" min="0" max="99" title="Effectif" placeholder="Eff." style="width:64px;text-align:center;flex:none"/></div>'
        +'<div class="gc-m-ligne" style="display:flex;gap:6px;align-items:center"><input class="finput gc-m2" maxlength="100" value="'+escHtml(vide?'Compote':l2)+'"/>'
        +'<input class="finput gc-eff-m gc-me2" type="number" min="0" max="99" title="Effectif" placeholder="Eff." style="width:64px;text-align:center;flex:none"/></div>'
        +'<div class="gc-rec-moyen"></div></div>'
        +'<div class="gc-grand-wrap"><span class="gc-lbl">Grands</span>'
        +'<div class="gc-grand-items" data-traiteur="'+escHtml(t.grand)+'"></div>'
        +'<button type="button" class="btn-cancel gc-grand-add" style="padding:3px 9px;font-size:12px;margin-top:4px"><i class="ti ti-plus"></i> produit</button>'
        +'<div class="gc-rec-grand"></div></div>'
        +'<div class="gc-alertes"></div></div>';
    }).join('');
    Array.prototype.forEach.call(zone.querySelectorAll('.gc-bloc'),function(b,i){grandInit(b,(existants[i+1]||{}).grand);});
    // Effectifs : valeurs enregistrées, sinon Présences › Semaine (même semaine), sinon à saisir.
    const eff=await gouterEffectifsSemaine(crecheId,semaine);
    enfantsJour=eff?eff.enfants:null;
    const val=function(p,i){const sv=effSaved[i+1];if(sv)return sv.grands;return eff?eff[p][i]:'';};
    const valM=function(i,n){const sv=effSaved[i+1];if(sv){const v=sv['moyens_l'+n];return v==null?sv.moyens:v;}return eff?eff.moyen[i]:'';};
    Array.prototype.forEach.call(zone.querySelectorAll('.gc-bloc'),function(b,i){b.querySelector('.gc-me1').value=valM(i,1);b.querySelector('.gc-me2').value=valM(i,2);});
    document.getElementById('gc-eff').innerHTML='<label class="flabel">Enfants au goûter'+(eff?' <span style="font-weight:400;color:var(--muted)">(calculés d’après les présences, modifiables)</span>':' <span style="font-weight:400;color:var(--muted)">(à saisir)</span>')+'</label>'
      +['grand'].map(function(p){
        return'<div style="font-size:11px;color:var(--muted);margin-top:4px">Grands</div>'
          +'<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">'
          +MENU_JOURS.map(function(nom,i){return'<div style="text-align:center;font-size:11px;color:var(--muted)">'+escHtml(nom.slice(0,3))
            +'<input class="finput gc-eff-j" data-p="'+p+'" type="number" min="0" max="99" style="text-align:center;padding:6px 2px" value="'+val(p,i)+'"/></div>';}).join('')+'</div>';
      }).join('');
    if(eff){
      const bt=document.createElement('button');bt.type='button';bt.className='btn-cancel';bt.style.cssText='margin-top:6px;padding:3px 9px;font-size:12px';
      bt.innerHTML='<i class="ti ti-refresh"></i> Recalculer d’après les présences';
      bt.onclick=function(){Array.prototype.forEach.call(document.querySelectorAll('.gc-eff-j[data-p="grand"]'),function(el,i){el.value=eff.grand[i];});Array.prototype.forEach.call(zone.querySelectorAll('.gc-bloc'),function(b,i){b.querySelector('.gc-me1').value=eff.moyen[i];b.querySelector('.gc-me2').value=eff.moyen[i];});majProduits();};
      document.getElementById('gc-eff').appendChild(bt);
    }
    Array.prototype.forEach.call(document.querySelectorAll('.gc-eff-j,.gc-eff-m'),function(el){el.oninput=majProduits;});
    Array.prototype.forEach.call(zone.querySelectorAll('input'),function(el){el.addEventListener('input',majProduits);});
    Array.prototype.forEach.call(zone.querySelectorAll('.gc-bloc'),majRecettes);
    majMode();
  }
  /* Goûter des grands : une case par produit (3 ou 4 en général), enregistrées « a / b / c ». */
  const GRAND_MAX=6;
  function grandCases(b){return b.querySelectorAll('.gc-grand');}
  function grandTexte(b){return Array.prototype.map.call(grandCases(b),function(el){return el.value.trim();}).filter(Boolean).join(' / ');}
  function grandInit(b,texte){
    const zoneG=b.querySelector('.gc-grand-items');zoneG.innerHTML='';
    // « + » accepté aussi comme séparateur (anciennes saisies : pain + miel + pomme)
    const parts=String(texte||'').split(/\s\+\s|\//).map(function(x){return x.trim();}).filter(Boolean);
    (parts.length?parts:['']).forEach(function(v){grandAjouter(b,v,false);});
    b.querySelector('.gc-grand-add').onclick=function(){grandAjouter(b,'',true);};
    grandMaj(b);
  }
  function grandAjouter(b,v,focus){
    const zoneG=b.querySelector('.gc-grand-items');
    if(zoneG.children.length>=GRAND_MAX)return;
    const d=document.createElement('div');d.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:4px';
    d.innerHTML='<input class="finput gc-grand" maxlength="100" value="'+escHtml(v)+'"/><button type="button" class="btn-cancel gc-grand-x" title="Retirer" style="padding:4px 8px;flex:none"><i class="ti ti-x"></i></button>';
    const inp=d.querySelector('input');
    if(focus)inp.addEventListener('input',majProduits); // les cases du premier affichage sont écoutées avec les autres
    d.querySelector('.gc-grand-x').onclick=function(){
      if(zoneG.children.length>1)d.remove();else inp.value='';
      grandMaj(b);majProduits();
    };
    zoneG.appendChild(d);
    if(focus){grandMaj(b);inp.focus();}
  }
  function grandMaj(b){
    const zoneG=b.querySelector('.gc-grand-items'),n=zoneG.children.length,tg=zoneG.dataset.traiteur;
    Array.prototype.forEach.call(grandCases(b),function(el,i){
      el.placeholder=tousEl.checked?'Aucun goûter ce jour':(i===0&&tg?'Traiteur : '+tg:'Produit '+(i+1)+(i===0?' (ex. pain complet)':''));
      el.parentNode.querySelector('.gc-grand-x').style.visibility=n>1?'':'hidden';
    });
    b.querySelector('.gc-grand-add').style.display=n>=GRAND_MAX?'none':'';
  }
  /* Pastilles des recettes d'un jour, allergènes et alerte enfants concernés. */
  function majRecettes(b){
    const j=+b.dataset.jour;
    ['moyen','grand'].forEach(function(p){
      const box=b.querySelector('.gc-rec-'+p);
      const liste=recDe(j,p);
      box.innerHTML=liste.map(function(r,n){
        return'<span style="display:inline-flex;align-items:center;gap:6px;background:#EEEDF8;color:#3D3580;border-radius:14px;padding:3px 10px;font-size:12px;margin:5px 4px 0 0">📖 '+escHtml(r.nom)
          +' <a href="#" data-rm="'+n+'" title="Retirer" style="color:#3D3580;text-decoration:none">×</a></span>';
      }).join('')+'<button type="button" class="btn-cancel" data-add="'+p+'" style="padding:3px 9px;font-size:12px;margin-top:5px"><i class="ti ti-plus"></i> recette</button>';
      Array.prototype.forEach.call(box.querySelectorAll('[data-rm]'),function(a){a.onclick=function(ev){ev.preventDefault();liste.splice(+a.dataset.rm,1);majRecettes(b);majProduits();};});
      box.querySelector('[data-add]').onclick=function(){
        rcChoisir(function(r){const l=recDe(j,p);if(!l.some(function(x){return x.id===r.id;}))l.push(r);majRecettes(b);majProduits();});
      };
    });
    const al={};
    ['moyen','grand'].forEach(function(p){if(p==='grand'&&memeEl.checked)return;recDe(j,p).forEach(function(r){rcAllergenesRecette(r).forEach(function(k){al[k]=1;});});});
    const keys=Object.keys(al);
    let h='';
    if(keys.length){
      h='<div style="background:#FDE8D6;border-left:4px solid #E07B2A;border-radius:0 8px 8px 0;padding:6px 10px;font-size:12px;color:#7A3A0A;margin-top:6px">⚠ Allergènes du jour : '+keys.map(rcLibelleAllergene).join(', ');
      if(enfantsJour){
        const concernes=(enfantsJour[j-1]||[]).filter(function(e){return e.al.some(function(k){return al[k];});});
        if(concernes.length)h+='<br>Enfants concernés (d’après leur fiche, à vérifier) : <b>'+concernes.map(function(e){return escHtml(e.nom+' ('+e.al.filter(function(k){return al[k];}).map(rcLibelleAllergene).join(', ')+')');}).join(' · ')+'</b>';
      }
      h+='</div>';
    }
    b.querySelector('.gc-alertes').innerHTML=h;
  }
  /* Produits à commander de la semaine affichée, recalculés à chaque frappe. */
  function jourSaisi(b,p){
    const j=+b.dataset.jour;
    const mo=moyenTexte(b),gr=memeEl.checked?mo:grandTexte(b);
    return{texte:p==='moyen'?mo:gr,recettes:recDe(j,p)};
  }
  function moyenTexte(b){return[b.querySelector('.gc-m1').value.trim(),b.querySelector('.gc-m2').value.trim()].filter(Boolean).join(' / ');}
  function effMoyen(b,n){return parseInt(b.querySelector('.gc-me'+n).value,10)||0;}
  function effectif(p,i){const el=document.querySelectorAll('.gc-eff-j[data-p="'+p+'"]')[i];return el?(parseInt(el.value,10)||0):0;}
  function majProduits(){
    const jours=[];
    Array.prototype.forEach.call(zone.querySelectorAll('.gc-bloc'),function(b,i){
      const sm=jourSaisi(b,'moyen'),sg=jourSaisi(b,'grand'),tout=sm.recettes.concat(sg.recettes),n1=effMoyen(b,1),n2=effMoyen(b,2);
      // une ligne de produit par case (chacune avec son effectif) ; les recettes comptent pour le plus grand effectif
      jours.push({sem:0,profil:'moyen',n:n1,texte:b.querySelector('.gc-m1').value,recettes:[],exclure:tout});
      jours.push({sem:0,profil:'moyen',n:n2,texte:b.querySelector('.gc-m2').value,recettes:[],exclure:tout});
      jours.push({sem:0,profil:'moyen',n:Math.max(n1,n2),texte:'',recettes:sm.recettes});
      jours.push({sem:0,profil:'grand',n:effectif('grand',i),texte:sg.texte,recettes:sg.recettes,exclure:tout});
    });
    const liste=gcLignes(jours);
    const box=document.getElementById('gc-produits');
    if(!liste.length){box.innerHTML='';return;}
    box.innerHTML='<div class="flabel">Produits à commander cette semaine</div>'
      +'<div style="border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:13px;max-height:200px;overflow:auto">'
      +liste.map(function(e){return'<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0"><span>'+escHtml(e.nom)+(e.ing?' <small style="color:var(--muted)">(recette)</small>':'')+'</span><strong>'+gcFmtLigne(e,gcTotalLigne(e,''))+'</strong></div>';}).join('')+'</div>'
      +'<div style="font-size:11px;color:var(--muted);margin-top:4px">Quantité = enfants × jours où le produit figure ; recettes recalculées pour l’effectif. Moyens et grands sont comptés séparément.</div>';
  }
  /* Affichage selon « même goûter » et « fait tous ses goûters » : une seule case par
     jour quand c'est le même goûter, indications du traiteur sinon « Aucun goûter ». */
  function majMode(){
    const meme=memeEl.checked;
    Array.prototype.forEach.call(zone.querySelectorAll('.gc-bloc'),function(b){
      b.querySelector('.gc-grand-wrap').style.display=meme?'none':'';
      b.querySelector('.gc-lbl-moyen').textContent=meme?'':'Moyens (6-18 mois)';
      b.querySelector('.gc-m1').placeholder=tousEl.checked?'Aucun goûter ce jour':'Produit 1 (ex. yaourt)';
      b.querySelector('.gc-m2').placeholder=tousEl.checked?'Aucun goûter ce jour':'Produit 2 (ex. compote)';
      grandMaj(b);
      majRecettes(b);
    });
    majProduits();
  }
  tousEl.onchange=majMode;
  memeEl.onchange=function(){
    if(!memeEl.checked){ // on sépare : les grands reprennent le goûter (et les recettes) des moyens
      Array.prototype.forEach.call(zone.querySelectorAll('.gc-bloc'),function(b){
        const j=+b.dataset.jour;
        if(!grandTexte(b))grandInit(b,moyenTexte(b));
        rec[j]=rec[j]||{moyen:[],grand:[]};
        if(!rec[j].grand.length)rec[j].grand=rec[j].moyen.slice();
      });
    }
    majMode();
  };
  inputSem.onchange=function(){
    if(!inputSem.value)return;
    semaine=menusMondayOf(inputSem.value); // recale sur le lundi
    charger();
  };
  const selEl=document.getElementById('gc-creche');
  if(selEl)selEl.onchange=function(){crecheId=selEl.value;charger();};
  document.getElementById('gc-recettes').onclick=rcOuvrirBibliotheque;
  document.getElementById('gc-recap').onclick=function(){gouterRecapOuvrir(crecheId,semaine);};

  async function enregistrer(vider){
    const lignes=Array.prototype.map.call(zone.querySelectorAll('.gc-bloc'),function(b){
      const moyen=vider?'':moyenTexte(b);
      const grand=vider?'':(memeEl.checked?moyen:grandTexte(b));
      return{jour:+b.dataset.jour,moyen:moyen,grand:grand};
    });
    const aEcrire=lignes.filter(function(l){return l.moyen||l.grand;}).map(function(l){
      return{creche_id:crecheId,date_debut:semaine,jour:l.jour,gouter:l.moyen||null,gouter_grand:l.grand||null,updated_at:new Date().toISOString()};
    });
    const aSupprimer=lignes.filter(function(l){return !l.moyen&&!l.grand;}).map(function(l){return l.jour;});
    const recettesLignes=[],effLignes=[];
    if(!vider){
      lignes.forEach(function(l,i){
        ['moyen','grand'].forEach(function(p){recDe(l.jour,p).forEach(function(r){recettesLignes.push({creche_id:crecheId,date_debut:semaine,jour:l.jour,profil:p,recette_id:r.id});});});
        const b=zone.querySelectorAll('.gc-bloc')[i],m1=effMoyen(b,1),m2=effMoyen(b,2),m=Math.max(m1,m2),g=effectif('grand',i);
        if(m||g)effLignes.push({creche_id:crecheId,date_debut:semaine,jour:l.jour,moyens:m,moyens_l1:m1,moyens_l2:m2,grands:g,updated_at:new Date().toISOString()});
      });
    }
    try{
      {
        const{error}=await sb.from('gouters_creche_options').upsert({creche_id:crecheId,tous_gouters:tousEl.checked,updated_at:new Date().toISOString()},{onConflict:'creche_id'});
        if(error)throw error;
      }
      if(aEcrire.length){
        const{error}=await sb.from('menus_gouters_creche').upsert(aEcrire,{onConflict:'creche_id,date_debut,jour'});
        if(error)throw error;
      }
      if(aSupprimer.length){
        const{error}=await sb.from('menus_gouters_creche').delete().eq('creche_id',crecheId).eq('date_debut',semaine).in('jour',aSupprimer);
        if(error)throw error;
      }
      {
        const{error}=await sb.from('gouters_creche_recettes').delete().eq('creche_id',crecheId).eq('date_debut',semaine);
        if(error)throw error;
      }
      if(recettesLignes.length){
        const{error}=await sb.from('gouters_creche_recettes').insert(recettesLignes);
        if(error)throw error;
      }
      {
        const{error}=await sb.from('gouters_creche_effectifs').delete().eq('creche_id',crecheId).eq('date_debut',semaine);
        if(error)throw error;
      }
      if(effLignes.length){
        const{error}=await sb.from('gouters_creche_effectifs').insert(effLignes);
        if(error)throw error;
      }
    }catch(err){console.error('[Goûters crèche] enregistrement',err);showBanner('Erreur lors de l\'enregistrement des goûters.','error');return;}
    await gouterCrecheMap(crecheId,true);
    showBanner(vider?(tousEl.checked?'Goûters effacés : aucun goûter affiché.':'Goûters effacés : retour au goûter du traiteur.'):'Goûters enregistrés ✅');
    closeModal('modal-gouters-creche-wrap');
    if(typeof mcmLoadMenusList==='function')mcmLoadMenusList();
    if(typeof renderMenuSemaine==='function')renderMenuSemaine();
    if(typeof renderMenuJour==='function')renderMenuJour();
  }
  document.getElementById('gc-enregistrer').onclick=function(){enregistrer(false);};
  document.getElementById('gc-vider').onclick=function(){if(confirm('Effacer les goûters de cette semaine ? Le goûter du traiteur sera affiché à la place.'))enregistrer(true);};
  ov.classList.add('open');
  charger();
}
window.gouterCrecheOuvrir=gouterCrecheOuvrir;
