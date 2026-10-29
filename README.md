# AgriCompte / الفلاح

Application Android hors-ligne pour suivre les dettes d'une exploitation agricole : achats à crédit chez les
fournisseurs, ventes à crédit, chèques / traites / billets à ordre, paie des ouvriers. Français + Arabe (RTL natif).

Stack : Expo SDK 58 · React Native · TypeScript · expo-router · expo-sqlite · expo-notifications.

## Environnement local

Tout est installé dans le dossier du projet (rien sur le système) :

- `.env\node\` — Node.js 22 LTS portable
- `.env\npm-cache\`, `.env\npm-global\` — cache npm et outils « globaux » (dont `eas`)

Dans chaque nouveau terminal :

```powershell
. .\activate.ps1      # PowerShell (le point au début est obligatoire) ; `deactivate` pour sortir
```

```cmd
activate              :: cmd.exe
```

## Commandes

```powershell
npm install                 # installer les dépendances (après un clone)
npm install -g eas-cli      # une fois : installe eas dans .env\npm-global
npm run typecheck           # vérification TypeScript
npm test                    # tests de la logique sur SQLite réel
npm run build:apk           # APK installable (build cloud EAS, compte Expo gratuit)
npm run build:store         # .aab pour le Google Play Store
```

Le build se fait dans le cloud Expo (EAS) : aucun SDK Android ni Java n'est nécessaire sur ce PC.
La première fois : `eas login`, puis `npm run build:apk` ; EAS fournit un lien de téléchargement de l'APK.

## Parcours

1. **Accueil** : la liste des personnes (fournisseurs, clients, ouvriers…) avec ce qui est dû, et « + Ajouter une personne ».
2. **Fiche d'une personne** : ce qui est dû, « + Achat / Crédit » et « 💵 Paiement », puis toutes les opérations.
3. **Détail d'une opération** : articles, payé / reste, retard, justificatifs photo, modifier, supprimer.
4. **Menu (☰)** : échéancier des chèques / traites, paie groupée des ouvriers, historique, paramètres.

## Structure

```
app/                     Écrans (expo-router)
  index.tsx              Accueil : liste des personnes
  contacts/[id].tsx      Fiche d'une personne
  contacts/new.tsx       Nouvelle personne / modification / suppression
  credit/new.tsx         Achat ou vente à crédit, plusieurs articles (quantité × prix), facture photo
  payment.tsx            Paiement : montant, date, reçu photo
  instruments/           Échéancier + chèque / traite / billet à ordre
  payroll/               Journées de travail (un ou plusieurs ouvriers) + modification
  operation.tsx          Détail d'une opération
  history.tsx            Historique complet, recherche par nom
  menu.tsx, settings.tsx Menu, langue, notifications
src/
  db/                    Schéma SQLite + migrations, requêtes, recalcul des soldes
  i18n/                  Textes fr / ar, sens RTL
  components/            Design system (boutons, cartes, champs, avatars) et composants métier
  notifications.ts       Rappels locaux d'échéance
  photos.ts              Photos justificatives (stockage privé de l'app)
  statement.ts           Relevé de compte PDF / message WhatsApp
tests/                   Tests de la logique sur SQLite réel (npm test)
```

## Règles métier

- Montants stockés en **centimes (INTEGER)** : aucune erreur d'arrondi.
- **Deux sens, deux couleurs** : rouge = je dois (PAYABLE), vert = il me doit (RECEIVABLE).
- Un achat contient un ou plusieurs **articles** (`transaction_items`) ; son total est la somme quantité × prix.
- Les montants payés de chaque ligne sont **recalculés** à partir du montant payé à la saisie et des paiements :
  d'abord vers l'opération choisie, puis les plus anciennes. Modifier ou supprimer une opération reste cohérent ;
  un trop-payé apparaît comme « Avance ».
- Un **chèque / traite** reste « En attente » jusqu'à « ✓ Marquer comme payé » : il solde alors les dettes.
- **Historique** : chaque action est écrite dans `activity_log`, avec le nom de la personne (conservé même après suppression).
- Rappels : notification N jours avant l'échéance (9h) et le jour même (8h), reconstruits après chaque modification.
