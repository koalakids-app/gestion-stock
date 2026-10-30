// Ajoute l'œil « afficher / masquer » sur les champs mot de passe qui n'en ont pas encore.
(function(){
  function toggle(input,btn){
    var voir=input.type==='password';
    input.type=voir?'text':'password';
    var icon=btn.querySelector('i');
    if(icon){icon.classList.toggle('ti-eye',!voir);icon.classList.toggle('ti-eye-off',voir);}
    btn.setAttribute('aria-label',voir?'Masquer le mot de passe':'Afficher le mot de passe');
  }
  function ajouter(input){
    if(input.dataset.pwdEye)return;
    input.dataset.pwdEye='1';
    var p=input.parentNode;
    if(p.querySelector('button'))return;
    var w=document.createElement('div');
    w.style.position='relative';
    p.insertBefore(w,input);
    w.appendChild(input);
    input.style.paddingRight='38px';
    input.style.boxSizing='border-box';
    if(!input.style.width)input.style.width='100%';
    var b=document.createElement('button');
    b.type='button';b.tabIndex=-1;
    b.setAttribute('aria-label','Afficher le mot de passe');
    b.style.cssText='position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#999;padding:4px;display:flex;align-items:center';
    b.innerHTML='<i class="ti ti-eye" style="font-size:17px"></i>';
    b.onclick=function(){toggle(input,b);};
    w.appendChild(b);
  }
  function init(){document.querySelectorAll('input[type="password"]').forEach(ajouter);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
