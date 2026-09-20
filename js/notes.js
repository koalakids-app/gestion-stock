// ══════════════ MODULE NOTES / PENSE-BÊTE ══════════════
let noteCache=[];

async function noteInit(){
  await noteLoad();
}

async function noteLoad(){
  const{data,error}=await sb.from('notes_libres').select('*').eq('user_id',currentUser.id).order('updated_at',{ascending:false});
  if(error){showBanner('Erreur chargement notes.','error');noteCache=[];}
  else noteCache=data||[];
  noteRender();
}

async function noteAdd(){
  const titre=(document.getElementById('note-new-titre').value||'').trim()||null;
  const contenu=(document.getElementById('note-new-contenu').value||'').trim();
  if(!contenu){document.getElementById('note-new-contenu').focus();return;}
  const row={user_id:currentUser.id,titre:titre,contenu:contenu};
  const{data,error}=await sb.from('notes_libres').insert(row).select().single();
  if(error){showBanner('Erreur ajout note.','error');return;}
  noteCache.unshift(data);
  document.getElementById('note-new-titre').value='';
  document.getElementById('note-new-contenu').value='';
  noteRender();
  showBanner('Note ajoutée !');
}

async function noteSave(id){
  const n=noteCache.find(x=>x.id===id);if(!n)return;
  const titreEl=document.getElementById('note-titre-'+id);
  const contenuEl=document.getElementById('note-contenu-'+id);
  const titre=(titreEl.value||'').trim()||null;
  const contenu=(contenuEl.value||'').trim();
  if(!contenu){showBanner('Une note ne peut pas être vide.','error');return;}
  const{error}=await sb.from('notes_libres').update({titre:titre,contenu:contenu,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){showBanner('Erreur enregistrement note.','error');return;}
  n.titre=titre;n.contenu=contenu;n.updated_at=new Date().toISOString();
  showBanner('Note enregistrée.');
}

async function noteDelete(id){
  if(!confirm('Supprimer cette note ?'))return;
  const{error}=await sb.from('notes_libres').delete().eq('id',id);
  if(error){showBanner('Erreur suppression.','error');return;}
  noteCache=noteCache.filter(x=>x.id!==id);noteRender();
}

function noteCard(n){
  return '<div style="background:var(--card);border:1.5px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px">'
    +'<input class="finput" id="note-titre-'+n.id+'" type="text" value="'+escHtml(n.titre||'')+'" placeholder="Titre (facultatif)" style="font-weight:700;border:none;padding:2px 0;background:transparent"/>'
    +'<textarea class="finput" id="note-contenu-'+n.id+'" rows="3" style="resize:vertical;border:none;padding:2px 0;background:transparent">'+escHtml(n.contenu)+'</textarea>'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">'
      +'<span style="font-size:11px;color:var(--muted)">Modifiée le '+new Date(n.updated_at).toLocaleDateString('fr-FR')+'</span>'
      +'<div style="display:flex;gap:2px">'
        +'<button class="btn-sm" onclick="noteSave(\''+n.id+'\')"><i class="ti ti-device-floppy"></i> Enregistrer</button>'
        +'<button class="ibtn del" onclick="noteDelete(\''+n.id+'\')" title="Supprimer"><i class="ti ti-trash"></i></button>'
      +'</div>'
    +'</div>'
  +'</div>';
}

function noteRender(){
  const list=document.getElementById('note-list');
  if(!list)return;
  if(!noteCache.length){
    list.innerHTML='<div style="text-align:center;color:var(--muted);padding:30px;font-size:13px"><i class="ti ti-notes" style="font-size:28px;display:block;margin-bottom:6px;opacity:0.5"></i>Aucune note pour le moment.</div>';
    return;
  }
  list.innerHTML=noteCache.map(noteCard).join('');
}
