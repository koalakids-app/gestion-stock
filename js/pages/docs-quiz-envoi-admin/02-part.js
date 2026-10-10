function copyModuleLink(id){
  const m=curModules.find(x=>x.id===id);
  const url=moduleBase()+'?module='+id;
  const avert=m&&!m.publie?'\n\n\u26a0 Ce module est en brouillon : le lien ne fonctionnera qu\'une fois publi\u00e9.':'';
  navigator.clipboard.writeText(url).then(
    ()=>alert('Lien copi\u00e9 :\n'+url+avert),
    ()=>prompt('Copiez ce lien :',url));
}

async function editContent(id){
  curModule=curModules.find(x=>x.id===id);
  const{data,error}=await db.from('bloc').select('*').eq('module_id',id).order('ordre');
  if(error)return alert('Erreur : '+error.message);
  curBlocs=(data||[]).map(b=>({...b,contenu:b.contenu||blocVide(b.type)}));
  delBlocs=[];view='blocs';render();
}

/* ---------- RENDU DES ÉDITEURS PAR TYPE ---------- */

function ta(val,oninput,rows,ph){
  return `<textarea class="form-input" rows="${rows||2}" placeholder="${ph||''}"
    style="font-size:13px;padding:7px 10px;resize:vertical" oninput="${oninput}">${esc(val)}</textarea>`;
}
function inp(val,oninput,ph){
  return `<input class="form-input" style="font-size:13px;padding:7px 10px" placeholder="${ph||''}"
    value="${esc(val)}" oninput="${oninput}">`;
}
function lbl(t){return `<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin:10px 0 4px">${t}</div>`}
function miniBtn(txt,onclick,danger){
  return `<button class="btn" style="padding:3px 9px;font-size:11px${danger?';color:var(--danger-text)':''}" onclick="${onclick}">${txt}</button>`;
}

function editorFor(b,i){
  const c=b.contenu;
  const S=(path,v)=>`setC(${i},'${path}',this.value)`;
  switch(b.type){

    case 'texte':return `
      ${lbl('Titre de section (facultatif)')}
      ${inp(c.titre,S('titre'),'Ce que les pleurs disent')}
      ${lbl('Paragraphes')}
      ${c.paragraphes.map((p,j)=>`
        <div style="display:flex;gap:6px;margin-bottom:6px;align-items:flex-start">
          ${ta(p,`setArr(${i},'paragraphes',${j},this.value)`,3,"Rédigez ici. Le gras s'écrit **ainsi**.")}
          ${c.paragraphes.length>1?miniBtn('×',`delArr(${i},'paragraphes',${j})`,1):''}
        </div>`).join('')}
      ${miniBtn('+ Paragraphe',`addArr(${i},'paragraphes','')`)}`;

    case 'scenes':return `
      ${lbl('Titre de section')}
      ${inp(c.titre,S('titre'),'Trois scènes que vous reconnaîtrez')}
      ${c.items.map((s,j)=>`
        <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin:8px 0;background:var(--surface-2)">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
            <input class="form-input" style="width:44px;text-align:center;font-weight:700;padding:6px" maxlength="2"
              value="${esc(s.lettre)}" oninput="setObjArr(${i},'items',${j},'lettre',this.value)">
            ${inp(s.titre,`setObjArr(${i},'items',${j},'titre',this.value)`,"Il hurle, puis s'arrête")}
            ${c.items.length>1?miniBtn('×',`delArr(${i},'items',${j})`,1):''}
          </div>
          ${ta(s.texte,`setObjArr(${i},'items',${j},'texte',this.value)`,2,'La situation, racontée')}
          <div style="margin-top:6px">${ta(s.analyse,`setObjArr(${i},'items',${j},'analyse',this.value)`,2,'Ce qui se passe : votre analyse')}</div>
        </div>`).join('')}
      ${miniBtn('+ Scène',`addArr(${i},'items',{lettre:String.fromCharCode(65+${c.items.length}),titre:'',texte:'',analyse:''})`)}`;

    case 'reflexion':return `
      ${lbl('La question posée')}
      ${ta(c.question,S('question'),2,'Y a-t-il un enfant dont les pleurs vous agacent plus que les autres ?')}
      ${lbl('Précision sous la question')}
      ${ta(c.sous_titre,S('sous_titre'),2,'Question inconfortable, posée sans jugement…')}
      ${lbl('Texte d\'invite dans la zone de saisie')}
      ${inp(c.placeholder,S('placeholder'))}`;

    case 'retenir':return `
      ${lbl('Titre')}
      ${inp(c.titre,S('titre'),'À retenir')}
      ${lbl('Points clés')}
      ${c.points.map((p,j)=>`
        <div style="display:flex;gap:6px;margin-bottom:5px;align-items:flex-start">
          ${ta(p,`setArr(${i},'points',${j},this.value)`,2,'Un point, une idée')}
          ${c.points.length>1?miniBtn('×',`delArr(${i},'points',${j})`,1):''}
        </div>`).join('')}
      ${miniBtn('+ Point',`addArr(${i},'points','')`)}`;

    case 'citation':return `
      ${lbl('La phrase')}
      ${ta(c.texte,S('texte'),3,"Les pleurs de séparation ne sont pas le signe d'un problème.")}
      <p style="font-size:11px;color:var(--text-light);margin-top:4px">Un retour à la ligne dans le texte crée un saut de ligne à l'affichage.</p>`;

    case 'comparaison':return `
      ${lbl('Phrase d\'introduction (facultative)')}
      ${ta(c.intro,S('intro'),2)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--success-text);margin-bottom:5px">Plutôt</div>
          ${c.plutot.map((p,j)=>`<div style="display:flex;gap:4px;margin-bottom:5px;align-items:flex-start">
            ${ta(p,`setArr(${i},'plutot',${j},this.value)`,2)}
            ${c.plutot.length>1?miniBtn('×',`delArr(${i},'plutot',${j})`,1):''}</div>`).join('')}
          ${miniBtn('+',`addArr(${i},'plutot','')`)}
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--danger-text);margin-bottom:5px">À éviter</div>
          ${c.eviter.map((p,j)=>`<div style="display:flex;gap:4px;margin-bottom:5px;align-items:flex-start">
            ${ta(p,`setArr(${i},'eviter',${j},this.value)`,2)}
            ${c.eviter.length>1?miniBtn('×',`delArr(${i},'eviter',${j})`,1):''}</div>`).join('')}
          ${miniBtn('+',`addArr(${i},'eviter','')`)}
        </div>
      </div>`;

    case 'essayer':return `
      ${lbl('Étiquette')}
      ${inp(c.label,S('label'),'À essayer cette semaine')}
      ${lbl('Titre')}
      ${inp(c.titre,S('titre'),'Une observation, un essai, un retour')}
      ${lbl('Étapes')}
      ${c.etapes.map((e,j)=>`
        <div style="display:flex;gap:6px;margin-bottom:6px;align-items:flex-start">
          <div style="flex:1">
            ${inp(e.titre,`setObjArr(${i},'etapes',${j},'titre',this.value)`,'Observer.')}
            <div style="margin-top:4px">${ta(e.texte,`setObjArr(${i},'etapes',${j},'texte',this.value)`,2,"Ce qu'il faut faire concrètement")}</div>
          </div>
          ${c.etapes.length>1?miniBtn('×',`delArr(${i},'etapes',${j})`,1):''}
        </div>`).join('')}
      ${miniBtn('+ Étape',`addArr(${i},'etapes',{titre:'',texte:''})`)}
      ${lbl('Note de fin (facultative)')}
      ${ta(c.note,S('note'),2)}`;

    case 'image':return `
      ${c.url?`<div style="margin:8px 0"><img src="${esc(c.url)}" alt="" style="max-width:100%;max-height:220px;border-radius:8px;border:1px solid var(--border)"></div>`:''}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0">
        <input type="file" accept="image/*" id="file-${i}" style="display:none" onchange="uploadImg(${i},this)">
        <button class="btn" style="padding:6px 14px;font-size:12px" onclick="document.getElementById('file-${i}').click()">
          ${c.url?'Remplacer l\'image':'Choisir une image'}</button>
        <span id="up-${i}" style="font-size:12px;color:var(--text-muted)"></span>
      </div>
      ${lbl('Ou coller une adresse d\'image')}
      ${inp(c.url,S('url'),'https://…')}
      ${lbl('Texte alternatif (décrit l\'image, pour l\'accessibilité)')}
      ${inp(c.alt,S('alt'),'Une professionnelle accueille un enfant')}
      ${lbl('Légende affichée sous l\'image (facultative)')}
      ${inp(c.legende,S('legende'))}`;
  }
  return '<em>Type inconnu</em>';
}

/* ---------- MUTATIONS ---------- */
function setC(i,path,v){curBlocs[i].contenu[path]=v;dirty()}
function setArr(i,key,j,v){curBlocs[i].contenu[key][j]=v;dirty()}
function setObjArr(i,key,j,f,v){curBlocs[i].contenu[key][j][f]=v;dirty()}
function addArr(i,key,val){curBlocs[i].contenu[key].push(typeof val==='object'?{...val}:val);dirty();renderBlocs()}
function delArr(i,key,j){curBlocs[i].contenu[key].splice(j,1);dirty();renderBlocs()}

function dirty(){
  const m=document.getElementById('bl-msg');
  if(m){m.className='save-status';m.textContent='Modifications non enregistrées';}
}

function addBloc(type){
  curBlocs.push({module_id:curModule.id,type,contenu:blocVide(type),ordre:curBlocs.length});
  renderBlocs();
  setTimeout(()=>{const els=document.querySelectorAll('.bloc-card');els[els.length-1]?.scrollIntoView({behavior:'smooth',block:'center'})},50);
}
function delBloc(i){
  if(!confirm('Supprimer ce bloc ?'))return;
  if(curBlocs[i].id)delBlocs.push(curBlocs[i].id);
  curBlocs.splice(i,1);renderBlocs();
}
function moveBloc(i,d){
  const j=i+d;if(j<0||j>=curBlocs.length)return;
  [curBlocs[i],curBlocs[j]]=[curBlocs[j],curBlocs[i]];
  renderBlocs();dirty();
}

/* ---------- UPLOAD ---------- */
async function uploadImg(i,input){
  const f=input.files[0];if(!f)return;
  const st=document.getElementById('up-'+i);
  if(f.size>5*1024*1024){st.textContent='⚠ Image trop lourde (max 5 Mo)';st.style.color='var(--danger-text)';return;}
  st.style.color='var(--text-muted)';st.textContent='Envoi en cours…';
  const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace('jfif','jpg');
  const path=`${curModule.id}/${Date.now()}.${ext}`;
  const{error}=await db.storage.from(BUCKET).upload(path,f,{cacheControl:'3600',upsert:false});
  if(error){st.textContent='⚠ '+error.message;st.style.color='var(--danger-text)';return;}
  const{data}=db.storage.from(BUCKET).getPublicUrl(path);
  curBlocs[i].contenu.url=data.publicUrl;
  if(!curBlocs[i].contenu.alt)curBlocs[i].contenu.alt=f.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');
  renderBlocs();dirty();
}

/* ---------- VUE ---------- */
function renderBlocs(){
  const boutons=Object.entries(TYPES).map(([k,t])=>
    `<button class="btn addb" onclick="addBloc('${k}')" title="${t.desc}">
      <span style="font-size:14px;opacity:.6">${t.icon}</span> ${t.label}</button>`).join('');

  const cards=curBlocs.length?curBlocs.map((b,i)=>`
    <div class="question-card bloc-card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding-bottom:8px;border-bottom:1px solid var(--border)">
        <span class="q-badge" style="margin:0">${TYPES[b.type]?.icon||''} ${TYPES[b.type]?.label||b.type}</span>
        <div style="display:flex;gap:6px">
          ${miniBtn('↑',`moveBloc(${i},-1)`)}${miniBtn('↓',`moveBloc(${i},1)`)}${miniBtn('Suppr.',`delBloc(${i})`,1)}
        </div>
      </div>
      ${editorFor(b,i)}
    </div>`).join(''):
    `<div class="center-msg">Ce module est vide. Ajoutez un premier bloc ci-dessus.</div>`;

  app().innerHTML=`
    ${tabs('formations')}
    <button class="btn" style="margin-bottom:1rem" onclick="quitBlocs()">← ${esc(curTheme.nom)}</button>
    <div class="question-card" style="margin-bottom:1rem;background:var(--purple-light);border-color:var(--purple)">
      <h2 style="font-size:19px;color:var(--purple)">${esc(curModule.titre)}</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-top:2px">${esc(curModule.accroche)}</p>
      <p style="font-size:11px;color:var(--text-light);margin-top:6px">Le titre, l'accroche et le pied de page sont générés automatiquement — inutile d'en faire des blocs.</p>
    </div>
    <div class="addbar">${boutons}</div>
    ${cards}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:1.25rem;position:sticky;bottom:0;background:var(--bg);padding:12px 0;border-top:1px solid var(--border)">
      <button class="btn primary" onclick="saveBlocs()">Enregistrer</button>
      <button class="btn" onclick="previewModule()">Aperçu</button>
      <span id="bl-msg" class="save-status" style="margin:0;align-self:center"></span>
    </div>`;
}

function quitBlocs(){
  if(confirm('Quitter ? Les modifications non enregistrées seront perdues.')){loadModules();}
}

async function saveBlocs(){
  const msg=document.getElementById('bl-msg');
  msg.className='save-status';msg.textContent='Enregistrement…';
  try{
    if(delBlocs.length){
      const d=await db.from('bloc').delete().in('id',delBlocs);
      if(d.error)throw d.error;
      delBlocs=[];
    }
    for(let i=0;i<curBlocs.length;i++){
      const b=curBlocs[i];
      const payload={module_id:curModule.id,type:b.type,contenu:b.contenu,ordre:i};
      if(b.id){
        const r=await db.from('bloc').update(payload).eq('id',b.id);
        if(r.error)throw r.error;
      }else{
        const r=await db.from('bloc').insert(payload).select().single();
        if(r.error)throw r.error;
        b.id=r.data.id;
      }
      b.ordre=i;
    }
    msg.className='save-status ok';msg.textContent='✓ Enregistré';
  }catch(e){msg.className='save-status err';msg.textContent='⚠ '+e.message;}
}

/* ---------- APERÇU ---------- */
function mdBold(t){return esc(t).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}

function blocHTML(b){
  const c=b.contenu||{};
  switch(b.type){
    case 'texte':return `<section class="m-block">
      ${c.titre?`<h3>${esc(c.titre)}</h3>`:''}
      ${(c.paragraphes||[]).filter(p=>p.trim()).map(p=>`<p>${mdBold(p)}</p>`).join('')}</section>`;

    case 'scenes':return `<section class="m-block">
      ${c.titre?`<h3>${esc(c.titre)}</h3>`:''}
      ${(c.items||[]).map(s=>`<div class="m-scene">
        <div class="m-scene-h"><span class="m-scene-n">${esc(s.lettre)}</span><h4>${esc(s.titre)}</h4></div>
        ${s.texte?`<p>${mdBold(s.texte)}</p>`:''}
        ${s.analyse?`<p class="m-scene-r"><strong>Ce qui se passe :</strong> ${mdBold(s.analyse)}</p>`:''}
      </div>`).join('')}</section>`;

    case 'reflexion':return `<div class="m-pause">
      <div class="m-pause-label">Temps de réflexion</div>
      <p class="m-pause-q">${esc(c.question)}</p>
      ${c.sous_titre?`<p class="m-pause-sub">${esc(c.sous_titre)}</p>`:''}
      <textarea class="m-input" rows="3" placeholder="${esc(c.placeholder||'')}"></textarea>
      <p class="m-pause-note">Vos notes restent sur votre appareil. Elles ne sont ni enregistrées ni transmises.</p>
    </div>`;

    case 'retenir':return `<div class="m-key">
      <h3>${esc(c.titre||'À retenir')}</h3>
      <ul>${(c.points||[]).filter(p=>p.trim()).map(p=>`<li>${mdBold(p)}</li>`).join('')}</ul></div>`;

    case 'citation':return `<div class="m-quote">${esc(c.texte||'').replace(/\n/g,'<br>')}</div>`;

    case 'comparaison':return `
      ${c.intro?`<section class="m-block"><p>${mdBold(c.intro)}</p></section>`:''}
      <div class="m-do">
        <div class="m-do-col ok"><h5>Plutôt</h5><ul>${(c.plutot||[]).filter(x=>x.trim()).map(x=>`<li>${mdBold(x)}</li>`).join('')}</ul></div>
        <div class="m-do-col ko"><h5>À éviter</h5><ul>${(c.eviter||[]).filter(x=>x.trim()).map(x=>`<li>${mdBold(x)}</li>`).join('')}</ul></div>
      </div>`;

    case 'essayer':return `<div class="m-try">
      <div class="m-try-label">${esc(c.label||'À essayer cette semaine')}</div>
      ${c.titre?`<h3>${esc(c.titre)}</h3>`:''}
      <ol class="m-try-list">${(c.etapes||[]).map(e=>`<li>${e.titre?`<strong>${esc(e.titre)}</strong> `:''}${mdBold(e.texte||'')}</li>`).join('')}</ol>
      ${c.note?`<p class="m-try-note">${mdBold(c.note)}</p>`:''}</div>`;

    case 'image':return c.url?`<figure class="m-fig">
      <img src="${esc(c.url)}" alt="${esc(c.alt||'')}">
      ${c.legende?`<figcaption>${esc(c.legende)}</figcaption>`:''}</figure>`:'';
  }
  return '';
}

function moduleHTML(){
  const corps=curBlocs.map(blocHTML).join('\n');
  return `<div class="container">
    <div class="m-hero">
      <div class="m-tag">Thème : ${esc(curTheme.nom)}</div>
      <h2>${esc(curModule.titre)}</h2>
      ${curModule.accroche?`<p>${mdBold(curModule.accroche)}</p>`:''}
    </div>
    ${corps}
    <div class="m-end">
      <h3>Vous avez terminé ce module</h3>
      <p>Prenez le temps d'essayer ce qui vous a parlé, puis revenez-y si besoin.</p>
    </div>
    <p class="m-foot">Micro-formation Koalakids · ${esc(curTheme.nom)}</p>
  </div>`;
}

function previewModule(){
  const w=window.open('','_blank');
  if(!w)return alert('Le navigateur a bloqué la fenêtre d\'aperçu. Autorisez les fenêtres surgissantes pour ce site.');
  const base=document.querySelector('style').textContent;
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Aperçu — ${esc(curModule.titre)}</title>
    <style>${base}${MOD_CSS}</style></head>
    <body>
    <header class="app-header">
      <img class="header-logo" src="${document.getElementById('logo').src}" alt="Koalakids">
      <div class="header-title"><h1>${esc(curModule.titre)}</h1><p>Micro-formation · ${esc(curTheme.nom)}</p></div>
      <div class="header-score-chip">Aperçu</div>
    </header>
    ${moduleHTML()}</body></html>`);
  w.document.close();
}


boot();
