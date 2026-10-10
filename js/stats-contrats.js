/* ============================================================================
   Onglet « Statistiques » de la page Contrats d'accueil (contrats.html)
   ----------------------------------------------------------------------------
   Tout se calcule dans le navigateur à partir de ce que la page a déjà chargé
   (CONTRATS, CRECHES, ENFANTS, DEMANDES) + les devis du réseau, lus à la
   première ouverture de l'onglet. Aucune table, aucune migration.

   Règles de lecture, pour que les chiffres restent explicables :
   - un berceau est OCCUPÉ à une date par un contrat signé, contresigné ou
     résilié dont la période couvre cette date. Un enfant n'occupe qu'un
     contrat à la fois : le plus récent à cette date l'emporte (c'est ce qui
     fait qu'un avenant remplace le contrat qu'il modifie, sans doublon) ;
   - un contrat résilié s'arrête au dernier jour de préavis, pas à date_fin ;
   - le taux de remplissage = places contractées en moyenne sur lundi→vendredi
     ÷ capacité agréée (creches.capacity). Une crèche sans capacité
     renseignée est écartée des taux, et signalée ;
   - les courbes et tableaux « par mois » sont mesurés au 15 de chaque mois :
     les contrats signés à venir et les fins de contrat connues y figurent donc.
   ============================================================================ */
(function(){
'use strict';

var SIGNES=['signe','contresigne','resilie'];
var JOURS_ABR=['Lun','Mar','Mer','Jeu','Ven'];
var MOIS_ABR=['Sept','Oct','Nov','Déc','Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août'];
var PAL=['#4A3F9F','#F47920','#2E9E6B','#C2548F','#2F8FBF','#B8860B','#7B6FD0','#6B8E23'];
var STATUT_COULEURS=[
  ['contresigne','Contresigné','#2E9E6B'],['signe','Signé par la famille','#7DBF9D'],
  ['envoye','Envoyé, en attente','#F47920'],['brouillon','Brouillon','#B8860B'],
  ['resilie','Résilié','#8E8AA8'],['autre','Refusé / annulé / expiré','#C62828']
];

var DEVIS_ALL=null,DEVIS_ERR=false,sousVue='s';
function $(id){return document.getElementById(id);}
function pct(a,b){return b?Math.round(a/b*100):0;}
function nom(s,n){s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s;}

/* ---------- LES CONTRATS DANS LE TEMPS ---------- */
function ds(x){return x?String(x).slice(0,10):'';}
function parentDe(c){
  if(!c.parent_contrat_id)return null;
  return CONTRATS.find(function(x){return String(x.id)===String(c.parent_contrat_id);})||null;
}
/* Un avenant prend effet à date_effet ; un contrat résilié s'arrête à la fin
   du préavis. Un avenant sans date_fin hérite de celle du contrat parent. */
function debutEff(c){return ds((c.type==='avenant'&&c.date_effet)||c.date_debut);}
function finEff(c){
  if(c.statut==='resilie'&&c.resilie_fin_preavis)return ds(c.resilie_fin_preavis);
  if(c.date_fin)return ds(c.date_fin);
  var p=parentDe(c);
  return p&&p.date_fin?ds(p.date_fin):'9999-12-31';
}
var PRE2ENF=null;
function cleEnfant(c){
  if(!PRE2ENF){
    PRE2ENF={};
    CONTRATS.forEach(function(x){if(x.enfant_id&&x.preinscription_id)PRE2ENF[String(x.preinscription_id)]=String(x.enfant_id);});
  }
  var e=c.enfant_id?String(c.enfant_id):(c.preinscription_id?PRE2ENF[String(c.preinscription_id)]:null);
  return e?'e'+e:'p'+c.preinscription_id;
}
/* Un contrat par enfant à la date d. */
function actifsAu(d){
  var par={};
  CONTRATS.forEach(function(c){
    if(SIGNES.indexOf(c.statut)<0)return;
    if(!debutEff(c)||debutEff(c)>d||finEff(c)<d)return;
    var k=cleEnfant(c);
    if(!par[k]||debutEff(c)>=debutEff(par[k]))par[k]=c;
  });
  return Object.keys(par).map(function(k){return par[k];});
}
function joursDe(c){
  return (c.jours||[]).map(Number).filter(function(j){return j>=1&&j<=5;});
}
/* {crecheId:[lun..ven]} : places contractées chaque jour. */
function occAu(d){
  var o={};
  CRECHES.forEach(function(c){o[c.id]=[0,0,0,0,0];});
  actifsAu(d).forEach(function(c){
    var a=o[c.creche_id];if(!a)return;
    joursDe(c).forEach(function(j){a[j-1]++;});
  });
  return o;
}
function moy(a){return a.reduce(function(s,x){return s+x;},0)/5;}
function capDe(c){return Number(c.capacity)||0;}
function surnDe(c){return Number(c.capacity_surnombre)||null;}

/* ---------- LE CONTEXTE CHOISI ---------- */
function contexte(){
  var a=Number($('stAn').value),crId=$('stCr').value;
  var scope=crId?CRECHES.filter(function(c){return String(c.id)===crId;}):CRECHES.slice();
  var L=scope.filter(function(c){return capDe(c)>0;});
  var sansCap=scope.filter(function(c){return capDe(c)<=0;});
  var mode=$('stDate').value,d;
  if(mode==='sep')d=debutAnnee(a);
  else if(mode==='jan')d=(a+1)+'-01-01';
  else{d=auj();if(d<debutAnnee(a))d=debutAnnee(a);if(d>finAnnee(a))d=finAnnee(a);}
  var mois=MOIS_ABR.map(function(m,i){
    return (a+(i<4?0:1))+'-'+String(((8+i)%12)+1).padStart(2,'0')+'-15';
  });
  return {a:a,crId:crId,L:L,sansCap:sansCap,d:d,mois:mois,occ:occAu(d),
          occMois:mois.map(occAu),today:auj()};
}
function dansScope(X,crecheId){
  return !X.crId||String(crecheId)===X.crId;
}

/* ---------- LES DEVIS ---------- */
async function chargerDevis(){
  if(DEVIS_ALL)return;
  try{
    var r=await sb.from('devis')
      .select('id,preinscription_id,creche_id,statut,envoye_le,repondu_le,created_at')
      .order('created_at');
    if(r.error)throw r.error;
    DEVIS_ALL=r.data||[];DEVIS_ERR=false;
  }catch(e){
    console.error('[stats devis]',e);DEVIS_ALL=[];DEVIS_ERR=true;
  }
}
function joursEntre(a,b){return Math.round((new Date(ds(b))-new Date(ds(a)))/86400000);}
/* Un dossier = une demande. On ne compte pas deux fois une famille qui a reçu
   deux devis : le taux dit « combien de familles ont signé », pas « combien
   de PDF sont partis ». */
function statsDevis(X){
  var groupes={};
  (DEVIS_ALL||[]).forEach(function(d){
    if(!d.envoye_le||['envoye','accepte','refuse','expire'].indexOf(d.statut)<0)return;
    (groupes[d.preinscription_id]=groupes[d.preinscription_id]||[]).push(d);
  });
  var T=[0,0,0,0],delais=[],parCr={};
  Object.keys(groupes).forEach(function(pid){
    var g=groupes[pid].sort(function(x,y){return ds(x.envoye_le).localeCompare(ds(y.envoye_le));});
    var premier=g[0],dernier=g[g.length-1];
    if(anneeScolaireDe(premier.envoye_le)!==X.a)return;
    if(!dansScope(X,dernier.creche_id))return;
    var acc=g.some(function(d){return d.statut==='accepte';});
    var cts=CONTRATS.filter(function(c){return String(c.preinscription_id)===String(pid)&&c.statut!=='annule';});
    var cree=acc&&cts.length>0;
    var sig=cts.filter(function(c){return SIGNES.indexOf(c.statut)>=0;});
    var k=String(dernier.creche_id);
    var p=parCr[k]=parCr[k]||[0,0,0,0,[]];
    T[0]++;p[0]++;
    if(acc){T[1]++;p[1]++;}
    if(cree){T[2]++;p[2]++;}
    if(acc&&sig.length){
      T[3]++;p[3]++;
      var rep=sig.map(function(c){return c.repondu_le;}).filter(Boolean).sort()[0];
      if(rep){var j=joursEntre(premier.envoye_le,rep);if(j>=0){delais.push(j);p[4].push(j);}}
    }
  });
  function m(l){return l.length?Math.round(l.reduce(function(s,x){return s+x;},0)/l.length):null;}
  return {T:T,delai:m(delais),parCr:parCr,m:m};
}

/* ---------- LES TRANCHES DE COULEUR ---------- */
function classe(p){return p>100?'over':p>=90?'ok':p>=70?'mid':'low';}
function kpi(l,n,s,cl,ic){
  return '<div class="kpi '+(cl||'')+'"><div class="l"><i class="ti '+ic+'"></i>'+l+'</div><div class="n">'+n+'</div><div class="s">'+s+'</div></div>';
}
function hb(l,v,tot,col){
  var p=pct(v,tot);
  return '<div class="hb"><span class="lab">'+l+'</span><span class="tr"><b style="width:'+p+'%'+(col?';background:'+col:'')+'"></b></span><span class="v">'+v+'</span></div>';
}
function vide(msg){return '<p class="hint" style="margin:8px 0">'+msg+'</p>';}
function dcourt(d){var p=ds(d).split('-');return p.length===3?p[2]+'/'+p[1]:'';}

/* ---------- LE RENDU ---------- */
async function statsRendre(){
  if(!CRECHES.length&&!CONTRATS.length){return;}
  await chargerDevis();
  var X=contexte();
  var L=X.L;
  var cap=L.reduce(function(s,c){return s+capDe(c);},0);
  var occ=L.reduce(function(s,c){return s+moy(X.occ[c.id]);},0);

  var note=$('stAvert');
  if(X.sansCap.length){
    note.style.display='block';
    note.innerHTML='<i class="ti ti-alert-triangle"></i> Capacité non renseignée, crèche écartée des taux : <b>'
      +X.sansCap.map(function(c){return esc(c.name);}).join(', ')
      +'</b>. À compléter dans Paramètres → Crèches.';
  }else note.style.display='none';

  if(!L.length){
    ['stKpis','stRempl','stHeat','stLibres','stCourbe'].forEach(function(id){$(id).innerHTML='';});
    $('stRempl').innerHTML=vide('Aucune crèche avec une capacité renseignée : les taux de remplissage ne peuvent pas être calculés.');
    return;
  }

  /* les contrats de l'année, hors avenants (un avenant n'est pas un contrat de plus) */
  var cAn=CONTRATS.filter(function(c){return c.type!=='avenant'&&contratDansAnnee(c,String(X.a))&&dansScope(X,c.creche_id);});
  var nBrouillon=cAn.filter(function(c){return c.statut==='brouillon';}).length;
  var nEnvoye=cAn.filter(function(c){return c.statut==='envoye';}).length;

  var actifs=actifsAu(X.d).filter(function(c){return dansScope(X,c.creche_id);});
  var heures=actifs.map(function(c){return Number(c.heures_hebdo);}).filter(function(v){return v>0;});
  var hMoy=heures.length?heures.reduce(function(s,x){return s+x;},0)/heures.length:null;

  /* même date, un an plus tôt */
  var dPrec=(Number(X.d.slice(0,4))-1)+X.d.slice(4);
  var occPrec=occAu(dPrec);
  var capPrec=L.reduce(function(s,c){return s+capDe(c);},0);
  var occP=L.reduce(function(s,c){return s+moy(occPrec[c.id]);},0);
  var delta=occP>0?Math.round(pct(occ,cap)-pct(occP,capPrec)):null;

  /* contrats qui se terminent sous 90 jours, sans suite connue */
  var h90=new Date(X.today);h90.setDate(h90.getDate()+90);
  var lim=h90.getFullYear()+'-'+String(h90.getMonth()+1).padStart(2,'0')+'-'+String(h90.getDate()).padStart(2,'0');
  var fins=actifsAu(X.today).filter(function(c){
    return dansScope(X,c.creche_id)&&finEff(c)>=X.today&&finEff(c)<=lim;
  });
  function aSuite(c){
    var k=cleEnfant(c),f=finEff(c);
    return CONTRATS.some(function(x){
      return x!==c&&x.type!=='avenant'&&cleEnfant(x)===k
        &&['annule','refuse','expire','resilie'].indexOf(x.statut)<0&&debutEff(x)>f;
    });
  }
  var aRenouveler=fins.filter(function(c){return !aSuite(c);}).length;

  var sd=statsDevis(X);
  var tauxDevis=pct(sd.T[3],sd.T[0]);

  $('stKpis').innerHTML=
    kpi('Taux de remplissage',pct(occ,cap)+' %',delta==null?'au '+dfr(X.d):
        '<span class="'+(delta>=0?'up':'dn')+'">'+(delta>=0?'▲ +':'▼ ')+delta+' pt'+(Math.abs(delta)>1?'s':'')+'</span> vs même date N-1','hi','ti-gauge')+
    kpi('Enfants accueillis',actifs.length,'au '+dfr(X.d),'','ti-baby-carriage')+
    kpi('Berceaux libres',nbFr(Math.round((cap-occ)*10)/10),'moyenne sur la semaine','','ti-armchair')+
    kpi('Devis → contrat',sd.T[0]?tauxDevis+' %':'—',sd.T[0]?sd.T[3]+' signés sur '+sd.T[0]+' devis envoyés':'aucun devis envoyé','','ti-filter')+
    kpi('Contrats à signer',nEnvoye+nBrouillon,nEnvoye+' envoyé'+(nEnvoye>1?'s':'')+' · '+nBrouillon+' brouillon'+(nBrouillon>1?'s':''),'','ti-signature')+
    kpi('À renouveler',aRenouveler,'échéance sous 90 jours','','ti-refresh')+
    kpi('Heures / enfant / sem.',hMoy==null?'—':nbFr(Math.round(hMoy*10)/10)+' h','durée contractuelle moyenne','','ti-clock');

  $('stSubRempl').textContent=nbFr(cap)+' berceaux agréés · '+nbFr(Math.round(occ*10)/10)+' occupés au '+dfr(X.d);

  /* remplissage par crèche, du moins au plus rempli */
  $('stRempl').innerHTML=L.slice().sort(function(a,b){return moy(X.occ[a.id])/capDe(a)-moy(X.occ[b.id])/capDe(b);}).map(function(c){
    var o=moy(X.occ[c.id]),cp=capDe(c),sn=surnDe(c),p=pct(o,cp),k=classe(p);
    var ech=Math.max(sn||cp,cp*1.15,o),w=Math.min(o/ech*100,100),mk=cp/ech*100,mk2=sn?sn/ech*100:null;
    var nEnf=actifsAu(X.d).filter(function(x){return String(x.creche_id)===String(c.id);}).length;
    return '<div class="cr"><div class="nm">'+esc(c.name)+'<span>'+nEnf+' enfant'+(nEnf>1?'s':'')+' · '+cp+' berceaux</span></div>'
      +'<div class="jauge"><div class="f c-'+k+'" style="width:'+w+'%"></div>'
      +'<div class="mk" style="left:'+mk+'%" data-l="'+cp+'"></div>'
      +(mk2?'<div class="mk" style="left:'+mk2+'%;opacity:.25" data-l="'+sn+' (surnombre)"></div>':'')+'</div>'
      +'<div class="pc t-'+k+'">'+p+' %</div></div>';
  }).join('');

  /* places par jour */
  var h='<tr><th></th>'+JOURS_ABR.map(function(j){return '<th>'+j+'</th>';}).join('')+'<th>Libres (moy.)</th></tr>';
  L.forEach(function(c){
    var cp=capDe(c);
    h+='<tr><td>'+esc(c.name)+'</td>'+X.occ[c.id].map(function(n){
      var p=pct(n,cp),bg=p>100?'#F5C6C6':p>=90?'#BFE6D3':p>=70?'#FFE2C4':'#FBF0CF',
          co=p>100?'#C62828':p>=90?'#1E7A50':p>=70?'#B35A0E':'#8A6A0A';
      return '<td style="background:'+bg+';color:'+co+'">'+n+'<small>/ '+cp+'</small></td>';
    }).join('')+'<td style="color:var(--muted)">'+nbFr(Math.round(Math.max(0,cp-moy(X.occ[c.id]))*10)/10)+'</td></tr>';
  });
  $('stHeat').innerHTML=h;

  /* places libres par crèche et par période */
  var tri=$('stPer').value==='t';
  var per=tri?[['Sept–Nov',[0,1,2]],['Déc–Févr',[3,4,5]],['Mars–Mai',[6,7,8]],['Juin–Août',[9,10,11]]]
             :MOIS_ABR.map(function(m,i){return [m,[i]];});
  function libre(c,ix){
    return capDe(c)-ix.reduce(function(a,i){return a+moy(X.occMois[i][c.id]);},0)/ix.length;
  }
  var lh='<tr><th></th>'+per.map(function(p){return '<th>'+p[0]+'</th>';}).join('')+'</tr>';
  L.forEach(function(c){
    lh+='<tr><td>'+esc(c.name)+'<small style="display:block;font-weight:600;color:var(--muted)">'+capDe(c)+' berceaux</small></td>'+per.map(function(p){
      var v=libre(c,p[1]),bg=v<0?'#F5C6C6':v<1.5?'#BFE6D3':v<3.5?'#FFE2C4':'#FBF0CF',
          co=v<0?'#C62828':v<1.5?'#1E7A50':v<3.5?'#B35A0E':'#8A6A0A';
      return '<td style="background:'+bg+';color:'+co+'">'+Math.round(v)+'</td>';
    }).join('')+'</tr>';
  });
  lh+='<tr><td style="border-top:2px solid var(--line)">Total</td>'+per.map(function(p){
    return '<td style="border-top:2px solid var(--line);color:var(--violet);font-family:\'Baloo 2\';font-size:15px">'
      +Math.round(L.reduce(function(a,c){return a+libre(c,p[1]);},0))+'</td>';
  }).join('')+'</tr>';
  $('stLibres').innerHTML=lh;

  /* évolution */
  $('stCourbe').innerHTML=courbeReseau(X,L,cap);

  /* état des contrats */
  var cnt={};STATUT_COULEURS.forEach(function(s){cnt[s[0]]=0;});
  cAn.forEach(function(c){cnt[cnt[c.statut]!=null?c.statut:'autre']++;});
  var tot=cAn.length;
  var signes=cAn.filter(function(c){return c.envoye_le&&c.repondu_le&&SIGNES.indexOf(c.statut)>=0;});
  var dl=signes.map(function(c){return joursEntre(c.envoye_le,c.repondu_le);}).filter(function(j){return j>=0;});
  var relances=cAn.filter(function(c){return c.statut==='envoye'&&c.envoye_le&&joursEntre(c.envoye_le,X.today)>10;}).length;
  $('stStatuts').innerHTML=tot?
    '<div class="seg">'+STATUT_COULEURS.map(function(s){
      var p=pct(cnt[s[0]],tot);return cnt[s[0]]?'<div style="width:'+p+'%;background:'+s[2]+'">'+(p>7?cnt[s[0]]:'')+'</div>':'';
    }).join('')+'</div>'
    +STATUT_COULEURS.map(function(s){
      return '<div class="hb"><span class="lab"><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:'+s[2]+';margin-right:6px"></i>'+s[1]+'</span><span class="tr"><b style="width:'+pct(cnt[s[0]],tot)+'%;background:'+s[2]+'"></b></span><span class="v">'+cnt[s[0]]+'</span></div>';
    }).join('')
    +'<p class="hint" style="margin-top:10px">'
    +(dl.length?'Délai moyen d\'envoi → signature : <b>'+nbFr(Math.round(dl.reduce(function(s,x){return s+x;},0)/dl.length*10)/10)+' jours</b> · ':'')
    +'envoyés depuis plus de 10 jours : <span class="tag '+(relances?'tg-r':'tg-g')+'">'+relances+' à relancer</span></p>'
    :vide('Aucun contrat sur cette année scolaire.');

  /* profil d'accueil */
  var nb=function(f){return actifs.filter(function(c){return f(joursDe(c).length);}).length;};
  var na=actifs.length;
  var bars=[['Temps plein (5 j)',nb(function(n){return n>=5;})],['4 jours',nb(function(n){return n===4;})],
            ['3 jours',nb(function(n){return n===3;})],['1 à 2 jours',nb(function(n){return n>=1&&n<=2;})]];
  var ages=[0,0,0,0],dref=new Date(X.d);
  actifs.forEach(function(c){
    var e=ENFANTS.find(function(x){return String(x.id)===String(c.enfant_id);});
    if(!e||!e.dob)return;
    var mois=(dref-new Date(e.dob))/(86400000*30.4375);
    ages[mois<12?0:mois<24?1:mois<36?2:3]++;
  });
  var reste=actifs.map(function(c){return c.reste_a_charge;}).filter(function(v){return v!=null&&v!=='';}).map(Number);
  var cmgs=actifs.map(function(c){return c.cmg_estime;}).filter(function(v){return v!=null&&v!=='';}).map(Number);
  function mo(l){return l.length?euro(l.reduce(function(s,x){return s+x;},0)/l.length):'—';}
  $('stProfil').innerHTML=na?
    '<b style="font-size:12px;color:var(--muted)">JOURS CONTRACTÉS / SEMAINE</b>'
    +bars.map(function(b){return hb(b[0],b[1],na);}).join('')
    +'<b style="font-size:12px;color:var(--muted);display:block;margin-top:12px">TRANCHES D\'ÂGE</b>'
    +[['0–12 mois',ages[0]],['12–24 mois',ages[1]],['24–36 mois',ages[2]],['> 36 mois',ages[3]]].map(function(b){return hb(b[0],b[1],na);}).join('')
    +'<p class="hint" style="margin-top:10px">Reste à charge moyen : <b>'+mo(reste)+'/mois</b> · CMG estimé moyen : <b>'+mo(cmgs)+'/mois</b></p>'
    :vide('Aucun enfant sous contrat à cette date.');

  /* échéances */
  var ev=[];
  fins.forEach(function(c){
    ev.push({d:finEff(c),t:'fin',c:c,renouv:aSuite(c)});
  });
  CONTRATS.forEach(function(c){
    if(c.type!=='initial'||SIGNES.indexOf(c.statut)<0||!dansScope(X,c.creche_id))return;
    if(debutEff(c)>X.today&&debutEff(c)<=lim)ev.push({d:debutEff(c),t:'entree',c:c});
  });
  ev.sort(function(a,b){return a.d.localeCompare(b.d);});
  function nomEnfant(c){
    var e=ENFANTS.find(function(x){return String(x.id)===String(c.enfant_id);});
    if(e)return (e.prenom||'')+' '+(e.nom||'').slice(0,1)+'.';
    var p=(DEMANDES||[]).find(function(x){return String(x.id)===String(c.preinscription_id);});
    return p?((p.prenom||'')+' '+(p.nom||'').slice(0,1)+'.'):'—';
  }
  $('stEcheances').innerHTML='<tr><th>Date</th><th>Événement</th><th>Enfant</th><th>Crèche</th><th>Motif</th><th class="r">Effet</th></tr>'
    +(ev.length?ev.slice(0,40).map(function(e){
      var n=joursDe(e.c).length,fin=e.t==='fin';
      return '<tr><td><b>'+dcourt(e.d)+'</b></td><td><span class="tag '+(fin?(e.renouv?'tg-v':'tg-a'):'tg-g')+'">'
        +(fin?(e.renouv?'Fin · renouvelé':'Fin de contrat'):'Entrée signée')+'</span></td><td>'+esc(nomEnfant(e.c))+'</td><td>'
        +esc(nomCreche(e.c.creche_id))+'</td><td style="color:var(--muted)">'+esc(e.c.statut==='resilie'?(e.c.resilie_motif||'Résiliation'):'—')
        +'</td><td class="r"><b>'+(fin?(e.renouv?'Reconduit':'Libère '+n+' j/sem.'):'+ '+n+' j/sem.')+'</b></td></tr>';
    }).join('')
    :'<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:18px">Aucune échéance dans les 90 jours.</td></tr>');

  /* devis → contrat */
  var T=sd.T;
  var etapes=[['Devis envoyés',T[0],'#8E8AA8'],['Devis acceptés',T[1],'#F47920'],['Contrats créés',T[2],'#7B6FD0'],['Contrats signés',T[3],'#2E9E6B']];
  if(DEVIS_ERR){
    $('stEntonnoir').innerHTML=vide('Les devis sont inaccessibles pour le moment : le taux de réalisation ne peut pas être calculé.');
    $('stTransfo').innerHTML='';
  }else if(!T[0]){
    $('stEntonnoir').innerHTML=vide('Aucun devis envoyé sur cette année scolaire.');
    $('stTransfo').innerHTML='';
  }else{
    $('stEntonnoir').innerHTML=etapes.map(function(e,i){
      var pp=i?pct(e[1],etapes[i-1][1]):0;
      return '<div class="hb" style="margin:9px 0"><span class="lab" style="width:112px">'+e[0]+'</span><span class="tr" style="height:22px;border-radius:11px"><b style="width:'+pct(e[1],T[0])+'%;background:'+e[2]+';border-radius:11px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-size:11.5px">'+e[1]+'</b></span><span class="v" style="width:92px;text-align:left">'
        +(i?'<span class="'+(pp>=80?'up':'dn')+'">'+pp+' %</span> de l\'étape préc.':'')+'</span></div>';
    }).join('')
    +'<div style="margin-top:12px;padding:10px 14px;border-radius:14px;background:var(--orange-l);display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:13px">Taux de réalisation global<br><span style="font-size:11.5px;color:var(--muted)">devis envoyé → contrat signé'+(sd.delai!=null?' · délai moyen '+sd.delai+' j':'')+'</span></span><span style="font-family:\'Baloo 2\';font-size:30px;color:var(--orange)">'+tauxDevis+' %</span></div>';
    var cles=Object.keys(sd.parCr).filter(function(k){return sd.parCr[k][0]>0;}).sort(function(a,b){
      return sd.parCr[b][3]/sd.parCr[b][0]-sd.parCr[a][3]/sd.parCr[a][0];});
    $('stTransfo').innerHTML='<tr><th>Crèche</th><th class="r">Devis</th><th class="r">Signés</th><th class="r">Réalisation</th><th class="r">Délai</th></tr>'
      +cles.map(function(k){var t=sd.parCr[k],p=pct(t[3],t[0]),dm=sd.m(t[4]);
        return '<tr><td><b>'+esc(nomCreche(k)||'—')+'</b></td><td class="r">'+t[0]+'</td><td class="r">'+t[3]+'</td><td class="r"><span class="tag '+(p>=75?'tg-g':p>=50?'tg-o':'tg-r')+'">'+p+' %</span></td><td class="r" style="color:var(--muted)">'+(dm!=null?dm+' j':'—')+'</td></tr>';}).join('')
      +'<tr><td colspan="5" style="color:var(--muted);font-size:12px;border:none;padding-top:10px">Pertes : '+(T[0]-T[1])+' devis refusés ou sans réponse, '+(T[1]-T[2])+' acceptés sans contrat créé, '+(T[2]-T[3])+' contrats non signés.</td></tr>';
  }

  /* demande face à la capacité */
  var occAuj=occAu(X.today),att={};
  (DEMANDES||[]).forEach(function(p){
    if(CONTRATS.some(function(c){return String(c.preinscription_id)===String(p.id)&&SIGNES.indexOf(c.statut)>=0;}))return;
    var dv=devisDe(p.id),k=String((dv&&dv.creche_id)||p.creche_id||'');
    if(!dansScope(X,k))return;
    att[k]=(att[k]||0)+1;
  });
  var ak=Object.keys(att);
  $('stAttente').innerHTML='<tr><th>Crèche</th><th class="r">Familles en attente</th><th>Jours disponibles</th><th class="r">Berceaux libres</th><th class="r">Couverture</th></tr>'
    +(ak.length?ak.map(function(k){
      var c=CRECHES.find(function(x){return String(x.id)===k;}),cp=c?capDe(c):0,oc=c?occAuj[c.id]:null;
      if(!c||!cp)return '<tr><td><b>'+esc(nomCreche(k)||'Crèche non précisée')+'</b></td><td class="r">'+att[k]+'</td><td colspan="3" style="color:var(--muted)">capacité inconnue</td></tr>';
      var jd=oc.map(function(n,i){return cp-n>=1?JOURS_ABR[i]:null;}).filter(Boolean);
      var lib=Math.max(0,cp-moy(oc)),ok=Math.floor(lib)>=att[k];
      return '<tr><td><b>'+esc(c.name)+'</b></td><td class="r">'+att[k]+'</td><td>'+(jd.length?jd.join(', '):'Aucune (complet)')+'</td><td class="r">'+nbFr(Math.round(lib*10)/10)+'</td><td class="r"><span class="tag '+(ok?'tg-g':Math.floor(lib)===0?'tg-r':'tg-o')+'">'+(ok?'Peut tout absorber':Math.floor(lib)===0?'Complet':'Partielle')+'</span></td></tr>';
    }).join(''):'<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:18px">Aucune famille en attente de contrat.</td></tr>');

  graphiques(X,L,cap,occ,sd,cnt,tot);
}

/* ---------- LES GRAPHIQUES (SVG, sans bibliothèque) ---------- */
function axe(W,H,pl,pt,pb,max,step,fmt){
  var o='';
  for(var g=0;g<=max;g+=step){
    var y=pt+(H-pt-pb)*(1-g/max);
    o+='<line x1="'+pl+'" x2="'+(W-8)+'" y1="'+y+'" y2="'+y+'" stroke="#EFE9F5"/><text x="'+(pl-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="#8E8AA8">'+g+(fmt||'')+'</text>';
  }
  return o;
}
function leg(items){
  return '<div class="gl">'+items.map(function(i){return '<span><i style="background:'+i[1]+'"></i>'+esc(i[0])+'</span>';}).join('')+'</div>';
}
function donut(parts,centre,sous){
  var R=70,r=46,cx=90,cy=90,a=-Math.PI/2;
  var tot=parts.reduce(function(x,p){return x+p[1];},0);
  var o='<svg viewBox="0 0 180 180" style="width:100%;max-width:200px;display:block;margin:auto">';
  if(tot<=0)o+='<circle cx="90" cy="90" r="58" fill="none" stroke="#EEECFA" stroke-width="24"/>';
  parts.forEach(function(p){
    var d=p[1]/tot*2*Math.PI;if(!(d>0))return;
    if(d>=2*Math.PI-0.001)d=2*Math.PI-0.001;
    var x0=cx+R*Math.cos(a),y0=cy+R*Math.sin(a),x1=cx+R*Math.cos(a+d),y1=cy+R*Math.sin(a+d),
        x2=cx+r*Math.cos(a+d),y2=cy+r*Math.sin(a+d),x3=cx+r*Math.cos(a),y3=cy+r*Math.sin(a),big=d>Math.PI?1:0;
    o+='<path d="M'+x0+' '+y0+' A'+R+' '+R+' 0 '+big+' 1 '+x1+' '+y1+' L'+x2+' '+y2+' A'+r+' '+r+' 0 '+big+' 0 '+x3+' '+y3+' Z" fill="'+p[2]+'"/>';
    a+=d;
  });
  return o+'<text x="90" y="92" text-anchor="middle" font-size="26" font-weight="800" fill="#4A3F9F" style="font-family:\'Baloo 2\'">'+centre+'</text><text x="90" y="110" text-anchor="middle" font-size="10.5" font-weight="700" fill="#8E8AA8">'+sous+'</text></svg>';
}
function courbeReseau(X,L,cap){
  var W=900,H=230,pl=38,pr=12,pt=14,pb=26,pw=W-pl-pr,ph=H-pt-pb;
  var tot=X.mois.map(function(_,i){
    return pct(L.reduce(function(s,c){return s+moy(X.occMois[i][c.id]);},0),cap);
  });
  function x(i){return pl+i*pw/11;}
  function y(p){return pt+ph-(Math.min(p,110)/110)*ph;}
  var s='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">';
  [0,25,50,75,100].forEach(function(g){s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(g)+'" y2="'+y(g)+'" stroke="#EFE9F5"/><text x="'+(pl-6)+'" y="'+(y(g)+4)+'" text-anchor="end" font-size="11" fill="#8E8AA8">'+g+'%</text>';});
  s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(90)+'" y2="'+y(90)+'" stroke="#2E9E6B" stroke-dasharray="4 4"/><text x="'+(W-pr)+'" y="'+(y(90)-4)+'" text-anchor="end" font-size="10.5" fill="#2E9E6B" font-weight="700">objectif 90 %</text>';
  MOIS_ABR.forEach(function(m,i){s+='<text x="'+x(i)+'" y="'+(H-6)+'" text-anchor="middle" font-size="11" fill="#8E8AA8">'+m+'</text>';});
  /* le mois en cours sépare le réel du projeté ; hors année en cours, tout est « réel » ou tout est « projeté » */
  var cut=X.mois.reduce(function(r,d,i){return d<=X.today?i:r;},-1);
  var pts=tot.map(function(p,i){return [x(i),y(p)];});
  var reel=cut>=0?pts.slice(0,cut+1):[],proj=cut<11?pts.slice(Math.max(cut,0)):[];
  s+='<polygon points="'+pl+','+y(0)+' '+pts.map(function(p){return p.join(',');}).join(' ')+' '+x(11)+','+y(0)+'" fill="#F4792014"/>';
  if(proj.length>1)s+='<polyline points="'+proj.map(function(p){return p.join(',');}).join(' ')+'" fill="none" stroke="#F47920" stroke-width="2.5" stroke-dasharray="6 5"/>';
  if(reel.length>1)s+='<polyline points="'+reel.map(function(p){return p.join(',');}).join(' ')+'" fill="none" stroke="#F47920" stroke-width="3"/>';
  pts.forEach(function(p,i){
    s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(i===cut?5.5:3.5)+'" fill="'+(i<=cut?'#F47920':'#fff')+'" stroke="#F47920" stroke-width="2"/>';
    if(i===cut||i===0||i===5||i===11)s+='<text x="'+p[0]+'" y="'+(p[1]-10)+'" text-anchor="middle" font-size="11.5" font-weight="800" fill="#4A3F9F">'+tot[i]+' %</text>';
  });
  if(cut>=0)s+='<text x="'+x(cut)+'" y="'+(pt+2)+'" text-anchor="middle" font-size="10" fill="#8E8AA8" font-weight="700">aujourd\'hui</text>';
  return s+'</svg><div class="legend"><span><i style="background:#F47920"></i>Réel (contrats signés)</span><span><i style="background:#fff;border:2px solid #F47920"></i>Projeté (fins de contrat et entrées signées connues)</span></div>';
}
function graphiques(X,L,cap,occ,sd,cnt,tot){
  var o,W,H,pl,pt,pb;
  /* 1. anneau de remplissage */
  $('stGDonutSub').textContent=nbFr(Math.round(occ*10)/10)+' / '+cap+' berceaux';
  $('stGDonut').innerHTML=donut([['Occupés',occ,'#F47920'],['Libres',Math.max(0,cap-occ),'#EEECFA']],pct(occ,cap)+' %','remplis')
    +leg([['Occupés','#F47920'],['Libres','#D9D3F2']]);

  /* 2. barres par crèche */
  W=520;H=230;pl=30;pt=12;pb=44;
  var mx=Math.max.apply(null,L.map(function(c){return Math.max(capDe(c),moy(X.occ[c.id]));}))+2,top=Math.ceil(mx/2)*2;
  var bw=Math.min(46,(W-pl-10)/L.length*.6);
  function yy(v){return pt+(H-pt-pb)*(1-v/top);}
  o='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">'+axe(W,H,pl,pt,pb,top,2);
  L.forEach(function(c,i){
    var xx=pl+(i+.5)*(W-pl-10)/L.length-bw/2,m=moy(X.occ[c.id]),cp=capDe(c),
        k=m/cp>=.9?'#2E9E6B':m/cp>=.7?'#F47920':'#E0B14B';
    o+='<rect x="'+xx+'" y="'+yy(Math.min(m,top))+'" width="'+bw+'" height="'+Math.max(0,yy(0)-yy(Math.min(m,top)))+'" rx="4" fill="'+k+'"/>'
      +(cp>m?'<rect x="'+xx+'" y="'+yy(cp)+'" width="'+bw+'" height="'+(yy(m)-yy(cp))+'" rx="4" fill="#EEECFA"/>':'')
      +'<text x="'+(xx+bw/2)+'" y="'+(yy(Math.max(cp,m))-4)+'" text-anchor="middle" font-size="10.5" font-weight="800" fill="#4A3F9F">'+pct(m,cp)+'%</text>'
      +'<text x="'+(xx+bw/2)+'" y="'+(H-pb+14)+'" text-anchor="middle" font-size="10" fill="#555">'+esc(nom(c.name.replace(/^Les? /i,''),11))+'</text>';
  });
  $('stGStack').innerHTML=o+'</svg>'+leg([['Occupées (≥ 90 %)','#2E9E6B'],['Occupées (70–89 %)','#F47920'],['Occupées (< 70 %)','#E0B14B'],['Libres','#D9D3F2']]);

  /* 3. courbes par crèche */
  var W3=900,H3=250,p3=36,pt3=12,pb3=26;
  function x3(i){return p3+i*(W3-p3-12)/11;}
  function y3(v){return pt3+(H3-pt3-pb3)*(1-Math.min(v,110)/110);}
  o='<svg viewBox="0 0 '+W3+' '+H3+'" style="width:100%;height:auto">';
  [0,25,50,75,100].forEach(function(g){o+='<line x1="'+p3+'" x2="'+(W3-12)+'" y1="'+y3(g)+'" y2="'+y3(g)+'" stroke="#EFE9F5"/><text x="'+(p3-6)+'" y="'+(y3(g)+4)+'" text-anchor="end" font-size="11" fill="#8E8AA8">'+g+'%</text>';});
  o+='<line x1="'+p3+'" x2="'+(W3-12)+'" y1="'+y3(90)+'" y2="'+y3(90)+'" stroke="#2E9E6B" stroke-dasharray="4 4"/>';
  MOIS_ABR.forEach(function(m,i){o+='<text x="'+x3(i)+'" y="'+(H3-6)+'" text-anchor="middle" font-size="11" fill="#8E8AA8">'+m+'</text>';});
  L.forEach(function(c,ci){
    var col=PAL[ci%PAL.length],v=X.occMois.map(function(om){return pct(moy(om[c.id]),capDe(c));});
    o+='<polyline fill="none" stroke="'+col+'" stroke-width="2.5" points="'+v.map(function(p,i){return x3(i)+','+y3(p);}).join(' ')+'"/>'
      +v.map(function(p,i){return '<circle cx="'+x3(i)+'" cy="'+y3(p)+'" r="3" fill="'+col+'"/>';}).join('');
  });
  $('stGLines').innerHTML=o+'</svg>'+leg(L.map(function(c,i){return [c.name,PAL[i%PAL.length]];}).concat([['objectif 90 %','#2E9E6B']]));

  /* 4. places libres du réseau par mois */
  var lib=X.mois.map(function(_,i){return Math.round(L.reduce(function(a,c){return a+(capDe(c)-moy(X.occMois[i][c.id]));},0));});
  var mxl=Math.max.apply(null,lib.concat([4])),W4=520,H4=230,p4=30,pt4=18,pb4=26,bw4=(W4-p4-10)/12*.62;
  function y4(v){return pt4+(H4-pt4-pb4)*(1-Math.max(v,0)/mxl);}
  var cutM=X.mois.reduce(function(r,d,i){return d<=X.today?i:r;},-1);
  o='<svg viewBox="0 0 '+W4+' '+H4+'" style="width:100%;height:auto">'+axe(W4,H4,p4,pt4,pb4,mxl,Math.max(1,Math.ceil(mxl/5)));
  lib.forEach(function(v,i){
    var xx=p4+(i+.5)*(W4-p4-10)/12-bw4/2;
    o+='<rect x="'+xx+'" y="'+y4(v)+'" width="'+bw4+'" height="'+(y4(0)-y4(v))+'" rx="3" fill="'+(i===cutM?'#F47920':'#B7B0E3')+'"/><text x="'+(xx+bw4/2)+'" y="'+(y4(v)-4)+'" text-anchor="middle" font-size="10" font-weight="800" fill="#4A3F9F">'+v+'</text><text x="'+(xx+bw4/2)+'" y="'+(H4-8)+'" text-anchor="middle" font-size="9.5" fill="#8E8AA8">'+MOIS_ABR[i]+'</text>';
  });
  $('stGLibres').innerHTML=o+'</svg>'+leg([['Mois en cours','#F47920'],['Autres mois','#B7B0E3']]);

  /* 5. places contractées par jour */
  var pj=JOURS_ABR.map(function(_,j){return L.reduce(function(a,c){return a+X.occ[c.id][j];},0);});
  var W5=520,H5=230,p5=30,pt5=18,pb5=26,mx5=Math.max(cap,Math.max.apply(null,pj))+2;
  function y5(v){return pt5+(H5-pt5-pb5)*(1-v/mx5);}
  var bw5=(W5-p5-10)/5*.55;
  o='<svg viewBox="0 0 '+W5+' '+H5+'" style="width:100%;height:auto">'+axe(W5,H5,p5,pt5,pb5,mx5,Math.max(2,Math.round(mx5/5)));
  o+='<line x1="'+p5+'" x2="'+(W5-10)+'" y1="'+y5(cap)+'" y2="'+y5(cap)+'" stroke="#2B2740" stroke-dasharray="5 4"/><text x="'+(W5-10)+'" y="'+(y5(cap)-4)+'" text-anchor="end" font-size="10.5" font-weight="700" fill="#2B2740">capacité '+cap+'</text>';
  pj.forEach(function(v,j){
    var xx=p5+(j+.5)*(W5-p5-10)/5-bw5/2;
    o+='<rect x="'+xx+'" y="'+y5(v)+'" width="'+bw5+'" height="'+(y5(0)-y5(v))+'" rx="4" fill="#4A3F9F"/><text x="'+(xx+bw5/2)+'" y="'+(y5(v)-4)+'" text-anchor="middle" font-size="11" font-weight="800" fill="#4A3F9F">'+v+'</text><text x="'+(xx+bw5/2)+'" y="'+(H5-8)+'" text-anchor="middle" font-size="11" fill="#8E8AA8">'+JOURS_ABR[j]+'</text>';
  });
  $('stGJours').innerHTML=o+'</svg>';

  /* 6. devis envoyés / contrats signés par crèche */
  var cles=L.map(function(c){return c;}).filter(function(c){return sd.parCr[String(c.id)];});
  if(DEVIS_ERR||!cles.length){
    $('stGDevis').innerHTML=vide(DEVIS_ERR?'Devis inaccessibles pour le moment.':'Aucun devis envoyé sur cette année scolaire.');
  }else{
    var W6=520,H6=230,p6=30,pt6=24,pb6=44,mx6=Math.max.apply(null,cles.map(function(c){return sd.parCr[String(c.id)][0];}))+2;
    function y6(v){return pt6+(H6-pt6-pb6)*(1-v/mx6);}
    var gw=(W6-p6-10)/cles.length,bw6=Math.min(22,gw*.32);
    o='<svg viewBox="0 0 '+W6+' '+H6+'" style="width:100%;height:auto">'+axe(W6,H6,p6,pt6,pb6,Math.ceil(mx6/5)*5,5);
    cles.forEach(function(c,i){
      var t=sd.parCr[String(c.id)],xx=p6+i*gw+gw/2;
      o+='<rect x="'+(xx-bw6-1)+'" y="'+y6(t[0])+'" width="'+bw6+'" height="'+(y6(0)-y6(t[0]))+'" rx="3" fill="#B7B0E3"/><rect x="'+(xx+1)+'" y="'+y6(t[3])+'" width="'+bw6+'" height="'+(y6(0)-y6(t[3]))+'" rx="3" fill="#2E9E6B"/>'
        +'<text x="'+xx+'" y="'+(y6(t[0])-5)+'" text-anchor="middle" font-size="10.5" font-weight="800" fill="#2E9E6B">'+pct(t[3],t[0])+'%</text><text x="'+xx+'" y="'+(H6-pb6+14)+'" text-anchor="middle" font-size="10" fill="#555">'+esc(nom(c.name.replace(/^Les? /i,''),11))+'</text>';
    });
    $('stGDevis').innerHTML=o+'</svg>'+leg([['Devis envoyés','#B7B0E3'],['Contrats signés','#2E9E6B']]);
  }

  /* 7. anneau des statuts */
  $('stGStat').innerHTML=tot?donut(STATUT_COULEURS.map(function(s){return [s[1],cnt[s[0]],s[2]];}),tot,'contrats')
    +leg(STATUT_COULEURS.filter(function(s){return cnt[s[0]];}).map(function(s){return [s[1]+' ('+cnt[s[0]]+')',s[2]];}))
    :vide('Aucun contrat sur cette année scolaire.');
}

/* ---------- L'ONGLET ---------- */
function statsSousVue(w){
  sousVue=w;
  $('stSynth').style.display=w==='s'?'block':'none';
  $('stGraph').style.display=w==='g'?'block':'none';
  $('stS').classList.toggle('on',w==='s');
  $('stG').classList.toggle('on',w==='g');
}
var statsInit=false;
function statsPreparer(){
  if(!statsInit){
    var a0=anneeScolaireDe(auj());
    $('stAn').innerHTML=[a0+1,a0,a0-1,a0-2].map(function(a){
      return '<option value="'+a+'"'+(a===a0?' selected':'')+'>Année '+libelleAnnee(a)+'</option>';
    }).join('');
    $('stCr').innerHTML='<option value="">Toutes les crèches</option>'
      +CRECHES.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+'</option>';}).join('');
    statsInit=true;
  }
}
function vueOnglet(w){
  $('vueContrats').style.display=w==='c'?'block':'none';
  $('vueStats').style.display=w==='s'?'block':'none';
  $('tabC').classList.toggle('on',w==='c');
  $('tabS').classList.toggle('on',w==='s');
  if(w==='s'){statsPreparer();statsRendre();}
}
/* Les données se rechargent (après un contrat créé, par exemple) : la
   projection des contrats par date est recalculée, pas gardée en cache. */
function statsInvalider(){PRE2ENF=null;if(statsInit&&$('vueStats').style.display!=='none')statsRendre();}

window.statsRendre=statsRendre;
window.statsSousVue=statsSousVue;
window.vueOnglet=vueOnglet;
window.statsInvalider=statsInvalider;
})();
