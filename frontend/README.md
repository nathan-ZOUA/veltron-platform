# VELTRON – Frontend

*Move smarter. Travel better.* — Conçu et développé par **Nathan Zoua**.

Application web de démonstration (React + TypeScript + Vite), 4 langues (FR, EN, AR avec RTL, ZH), thèmes sombre/clair, animations Framer Motion.

## Lancer le projet

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production dans /dist
```

Prérequis : Node.js 18 ou plus récent.

## Où modifier quoi

| Je veux changer…                         | Fichier                                   |
|------------------------------------------|-------------------------------------------|
| Couleurs, polices, espacements, thèmes   | `src/styles/tokens.css`                   |
| Style des titres / polices par langue    | `src/styles/typography.css`               |
| Animations en boucle (CSS)               | `src/styles/animations.css`               |
| En-tête, menu, pied de page, signature   | `src/styles/layout.css`                   |
| Boutons, cartes, formulaires, photos     | `src/styles/components.css`               |
| Style d'une page                         | `src/styles/home.css`, `booking.css`, `tracking.css`, `dashboard.css`, `auth.css` |
| Textes et traductions                    | `src/i18n/locales/fr.ts`, `en.ts`, `ar.ts`, `zh.ts` |
| Nom, e-mail, WhatsApp, GitHub            | `src/app/config.ts`                       |
| Données de démonstration                 | `src/features/demo/demoData.ts`           |
| Photos d'arrière-plan                    | dossier `public/images/` (voir LISEZ-MOI.txt) |

## Ajouter une langue

1. Copier `src/i18n/locales/fr.ts` vers `es.ts` (par exemple) et traduire.
2. L'ajouter dans `src/i18n/index.ts` (`LANGUAGES` et `resources`).

## État actuel (honnête)

- Frontend de démonstration : aucune donnée n'est enregistrée, aucun serveur n'est connecté.
- Réservation, suivi GPS et tableau de bord utilisent des **données fictives**, signalées « SIMULÉ » / « Données de démonstration ».
- Le formulaire de contact et la connexion sont des aperçus visuels.
- Prochaines étapes : backend PHP + MySQL (API REST), carte MapLibre, authentification réelle, paiements.
