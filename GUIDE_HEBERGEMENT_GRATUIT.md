# 🌐 Guide de Déploiement Gratuit en Ligne — VELTRON Platform

Votre plateforme **VELTRON** est configurée avec un conteneur Docker autonome (`Dockerfile`, `render.yaml`) pour être déployée gratuitement sur Render.com sous l'URL HTTPS standard **`https://veltron-platform.onrender.com`**.

## Déploiement Gratuit sur Render.com (en 1 clic)

1. **Rendez-vous sur [dashboard.render.com](https://dashboard.render.com/)** (connectez-vous avec votre compte GitHub `Nathan-Zoua`).
2. Cliquez sur le bouton bleu **New +** en haut à droite, puis choisissez **Blueprint** (ou **Web Service**).
3. Sélectionnez votre dépôt GitHub : **`nathan-ZOUA/veltron-platform`**.
4. Render détecte automatiquement `render.yaml` et `Dockerfile` :
   - Nom du service : `veltron-platform`
   - Plan : **Free** (gratuit, 0 € / mois)
   - Runtime : **Docker** (compilation Node.js 20 pour React + exécution PHP 8.3 & MariaDB intégré)
5. Cliquez sur **Apply** (ou **Create Web Service**) :
   - Le build démarre automatiquement.
   - En 2 à 3 minutes, votre application est en ligne avec son certificat SSL HTTPS gratuit sur le sous-domaine Render :
   - 👉 **`https://veltron-platform.onrender.com`**

> **Note importante** : Aucune configuration de nom de domaine personnalisé n'est requise. L'application utilise directement le domaine gratuit fourni par Render (`*.onrender.com`).

