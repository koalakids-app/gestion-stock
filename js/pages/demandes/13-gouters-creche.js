/* ══════════════════════════════════════════════════════════════════════════
   GOÛTERS DE LA CRÈCHE (MCM › Menus › « Goûters de la crèche »)

   Certaines crèches préparent elles-mêmes leurs goûters. Le référent saisit,
   pour une semaine, le goûter de chaque jour (table `menus_gouters_creche`,
   voir sql/menus_gouters_creche.sql). Pour cette crèche, il REMPLACE le goûter
   du traiteur (bb18_gouter / grand_gouter) partout où le menu s'affiche :
   liste MCM › Menus, bandeaux Présences, page publique du QR code. Un seul
   texte par jour, valable pour les 6-18 mois et les grands (pas de goûter
   avant 6 mois).
   ═════════════════════════════════════════════════════════════════════════ */
const gcCache={}; // crecheId -> { date_debut -> { jour -> texte } }
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
    const{data,error}=await sb.from('menus_gouters_creche').select('date_debut,jour,gouter').eq('creche_id',crecheId);
    if(error)throw error;
    (data||[]).forEach(function(r){(map[r.date_debut]=map[r.date_debut]||{})[r.jour]=r.gouter;});
    const{data:opt,error:errOpt}=await sb.from('gouters_creche_options').select('tous_gouters').eq('creche_id',crecheId).maybeSingle();
    if(errOpt)throw errOpt;
    gcTousCache[crecheId]=!!(opt&&opt.tous_gouters);
  }catch(err){console.warn('[Goûters crèche] lecture',err);}
  gcCache[crecheId]=map;
  return map;
}

/* Goûter à afficher pour un jour : celui de la crèche s'il existe, sinon celui
   du traiteur. `creche` vaut true quand il vient de la crèche. */
function gouterAffiche(gcSemaine,jour,gouterTraiteur,tous){
  const g=gcSemaine&&gcSemaine[jour];
  if(g)return{texte:g,creche:true};
  return{texte:tous?'':(gouterTraiteur||''),creche:false}; // « fait tous ses goûters » : jamais celui du traiteur
}
/* Option « cette crèche fait tous ses goûters » (lue après gouterCrecheMap). */
function gouterTous(crecheId){return !!(crecheId&&gcTousCache[crecheId]);}
function gouterLigneHtml(g){
  if(!g.texte)return'';
  return'<div style="margin-top:4px;padding-top:4px;border-top:1px dashed var(--border);color:var(--koala-dark)"><i class="ti ti-cookie" style="font-size:11px"></i> '
    +escHtml(g.texte)+(g.creche?' <span style="font-size:10px;font-weight:700;color:var(--orange-dark)">(crèche)</span>':'')+'</div>';
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
    +'<p style="font-size:12px;color:var(--muted);margin:0 0 10px">Le goûter saisi remplace celui du traiteur pour votre crèche (bébés 6-18 mois et grands). Laissez un jour vide pour garder le goûter du traiteur, sauf si vous cochez ci-dessous.</p>'
    +selCreche
    +'<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:0 0 10px;cursor:pointer"><input type="checkbox" id="gc-tous" style="margin-top:3px"/><span><strong>Cette crèche fait tous ses goûters</strong><br><span style="color:var(--muted);font-size:12px">Un jour sans goûter saisi n\'affiche aucun goûter (pas celui du traiteur), et le bon de commande ne compte aucun goûter pour cette crèche.</span></span></label>'
    +'<div class="fg"><label class="flabel">Semaine du (lundi)</label><input class="finput" type="date" id="gc-semaine"/></div>'
    +'<div id="gc-jours"></div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">'
    +'<button class="btn-cancel" id="gc-vider">Tout effacer</button>'
    +'<button class="btn-primary" id="gc-enregistrer"><i class="ti ti-device-floppy"></i> Enregistrer</button></div></div>';
  document.body.appendChild(ov);
  const inputSem=document.getElementById('gc-semaine');
  const zone=document.getElementById('gc-jours');
  const tousEl=document.getElementById('gc-tous');

  async function charger(){
    inputSem.value=semaine;
    zone.innerHTML='<div class="empty-state"><i class="ti ti-loader"></i><p>Chargement…</p></div>';
    let traiteur={};
    try{
      const{data}=await sb.from('menus_semaine').select('jour,bb18_gouter,grand_gouter').eq('date_debut',semaine);
      (data||[]).forEach(function(r){traiteur[r.jour]=r.grand_gouter||r.bb18_gouter||'';});
    }catch(e){console.warn('[Goûters crèche] menu traiteur',e);}
    const existants=(await gouterCrecheMap(crecheId,true))[semaine]||{};
    tousEl.checked=gouterTous(crecheId);
    const [y,m,d]=semaine.split('-').map(Number);
    zone.innerHTML=MENU_JOURS.map(function(nom,i){
      const j=i+1;
      const date=new Date(y,m-1,d+i).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
      return'<div class="fg"><label class="flabel">'+nom+' '+escHtml(date)+'</label>'
        +'<input class="finput gc-jour" data-jour="'+j+'" maxlength="200" value="'+escHtml(existants[j]||'')+'" data-traiteur="'+escHtml(traiteur[j]||'')+'"/></div>';
    }).join('');
    placeholders();
  }
  function placeholders(){
    Array.prototype.forEach.call(zone.querySelectorAll('.gc-jour'),function(i){
      const t=i.dataset.traiteur;
      i.placeholder=tousEl.checked?'Aucun goûter ce jour':(t?'Traiteur : '+t:'Ex. compote maison et biscuit');
    });
  }
  tousEl.onchange=placeholders;
  inputSem.onchange=function(){
    if(!inputSem.value)return;
    semaine=menusMondayOf(inputSem.value); // recale sur le lundi
    charger();
  };
  const selEl=document.getElementById('gc-creche');
  if(selEl)selEl.onchange=function(){crecheId=selEl.value;charger();};

  async function enregistrer(vider){
    const lignes=Array.prototype.map.call(zone.querySelectorAll('.gc-jour'),function(i){
      return{jour:+i.dataset.jour,gouter:vider?'':i.value.trim()};
    });
    const aEcrire=lignes.filter(function(l){return l.gouter;}).map(function(l){
      return{creche_id:crecheId,date_debut:semaine,jour:l.jour,gouter:l.gouter,updated_at:new Date().toISOString()};
    });
    const aSupprimer=lignes.filter(function(l){return !l.gouter;}).map(function(l){return l.jour;});
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
