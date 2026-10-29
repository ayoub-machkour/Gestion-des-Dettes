# AgriCompte / الفلاح

Application Android hors-ligne de gestion des dettes agricoles (crédits fournisseurs, prêts familiaux,
chèques / traites / billets à ordre, paie des ouvriers). Français + Arabe (RTL natif).

Stack : Expo SDK 58 · React Native · TypeScript · expo-router · expo-sqlite · expo-notifications.

## Environnement local

Tout est installé dans le dossier du projet (rien sur le système) :

- `.env\node\` — Node.js 22 LTS portable
- `.env\npm-cache\`, `.env\npm-global\` — cache et outils npm

Dans chaque nouveau terminal PowerShell :

```powershell
. .\activate.ps1      # active l'environnement (le point au début est obligatoire)
deactivate            # pour en sortir
```

## Commandes

```powershell
npm install           # installer les dépendances (après un clone)
npm run typecheck     # vérification TypeScript
npm test              # tests de la logique (soldes, versements, annulation, historique) sur SQLite réel
npx expo start        # serveur de dev (nécessite un build de dev sur le téléphone, voir plus bas)
npm run build:apk     # APK installable (build cloud EAS, compte Expo gratuit requis)
npm run build:store   # .aab pour le Google Play Store
```

Le build APK se fait dans le cloud Expo (EAS) : aucun SDK Android ni Java n'est nécessaire sur ce PC.
La première fois : `npx eas-cli login`, puis `npm run build:apk` ; EAS fournit un lien de téléchargement de l'APK.

> Les notifications et le RTL natif ne fonctionnent pas complètement dans Expo Go :
> testez avec l'APK `preview` ou un build de développement.

## Structure

```
app/                     Écrans (expo-router)
  index.tsx              Tableau de bord : je dois / on me doit, retards, échéances, actions rapides
  contacts/              Liste (filtre je dois / on me doit), fiche + grand livre + relevé WhatsApp
  credit/new.tsx         Dette ou créance (création + modification), culture, calcul quantité × prix
  instruments/           Échéancier + chèque / traite / billet à ordre (donné ou reçu)
  payroll/               Saisie groupée des journaliers + modification
  payment.tsx            Je paie / je reçois (ciblé sur une ligne, ou plus anciennes d'abord)
  operation.tsx          Détail d'une opération : compteur de retard, photos, payer, modifier, supprimer
  history.tsx            Historique complet : recherche par nom, filtres, période, annulation
  crops.tsx              Bilan par culture (tomate, haricot plat, concombre, poivron…)
  settings.tsx           Langue, notifications
src/
  db/                    Schéma SQLite, requêtes, recalcul des soldes, annulation (undo)
  i18n/                  Dictionnaires fr / ar, sens RTL
  state.tsx              Rafraîchissement global + barre « ↩ Annuler »
  notifications.ts       Rappels locaux d'échéance (reconstruits après chaque modification)
  photos.ts              Photos justificatives (stockage privé de l'app)
  statement.ts           Relevé de compte PDF / message WhatsApp
  components/            Boutons larges, champs, sélecteurs, cartes
tests/                   Tests de la logique sur SQLite réel (npm test)
```

## Règles métier

- Montants stockés en **centimes (INTEGER)** : aucune erreur d'arrondi.
- **Deux sens, deux couleurs** : 🔴 je dois (PAYABLE) / 🟢 on me doit (RECEIVABLE).
- Les montants payés de chaque ligne sont **recalculés** à partir du montant payé à la saisie et des versements :
  d'abord vers la ligne choisie, puis les plus anciennes. Modifier ou supprimer une opération reste toujours cohérent ;
  un trop-versé apparaît comme « Avance ».
- Un **chèque / traite** reste « En attente » jusqu'à « ✓ Payé » : il solde alors les dettes liées.
- **Annulation** : chaque action (ajout, modification, suppression, photo…) peut être annulée
  (barre « ↩ Annuler » pendant 7 s, ou depuis l'Historique, jusqu'à 30 actions en arrière).
  Technique : triggers SQLite qui enregistrent l'instruction inverse de chaque modification.
- **Historique** : chaque action est écrite dans `activity_log`, avec le nom du contact (conservé même s'il est supprimé).
- Rappels : notification N jours avant l'échéance (9h) et le jour même (8h), reconstruits après chaque modification.
