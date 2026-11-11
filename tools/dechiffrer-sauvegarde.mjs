#!/usr/bin/env node
// Déchiffre une sauvegarde hebdomadaire Koala Kids (fichier .json.gz.enc reçu par e-mail).
//
//   BACKUP_ENCRYPTION_KEY='la phrase secrète' node tools/dechiffrer-sauvegarde.mjs sauvegarde-koalakids-2026-11-13.json.gz.enc
//
// Écrit sauvegarde-koalakids-2026-11-13.json.gz à côté, puis : gunzip sauvegarde-koalakids-2026-11-13.json.gz
// Format (supabase/functions/sauvegarde-hebdomadaire) : "KKB1" + sel(16) + IV(12) + AES-256-GCM (PBKDF2-SHA256, 250 000 tours).
import { readFileSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';

const [fichier] = process.argv.slice(2);
const phrase = process.env.BACKUP_ENCRYPTION_KEY || '';
if (!fichier || !phrase) {
  console.error("Usage : BACKUP_ENCRYPTION_KEY='...' node tools/dechiffrer-sauvegarde.mjs <fichier.json.gz.enc>");
  process.exit(2);
}
const buf = readFileSync(fichier);
if (buf.subarray(0, 4).toString() !== 'KKB1') { console.error('Format inconnu (en-tête KKB1 absent).'); process.exit(1); }
const sel = buf.subarray(4, 20), iv = buf.subarray(20, 32);
const corps = buf.subarray(32, buf.length - 16), tag = buf.subarray(buf.length - 16);
const cle = pbkdf2Sync(phrase, sel, 250000, 32, 'sha256');
try {
  const d = createDecipheriv('aes-256-gcm', cle, iv);
  d.setAuthTag(tag);
  const clair = Buffer.concat([d.update(corps), d.final()]);
  const sortie = fichier.replace(/\.enc$/, '');
  writeFileSync(sortie, clair);
  console.log('OK →', sortie);
} catch (e) {
  console.error('Échec du déchiffrement : mauvaise phrase secrète ou fichier abîmé.');
  process.exit(1);
}
