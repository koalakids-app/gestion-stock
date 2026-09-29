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
      // functions.invoke ne lève pas d'exception sur une erreur HTTP : elle est
      // renvoyée dans `error`. On la vérifie (avant, elle était ignorée en
      // silence, l'alerte pouvait donc échouer sans aucune trace) et on retente
      // une fois, la session pouvant ne pas être encore prête juste après le login.
      for (let essai = 1; essai <= 2; essai++) {
        try {
          const { error: errAlerte } = await sb.functions.invoke('envoyer-alerte-connexion', {
            body: { user_agent: navigator.userAgent },
          });
          if (!errAlerte) break;
          console.warn('[LoginAlert] envoi alerte (essai ' + essai + ')', errAlerte);
        } catch (e) {
          console.warn('[LoginAlert] envoi alerte (essai ' + essai + ')', e);
        }
        if (essai < 2) await new Promise(r => setTimeout(r, 1500));
      }
    }
  } catch (e) {
    console.warn('[LoginAlert]', e);
  }
}
