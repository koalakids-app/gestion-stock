/* Planning du parcours quiz : 16 quiz « profil » (8 sur le projet pédagogique, thèmes 1 à 8,
   8 sur les protocoles, thèmes 9 à 16), deux par semaine à partir du 26 octobre 2026, puis une
   semaine de rattrapage. Partagé par collaborateur.html (Mon espace) et employes.html (fiche,
   lecture seule pour la direction).
   Les quiz vivent dans le projet Supabase « quiz » (sbQuiz, défini par chaque page) : on les
   retrouve par leur titre « Thème N — … ». Un quiz non publié s'affiche « Bientôt disponible ».
   Pour décaler le planning : changer PLANNING_QUIZ.debut (un lundi) ou la liste des semaines. */
const PLANNING_QUIZ={
  debut:'2026-10-26',
  semaines:[
    {pedago:1,proto:9},{pedago:2,proto:13},{pedago:3,proto:11},{pedago:4,proto:10},
    {pedago:5,proto:16},{pedago:6,proto:14},{pedago:7,proto:15},{pedago:8,proto:12},
    {rattrapage:true}
  ],
  titres:{
    1:'Partenariat et confiance avec les familles',2:'Regard sur le jeune enfant et ses apprentissages',
    3:'Posture « port d\'attache »',4:'Posture « phare »',5:'Posture « boussole »',
    6:'Autonomie et soins d\'hygiène',7:'Repas',8:'Sommeil',
    9:'Premiers secours et urgences vitales',10:'Enfant malade, soins et médicaments',
    11:'Sécurité des lieux et situations d\'urgence',12:'Sorties',13:'Protection de l\'enfance',
    14:'Hygiène des locaux, du matériel et du personnel',15:'Alimentation et HACCP',16:'Cadre professionnel'
  }
};
const PlanningQuiz=(function(){
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const MOIS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  function jours(i){
    const d=new Date(PLANNING_QUIZ.debut+'T12:00:00');d.setDate(d.getDate()+7*i);
    const f=new Date(d);f.setDate(f.getDate()+(PLANNING_QUIZ.semaines[i].rattrapage?3:4));
    const lib=x=>x.getDate()+(x.getDate()===1?'er':'')+' '+MOIS[x.getMonth()];
    return{debut:iso(d),fin:iso(f),texte:d.getMonth()===f.getMonth()?d.getDate()+' – '+lib(f):lib(d)+' – '+lib(f)};
  }
  /* Thème N → quiz publié, d'après le titre « Thème N — … ». */
  function quizParTheme(quizzes){
    const m={};
    (quizzes||[]).forEach(q=>{const r=/^Th[èe]me\s+(\d+)\b/i.exec(q.titre||'');if(r)m[+r[1]]=q;});
    return m;
  }
  /* quizzes : [{id,titre}] publiés ; resultats : kk_resultats_par_ref ;
     lien(quizId) : lien personnel du quiz, ou null en lecture seule (vue direction). */
  function html(quizzes,resultats,lien){
    const parTheme=quizParTheme(quizzes);
    const faits=new Set((resultats||[]).map(r=>r.quiz_id));
    /* Un quiz republié ou remplacé change d'identifiant : on reconnaît aussi un résultat à son titre « Thème N — … ». */
    const themesFaits=new Set();
    (resultats||[]).forEach(r=>{const m=/^Th[èe]me\s+(\d+)\b/i.exec(r.quiz_titre||'');if(m)themesFaits.add(+m[1]);});
    const auj=iso(new Date());
    let nb=0,nbFaits=0;
    const ligneQuiz=(n,famille)=>{
      const q=parTheme[n],titre='Thème '+n+' · '+PLANNING_QUIZ.titres[n];
      const pastille='<span style="font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:20px;white-space:nowrap;background:'+(famille==='proto'?'var(--orange-bg,#FDEBDD)':'var(--violet-bg,#EDEAF8)')+';color:'+(famille==='proto'?'var(--orange)':'var(--violet)')+'">'+(famille==='proto'?'Protocoles':'Pédagogie')+'</span>';
      return{n,titre,q,pastille,fait:!!((q&&faits.has(q.id))||themesFaits.has(n))};
    };
    const lignes=PLANNING_QUIZ.semaines.map((s,i)=>{
      const j=jours(i),courante=auj>=j.debut&&auj<=j.fin,passee=auj>j.fin;
      let contenu;
      if(s.rattrapage){
        contenu='<div style="font-size:12.5px;color:var(--muted)">Rattrapage des quiz non passés, puis point en réunion d\'équipe.</div>';
      }else{
        contenu=[ligneQuiz(s.pedago,'pedago'),ligneQuiz(s.proto,'proto')].map(l=>{
          nb++;if(l.fait)nbFaits++;
          let droite;
          if(l.fait)droite='<span style="font-weight:700;font-size:11.5px;color:var(--green);white-space:nowrap"><i class="ti ti-check"></i> Fait</span>';
          else if(!l.q)droite='<span style="font-size:11.5px;color:var(--muted);white-space:nowrap">Bientôt disponible</span>';
          else if(!lien)droite='<span style="font-size:11.5px;font-weight:700;white-space:nowrap;color:'+(passee?'var(--red)':'var(--muted)')+'">'+(passee?'En retard':(courante?'À faire':'À venir'))+'</span>';
          else if(auj<j.debut)droite='<span style="font-size:11.5px;color:var(--muted);white-space:nowrap">À venir</span>';
          else droite='<a href="'+esc(lien(l.q.id))+'" target="_blank" rel="noopener" class="btn btn-p btn-sm" style="font-size:11.5px"><i class="ti ti-player-play"></i> '+(passee?'Passer (en retard)':'Passer le quiz')+'</a>';
          return'<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:4px 0"><div style="min-width:0;font-size:13px">'+l.pastille+' <span style="font-weight:600">'+esc(l.titre)+'</span></div>'+droite+'</div>';
        }).join('');
      }
      return'<div style="padding:9px 10px;border-bottom:1px solid var(--line);'+(courante?'background:var(--orange-bg,#FDEBDD);border-left:4px solid var(--orange);border-radius:8px;':'')+'">'
        +'<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted);font-weight:700"><span>'+(s.rattrapage?'Rattrapage':'Semaine '+(i+1))+(courante?' · cette semaine':'')+'</span><span>'+esc(j.texte)+'</span></div>'
        +contenu+'</div>';
    }).join('');
    return'<div style="font-size:12.5px;color:var(--muted);margin-bottom:6px"><strong>'+nbFaits+' quiz sur '+nb+'</strong> passés · deux par semaine, environ 10 minutes chacun, sans note</div>'+lignes;
  }
  /* Charge les quiz publiés et les résultats du `ref` puis remplit `box`.
     resultats : déjà chargés par la page (sinon on les demande). */
  async function charger(box,ref,lien,resultats){
    if(!box)return;
    box.innerHTML='<p class="hint">Chargement…</p>';
    try{
      const[qz,rs]=await Promise.all([
        sbQuiz.from('quiz').select('id,titre').eq('publie',true),
        resultats?Promise.resolve({data:resultats}):sbQuiz.rpc('kk_resultats_par_ref',{p_ref:ref})
      ]);
      if(qz.error)throw qz.error;
      if(rs.error)throw rs.error;
      box.innerHTML=html(qz.data||[],rs.data||[],lien);
    }catch(e){
      box.innerHTML='<p class="hint">Planning des quiz indisponible pour le moment.</p>';
    }
  }
  return{html,charger};
})();
