// Signale à l'équipe qu'une famille ou une stagiaire vient de déposer un
// document : une ligne dans depots_externes (visible dans « Ma journée ») et
// une notification push aux référentes de la crèche. Ne doit JAMAIS faire
// échouer le dépôt lui-même : tout est avalé et journalisé.
// deno-lint-ignore-file no-explicit-any

export async function signalerDepot(sb: any, d: {
  source: 'enfant' | 'stagiaire';
  creche_id: string | null;
  enfant_id?: string;
  stagiaire_id?: string;
  libelle: string;
  nom: string; // prénom de la personne concernée, pour le texte de la notification
}) {
  try {
    if (!d.creche_id) return;
    const { data: creche } = await sb.from('creches').select('org_id').eq('id', d.creche_id).maybeSingle();
    const { error } = await sb.from('depots_externes').insert({
      org_id: creche?.org_id ?? null,
      creche_id: d.creche_id,
      source: d.source,
      enfant_id: d.enfant_id ?? null,
      stagiaire_id: d.stagiaire_id ?? null,
      libelle: d.libelle,
    });
    if (error) { console.error('[depot-externe] insertion', error); return; }

    const { data: refs } = await sb.from('referents').select('id').eq('creche_id', d.creche_id);
    const ids = (refs ?? []).map((r: any) => r.id);
    if (!ids.length) return;
    const url = Deno.env.get('SUPABASE_URL')!;
    const cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    await fetch(`${url}/functions/v1/notify-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}`, apikey: cle },
      body: JSON.stringify({
        referent_ids: ids,
        title: d.source === 'enfant' ? 'Document déposé par une famille' : 'Document déposé par une stagiaire',
        body: `${d.nom} : ${d.libelle}`,
        url: './demandes.html',
        // Même tag pour une même personne : dix photos d'affilée = une seule
        // notification qui se met à jour, pas dix.
        tag: `depot-${d.enfant_id ?? d.stagiaire_id}`,
      }),
    });
  } catch (e) {
    console.error('[depot-externe]', e);
  }
}
