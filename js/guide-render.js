/* Rendu HTML d'un guide pour les parents (guides_parents + guides_parents_blocs).
   Partagé par guide.html (lecture publique par lien) et guides.html (aperçu de
   l'éditeur), pour que l'aperçu soit strictement celui que verront les parents. */
window.KKGuide=(function(){
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  // **gras** seulement : le reste est échappé, aucun HTML libre.
  function fmt(s){return esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');}
  function paras(s){
    return String(s||'').split(/\n{1,}/).map(x=>x.trim()).filter(Boolean).map(x=>'<p>'+fmt(x)+'</p>').join('');
  }
  function figure(im){
    if(!im||!im.url)return '';
    return '<figure class="g-fig"><img src="'+esc(im.url)+'" alt="'+esc(im.alt||im.legende||'')+'" loading="lazy">'
      +(im.legende?'<figcaption>'+esc(im.legende)+'</figcaption>':'')+'</figure>';
  }
  function bloc(b){
    const c=b.contenu||{};
    switch(b.type){
      case 'section':
        return '<h2 class="g-section"><span>✦</span> '+esc(c.titre||'')+'</h2>';
      case 'qr':{
        const imgs=(c.images||[]).filter(i=>i&&i.url);
        return '<article class="g-qr">'
          +'<div class="g-q"><div class="g-q-label">La question des parents</div><div class="g-q-text">'+esc(c.question||'')+'</div></div>'
          +(c.auteur?'<div class="g-who">La réponse de '+esc(c.auteur)+'</div>':'')
          +(c.accroche?'<div class="g-hook">'+esc(c.accroche)+'</div>':'')
          +paras(c.texte)
          +((c.points||[]).filter(Boolean).length?'<ul class="g-list">'+c.points.filter(Boolean).map(p=>'<li>'+fmt(p)+'</li>').join('')+'</ul>':'')
          +(c.reflexe?'<div class="g-reflex"><strong>'+esc(c.reflexe_titre||'Notre petit réflexe')+' : </strong>'+fmt(c.reflexe)+'</div>':'')
          +(imgs.length?'<div class="g-imgs n'+Math.min(imgs.length,3)+'">'+imgs.map(figure).join('')+'</div>':'')
          +'</article>';
      }
      case 'texte':
        return '<section class="g-texte">'+(c.titre?'<h3>'+esc(c.titre)+'</h3>':'')+paras(c.texte)+'</section>';
      case 'citation':
        return '<blockquote class="g-quote">'+esc(c.texte||'').replace(/\n/g,'<br>')+'</blockquote>';
      case 'image':
        return figure(c);
    }
    return '';
  }
  function render(g,blocs){
    return '<header class="g-cover">'
        +'<img class="g-banner" src="'+esc(g.banniere_url||'guide-banniere.jpg')+'" alt="">'
        +'<h1>Bienvenue</h1>'
        +'<div class="g-struct">dans l’univers de '+esc(g.structure||'la crèche')+'</div>'
        +(g.titre?'<div class="g-title">'+esc(g.titre)+'</div>':'')
        +(g.sous_titre?'<div class="g-sub">'+esc(g.sous_titre)+'</div>':'')
        +(g.accueil?'<div class="g-welcome"><strong>Un livret pour échanger</strong>'+paras(g.accueil)+'</div>':'')
      +'</header>'
      +(g.intro?'<section class="g-intro">'+paras(g.intro)+'</section>':'')
      +(blocs||[]).map(bloc).join('')
      +((g.conclusion||g.signature)?'<footer class="g-end">'+paras(g.conclusion)+(g.signature?'<div class="g-sign">'+esc(g.signature)+'</div>':'')+'</footer>':'');
  }
  const css=`
.g-doc{max-width:760px;margin:0 auto;color:#333;font-family:'Nunito',sans-serif;font-size:16px;line-height:1.65}
.g-doc p{margin:0 0 12px}
.g-cover{text-align:center;margin-bottom:28px}
.g-banner{width:100%;aspect-ratio:7/3;object-fit:cover;border-radius:18px;display:block;margin-bottom:22px}
.g-cover h1{font-family:'Baloo 2',cursive;font-size:44px;color:#33446B;line-height:1.1;margin:0}
.g-struct{font-family:'Baloo 2',cursive;font-size:28px;color:#8B52FF;line-height:1.2;margin:4px 0 14px}
.g-title{font-weight:800;font-size:19px;color:#FF66C3;margin-top:6px}
.g-sub{color:#E38B4E;font-weight:700;margin-top:4px}
.g-welcome{text-align:left;background:#F1EAFF;border-left:6px solid #8B52FF;border-radius:0 14px 14px 0;padding:16px 20px;margin-top:22px}
.g-welcome strong{display:block;font-family:'Baloo 2',cursive;font-size:19px;color:#33446B;margin-bottom:4px}
.g-welcome p:last-child{margin:0}
.g-intro{margin-bottom:8px}
.g-section{font-family:'Baloo 2',cursive;font-size:27px;color:#33446B;margin:38px 0 16px;padding-bottom:6px;border-bottom:3px solid #FF66C3;break-after:avoid}
.g-section span{color:#FF66C3}
.g-qr{margin-bottom:28px;break-inside:avoid-page}
.g-q{background:#FFE9F5;border-left:6px solid #FF66C3;border-radius:0 14px 14px 0;padding:14px 20px;margin-bottom:14px}
.g-q-label{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#FF66C3}
.g-q-text{font-family:'Baloo 2',cursive;font-size:21px;line-height:1.3;color:#33446B;margin-top:2px}
.g-who{font-weight:800;color:#8B52FF;margin-bottom:6px}
.g-hook{font-weight:800;color:#E38B4E;font-size:18px;margin-bottom:8px}
.g-list{margin:0 0 14px;padding-left:22px}
.g-list li{margin-bottom:5px}
.g-list li::marker{color:#FF66C3}
.g-reflex{background:#EAF3E8;border-left:6px solid #6A8C65;border-radius:0 14px 14px 0;padding:12px 18px;margin:8px 0 14px}
.g-reflex strong{color:#6A8C65}
.g-texte h3{font-family:'Baloo 2',cursive;color:#8B52FF;font-size:21px;margin:22px 0 8px}
.g-quote{text-align:center;font-family:'Baloo 2',cursive;font-size:23px;line-height:1.35;color:#33446B;background:#FFE9F5;border-radius:16px;padding:20px 24px;margin:26px 0}
.g-fig{margin:14px 0;text-align:center}
.g-fig img{max-width:100%;max-height:420px;border-radius:14px;display:inline-block}
.g-fig figcaption{font-size:13px;color:#8E8AA8;font-style:italic;margin-top:5px}
.g-imgs{display:grid;gap:12px;margin-top:12px}
.g-imgs.n2{grid-template-columns:1fr 1fr}
.g-imgs.n3{grid-template-columns:1fr 1fr 1fr}
.g-imgs .g-fig{margin:0}
.g-imgs .g-fig img{width:100%;max-height:260px;object-fit:cover}
@media(max-width:560px){.g-imgs.n2,.g-imgs.n3{grid-template-columns:1fr}.g-cover h1{font-size:34px}.g-struct{font-size:22px}}
.g-end{margin-top:36px;padding-top:18px;border-top:3px solid #FF66C3}
.g-sign{text-align:right;font-family:'Baloo 2',cursive;font-size:22px;color:#33446B;margin-top:10px}
`;
  return{render,css,esc};
})();
