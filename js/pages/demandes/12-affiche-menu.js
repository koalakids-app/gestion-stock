/* ══════════════════════════════════════════════════════════════════════════
   AFFICHE DU MENU (MCM › Menus › « Affiche QR »)

   Le référent édite une affiche A4 avec le QR code PERMANENT du menu (celui de
   menu.html sans date : il montre toujours la semaine en cours, donc l'affiche
   s'imprime une seule fois). Titre, message et pied de page sont modifiables ;
   l'aperçu se met à jour en direct. « Imprimer » imprime l'affiche seule (ou
   l'enregistre en PDF depuis la boîte d'impression du navigateur).
   QR généré localement (qrcodejs), aucun service tiers.
   ═════════════════════════════════════════════════════════════════════════ */
const AFFICHE_DEFAUTS={
  titre:'Le menu de la semaine',
  message:'Scannez ce QR code avec votre téléphone pour découvrir les repas de vos enfants.',
  pied:''
};
const AFFICHE_CLE='kk_affiche_menu';

function afficheLire(){
  try{
    const v=JSON.parse(localStorage.getItem(AFFICHE_CLE)||'null');
    if(v&&typeof v==='object')return Object.assign({},AFFICHE_DEFAUTS,v);
  }catch(e){}
  return Object.assign({},AFFICHE_DEFAUTS);
}
function afficheSauver(v){try{localStorage.setItem(AFFICHE_CLE,JSON.stringify(v));}catch(e){}}

/* QR en image (data URL) pour l'incruster dans l'affiche. Null si la
   bibliothèque n'est pas chargée. */
function afficheQrDataUrl(url){
  if(typeof QRCode!=='function')return null;
  const tmp=document.createElement('div');
  tmp.style.cssText='position:fixed;left:-9999px;top:0';
  document.body.appendChild(tmp);
  try{
    new QRCode(tmp,{text:url,width:640,height:640,correctLevel:QRCode.CorrectLevel.M});
    const c=tmp.querySelector('canvas');
    return c?c.toDataURL('image/png'):null;
  }catch(e){console.warn('QRCode lib KO',e);return null;}
  finally{tmp.remove();}
}

/* Document HTML complet de l'affiche (A4 portrait). Les textes saisis sont
   échappés ; les retours à la ligne sont conservés. */
function afficheHtml(v,qr){
  const base=location.origin+location.pathname.replace(/[^/]*$/,'');
  const t=function(s){return escHtml(s).replace(/\n/g,'<br>');};
  return'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Affiche menu</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:wght@600;800&display=swap" rel="stylesheet">'
    +'<style>'
    +'@page{size:A4;margin:0}'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'html,body{width:210mm;height:297mm}'
    +'body{font-family:Nunito,system-ui,sans-serif;color:#2B2740;background:#FDF8F2;display:flex;flex-direction:column;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.hd{background:#4A3F9F;color:#fff;text-align:center;padding:14mm 12mm 12mm}'
    +'.hd img{height:20mm;background:#fff;border-radius:4mm;padding:2mm 5mm}'
    +'.hd h1{font-family:"Baloo 2",system-ui,sans-serif;font-size:15mm;line-height:1.1;margin-top:7mm;font-weight:800}'
    +'.mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8mm 18mm;text-align:center}'
    +'.qr{background:#fff;border:2mm solid #F47920;border-radius:8mm;padding:7mm}'
    +'.qr img{display:block;width:100mm;height:100mm}'
    +'.msg{font-size:7mm;font-weight:800;line-height:1.35;margin-top:11mm;color:#4A3F9F}'
    +'.pied{background:#F47920;color:#fff;text-align:center;font-family:"Baloo 2",system-ui,sans-serif;font-size:7.5mm;font-weight:700;padding:7mm 12mm}'
    +'.pied:empty{display:none}'
    +'.nqr{width:100mm;height:100mm;display:flex;align-items:center;justify-content:center;font-size:4mm}'
    +'</style></head><body>'
    +'<div class="hd"><img src="'+base+'logo-koalakids.png" alt="Koala Kids"><h1>'+t(v.titre)+'</h1></div>'
    +'<div class="mid"><div class="qr">'+(qr?'<img src="'+qr+'" alt="QR code du menu">':'<div class="nqr">QR code indisponible</div>')+'</div>'
    +'<div class="msg">'+t(v.message)+'</div></div>'
    +'<div class="pied">'+t(v.pied)+'</div>'
    +'<div style="text-align:center;font-size:9px;color:#999;margin-top:14px">Application créée par David Bucari</div></body></html>';
}

function afficheMenuOuvrir(){
  const v=afficheLire();
  let crecheId=menuCrecheQr();
  let qr=afficheQrDataUrl(menuPublicUrl(null,crecheId));
  let ov=document.getElementById('modal-affiche-menu-wrap');
  if(ov)ov.remove();
  ov=document.createElement('div');
  ov.className='overlay';ov.id='modal-affiche-menu-wrap';
  ov.onclick=function(ev){if(ev.target===ov)closeModal('modal-affiche-menu-wrap');};
  ov.innerHTML='<div class="modal" style="max-width:860px;width:100%">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h3 style="margin:0"><i class="ti ti-qrcode"></i> Affiche du menu (QR code)</h3>'
    +'<button class="btn-cancel" onclick="closeModal(\'modal-affiche-menu-wrap\')" style="padding:4px 8px"><i class="ti ti-x"></i></button></div>'
    +'<div class="affiche-editeur">'
    +'<div class="affiche-champs">'
    +'<div class="fg"><label class="flabel">Titre</label><input class="finput" id="aff-titre" maxlength="60"/></div>'
    +'<div class="fg"><label class="flabel">Message</label><textarea class="finput" id="aff-message" rows="4" maxlength="200"></textarea></div>'
    +'<div class="fg"><label class="flabel">Pied de page (facultatif)</label><input class="finput" id="aff-pied" maxlength="80" placeholder="Ex. Crèche Koala Kids — Lyon 3e"/></div>'
    +menuCrecheSelectHtml('aff-creche',crecheId)
    +'<p style="font-size:12px;color:var(--muted);margin:0 0 10px">Le QR code est permanent : il affiche toujours le menu de la semaine en cours. Imprimez l\'affiche une seule fois.</p>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-primary" id="aff-imprimer"><i class="ti ti-printer"></i> Imprimer / PDF</button>'
    +'<button class="btn-cancel" id="aff-reset">Remettre les textes par défaut</button></div>'
    +'</div>'
    +'<div class="affiche-apercu" id="aff-apercu-wrap"><iframe id="aff-apercu" title="Aperçu de l\'affiche" style="width:794px;height:1123px;border:1px solid var(--border);background:#fff;transform-origin:top left"></iframe></div>'
    +'</div></div>';
  document.body.appendChild(ov);
  const champs={titre:document.getElementById('aff-titre'),message:document.getElementById('aff-message'),pied:document.getElementById('aff-pied')};
  const frame=document.getElementById('aff-apercu');
  const wrap=document.getElementById('aff-apercu-wrap');
  function valeurs(){return{titre:champs.titre.value,message:champs.message.value,pied:champs.pied.value};}
  function ajuster(){
    const s=Math.min(1,wrap.clientWidth/794);
    frame.style.transform='scale('+s+')';
    wrap.style.height=Math.round(1123*s)+'px';
  }
  function rendre(){frame.srcdoc=afficheHtml(valeurs(),qr);afficheSauver(valeurs());}
  function remplir(x){champs.titre.value=x.titre;champs.message.value=x.message;champs.pied.value=x.pied;}
  remplir(v);
  Object.keys(champs).forEach(function(k){champs[k].addEventListener('input',rendre);});
  const selC=document.getElementById('aff-creche');
  if(selC)selC.onchange=function(){crecheId=selC.value||null;qr=afficheQrDataUrl(menuPublicUrl(null,crecheId));rendre();};
  document.getElementById('aff-reset').onclick=function(){remplir(AFFICHE_DEFAUTS);rendre();};
  document.getElementById('aff-imprimer').onclick=function(){
    if(!qr){showBanner('QR code indisponible : rechargez la page.','error');return;}
    try{frame.contentWindow.focus();frame.contentWindow.print();}
    catch(e){console.warn('[Affiche menu] impression',e);showBanner('Impression impossible depuis cet appareil.','error');}
  };
  ov.classList.add('open');
  ajuster();
  window.addEventListener('resize',ajuster);
  rendre();
}
window.afficheMenuOuvrir=afficheMenuOuvrir;
