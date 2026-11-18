/* Lecteur PDF commun (pdf.js, cdnjs, chargé à la demande) pour les navigateurs sans visionneuse PDF intégrée.
   Chrome / Samsung Internet sur Android n'affichent pas un PDF dans une <iframe> : ils montrent une page avec un
   bouton « Ouvrir » inactif pour une adresse blob:. Les autres navigateurs gardent l'<iframe> (impression, zoom natifs).
   Utilisation :
     if(KkPdfLecteur.utile()) KkPdfLecteur.rendre(zone, urlOuBlob);   // zone = élément défilant, de hauteur limitée
     KkPdfLecteur.annuler();                                          // à la fermeture : abandonne un dessin en cours
   Pages dessinées au défilement (IntersectionObserver), 120 pages maximum. */
(function(){
  var PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var pret=null,courant=0,docOuvert=null;
  function script(src){
    return new Promise(function(ok,ko){
      var sc=document.createElement('script');
      sc.src=src;sc.onload=ok;sc.onerror=function(){ko(new Error('lecteur PDF inaccessible'));};
      document.head.appendChild(sc);
    });
  }
  function charger(){
    if(window.pdfjsLib&&window.pdfjsWorker)return Promise.resolve();
    if(!pret)pret=script(PDFJS+'pdf.min.js').then(function(){return script(PDFJS+'pdf.worker.min.js');}).catch(function(e){pret=null;throw e;});
    return pret;
  }
  function utile(){
    var v=navigator.pdfViewerEnabled;
    return v===false||(v===undefined&&/Android/i.test(navigator.userAgent||''));
  }
  function annuler(){
    courant++;
    if(docOuvert){try{docOuvert.destroy();}catch(e){}docOuvert=null;}
  }
  function message(zone,texte,erreur){
    zone.innerHTML='<div style="padding:14px;text-align:center;font-size:13px;color:'+(erreur?'#9c2b2b':'#5d5880')+'">'+texte+'</div>';
  }
  async function rendre(zone,source,opt){
    opt=opt||{};
    annuler();
    var jeton=courant;
    message(zone,'Chargement du document…');
    try{
      await charger();
      var args;
      if(typeof source==='string')args={url:source};
      else args={data:new Uint8Array(source.arrayBuffer?await source.arrayBuffer():source)};
      var pdf=await window.pdfjsLib.getDocument(args).promise;
      if(jeton!==courant){pdf.destroy();return;}
      docOuvert=pdf;
      var total=Math.min(pdf.numPages,120);
      var p1=await pdf.getPage(1),base=p1.getViewport({scale:1}),ratio=base.height/base.width;
      zone.innerHTML='';
      var pages=[];
      for(var i=0;i<total;i++){
        var d=document.createElement('div');
        d.dataset.n=i+1;
        d.style.cssText='width:100%;margin:0 auto 8px;background:#fff;border-radius:6px;overflow:hidden;aspect-ratio:'+(1/ratio).toFixed(4);
        var c=document.createElement('canvas');
        c.style.cssText='width:100%;height:100%;display:block';
        d.appendChild(c);zone.appendChild(d);
        pages.push({d:d,c:c,etat:0});
      }
      if(pdf.numPages>total)zone.insertAdjacentHTML('beforeend','<div style="padding:10px;text-align:center;font-size:12px;color:#5d5880">'+(pdf.numPages-total)+' page(s) non affichée(s).</div>');
      var dessiner=async function(n){
        var P=pages[n-1];
        if(!P||P.etat!==0||jeton!==courant)return;
        P.etat=1;
        try{
          var page=await pdf.getPage(n);
          if(jeton!==courant)return;
          var px=Math.min(2200,Math.max(500,P.d.clientWidth*Math.min(window.devicePixelRatio||1,2)));
          var vp=page.getViewport({scale:px/page.getViewport({scale:1}).width});
          P.c.width=Math.floor(vp.width);P.c.height=Math.floor(vp.height);
          await page.render({canvasContext:P.c.getContext('2d'),viewport:vp}).promise;
          P.etat=2;
        }catch(e){P.etat=0;console.warn('[pdf-lecteur] page '+n,e);}
      };
      var obs=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)dessiner(+e.target.dataset.n);});},{root:zone,rootMargin:'700px 0px'});
      pages.forEach(function(P){obs.observe(P.d);});
      if(opt.apres)opt.apres(pdf);
    }catch(e){
      console.warn('[pdf-lecteur]',e);
      if(jeton===courant){
        message(zone,opt.messageErreur||'Le document ne peut pas s’afficher ici : utilisez « Ouvrir dans un onglet » ou « Télécharger ».',true);
        if(opt.surErreur)opt.surErreur(e);
      }
    }
  }
  window.KkPdfLecteur={utile:utile,rendre:rendre,annuler:annuler};
})();
