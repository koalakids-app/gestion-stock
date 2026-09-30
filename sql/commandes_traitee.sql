-- Commandes : marquage "vue et traitée" (bouton dans stock.html > Commandes).
-- NULL = pas encore vue/traitée ; sinon date/heure du marquage.
alter table public.commandes add column if not exists traitee_le timestamptz;
