# VELTRON v2 – Plateforme internationale multi-agences de transport

*Move smarter. Travel better.* — Conçu et développé par **Nathan Zoua**.

```text
veltron-platform/
├── database/   schema.sql, seed.sql, world_countries.sql (213 pays & 152 devises), refresh_trips.sql
├── backend/    API PHP 8.2+ sécurisée (Argon2id, sessions révocables, PIN 5 chiffres, Audit IA, E2EE)
├── frontend/   React + TypeScript + Vite (Portails Passager, Agence & Supervision 100 % séparés)
└── media/      Images & vidéo de démonstration VELTRON
```

## 1. Mise à jour / Import de la base de données MySQL 8

### Méthode rapide automatique (recommandée — 1 seule commande)
Depuis le dossier `veltron-platform` :
```powershell
php backend/bin/install_db.php
```
Cette commande importe automatiquement `schema.sql`, `seed.sql` et `world_countries.sql` (les 213 pays du monde par ordre alphabétique avec leurs devises respectives), puis initialise les mots de passe Argon2id de démonstration (`Veltron#2026`).

### Méthode manuelle SQL (WAMP / phpMyAdmin / ligne de commande MySQL)
```powershell
mysql -u root -p --default-character-set=utf8mb4 < database/schema.sql
mysql -u root -p --default-character-set=utf8mb4 veltron < database/seed.sql
mysql -u root -p --default-character-set=utf8mb4 veltron < database/world_countries.sql
php backend/bin/set_test_passwords.php
```

## 2. Démarrer l’application

### Terminal 1 — API PHP (port 8000)
```powershell
cd backend
php -S 127.0.0.1:8000 -t public
```
*(En mode local sans serveur SMTP externe, tous les codes PIN à 5 chiffres sont journalisés dans `backend/verification.log` et `backend/storage/mail.log`, et affichés dans une bannière d’aide locale).*
*(Optionnel : ajoutez `GEMINI_API_KEY=...` ainsi que votre `OWNER_EMAIL` et `OWNER_WHATSAPP_PHONE` dans `backend/.env` pour l’audit IA Gemini et les alertes propriétaire).*

### Terminal 2 — Frontend React / Vite (port 5173)
```powershell
cd frontend
npm install
npm run dev
```
Ouvrez ensuite **http://localhost:5173** et actualisez la page (`Ctrl + F5`).

## 3. Les 3 espaces strictement séparés

1. **Accueil `/` (`Gateway`)** : demande dès l’ouverture si vous êtes **Passager** ou **Agence** (avec vidéo et cartes photo animées).
2. **Espace Passager (`/passager/*`)** :
   - Réservation de billets (213 pays, sièges 2+2 / 2+3, QR code, remboursement et report jusqu’à 2 h avant départ)
   - Location de bus sur mesure (`LOC-XXXXXX` + suivi des devis reçus)
   - Achat de bus certifiés (annonces + contact direct vendeur)
   - Suivi de trajet en temps réel (`/passager/suivi` — vitesse en `km/h`, distance restante, bouchons/pannes déclarés par le chauffeur et heure d’arrivée recalculée dynamiquement ; testez la réf. **`VLT-9TRK42`**)
   - Points de fidélité annuels par agence (`/passager/fidelite` — cumulés à chaque trajet, remis à zéro chaque 1er janvier, échangeables contre des bons `RWD-XXXXXX`)
3. **Espace Agence (`/agence/*`)** :
   - **Créer une agence (`/agence/creer`)** : vérification d’unicité de l’adresse physique, 213 pays classés A→Z avec devises, confirmation d’appartenance de l’e-mail par **code PIN aléatoire à 5 chiffres** (renvoi 50 s), génération de l’ID unique **`AG-XXXXXX`** et **Système de Vérification IA** (activation immédiate si authentique, sinon alerte E-mail + WhatsApp transmise directement au propriétaire VELTRON).
   - **J’ai une agence (`/agence/connexion`)** : saisie de l’ID auto (`AG-XXXXXX`) + Nom + E-mail + Mot de passe → **code de validation à 5 chiffres** (réinitialisable après **50 secondes**).
   - **6 Comptes employés strictement isolés** : Administrateur (`owner`), Secrétaire (`secretary`), Chauffeur (`driver`), Membre du personnel (`staff`), Responsable Programmation (`manager`), Comptable (`accountant`).
   - **Messagerie de groupe chiffrée de bout en bout (`E2EE`)** : `ECDH P-256` + `AES-256-GCM` style WhatsApp / Instagram Direct avec 6 thèmes visuels interchangeables.
4. **Supervision Propriétaire VELTRON (`/supervision`)** :
   - Votre console propriétaire (`admin@veltron.test` / `Veltron#2026`) recevant les dossiers escaladés par l’IA avec boutons 1-clic **WhatsApp** et **E-mail** pour échanger avec l’agence et l’activer.

## 4. Comptes de démonstration (`Veltron#2026`)

| Espace | Rôle | Identifiants |
|---|---|---|
| Passager | Voyageuse (40 pts fidélité) | `passager1@veltron.test` |
| Passager | Voyageur | `passager2@veltron.test` |
| Agence (`AG-EQT001` · *Équateur Voyages*) | Administrateur | `owner.equateur@veltron.test` |
| Agence (`AG-EQT001` · *Équateur Voyages*) | Secrétaire | `desk.equateur@veltron.test` |
| Agence (`AG-EQT001` · *Équateur Voyages*) | Chauffeur | `driver1.equateur@veltron.test` |
| Agence (`AG-EQT001` · *Équateur Voyages*) | Personnel | `staff.equateur@veltron.test` |
| Agence (`AG-EQT001` · *Équateur Voyages*) | Programmation | `prog.equateur@veltron.test` |
| Agence (`AG-EQT001` · *Équateur Voyages*) | Comptable | `compta.equateur@veltron.test` |
| Supervision Propriétaire | Propriétaire VELTRON | `admin@veltron.test` |

## 5. Suite de tests automatisés
```powershell
php backend/bin/install_db.php
python backend/tests/smoke.py
```
