/**
 * JusNat Pro — Script d'initialisation de la base de données
 * Usage : node scripts/setup-db.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const fs       = require('fs');
const path     = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function setup() {
  console.log('Connexion a la base de donnees...');
  const client = await pool.connect();

  try {
    // 1. Exécuter le schéma SQL
    console.log('Creation des tables...');
    const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log('Tables creees avec succes.');

    // 2. Créer l'administrateur par défaut
    const adminEmail = 'admin@jusnat.ci';
    const existing = await client.query('SELECT id FROM utilisateurs WHERE email = $1', [adminEmail]);

    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(
        'INSERT INTO utilisateurs (nom, email, password, role) VALUES ($1, $2, $3, $4)',
        ['Administrateur', adminEmail, hash, 'admin']
      );
      console.log('\nCompte administrateur cree :');
      console.log('  Email    : admin@jusnat.ci');
      console.log('  Mot de passe : admin123');
      console.log('  !! Changez ce mot de passe apres la premiere connexion !!');
    } else {
      console.log('Administrateur deja existant, ignore.');
    }

    // 3. Créer un vendeur de démonstration
    const vendeurEmail = 'vendeur@jusnat.ci';
    const existing2 = await client.query('SELECT id FROM utilisateurs WHERE email = $1', [vendeurEmail]);

    if (existing2.rows.length === 0) {
      const hash2 = await bcrypt.hash('vendeur123', 10);
      await client.query(
        'INSERT INTO utilisateurs (nom, email, password, role) VALUES ($1, $2, $3, $4)',
        ['Vendeur Demo', vendeurEmail, hash2, 'vendeur']
      );
      console.log('\nCompte vendeur cree :');
      console.log('  Email    : vendeur@jusnat.ci');
      console.log('  Mot de passe : vendeur123');
    }

    console.log('\nInitialisation terminee avec succes !');
    console.log('Vous pouvez demarrer le serveur avec : npm start');

  } catch (err) {
    console.error('Erreur lors de l\'initialisation :', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
