// Alerte de sécurité : prévient l'utilisateur quand SON compte se connecte
// depuis un appareil/navigateur jamais vu (protection en cas de vol de
// mot de passe). Appelé juste après qu'une connexion soit pleinement établie
// (mot de passe + MFA validés), sur toutes les pages avec login staff.
function kkDeviceId() {
  try {
    let id = localStorage.getItem('kk_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : ('dev-' + Date.now() + '-' + Math.random().toString(16).slice(2)));
      localStorage.setItem('kk_device_id', id);
    }
    return id;
  } catch (e) {
    // localStorage indisponible (navigation privée stricte, etc.) : identifiant
    // volatile, l'appareil sera donc considéré "nouveau" à chaque connexion.
    return 'dev-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
}

async function kkLoginAlertCheck(sb) {
  try {
    const { data: estNouveau, error } = await sb.rpc('kk_enregistrer_connexion', {
      p_device_id: kkDeviceId(),
      p_user_agent: navigator.userAgent,
    });
    if (error) { console.warn('[LoginAlert]', error); return; }
    if (estNouveau) {
      sb.functions.invoke('envoyer-alerte-connexion', {
        body: { user_agent: navigator.userAgent },
      }).catch(e => console.warn('[LoginAlert] envoi alerte', e));
    }
  } catch (e) {
    console.warn('[LoginAlert]', e);
  }
}
