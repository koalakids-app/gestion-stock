/* ---------- DONNÉES DE DÉMO ---------- */
const JOURS=['Lun','Mar','Mer','Jeu','Ven'];
/* cap = agrément PMI, surn = plafond de surnombre (null = aucun),
   places[] = places contractées par jour (lun→ven) à aujourd'hui */
const CRECHES=[
  {id:1,nom:'Les Petits Loups',ville:'Lyon 3e',cap:12,surn:14,places:[12,12,11,12,10],enf:19,mois:[8,9,10,11,11,12,12,12,12,12,12,8]},
  {id:2,nom:'Les Écureuils',ville:'Villeurbanne',cap:12,surn:null,places:[11,11,10,11,9],enf:17,mois:[7,9,10,10,11,11,11,11,12,12,11,7]},
  {id:3,nom:'Les P\'tits Choux',ville:'Caluire',cap:10,surn:null,places:[8,9,6,8,7],enf:12,mois:[5,7,8,8,8,9,9,9,9,9,8,5]},
  {id:4,nom:'Les Coccinelles',ville:'Bron',cap:12,surn:null,places:[7,8,5,7,5],enf:11,mois:[4,6,7,7,8,8,8,9,9,9,8,4]},
  {id:5,nom:'Les Lutins',ville:'Vénissieux',cap:10,surn:null,places:[10,10,9,10,8],enf:14,mois:[6,8,9,10,10,10,10,10,10,10,9,6]},
  {id:6,nom:'Les Marmousets',ville:'Oullins',cap:12,surn:null,places:[5,6,4,5,3],enf:8,mois:[3,4,5,5,6,6,7,7,7,7,6,3]}
];
const MOIS=['Sept','Oct','Nov','Déc','Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août'];
const STATUTS=[['Contresigné',96,'#2E9E6B'],['Signé par la famille',14,'#7DBF9D'],['Envoyé, en attente',17,'#F47920'],['Brouillon',9,'#B8860B'],['Refusé / annulé',6,'#C62828']];
/* devis envoyés, acceptés, contrats créés, signés, délai moyen devis→signature (jours) */
const TRANSFO={1:[26,22,21,20,9],2:[24,19,18,17,11],3:[22,15,14,12,14],4:[28,15,13,11,16],5:[20,17,16,16,8],6:[24,12,10,8,19]};
const ECH=[
  ['12 nov.','Fin de contrat','Léo M.',2,'Les Petits Loups','Déménagement','Libère 3 j/sem.'],
  ['30 nov.','Entrée signée','Inès B.',4,'Les Coccinelles','','+ 4 j/sem.'],
  ['19 déc.','Fin de contrat','Hugo R.',1,'Les Écureuils','Fin d\'accueil','Libère 5 j/sem.'],
  ['02 janv.','Entrée signée','Jade P.',3,'Les P\'tits Choux','','+ 3 j/sem.'],
  ['31 janv.','Fin de contrat','Noah T.',5,'Les Marmousets','Rentrée scolaire anticipée','Libère 4 j/sem.']
];
const ATT=[
  ['Les Coccinelles',5,'Mer, Ven',5,4],['Les Marmousets',3,'Mer, Ven',7,3],
  ['Les Petits Loups',4,'Aucune (complet)',0,2],['Les P\'tits Choux',2,'Mer',4,1]
];

/* ---------- OUTILS ---------- */
const $=id=>document.getElementById(id);
const pct=(a,b)=>b?Math.round(a/b*100):0;
const classe=p=>p>100?'over':p>=90?'ok':p>=70?'mid':'low';
function jusque(an,date){ /* facteur de projection de démonstration */
  return date==='auj'?1:date==='jan'?0.96:0.83;
}
function crList(){const v=$('fCr').value;return v?CRECHES.filter(c=>String(c.id)===v):CRECHES;}
function moy(c,f){return c.places.reduce((s,x)=>s+x,0)/5*f;}
function onglet(w){
  $('panelContrats').style.display=w==='c'?'block':'none';
  $('panelStats').style.display=w==='s'?'block':'none';
  $('tabC').classList.toggle('on',w==='c');$('tabS').classList.toggle('on',w==='s');
}

/* ---------- RENDU ---------- */
function rendre(){
  const f=jusque($('fAn').value,$('fDate').value),L=crList();
  const cap=L.reduce((s,c)=>s+c.cap,0),occ=L.reduce((s,c)=>s+moy(c,f),0);
  const nbEnf=Math.round(L.reduce((s,c)=>s+c.enf,0)*f);
  const taux=pct(occ,cap);

  $('kpis').innerHTML=
   kpi('Taux de remplissage',taux+' %','<span class="'+(taux>=90?'up':'dn')+'">'+(taux>=90?'▲':'▼')+' 3 pts vs même date N-1</span>','hi','ti-gauge')+
   kpi('Enfants accueillis',nbEnf,'sur '+L.length+' crèche'+(L.length>1?'s':''),'','ti-baby-carriage')+
   kpi('Berceaux libres',Math.round(cap-occ),'moyenne sur la semaine','','ti-armchair')+
   kpi('Devis → contrat',pct(L.reduce((a,c)=>a+TRANSFO[c.id][3],0),L.reduce((a,c)=>a+TRANSFO[c.id][0],0))+' %','devis envoyés aboutis en contrat signé','','ti-filter')+
   kpi('Contrats à signer',26,'17 envoyés · 9 brouillons','','ti-signature')+
   kpi('À renouveler',11,'échéance &lt; 90 jours','','ti-refresh')+
   kpi('Heures / enfant / sem.',(31.4).toFixed(1).replace('.',',')+' h','durée contractuelle moyenne','','ti-clock');

  $('subRempl').textContent=cap+' berceaux agréés · '+Math.round(occ)+' occupés';

  /* remplissage par crèche, trié du moins au plus rempli */
  $('remplissage').innerHTML=L.slice().sort((a,b)=>moy(a,f)/a.cap-moy(b,f)/b.cap).map(c=>{
    const o=moy(c,f),p=pct(o,c.cap),k=classe(p);
    const max=c.surn||c.cap,echelle=Math.max(max*1.0,c.cap*1.15);
    const w=Math.min(o/echelle*100,100),mk=c.cap/echelle*100,mk2=c.surn?c.surn/echelle*100:null;
    return '<div class="cr"><div class="nm">'+c.nom+'<span>'+c.ville+' · '+c.enf+' enfants</span></div>'+
      '<div class="jauge"><div class="f c-'+k+'" style="width:'+w+'%"></div>'+
      '<div class="mk" style="left:'+mk+'%" data-l="'+c.cap+'"></div>'+
      (mk2?'<div class="mk" style="left:'+mk2+'%;opacity:.25" data-l="'+c.surn+' (115 %)"></div>':'')+'</div>'+
      '<div class="pc t-'+k+'">'+p+' %</div></div>';
  }).join('');

  /* carte de chaleur jours × crèches */
  let h='<tr><th></th>'+JOURS.map(j=>'<th>'+j+'</th>').join('')+'<th>Libres (moy.)</th></tr>';
  L.forEach(c=>{
    h+='<tr><td>'+c.nom+'</td>'+c.places.map(n=>{
      const v=Math.min(Math.round(n*f),c.cap+3),p=pct(v,c.cap),
        bg=p>100?'#F5C6C6':p>=90?'#BFE6D3':p>=70?'#FFE2C4':'#FBF0CF',
        co=p>100?'#C62828':p>=90?'#1E7A50':p>=70?'#B35A0E':'#8A6A0A';
      return '<td style="background:'+bg+';color:'+co+'">'+v+'<small>/ '+c.cap+'</small></td>';
    }).join('')+'<td style="color:var(--muted)">'+Math.max(0,(c.cap-moy(c,f))).toFixed(1).replace('.',',')+'</td></tr>';
  });
  $('heat').innerHTML=h;

  /* places libres par crèche et par période */
  const tri=$('fPer').value==='t';
  const per=tri?[['Sept–Nov',[0,1,2]],['Déc–Févr',[3,4,5]],['Mars–Mai',[6,7,8]],['Juin–Août',[9,10,11]]]:MOIS.map((m,i)=>[m,[i]]);
  const libre=(c,ix)=>c.cap-ix.reduce((a,i)=>a+c.mois[i],0)/ix.length*f;
  let lh='<tr><th></th>'+per.map(p=>'<th>'+p[0]+'</th>').join('')+'</tr>';
  L.forEach(c=>{lh+='<tr><td>'+c.nom+'<small style="display:block;font-weight:600;color:var(--muted)">'+c.cap+' berceaux</small></td>'+per.map(p=>{
    const v=libre(c,p[1]),r=Math.round(v),
      bg=v<0?'#F5C6C6':v<1.5?'#BFE6D3':v<3.5?'#FFE2C4':'#FBF0CF',
      co=v<0?'#C62828':v<1.5?'#1E7A50':v<3.5?'#B35A0E':'#8A6A0A';
    return '<td style="background:'+bg+';color:'+co+'">'+r+'</td>';}).join('')+'</tr>';});
  lh+='<tr><td style="border-top:2px solid var(--line)">Total</td>'+per.map(p=>'<td style="border-top:2px solid var(--line);color:var(--violet);font-family:\'Baloo 2\';font-size:15px">'+Math.round(L.reduce((a,c)=>a+libre(c,p[1]),0))+'</td>').join('')+'</tr>';
  $('libres').innerHTML=lh;

  /* devis -> contrat */
  const T=L.reduce((a,c)=>a.map((v,i)=>v+(i<4?TRANSFO[c.id][i]:0)),[0,0,0,0,0]);
  const dl=Math.round(L.reduce((a,c)=>a+TRANSFO[c.id][4]*TRANSFO[c.id][3],0)/Math.max(1,T[3]));
  const etapes=[['Devis envoyés',T[0],'#8E8AA8'],['Devis acceptés',T[1],'#F47920'],['Contrats créés',T[2],'#7B6FD0'],['Contrats signés',T[3],'#2E9E6B']];
  $('entonnoir').innerHTML=etapes.map((e,i)=>'<div class="hb" style="margin:9px 0"><span class="lab" style="width:112px">'+e[0]+'</span><span class="tr" style="height:22px;border-radius:11px"><b style="width:'+pct(e[1],T[0])+'%;background:'+e[2]+';border-radius:11px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-size:11.5px">'+e[1]+'</b></span><span class="v" style="width:92px;text-align:left">'+(i?'<span class="'+(pct(e[1],etapes[i-1][1])>=80?'up':'dn')+'">'+pct(e[1],etapes[i-1][1])+' %</span> de l\'étape préc.':'')+'</span></div>').join('')+
    '<div style="margin-top:12px;padding:10px 14px;border-radius:14px;background:var(--orange-l);display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:13px">Taux de réalisation global<br><span style="font-size:11.5px;color:var(--muted)">devis envoyé → contrat signé · délai moyen '+dl+' j</span></span><span style="font-family:\'Baloo 2\';font-size:30px;color:var(--orange)">'+pct(T[3],T[0])+' %</span></div>';
  $('transfo').innerHTML='<tr><th>Crèche</th><th class="r">Devis</th><th class="r">Signés</th><th class="r">Réalisation</th><th class="r">Délai</th></tr>'+
    L.slice().sort((a,b)=>TRANSFO[b.id][3]/TRANSFO[b.id][0]-TRANSFO[a.id][3]/TRANSFO[a.id][0]).map(c=>{const t=TRANSFO[c.id],p=pct(t[3],t[0]);
      return '<tr><td><b>'+c.nom+'</b></td><td class="r">'+t[0]+'</td><td class="r">'+t[3]+'</td><td class="r"><span class="tag '+(p>=75?'tg-g':p>=50?'tg-o':'tg-r')+'">'+p+' %</span></td><td class="r" style="color:var(--muted)">'+t[4]+' j</td></tr>';}).join('')+
    '<tr><td colspan="5" style="color:var(--muted);font-size:12px;border:none;padding-top:10px">Pertes : '+(T[0]-T[1])+' devis refusés ou sans réponse, '+(T[1]-T[2])+' acceptés sans contrat créé, '+(T[2]-T[3])+' contrats non signés.</td></tr>';

  graphiques(L,f);

  /* courbe SVG */
  $('courbe').innerHTML=courbe(L,f);

  /* statuts */
  const tot=STATUTS.reduce((s,x)=>s+x[1],0);
  $('statuts').innerHTML='<div class="seg">'+STATUTS.map(s=>'<div style="width:'+pct(s[1],tot)+'%;background:'+s[2]+'">'+(pct(s[1],tot)>7?s[1]:'')+'</div>').join('')+'</div>'+
    STATUTS.map(s=>'<div class="hb"><span class="lab"><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:'+s[2]+';margin-right:6px"></i>'+s[0]+'</span><span class="tr"><b style="width:'+pct(s[1],tot)+'%;background:'+s[2]+'"></b></span><span class="v">'+s[1]+'</span></div>').join('')+
    '<p class="hint" style="margin-top:10px">Délai moyen d\'envoi → signature : <b>4,2 jours</b> · contrats envoyés depuis plus de 10 jours : <span class="tag tg-r">5 à relancer</span></p>';

  /* profil */
  const bars=[['Temps plein (5 j)',38],['4 jours',27],['3 jours',21],['1 à 2 jours',14]];
  const ages=[['0–12 mois',16],['12–24 mois',44],['24–36 mois',32],['> 36 mois',8]];
  $('profil').innerHTML='<b style="font-size:12px;color:var(--muted)">JOURS CONTRACTÉS / SEMAINE</b>'+
    bars.map(b=>hb(b[0],b[1])).join('')+
    '<b style="font-size:12px;color:var(--muted);display:block;margin-top:12px">TRANCHES D\'ÂGE</b>'+
    ages.map(b=>hb(b[0],b[1])).join('')+
    '<p class="hint" style="margin-top:10px">Reste à charge moyen : <b>312 €/mois</b> · CMG moyen : <b>486 €/mois</b></p>';

  /* échéances */
  const E=ECH.filter(r=>!$('fCr').value||CRECHES.find(c=>String(c.id)===$('fCr').value).nom===r[4]);
  $('echeances').innerHTML='<tr><th>Date</th><th>Événement</th><th>Enfant</th><th>Crèche</th><th>Motif</th><th class="r">Effet</th></tr>'+
    (E.length?E.map(r=>'<tr><td><b>'+r[0]+'</b></td><td><span class="tag '+(r[1][0]==='F'?'tg-a':'tg-g')+'">'+r[1]+'</span></td><td>'+r[2]+'</td><td>'+r[4]+'</td><td style="color:var(--muted)">'+(r[5]||'—')+'</td><td class="r"><b>'+r[6]+'</b></td></tr>').join('')
    :'<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:18px">Aucune échéance pour cette crèche.</td></tr>');

  /* attente */
  $('attente').innerHTML='<tr><th>Crèche</th><th class="r">Familles en attente</th><th>Jours disponibles</th><th class="r">Berceaux libres</th><th class="r">Couverture</th></tr>'+
    ATT.map(r=>{const ok=r[3]>=r[1];return '<tr><td><b>'+r[0]+'</b></td><td class="r">'+r[1]+'</td><td>'+r[2]+'</td><td class="r">'+r[3]+'</td><td class="r"><span class="tag '+(ok?'tg-g':r[3]===0?'tg-r':'tg-o')+'">'+(ok?'Peut tout absorber':r[3]===0?'Complet':'Partielle')+'</span></td></tr>';}).join('');
}

function sousOnglet(w){
  $('subSynth').style.display=w==='s'?'block':'none';
  $('subGraph').style.display=w==='g'?'block':'none';
  $('stS').classList.toggle('on',w==='s');$('stG').classList.toggle('on',w==='g');
}
const PAL=['#4A3F9F','#F47920','#2E9E6B','#C2548F','#2F8FBF','#B8860B'];
const axe=(W,H,pl,pt,pb,max,step,fmt)=>{let o='';for(let g=0;g<=max;g+=step){const y=pt+(H-pt-pb)*(1-g/max);o+='<line x1="'+pl+'" x2="'+(W-8)+'" y1="'+y+'" y2="'+y+'" stroke="#EFE9F5"/><text x="'+(pl-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="#8E8AA8">'+g+(fmt||'')+'</text>';}return o;};
const leg=(items)=>'<div class="gl">'+items.map(i=>'<span><i style="background:'+i[1]+'"></i>'+i[0]+'</span>').join('')+'</div>';
function donut(parts,centre,sous){
  const R=70,r=46,cx=90,cy=90;let a=-Math.PI/2,o='<svg viewBox="0 0 180 180" style="width:100%;max-width:200px;display:block;margin:auto">';
  const tot=parts.reduce((x,p)=>x+p[1],0);
  parts.forEach(p=>{const d=p[1]/tot*2*Math.PI;if(d<=0)return;const x0=cx+R*Math.cos(a),y0=cy+R*Math.sin(a),x1=cx+R*Math.cos(a+d-.0001),y1=cy+R*Math.sin(a+d-.0001),
    x2=cx+r*Math.cos(a+d-.0001),y2=cy+r*Math.sin(a+d-.0001),x3=cx+r*Math.cos(a),y3=cy+r*Math.sin(a),big=d>Math.PI?1:0;
    o+='<path d="M'+x0+' '+y0+' A'+R+' '+R+' 0 '+big+' 1 '+x1+' '+y1+' L'+x2+' '+y2+' A'+r+' '+r+' 0 '+big+' 0 '+x3+' '+y3+' Z" fill="'+p[2]+'"/>';a+=d;});
  return o+'<text x="90" y="92" text-anchor="middle" font-size="26" font-weight="800" fill="#4A3F9F" style="font-family:\'Baloo 2\'">'+centre+'</text><text x="90" y="110" text-anchor="middle" font-size="10.5" font-weight="700" fill="#8E8AA8">'+sous+'</text></svg>';
}
function graphiques(L,f){
  const cap=L.reduce((s,c)=>s+c.cap,0),occ=L.reduce((s,c)=>s+moy(c,f),0);
  /* 1. donut remplissage */
  $('gDonutSub').textContent=Math.round(occ)+' / '+cap+' berceaux';
  $('gDonut').innerHTML=donut([['Occupés',occ,'#F47920'],['Libres',Math.max(0,cap-occ),'#EEECFA']],pct(occ,cap)+' %','remplis')+leg([['Occupés','#F47920'],['Libres','#D9D3F2']]);
  /* 2. barres empilées par crèche */
  const W=520,H=230,pl=30,pt=12,pb=44,mx=Math.max(...L.map(c=>c.cap))+2,bw=Math.min(46,(W-pl-10)/L.length*.6);
  let o='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">'+axe(W,H,pl,pt,pb,Math.ceil(mx/2)*2,2);
  const yy=v=>pt+(H-pt-pb)*(1-v/(Math.ceil(mx/2)*2));
  L.forEach((c,i)=>{const x=pl+(i+.5)*(W-pl-10)/L.length-bw/2,m=moy(c,f),k=m/c.cap>=.9?'#2E9E6B':m/c.cap>=.7?'#F47920':'#E0B14B';
    o+='<rect x="'+x+'" y="'+yy(m)+'" width="'+bw+'" height="'+(yy(0)-yy(m))+'" rx="4" fill="'+k+'"/>'+
       '<rect x="'+x+'" y="'+yy(c.cap)+'" width="'+bw+'" height="'+(yy(m)-yy(c.cap))+'" rx="4" fill="#EEECFA"/>'+
       '<text x="'+(x+bw/2)+'" y="'+(yy(c.cap)-4)+'" text-anchor="middle" font-size="10.5" font-weight="800" fill="#4A3F9F">'+pct(m,c.cap)+'%</text>'+
       '<text x="'+(x+bw/2)+'" y="'+(H-pb+14)+'" text-anchor="middle" font-size="10" fill="#555">'+c.nom.replace('Les ','').replace('P\'tits ','Ptits ').slice(0,11)+'</text>';});
  $('gStack').innerHTML=o+'</svg>'+leg([['Occupées (≥ 90 %)','#2E9E6B'],['Occupées (70–89 %)','#F47920'],['Occupées (< 70 %)','#E0B14B'],['Libres','#D9D3F2']]);
  /* 3. courbes par crèche */
  const W3=900,H3=250,p3=36,pt3=12,pb3=26,x3=i=>p3+i*(W3-p3-12)/11,y3=v=>pt3+(H3-pt3-pb3)*(1-Math.min(v,110)/110);
  o='<svg viewBox="0 0 '+W3+' '+H3+'" style="width:100%;height:auto">'+axe(W3,H3,p3,pt3,pb3,100,25,'%').replace(/y1="([\d.]+)"/g,'y1="$1"');
  /* l'axe ci-dessus est sur 0-100 : on le refait proprement */
  o='<svg viewBox="0 0 '+W3+' '+H3+'" style="width:100%;height:auto">';
  [0,25,50,75,100].forEach(g=>{o+='<line x1="'+p3+'" x2="'+(W3-12)+'" y1="'+y3(g)+'" y2="'+y3(g)+'" stroke="#EFE9F5"/><text x="'+(p3-6)+'" y="'+(y3(g)+4)+'" text-anchor="end" font-size="11" fill="#8E8AA8">'+g+'%</text>';});
  o+='<line x1="'+p3+'" x2="'+(W3-12)+'" y1="'+y3(90)+'" y2="'+y3(90)+'" stroke="#2E9E6B" stroke-dasharray="4 4"/>';
  MOIS.forEach((m,i)=>{o+='<text x="'+x3(i)+'" y="'+(H3-6)+'" text-anchor="middle" font-size="11" fill="#8E8AA8">'+m+'</text>';});
  L.forEach(c=>{const col=PAL[CRECHES.indexOf(c)%6];
    o+='<polyline fill="none" stroke="'+col+'" stroke-width="2.5" points="'+c.mois.map((v,i)=>x3(i)+','+y3(pct(v,c.cap))).join(' ')+'"/>'+
       c.mois.map((v,i)=>'<circle cx="'+x3(i)+'" cy="'+y3(pct(v,c.cap))+'" r="3" fill="'+col+'"/>').join('');});
  $('gLines').innerHTML=o+'</svg>'+leg(L.map(c=>[c.nom,PAL[CRECHES.indexOf(c)%6]]).concat([['objectif 90 %','#2E9E6B']]));
  /* 4. places libres du réseau par mois */
  const lib=MOIS.map((_,i)=>Math.round(L.reduce((a,c)=>a+(c.cap-c.mois[i]*f),0))),mxl=Math.max(...lib,4),W4=520,H4=230,p4=30,pt4=18,pb4=26,bw4=(W4-p4-10)/12*.62;
  const y4=v=>pt4+(H4-pt4-pb4)*(1-v/mxl);
  o='<svg viewBox="0 0 '+W4+' '+H4+'" style="width:100%;height:auto">'+axe(W4,H4,p4,pt4,pb4,mxl,Math.max(1,Math.ceil(mxl/5)));
  lib.forEach((v,i)=>{const x=p4+(i+.5)*(W4-p4-10)/12-bw4/2;
    o+='<rect x="'+x+'" y="'+y4(v)+'" width="'+bw4+'" height="'+(y4(0)-y4(v))+'" rx="3" fill="'+(i===1?'#F47920':'#B7B0E3')+'"/><text x="'+(x+bw4/2)+'" y="'+(y4(v)-4)+'" text-anchor="middle" font-size="10" font-weight="800" fill="#4A3F9F">'+v+'</text><text x="'+(x+bw4/2)+'" y="'+(H4-8)+'" text-anchor="middle" font-size="9.5" fill="#8E8AA8">'+MOIS[i]+'</text>';});
  $('gLibres').innerHTML=o+'</svg>'+leg([['Mois en cours','#F47920'],['Autres mois','#B7B0E3']]);
  /* 5. places par jour */
  const pj=JOURS.map((_,j)=>Math.round(L.reduce((a,c)=>a+c.places[j]*f,0))),W5=520,H5=230,p5=30,pt5=18,pb5=26,mx5=cap+2,y5=v=>pt5+(H5-pt5-pb5)*(1-v/mx5),bw5=(W5-p5-10)/5*.55;
  o='<svg viewBox="0 0 '+W5+' '+H5+'" style="width:100%;height:auto">'+axe(W5,H5,p5,pt5,pb5,Math.ceil(mx5/10)*10>mx5?mx5:mx5,Math.max(2,Math.round(mx5/5)));
  o+='<line x1="'+p5+'" x2="'+(W5-10)+'" y1="'+y5(cap)+'" y2="'+y5(cap)+'" stroke="#2B2740" stroke-dasharray="5 4"/><text x="'+(W5-10)+'" y="'+(y5(cap)-4)+'" text-anchor="end" font-size="10.5" font-weight="700" fill="#2B2740">capacité '+cap+'</text>';
  pj.forEach((v,j)=>{const x=p5+(j+.5)*(W5-p5-10)/5-bw5/2;o+='<rect x="'+x+'" y="'+y5(v)+'" width="'+bw5+'" height="'+(y5(0)-y5(v))+'" rx="4" fill="#4A3F9F"/><text x="'+(x+bw5/2)+'" y="'+(y5(v)-4)+'" text-anchor="middle" font-size="11" font-weight="800" fill="#4A3F9F">'+v+'</text><text x="'+(x+bw5/2)+'" y="'+(H5-8)+'" text-anchor="middle" font-size="11" fill="#8E8AA8">'+JOURS[j]+'</text>';});
  $('gJours').innerHTML=o+'</svg>';
  /* 6. devis vs contrats */
  const W6=520,H6=230,p6=30,pt6=24,pb6=44,mx6=Math.max(...L.map(c=>TRANSFO[c.id][0]))+2,y6=v=>pt6+(H6-pt6-pb6)*(1-v/mx6),gw=(W6-p6-10)/L.length,bw6=Math.min(22,gw*.32);
  o='<svg viewBox="0 0 '+W6+' '+H6+'" style="width:100%;height:auto">'+axe(W6,H6,p6,pt6,pb6,Math.ceil(mx6/5)*5,5);
  L.forEach((c,i)=>{const t=TRANSFO[c.id],x=p6+i*gw+gw/2;
    o+='<rect x="'+(x-bw6-1)+'" y="'+y6(t[0])+'" width="'+bw6+'" height="'+(y6(0)-y6(t[0]))+'" rx="3" fill="#B7B0E3"/><rect x="'+(x+1)+'" y="'+y6(t[3])+'" width="'+bw6+'" height="'+(y6(0)-y6(t[3]))+'" rx="3" fill="#2E9E6B"/>'+
       '<text x="'+x+'" y="'+(y6(t[0])-5)+'" text-anchor="middle" font-size="10.5" font-weight="800" fill="#2E9E6B">'+pct(t[3],t[0])+'%</text><text x="'+x+'" y="'+(H6-pb6+14)+'" text-anchor="middle" font-size="10" fill="#555">'+c.nom.replace('Les ','').replace('P\'tits ','Ptits ').slice(0,11)+'</text>';});
  $('gDevis').innerHTML=o+'</svg>'+leg([['Devis envoyés','#B7B0E3'],['Contrats signés','#2E9E6B']]);
  /* 7. donut statuts */
  const tt=STATUTS.reduce((a,x)=>a+x[1],0);
  $('gStat').innerHTML=donut(STATUTS.map(x=>[x[0],x[1],x[2]]),tt,'contrats')+leg(STATUTS.map(x=>[x[0]+' ('+x[1]+')',x[2]]));
}
function kpi(l,n,s,cl,ic){return '<div class="kpi '+cl+'"><div class="l"><i class="ti '+ic+'"></i>'+l+'</div><div class="n">'+n+'</div><div class="s">'+s+'</div></div>';}
function hb(l,v){return '<div class="hb"><span class="lab">'+l+'</span><span class="tr"><b style="width:'+v*2+'%"></b></span><span class="v">'+v+' %</span></div>';}

function courbe(L,f){
  const W=900,H=230,pl=38,pr=12,pt=14,pb=26,pw=W-pl-pr,ph=H-pt-pb;
  const capT=L.reduce((s,c)=>s+c.cap,0);
  const tot=MOIS.map((_,i)=>pct(L.reduce((s,c)=>s+c.mois[i],0),capT));
  const x=i=>pl+i*pw/11,y=p=>pt+ph-(Math.min(p,110)/110)*ph;
  let s='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">';
  [0,25,50,75,100].forEach(g=>{s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(g)+'" y2="'+y(g)+'" stroke="#EFE9F5"/><text x="'+(pl-6)+'" y="'+(y(g)+4)+'" text-anchor="end" font-size="11" fill="#8E8AA8">'+g+'%</text>';});
  s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(90)+'" y2="'+y(90)+'" stroke="#2E9E6B" stroke-dasharray="4 4"/><text x="'+(W-pr)+'" y="'+(y(90)-4)+'" text-anchor="end" font-size="10.5" fill="#2E9E6B" font-weight="700">objectif 90 %</text>';
  MOIS.forEach((m,i)=>{s+='<text x="'+x(i)+'" y="'+(H-6)+'" text-anchor="middle" font-size="11" fill="#8E8AA8">'+m+'</text>';});
  /* mois en cours (octobre = index 1) : réel avant, projeté après */
  const cut=1;
  const pts=tot.map((p,i)=>[x(i),y(p)]);
  const reel=pts.slice(0,cut+1).map(p=>p.join(',')).join(' '),proj=pts.slice(cut).map(p=>p.join(',')).join(' ');
  s+='<polygon points="'+pl+','+y(0)+' '+pts.map(p=>p.join(',')).join(' ')+' '+x(11)+','+y(0)+'" fill="#F4792014"/>';
  s+='<polyline points="'+proj+'" fill="none" stroke="#F47920" stroke-width="2.5" stroke-dasharray="6 5"/>';
  s+='<polyline points="'+reel+'" fill="none" stroke="#F47920" stroke-width="3"/>';
  pts.forEach((p,i)=>{s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(i===cut?5.5:3.5)+'" fill="'+(i<=cut?'#F47920':'#fff')+'" stroke="#F47920" stroke-width="2"/>';
    if(i===cut||i===0||i===5||i===11)s+='<text x="'+p[0]+'" y="'+(p[1]-10)+'" text-anchor="middle" font-size="11.5" font-weight="800" fill="#4A3F9F">'+tot[i]+' %</text>';});
  s+='<text x="'+x(cut)+'" y="'+(pt+2)+'" text-anchor="middle" font-size="10" fill="#8E8AA8" font-weight="700">aujourd\'hui</text>';
  s+='</svg><div class="legend"><span><i style="background:#F47920"></i>Réel (contrats signés)</span><span><i style="background:#fff;border:2px solid #F47920"></i>Projeté (fins de contrat et entrées signées connues)</span></div>';
  return s;
}

$('fCr').innerHTML='<option value="">Toutes les crèches</option>'+CRECHES.map(c=>'<option value="'+c.id+'">'+c.nom+'</option>').join('');
rendre();
