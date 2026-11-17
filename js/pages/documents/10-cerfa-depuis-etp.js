/* CERFA 17580*01 (section G) <- « Calcul des ETP et de l'encadrement ».
   Lit la dernière saisie du calcul pour la crèche choisie dans la CERFA et en
   déduit : direction, encadrement (sous-totaux 1 et 2), restauration/entretien,
   règle d'encadrement (H) et nombre de places (F).
   Préfixe c17Etp : ne pas réutiliser ce nom ailleurs (scripts à espace global commun). */

const C17ETP_CHAMPS=['g_dir_qualif','g_dir_etp','g_p1_profils','g_p1_etp','g_p2_profils','g_p2_etp','g_rest_etp','h_regle','f_places'];

function c17EtpHtml(){
  return '<div class="c17-etp" style="margin:10px 0;padding:10px 12px;border:1px dashed #9bb;border-radius:10px;background:#f4faf8">'
    +'<button type="button" class="btn sm" onclick="c17EtpRemplir()"><i class="ti ti-users"></i> Remplir depuis le calcul des ETP</button>'
    +'<div class="c17-aide" id="c17-etp-msg" style="margin-top:6px">Reprend la dernière saisie du document « Calcul des ETP et de l’encadrement » de cette crèche : direction, encadrement (qualifications et ETP), restauration / entretien et règle d’encadrement. Les valeurs restent modifiables.</div>'
    +'</div>';
}

function c17EtpMsg(t,ko){
  const m=document.getElementById('c17-etp-msg');
  if(m){m.textContent=t;m.style.color=ko?'#b3261e':'';}
}

/* convertit un état de calcul en valeurs de la CERFA (fonction pure, testable) */
function c17EtpValeurs(s){
  const r=etpCalc(s);
  const r2=x=>String(Math.round(x*100)/100);
  const ft=r.ft;
  /* heures d'encadrement par qualification ; l'entretien / la restauration est retiré au prorata */
  const enfTot=r.rows.reduce((a,x)=>a+x.enf,0);
  const f=enfTot>0?Math.max(0,(enfTot-r.repasH)/enfTot):0;
  const gr={p1:{},p2:{}};
  let e1=0,e2=0;
  r.rows.forEach((x,i)=>{
    /* catégorie 1 : règle en vigueur à ce jour (CAP AEPE > 2 ans comptés jusqu'au 31/08/2027, VAE engagée comprise après) */
    const avant=new Date()<new Date('2027-09-01T00:00:00');
    const cat1=!!(avant?x.av:x.ap);
    const g=cat1?gr.p1:gr.p2;
    const h=x.enf*f;
    if(cat1)e1+=h;else e2+=h;
    const lib=x.qual+(i===0?' (directrice, temps hors direction)':'')+(avant&&x.av&&x.qual.indexOf('CAP')===0?' — catégorie 1 jusqu’au 31/08/2027':'');
    g[lib]=(g[lib]||0)+1;
  });
  const txt=g=>Object.keys(g).map(k=>g[k]+' × '+k).join('\n');
  const v={
    g_dir_qualif:r.rows[0].qual,
    g_dir_etp:r2(r.dirEtp),
    g_p1_profils:txt(gr.p1),
    g_p1_etp:e1?r2(e1/ft):'0',
    g_p2_profils:txt(gr.p2),
    g_p2_etp:e2?r2(e2/ft):'0',
    g_rest_etp:r2(r.repasH/ft),
    h_regle:(+s.ratio===6||!(+s.ratio>0))?C17_ENCADR[1]:C17_ENCADR[0]
  };
  if(+s.places>0)v.f_places=String(Math.round(+s.places));
  return{v:v,r:r};
}

async function c17EtpRemplir(){
  const crecheId=crecheIdDuFormulaire();
  if(!crecheId)return c17EtpMsg('Choisissez d’abord la crèche concernée en haut du formulaire.',true);
  const doc=(DOCS||[]).find(d=>d.template_key==='calcul_etp');
  if(!doc)return c17EtpMsg('Le modèle « Calcul des ETP et de l’encadrement » n’existe pas encore dans Documents › Administratifs.',true);
  c17EtpMsg('Lecture du calcul…');
  const{data,error}=await sb.from('documents_reponses').select('donnees,updated_at')
    .eq('document_id',doc.id).eq('creche_id',crecheId).order('updated_at',{ascending:false}).limit(1);
  if(error)return c17EtpMsg('Lecture impossible : '+(error.message||'erreur'),true);
  if(!data||!data.length||!data[0].donnees||!data[0].donnees.etp_json)
    return c17EtpMsg('Aucun calcul enregistré pour cette crèche : ouvrez « Calcul des ETP et de l’encadrement », renseignez l’équipe puis revenez ici.',true);
  const s=etpCharger(data[0].donnees.etp_json);
  const cr=(CRECHES||[]).find(c=>c.id===crecheId);
  if(!(+s.places>0)&&cr&&cr.capacity)s.places=cr.capacity;
  const{v,r}=c17EtpValeurs(s);
  const deja=C17ETP_CHAMPS.filter(k=>c17Get(k)!==''&&c17Get(k)!==v[k]);
  if(deja.length&&!confirm('Des champs de l’équipe sont déjà remplis. Les remplacer par les valeurs du calcul des ETP ?'))
    return c17EtpMsg('Rien n’a été modifié.');
  C17ETP_CHAMPS.forEach(k=>{
    if(v[k]==null)return;
    const el=document.getElementById('ff_c17_'+k);if(!el)return;
    if(el.type==='hidden'){
      el.value=v[k];
      const g=document.getElementById('ffg_c17_'+k);
      if(g)Array.prototype.forEach.call(g.querySelectorAll('button'),b=>b.classList.toggle('on',b.dataset.v===v[k]));
    }else el.value=v[k];
  });
  c17Touch();
  const d=data[0].updated_at?new Date(data[0].updated_at).toLocaleDateString('fr-FR'):'';
  const alerte=r.ecart<-0.05?' Attention : le calcul montre un manque de '+(Math.round(-r.ecart*10)/10)+' h d’encadrement par semaine.':'';
  c17EtpMsg('Section G remplie d’après le calcul du '+d+' ('+r.n+' professionnel·les, '+(Math.round(r.etpTot*100)/100)+' ETP au total). Le soutien d’un·e EJE (appui) n’est pas compté.'+alerte,r.ecart<-0.05);
}
