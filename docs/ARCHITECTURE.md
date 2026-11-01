# Règles métier clés (appliquées par le serveur, jamais seulement par l'écran)

1. **Isolation** : toute donnée d'agence porte un `agency_id` ; un utilisateur ne voit que son agence.
2. **Pas de double réservation** : index unique `uq_active_seat` (un siège = un billet actif par départ) + transaction avec verrou.
3. **Expiration** : une réservation non payée libère ses sièges à `expires_at`.
4. **Remboursement** : possible jusqu'à `refund_cutoff_minutes` (minimum 120 = 2 h) avant le départ, à l'heure locale de la ville de départ ; pourcentage selon `refund_tiers`. Après : aucun remboursement. Annulation par l'agence : remboursement intégral.
5. **Report** : jusqu'au délai de coupure, vers un autre départ de la même ligne (frais éventuels : `transfer_fee`).
6. **Bus raté** : après le départ, billet `no_show`, sans remboursement ; transfert possible selon l'agence.
7. **Compléter un bus** : le secrétaire transfère vers le départ en cours un passager du départ suivant **sans bagage**, présent en gare, avec son accord (`passenger_consent`) ; ancien QR invalidé, nouveau émis, tout tracé dans `ticket_transfers`.
8. **Pièces d'identité** : visibles seulement du secrétaire et du gestionnaire, accès journalisé (`audit_logs`).
9. **Photos des chauffeurs** : affichées seulement avec `photo_consent = 1`, via l'affectation `trip_drivers` (le changement de chauffeur change la photo).
10. **Avis** : un seul par billet (`reviews.ticket_id` unique), réservé aux billets de trajets effectués, modérés avant publication.
11. **Paiements** : clé d'idempotence unique ; `sandbox = 1` tant qu'aucun fournisseur réel n'est branché.
