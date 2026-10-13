/* MAQUETTE : données fictives. Une crèche = 5 jours (lun→ven) d'effectifs par code repas. */
const JOURS=['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI'],DATES=['19/10','20/10','21/10','22/10','23/10'];
const CRECHES={
  'Versailles':{
    bib:[1,1,1,1,0], bb:[2,2,3,2,2], m:[4,5,4,5,3], g:[11,12,9,12,10],
    bb6:[1,1,1,1,0], apmAbs:[1,1,0,1,1], sv:[1,1,1,1,1], spv:[0,1,0,0,0], sans:1,
    transmise:true},
  'Sèvres':{
    bib:[0,0,1,0,0], bb:[3,3,3,3,2], m:[5,5,6,5,5], g:[14,15,14,14,12],
    bb6:[0,0,0,0,0], apmAbs:[1,1,1,1,1], sv:[0,1,0,1,0], spv:[0,0,0,0,0], sans:0,
    transmise:false}
};
const ROWS=[
  ['bb6','Bébés - de 6 mois','(sans lait, sans sel, sans féculent)','#FFFECF'],
  ['bb18','Bébés (6 à 18 mois)','','#FFFECF'],
  ['grand','Grands (+ de 18 mois)','','#DEEAF6'],
  ['peri','Périscolaire 4/5 ans','','#E2EFDA'],
  ['temoin','REPAS TEMOIN','','#D9D9D9'],
  ['gbb','Goûters Bébés','(6 à 18 mois)','#FCE4D6'],
  ['ggr','Goûters Grands','(+ de 18 mois & périscol)','#FCE4D6'],
  ['bag','BAGUETTES TRADITION','(crèche livrée le matin uniquement)','#FFFFFF']
];
/* Le bon se déduit des effectifs : repas = présents le matin hors BIB ; M va avec les bébés,
   G avec les grands ; les sans-viande sont notés « +nSV ». */
Object.values(CRECHES).forEach(c=>{
  c.matin=c.bib.map((n,i)=>n+c.bb[i]+c.m[i]+c.g[i]);
  c.apm=c.matin.map((n,i)=>n-c.apmAbs[i]);
  c.cmd={bb6:c.bb6.map(String),
    bb18:c.bb.map((n,i)=>String(n+c.m[i]-c.bb6[i])),
    grand:c.g.map((n,i)=>c.sv[i]?(n-c.sv[i])+'+'+c.sv[i]+'SV':String(n)),
    peri:['','','','',''],temoin:Array(5).fill('OUI'),
    gbb:c.bb.map((n,i)=>String(Math.max(0,n+c.m[i]-c.bb6[i]-(i===0?1:0)))),
    ggr:c.g.map((n,i)=>String(n)),bag:['','','','','']};
});
const sum=a=>a.reduce((s,n)=>s+n,0);
const $=id=>document.getElementById(id);
const cell=(v,cls)=>'<td'+(cls?' class="'+cls+'"':'')+'>'+(v||'<span style="color:#D3CFE2">—</span>')+'</td>';

function vue(v){
  $('vCmd').style.display=v==='cmd'?'':'none';
  $('vPres').style.display=v==='pres'?'':'none';
  $('vAutre').style.display=v==='autre'?'':'none';
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  if(v==='cmd')$('tabC').classList.add('on');
}

function rendre(){
  const c=CRECHES[$('cr').value];
  const present=c.matin.map((m,i)=>Math.max(m,c.apm[i]));
  const lignes=[
    ['Enfants présents','journée ou demi-journée',present,''],
    ['Repas du midi','présents le matin',c.matin,''],
    ['Goûters','présents l\'après-midi',c.apm,'']
  ];
  const codes=[['G','grands',c.g],['M','moyens',c.m],['BB','bébés',c.bb],['BIB','biberon · exclu du bon',c.bib]];
  const regimes=c.sv.map((n,i)=>n+c.spv[i]);
  let h='<thead><tr><th>Effectifs</th>'+JOURS.map((j,i)=>'<th>'+j.slice(0,3)+'<small>'+DATES[i]+'</small></th>').join('')+'<th>Semaine</th></tr></thead><tbody>';
  lignes.forEach((l,k)=>{
    h+='<tr'+(k===1?' class="tot"':'')+'><td>'+l[0]+'<small>'+l[1]+'</small></td>'+l[2].map(n=>'<td>'+n+'</td>').join('')+'<td>'+sum(l[2])+'</td></tr>';
  });
  codes.forEach(k=>{
    h+='<tr'+(k[0]==='BIB'?' class="mut"':'')+'><td><i class="dot '+k[0].toLowerCase()+'"></i>'+k[0]+'<small>'+k[1]+'</small></td>'
      +k[2].map(n=>n?'<td>'+n+'</td>':'<td class="z">0</td>').join('')+'<td>'+sum(k[2])+'</td></tr>';
  });
  h+='<tr><td><i class="dot rg"></i>Régimes particuliers<small>SV sans viande · SPV sans porc/viande</small></td>'
    +c.sv.map((n,i)=>'<td>'+(regimes[i]?n+' SV'+(c.spv[i]?' · '+c.spv[i]+' SPV':''):'<span class="z">0</span>')+'</td>').join('')+'<td>'+sum(regimes)+'</td></tr></tbody>';
  $('effTab').innerHTML=h;

  const nbEnf=Math.max(...present);
  $('kpis').innerHTML=
    '<div class="kpi hi"><div class="l">Repas du midi</div><div class="n">'+sum(c.matin)+'</div></div>'
   +'<div class="kpi"><div class="l">Goûters</div><div class="n">'+sum(c.apm)+'</div></div>'
   +'<div class="kpi"><div class="l">Pic de la semaine</div><div class="n">'+nbEnf+'</div></div>'
   +'<div class="kpi"><div class="l">Régimes particuliers</div><div class="n">'+sum(regimes)+'</div></div>'
   +'<div class="kpi"><div class="l">Au biberon (exclus)</div><div class="n">'+sum(c.bib)+'</div></div>';
  $('warnSans').style.display=c.sans?'':'none';
  $('alerte').style.display=c.transmise?'':'none';

  let t='<thead><tr><th></th>'+JOURS.map((j,i)=>'<th>'+j+'<small>'+DATES[i]+'</small></th>').join('')+'</tr></thead><tbody>';
  ROWS.forEach(r=>{
    if(r[0]==='gbb'||r[0]==='bag')t+='<tr><td colspan="6" style="height:10px;border:none"></td></tr>';
    t+='<tr style="background:'+r[3]+'"><td class="l">'+r[1]+(r[2]?'<small>'+r[2]+'</small>':'')+'</td>'
      +c.cmd[r[0]].map(v=>'<td><input value="'+v+'"></td>').join('')+'</tr>';
  });
  $('cmdTab').innerHTML=t+'</tbody>';

  /* Rappel visuel : le total commandé (repas) doit retomber sur les effectifs hors BIB. */
  const cmdRepas=JOURS.map((_,i)=>['bb6','bb18','grand','peri'].reduce((s,k)=>s+(parseInt(c.cmd[k][i])||0)+(/\+(\d+)SV/.test(c.cmd[k][i])?parseInt(c.cmd[k][i].match(/\+(\d+)SV/)[1]):0),0));
  $('ecart').innerHTML='Contrôle : repas commandés <b>'+cmdRepas.join(' · ')+'</b> (lun → ven) pour <b>'+c.matin.map((m,i)=>m-c.bib[i]).join(' · ')+'</b> repas hors biberon dans les effectifs.';
}

Object.keys(CRECHES).forEach(n=>{const o=document.createElement('option');o.textContent=n;$('cr').appendChild(o);});
rendre();
