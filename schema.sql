-- =====================================================
-- JusNat Pro — Schéma de base de données PostgreSQL
-- =====================================================

-- Extension pour UUID (optionnel, on utilise SERIAL)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE : utilisateurs
-- =====================================================
CREATE TABLE IF NOT EXISTS utilisateurs (
  id          SERIAL PRIMARY KEY,
  nom         VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,  -- hash bcrypt
  role        VARCHAR(20) NOT NULL DEFAULT 'vendeur' CHECK (role IN ('admin','vendeur')),
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- TABLE : produits (jus naturels)
-- =====================================================
CREATE TABLE IF NOT EXISTS produits (
  id          SERIAL PRIMARY KEY,
  nom         VARCHAR(100) NOT NULL,
  description TEXT,
  prix_vente  INTEGER NOT NULL CHECK (prix_vente > 0),  -- en F CFA
  cout_prod   INTEGER NOT NULL DEFAULT 0,               -- coût de production unitaire
  couleur     VARCHAR(20) DEFAULT '#1D9E75',
  couleur2    VARCHAR(20) DEFAULT '#0F6E56',
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- TABLE : stock (matières premières)
-- =====================================================
CREATE TABLE IF NOT EXISTS stock (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(150) NOT NULL UNIQUE,
  stock_actuel  DECIMAL(10,3) NOT NULL DEFAULT 0,
  unite         VARCHAR(30) NOT NULL DEFAULT 'kg',
  seuil_alerte  DECIMAL(10,3) NOT NULL DEFAULT 0,
  cout_unitaire INTEGER NOT NULL DEFAULT 0,  -- F CFA par unité
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- TABLE : ventes
-- =====================================================
CREATE TABLE IF NOT EXISTS ventes (
  id              SERIAL PRIMARY KEY,
  produit_id      INTEGER NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  produit_nom     VARCHAR(100) NOT NULL,  -- dénormalisé pour historique stable
  quantite        INTEGER NOT NULL CHECK (quantite > 0),
  prix_unitaire   INTEGER NOT NULL,
  montant_total   INTEGER NOT NULL,
  cout_production INTEGER NOT NULL DEFAULT 0,
  benefice        INTEGER NOT NULL DEFAULT 0,
  mode_paiement   VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (mode_paiement IN ('cash','credit')),
  vendeur_id      INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  vendeur_nom     VARCHAR(100),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- TABLE : credits (paiements différés)
-- =====================================================
CREATE TABLE IF NOT EXISTS credits (
  id              SERIAL PRIMARY KEY,
  vente_id        INTEGER REFERENCES ventes(id) ON DELETE SET NULL,
  produit_nom     VARCHAR(100) NOT NULL,
  quantite        INTEGER NOT NULL,
  montant_total   INTEGER NOT NULL,
  montant_paye    INTEGER NOT NULL DEFAULT 0,
  client_nom      VARCHAR(150) NOT NULL,
  echeance        DATE NOT NULL,
  note            TEXT,
  statut          VARCHAR(20) NOT NULL DEFAULT 'en_attente'
                  CHECK (statut IN ('en_attente','en_retard','regle')),
  vendeur_id      INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- TABLE : productions (lots de fabrication)
-- =====================================================
CREATE TABLE IF NOT EXISTS productions (
  id              SERIAL PRIMARY KEY,
  produit_id      INTEGER REFERENCES produits(id) ON DELETE SET NULL,
  produit_nom     VARCHAR(100) NOT NULL,
  cout_ingredients INTEGER NOT NULL DEFAULT 0,  -- F CFA
  bouteilles_prod  INTEGER NOT NULL DEFAULT 0,
  bouteilles_vend  INTEGER NOT NULL DEFAULT 0,
  recettes        INTEGER NOT NULL DEFAULT 0,
  benefice        INTEGER NOT NULL DEFAULT 0,
  date_prod       DATE NOT NULL DEFAULT CURRENT_DATE,
  responsable_id  INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- TABLE : mouvements_stock (traçabilité)
-- =====================================================
CREATE TABLE IF NOT EXISTS mouvements_stock (
  id            SERIAL PRIMARY KEY,
  stock_id      INTEGER REFERENCES stock(id) ON DELETE SET NULL,
  stock_nom     VARCHAR(150) NOT NULL,
  type_mvt      VARCHAR(20) NOT NULL CHECK (type_mvt IN ('entree','sortie')),
  quantite      DECIMAL(10,3) NOT NULL,
  motif         VARCHAR(100),  -- 'approvisionnement', 'production', 'ajustement'
  responsable_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- INDEX pour les performances
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_ventes_created_at   ON ventes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventes_produit_id   ON ventes(produit_id);
CREATE INDEX IF NOT EXISTS idx_credits_statut       ON credits(statut);
CREATE INDEX IF NOT EXISTS idx_credits_echeance     ON credits(echeance);
CREATE INDEX IF NOT EXISTS idx_productions_date     ON productions(date_prod DESC);
CREATE INDEX IF NOT EXISTS idx_mouvements_stock_id  ON mouvements_stock(stock_id);

-- =====================================================
-- DONNÉES INITIALES
-- =====================================================

-- Administrateur par défaut (mot de passe: admin123)
-- Le hash sera généré par le script setup-db.js
-- INSERT INTO utilisateurs ...  (fait par setup-db.js)

-- Produits par défaut
INSERT INTO produits (nom, description, prix_vente, cout_prod, couleur, couleur2) VALUES
  ('Bissap',    'Fleurs d''hibiscus · sucre · eau', 2000, 1200, '#E24B4A', '#993556'),
  ('Gingembre', 'Gingembre frais · citron · sucre', 2000, 1100, '#EF9F27', '#BA7517'),
  ('Ananas',    'Ananas frais · sucre · eau',        2000, 1280, '#97C459', '#1D9E75'),
  ('Baobab',    'Poudre de baobab · lait · sucre',   2000, 1300, '#5DCAA5', '#0F6E56')
ON CONFLICT DO NOTHING;

-- Stock initial
INSERT INTO stock (nom, stock_actuel, unite, seuil_alerte, cout_unitaire) VALUES
  ('Fleurs de bissap', 0, 'kg',  2,  3500),
  ('Sucre blanc',      0, 'kg',  5,  600),
  ('Gingembre frais',  0, 'kg',  3,  2000),
  ('Ananas',           0, 'pcs', 5,  500),
  ('Poudre de baobab', 0, 'kg',  1,  4000),
  ('Bouteilles 75cl',  0, 'pcs', 50, 200),
  ('Capsules',         0, 'pcs', 30, 50),
  ('Etiquettes',       0, 'pcs', 30, 30)
ON CONFLICT (nom) DO NOTHING;
