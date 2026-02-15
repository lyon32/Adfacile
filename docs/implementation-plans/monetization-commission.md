# Plan d'Implantation : Monétisation via Commission (Mobile Money)

Ce plan détaille la première phase de l'intégration du modèle de revenus : prélever une commission sur le budget publicitaire de l'utilisateur avant le lancement de la campagne.

## Changements Proposés

### 1. [Dashboard] Mise à jour de l'Interface

- **Récapitulatif de Paiement** : Ajouter un bloc visuel à la fin du formulaire de campagne affichant :
    - Budget Publicitaire choisi par l'utilisateur.
    - Commission de service AdLaunch (ex: 10%).
    - Montant Total à régler.
- **Modale de Paiement Mobile Money** : Créer une fenêtre surgissante (modal) qui s'affiche lors du clic sur "Créer la Campagne". Elle contiendra :
    - Les options de paiement (Orange Money, MTN, etc.).
    - Un bouton "Payer maintenant".

### 2. [Dashboard] Logique JavaScript

- **Calcul Dynamique** : Mettre à jour les montants en temps réel dès que l'utilisateur modifie son budget quotidien.
- **Interception du Formulaire** : Empêcher l'envoi direct à l'API Facebook. À la place, afficher la modale de paiement.
- **Simulation de Succès** : (Pour cette phase) Une fois que l'utilisateur clique sur "Payer", simuler une attente de 3 secondes puis lancer réellement la création de la campagne.

## Plan de Vérification

1. Saisir un budget de 100€ et vérifier que les frais (10€) et le total (110€) s'affichent correctement.
2. Cliquer sur "Créer la Campagne" et vérifier que la modale de paiement s'ouvre.
3. Vérifier que le clic sur "Payer" déclenche le processus de création de campagne après la simulation.

> **IMPORTANT**: Taux de commission de **10%** par défaut. Ce taux est ajustable dans le code.
