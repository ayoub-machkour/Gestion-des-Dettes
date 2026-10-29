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
  index.tsx              Tableau de bord : cartes récap + 4 actions rapides
  contacts/              Liste, fiche + grand livre, formulaire
  credit/new.tsx         Achat à crédit / prêt d'argent
  instruments/           Échéancier + saisie chèque / traite / billet à ordre
  payroll/new.tsx        Saisie groupée des journaliers
  payment.tsx            Versement (FIFO, ou ciblé sur une ligne du grand livre)
  settings.tsx           Langue, notifications
src/
  db/                    Schéma SQLite, migrations, requêtes
  i18n/                  Dictionnaires fr / ar, sens RTL
  notifications.ts       Rappels locaux d'échéance
  components/            Boutons larges, champs, sélecteur de contact
```

## Règles métier

- Montants stockés en **centimes (INTEGER)** : aucune erreur d'arrondi.
- Un **versement** solde d'abord la dette choisie, puis les plus anciennes (dettes et salaires confondus).
- Un **chèque / traite** reste « En attente » jusqu'à « ✓ Payé » : il solde alors les dettes liées.
  Un effet « Espèces » est appliqué immédiatement.
- Rappels : notification N jours avant l'échéance (9h) et le jour même (8h) ; annulés si l'effet est payé ou annulé.
