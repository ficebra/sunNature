/**
 * JusNat Pro — Serveur API
 * Node.js + Express + PostgreSQL
 */
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Pool }= require('pg');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changez_moi';

// =====================================================
// CONNEXION BASE DE DONNÉES
// =====================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Erreur PostgreSQL inattendue', err);
});

// =====================================================
// MIDDLEWARES
// =====================================================
app.use(cors());
app.use(express.json());

// Servir le fichier HTML statique depuis la racine
app.use(express.static(path.join(__dirname, 'public')));

// =====================================================
// MIDDLEWARE D'AUTHENTIFICATION JWT
// =====================================================
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Token manquant' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
  }
  next();
}

// =====================================================
// ROUTE SANTÉ
// =====================================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// =====================================================
// AUTHENTIFICATION
// =====================================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  try {
    const result = await pool.query(
      'SELECT * FROM utilisateurs WHERE email = $1 AND actif = true',
      [email]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Identifiants incorrects' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign(
      { id: user.id, nom: user.nom, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: { id: user.id, nom: user.nom, email: user.email, role: user.role }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { ancien, nouveau } = req.body;
  try {
    const result = await pool.query('SELECT password FROM utilisateurs WHERE id = $1', [req.user.id]);
    const valid  = await bcrypt.compare(ancien, result.rows[0].password);
    if (!valid) return res.status(400).json({ error: 'Ancien mot de passe incorrect' });
    const hash = await bcrypt.hash(nouveau, 10);
    await pool.query('UPDATE utilisateurs SET password = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/utilisateurs (admin)
app.get('/api/utilisateurs', authMiddleware, adminOnly, async (req, res) => {
  const r = await pool.query('SELECT id, nom, email, role, actif, created_at FROM utilisateurs ORDER BY created_at DESC');
  res.json(r.rows);
});

// POST /api/utilisateurs (admin — créer un vendeur)
app.post('/api/utilisateurs', authMiddleware, adminOnly, async (req, res) => {
  const { nom, email, password, role } = req.body;
  if (!nom || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO utilisateurs (nom, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, nom, email, role',
      [nom, email, hash, role || 'vendeur']
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/utilisateurs/:id (admin)
app.delete('/api/utilisateurs/:id', authMiddleware, adminOnly, async (req, res) => {
  await pool.query('UPDATE utilisateurs SET actif = false WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// =====================================================
// PRODUITS
// =====================================================

// GET /api/produits
app.get('/api/produits', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM produits WHERE actif = true ORDER BY id');
  res.json(r.rows);
});

// POST /api/produits (admin)
app.post('/api/produits', authMiddleware, adminOnly, async (req, res) => {
  const { nom, description, prix_vente, cout_prod, couleur, couleur2 } = req.body;
  if (!nom || !prix_vente) return res.status(400).json({ error: 'Nom et prix requis' });
  try {
    const r = await pool.query(
      `INSERT INTO produits (nom, description, prix_vente, cout_prod, couleur, couleur2)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nom, description, prix_vente, cout_prod || 0, couleur || '#1D9E75', couleur2 || '#0F6E56']
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/produits/:id (admin)
app.put('/api/produits/:id', authMiddleware, adminOnly, async (req, res) => {
  const { nom, description, prix_vente, cout_prod, couleur, couleur2 } = req.body;
  try {
    const r = await pool.query(
      `UPDATE produits SET nom=$1, description=$2, prix_vente=$3, cout_prod=$4,
       couleur=$5, couleur2=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [nom, description, prix_vente, cout_prod, couleur, couleur2, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Produit non trouvé' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/produits/:id (admin — soft delete)
app.delete('/api/produits/:id', authMiddleware, adminOnly, async (req, res) => {
  await pool.query('UPDATE produits SET actif = false, updated_at = NOW() WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// =====================================================
// STOCK
// =====================================================

// GET /api/stock
app.get('/api/stock', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM stock ORDER BY nom');
  // Ajouter le champ alerte calculé
  const rows = r.rows.map(s => ({
    ...s,
    alerte: parseFloat(s.stock_actuel) < parseFloat(s.seuil_alerte)
  }));
  res.json(rows);
});

// POST /api/stock — Ajouter une nouvelle matière
app.post('/api/stock', authMiddleware, adminOnly, async (req, res) => {
  const { nom, stock_actuel, unite, seuil_alerte, cout_unitaire } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  try {
    const r = await pool.query(
      `INSERT INTO stock (nom, stock_actuel, unite, seuil_alerte, cout_unitaire)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nom, stock_actuel || 0, unite || 'kg', seuil_alerte || 0, cout_unitaire || 0]
    );
    res.status(201).json({ ...r.rows[0], alerte: r.rows[0].stock_actuel < r.rows[0].seuil_alerte });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Cette matière existe déjà' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/stock/:id — Modifier une matière
app.put('/api/stock/:id', authMiddleware, adminOnly, async (req, res) => {
  const { nom, stock_actuel, unite, seuil_alerte, cout_unitaire } = req.body;
  try {
    const r = await pool.query(
      `UPDATE stock SET nom=$1, stock_actuel=$2, unite=$3, seuil_alerte=$4,
       cout_unitaire=$5, updated_at=NOW() WHERE id=$6 RETURNING *`,
      [nom, stock_actuel, unite, seuil_alerte, cout_unitaire, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Matière non trouvée' });
    const s = r.rows[0];
    res.json({ ...s, alerte: parseFloat(s.stock_actuel) < parseFloat(s.seuil_alerte) });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/stock/:id/approvisionner — Ajouter du stock
app.post('/api/stock/:id/approvisionner', authMiddleware, adminOnly, async (req, res) => {
  const { quantite, cout_achat } = req.body;
  if (!quantite || quantite <= 0) return res.status(400).json({ error: 'Quantité invalide' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE stock SET stock_actuel = stock_actuel + $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [quantite, req.params.id]
    );
    if (r.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Matière non trouvée' }); }
    // Enregistrer le mouvement
    await client.query(
      `INSERT INTO mouvements_stock (stock_id, stock_nom, type_mvt, quantite, motif, responsable_id)
       VALUES ($1, $2, 'entree', $3, 'approvisionnement', $4)`,
      [r.rows[0].id, r.rows[0].nom, quantite, req.user.id]
    );
    await client.query('COMMIT');
    const s = r.rows[0];
    res.json({ ...s, alerte: parseFloat(s.stock_actuel) < parseFloat(s.seuil_alerte) });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// DELETE /api/stock/:id (admin)
app.delete('/api/stock/:id', authMiddleware, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM stock WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// =====================================================
// VENTES
// =====================================================

// GET /api/ventes?periode=jour|semaine|mois
app.get('/api/ventes', authMiddleware, async (req, res) => {
  const { periode } = req.query;
  let whereClause = '';
  if (periode === 'jour')    whereClause = "WHERE DATE(created_at) = CURRENT_DATE";
  if (periode === 'semaine') whereClause = "WHERE created_at >= NOW() - INTERVAL '7 days'";
  if (periode === 'mois')    whereClause = "WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())";

  const r = await pool.query(
    `SELECT * FROM ventes ${whereClause} ORDER BY created_at DESC LIMIT 500`
  );
  res.json(r.rows);
});

// GET /api/ventes/dashboard — Chiffres du dashboard
app.get('/api/ventes/dashboard', authMiddleware, async (req, res) => {
  try {
    const [mois, jour] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(montant_total), 0)   AS ca,
          COALESCE(SUM(benefice), 0)        AS benefice,
          COALESCE(SUM(quantite), 0)        AS quantite
        FROM ventes
        WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      `),
      pool.query(`
        SELECT COALESCE(SUM(quantite), 0) AS quantite
        FROM ventes WHERE DATE(created_at) = CURRENT_DATE
      `),
    ]);
    const alertes = await pool.query(
      'SELECT COUNT(*) AS count FROM stock WHERE stock_actuel < seuil_alerte'
    );
    res.json({
      ca:       parseInt(mois.rows[0].ca),
      benefice: parseInt(mois.rows[0].benefice),
      qte_mois: parseInt(mois.rows[0].quantite),
      qte_jour: parseInt(jour.rows[0].quantite),
      alertes:  parseInt(alertes.rows[0].count),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/ventes — Enregistrer une vente
app.post('/api/ventes', authMiddleware, async (req, res) => {
  const { produit_id, quantite, mode_paiement, client_nom, echeance, note } = req.body;
  if (!produit_id || !quantite) return res.status(400).json({ error: 'Produit et quantité requis' });

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Récupérer le produit
    const prodResult = await dbClient.query('SELECT * FROM produits WHERE id = $1 AND actif = true', [produit_id]);
    if (prodResult.rows.length === 0) { await dbClient.query('ROLLBACK'); return res.status(404).json({ error: 'Produit non trouvé' }); }
    const prod = prodResult.rows[0];

    const montant_total   = prod.prix_vente * quantite;
    const cout_production = prod.cout_prod  * quantite;
    const benefice        = montant_total - cout_production;

    // Insérer la vente
    const venteResult = await dbClient.query(
      `INSERT INTO ventes (produit_id, produit_nom, quantite, prix_unitaire, montant_total, cout_production, benefice, mode_paiement, vendeur_id, vendeur_nom)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [produit_id, prod.nom, quantite, prod.prix_vente, montant_total, cout_production, benefice,
       mode_paiement || 'cash', req.user.id, req.user.nom]
    );
    const vente = venteResult.rows[0];

    // Si paiement différé → créer un crédit
    if (mode_paiement === 'credit') {
      if (!client_nom || !echeance) { await dbClient.query('ROLLBACK'); return res.status(400).json({ error: 'Nom du client et échéance requis pour un crédit' }); }
      await dbClient.query(
        `INSERT INTO credits (vente_id, produit_nom, quantite, montant_total, client_nom, echeance, note, vendeur_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [vente.id, prod.nom, quantite, montant_total, client_nom, echeance, note || null, req.user.id]
      );
    }

    await dbClient.query('COMMIT');
    res.status(201).json(vente);
  } catch (e) {
    await dbClient.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    dbClient.release();
  }
});

// =====================================================
// CREDITS (paiements différés)
// =====================================================

// GET /api/credits?statut=tous|en_attente|en_retard|regle
app.get('/api/credits', authMiddleware, async (req, res) => {
  const { statut } = req.query;

  // Mettre à jour automatiquement les crédits en retard
  await pool.query(
    `UPDATE credits SET statut = 'en_retard', updated_at = NOW()
     WHERE statut = 'en_attente' AND echeance < CURRENT_DATE`
  );

  let whereClause = '';
  if (statut && statut !== 'tous') whereClause = `WHERE statut = '${statut}'`;

  const r = await pool.query(
    `SELECT c.*, TO_CHAR(c.created_at, 'YYYY-MM-DD') AS date_vente,
            TO_CHAR(c.created_at, 'HH24:MI') AS heure_vente
     FROM credits c ${whereClause} ORDER BY c.created_at DESC`
  );
  res.json(r.rows);
});

// GET /api/credits/kpi
app.get('/api/credits/kpi', authMiddleware, async (req, res) => {
  await pool.query(
    `UPDATE credits SET statut = 'en_retard', updated_at = NOW()
     WHERE statut = 'en_attente' AND echeance < CURRENT_DATE`
  );
  const r = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE statut != 'regle')                     AS count_actifs,
      COUNT(*) FILTER (WHERE statut = 'en_retard')                  AS count_retard,
      COALESCE(SUM(montant_total - montant_paye) FILTER (WHERE statut != 'regle'), 0) AS total_du,
      COALESCE(SUM(montant_paye) FILTER (WHERE statut = 'regle'
        AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', NOW())), 0) AS encaisse_mois
    FROM credits
  `);
  res.json(r.rows[0]);
});

// POST /api/credits/:id/encaisser
app.post('/api/credits/:id/encaisser', authMiddleware, async (req, res) => {
  const { montant } = req.body;
  if (!montant || montant <= 0) return res.status(400).json({ error: 'Montant invalide' });

  try {
    const existing = await pool.query('SELECT * FROM credits WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Crédit non trouvé' });
    const credit = existing.rows[0];
    const restant = credit.montant_total - credit.montant_paye;
    if (montant > restant) return res.status(400).json({ error: 'Montant supérieur au restant dû' });

    const nouveau_paye = credit.montant_paye + montant;
    const nouveau_statut = nouveau_paye >= credit.montant_total ? 'regle' : credit.statut;

    const r = await pool.query(
      `UPDATE credits SET montant_paye = $1, statut = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [nouveau_paye, nouveau_statut, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/credits/:id (admin)
app.delete('/api/credits/:id', authMiddleware, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM credits WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// =====================================================
// PRODUCTION
// =====================================================

// GET /api/productions
app.get('/api/productions', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM productions ORDER BY date_prod DESC, created_at DESC LIMIT 200');
  res.json(r.rows);
});

// GET /api/productions/kpi
app.get('/api/productions/kpi', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT
      COUNT(*)                              AS total_lots,
      COALESCE(SUM(bouteilles_prod), 0)    AS total_prod,
      COALESCE(SUM(bouteilles_vend), 0)    AS total_vend,
      COALESCE(SUM(benefice), 0)           AS total_benefice
    FROM productions
  `);
  res.json(r.rows[0]);
});

// POST /api/productions (admin)
app.post('/api/productions', authMiddleware, adminOnly, async (req, res) => {
  const { produit_id, produit_nom, cout_ingredients, bouteilles_prod, bouteilles_vend, date_prod } = req.body;
  if (!produit_nom || !bouteilles_prod) return res.status(400).json({ error: 'Champs requis manquants' });

  // Récupérer le prix de vente pour calculer les recettes
  let prix_vente = 2000;
  if (produit_id) {
    const p = await pool.query('SELECT prix_vente FROM produits WHERE id = $1', [produit_id]);
    if (p.rows.length > 0) prix_vente = p.rows[0].prix_vente;
  }
  const recettes = (bouteilles_vend || 0) * prix_vente;
  const benefice = recettes - (cout_ingredients || 0);

  try {
    const r = await pool.query(
      `INSERT INTO productions (produit_id, produit_nom, cout_ingredients, bouteilles_prod, bouteilles_vend, recettes, benefice, date_prod, responsable_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [produit_id || null, produit_nom, cout_ingredients || 0, bouteilles_prod,
       bouteilles_vend || 0, recettes, benefice,
       date_prod || new Date().toISOString().slice(0,10), req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/productions/:id (admin)
app.delete('/api/productions/:id', authMiddleware, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM productions WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// =====================================================
// RAPPORTS — Export CSV des données réelles
// =====================================================

// GET /api/rapports/ventes?periode=jour|semaine|mois
app.get('/api/rapports/ventes', authMiddleware, adminOnly, async (req, res) => {
  const { periode } = req.query;
  let where = '';
  if (periode === 'jour')    where = "WHERE DATE(created_at) = CURRENT_DATE";
  if (periode === 'semaine') where = "WHERE created_at >= NOW() - INTERVAL '7 days'";
  if (periode === 'mois')    where = "WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())";

  const r = await pool.query(
    `SELECT TO_CHAR(created_at,'YYYY-MM-DD') as date,
            TO_CHAR(created_at,'HH24:MI') as heure,
            produit_nom, quantite, montant_total, cout_production, benefice, vendeur_nom
     FROM ventes ${where} ORDER BY created_at DESC`
  );

  const header = 'Date,Heure,Produit,Quantite,Montant (F),Cout prod. (F),Benefice (F),Vendeur\n';
  const rows = r.rows.map(v =>
    `${v.date},${v.heure},${v.produit_nom},${v.quantite},${v.montant_total},${v.cout_production},${v.benefice},${v.vendeur_nom || ''}`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ventes_${periode}_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send('\uFEFF' + header + rows);
});

// GET /api/rapports/stock
app.get('/api/rapports/stock', authMiddleware, adminOnly, async (req, res) => {
  const r = await pool.query('SELECT nom, stock_actuel, unite, seuil_alerte, cout_unitaire FROM stock ORDER BY nom');
  const header = 'Matiere premiere,Stock actuel,Unite,Seuil alerte,Cout unitaire (F),Statut\n';
  const rows = r.rows.map(s =>
    `${s.nom},${s.stock_actuel},${s.unite},${s.seuil_alerte},${s.cout_unitaire},${parseFloat(s.stock_actuel) < parseFloat(s.seuil_alerte) ? 'Stock faible' : 'OK'}`
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="stock_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send('\uFEFF' + header + rows);
});

// =====================================================
// FALLBACK — Toutes les routes non-API servent index.html
// =====================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =====================================================
// DÉMARRAGE DU SERVEUR
// =====================================================
app.listen(PORT, () => {
  console.log(`JusNat Pro API démarrée sur le port ${PORT}`);
  console.log(`Environnement : ${process.env.NODE_ENV || 'development'}`);
});
