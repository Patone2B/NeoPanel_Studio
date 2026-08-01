<div align="center">

# NeoPanel Studio

### Transformez un smartphone, une tablette ou un écran secondaire en tableau de bord local pour Windows.

![Version](https://img.shields.io/badge/version-1.2.2-00d9ff)
![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4)
![Electron](https://img.shields.io/badge/Electron-42-47848F)
![Licence](https://img.shields.io/badge/licence-GPL--3.0-blue)

**Local · Sans compte · Open source · Contrôlable depuis un téléphone**

</div>

---

## Présentation

NeoPanel Studio est une application Windows qui héberge une interface de contrôle accessible depuis un smartphone, une tablette ou un autre ordinateur connecté au même réseau local.

L’objectif est de réutiliser un ancien téléphone comme panneau de contrôle pour le PC : commandes multimédias, lancement de logiciels, raccourcis, météo, notes partagées, diagnostic et informations réseau.

Aucun compte NeoPanel n’est nécessaire et aucune donnée de contrôle n’est envoyée vers un serveur NeoPanel externe.

## Fonctionnalités actuelles

### Contrôle du PC

- commandes lecture, pause, piste précédente et piste suivante ;
- contrôle du volume général et ouverture du mélangeur Windows ;
- lancement de DaVinci Resolve, OBS Studio, Steam, Discord, Chrome et Blender ;
- détection automatique des logiciels installés ;
- sélection manuelle d’un fichier `.exe` ou d’un raccourci `.lnk` ;
- raccourcis pour DaVinci Resolve, OBS Studio, le navigateur et Windows.

### Interface et services

- tableau de bord CPU, RAM, disque et activité réseau ;
- horloge plein écran et mode cockpit ;
- météo avec une clé OpenWeather personnelle ;
- sauvegarde locale de la ville et de la clé API ;
- notes partagées entre le PC et le téléphone ;
- plusieurs thèmes visuels ;
- interface adaptée au mode paysage sur mobile ;
- installation possible sur l’écran d’accueil d’un iPhone ou d’un appareil Android.

### Sécurité locale

- serveur limité au réseau local ;
- code de session à six chiffres renouvelé à chaque lancement ;
- QR code contenant uniquement l’adresse locale, jamais le code secret ;
- appareils autorisés et sessions individuelles ;
- blocage et déblocage d’adresses IP ;
- déconnexion de tous les appareils distants ;
- limitation du nombre de requêtes ;
- protection contre les requêtes provenant d’une origine non autorisée ;
- validation des chemins avant le lancement d’un programme ;
- refus des scripts et des protocoles dangereux.

## À venir

Les éléments suivants sont prévus pour de futures versions :

- **intégration GPU plus complète**, notamment une meilleure compatibilité avec les cartes AMD, NVIDIA et Intel ;
- températures et mémoire vidéo plus fiables selon le matériel ;
- davantage de logiciels et de raccourcis prêts à l’emploi ;
- personnalisation plus poussée du tableau de bord ;
- amélioration du contrôle audio par application ;
- nouvelles options d’affichage et d’accessibilité.

> L’intégration GPU avancée est une fonctionnalité à venir. Elle ne doit pas être considérée comme entièrement prise en charge dans la version 1.2.2.

## Installation pour un utilisateur

1. Téléchargez la dernière version depuis la section **Releases** du dépôt GitHub.
2. Lancez l’installateur Windows.
3. Ouvrez NeoPanel Studio sur le PC.
4. Scannez le QR code avec le téléphone ou saisissez l’adresse locale affichée.
5. Entrez sur le téléphone le code de session visible uniquement sur le PC.

Le PC et le téléphone doivent être connectés au même réseau local ou au même partage de connexion.

## Configuration des logiciels

Ouvrez la page **Config apps**, puis utilisez :

- **Détecter automatiquement** pour rechercher les logiciels connus ;
- **Parcourir** pour sélectionner manuellement un fichier `.exe` ou `.lnk` ;
- **Tester** pour vérifier le chemin choisi ;
- **Sauvegarder** pour conserver la configuration.

Lorsqu’un programme n’est pas installé ou que son chemin n’est plus valide, NeoPanel affiche désormais :

> Application introuvable. Configure son chemin dans « Config apps ».

## Configuration de la météo

1. Créez une clé API personnelle sur OpenWeather.
2. Ouvrez la page **Météo**.
3. Saisissez la ville et la clé API.
4. Cliquez sur **Sauvegarder / tester**.

La clé est enregistrée localement dans les données de l’utilisateur. Lorsqu’une clé est déjà enregistrée, le champ peut rester vide : NeoPanel conserve la clé existante.

Sous Windows, les réglages sont stockés dans :

```text
%APPDATA%\NeoPanel Studio\data\settings.json
```

Ne publiez jamais votre fichier `settings.json` et ne placez jamais votre clé API dans le dépôt GitHub.

## Informations réseau

La page **Réseau** affiche :

- l’adresse locale du PC ;
- l’adresse à ouvrir sur le téléphone ;
- les interfaces IPv4 détectées ;
- le nombre de clients connectés.

Les VPN, Hyper-V, VMware, Docker ou d’autres cartes virtuelles peuvent ajouter ou masquer certaines interfaces. Si le téléphone est déjà connecté, l’absence d’une interface secondaire dans la liste n’empêche pas NeoPanel de fonctionner.

## Développement

### Prérequis

- Windows 10 ou Windows 11 ;
- Node.js récent, compatible avec Electron 42 ;
- npm.

### Installation

```powershell
git clone https://github.com/Patone2B/NeoPanel_Studio.git
cd NeoPanel_Studio
npm install
npm start
```

### Création de l’installateur

```powershell
npm run make
```

Les fichiers sont générés dans :

```text
out\make
```

Le dépôt GitHub doit contenir le code source, mais pas les dossiers `node_modules`, `out`, `make`, `dist` ou `release`.

## Vérifications avant publication

```powershell
node --check server.js
node --check main.js
node --check public\app.js
npm audit
npm run make
```

Il est conseillé de tester ensuite :

- l’installation sur un second PC Windows ;
- la désinstallation et la réinstallation ;
- la connexion depuis Android et iPhone ;
- la détection des logiciels ;
- la météo après redémarrage ;
- le réseau avec et sans VPN.

## Structure du projet

```text
NeoPanel_Studio/
├── assets/                 Icônes de l’application
├── public/
│   ├── docs/               Documentation utilisateur
│   ├── icons/              Icônes PWA
│   ├── app.js              Logique de l’interface
│   ├── index.html          Interface principale
│   ├── manifest.webmanifest
│   ├── style.css
│   └── sw.js
├── main.js                 Fenêtre Electron
├── preload.js              Préchargement sécurisé
├── server.js               Serveur local et API
├── package.json
├── package-lock.json
├── LICENSE
└── README.md
```

## Questions fréquentes

### Le téléphone ne se connecte pas

Vérifiez que le PC et le téléphone utilisent le même réseau. Autorisez également NeoPanel Studio dans le pare-feu Windows pour les réseaux privés.

### Le code de session a changé

C’est normal. Un nouveau code est créé à chaque lancement de NeoPanel Studio.

### Une application ne démarre pas

Ouvrez **Config apps**, lancez la détection automatique ou sélectionnez le fichier du logiciel avec **Parcourir**.

### La météo demande de nouveau une clé

À partir de cette version, une clé déjà enregistrée est conservée lorsque le champ est laissé vide. Il suffit de saisir la clé une première fois, sauf si le fichier de réglages a été supprimé.

### Windows affiche plusieurs interfaces IPv4

Cela peut venir d’un VPN, d’Hyper-V, de VMware, de Docker ou d’un autre adaptateur virtuel. Utilisez l’adresse indiquée dans **Adresse téléphone**.

### Windows SmartScreen affiche un avertissement

Une application open source non signée peut déclencher SmartScreen. Vérifiez que le fichier provient bien de la page officielle des Releases du dépôt.

## Confidentialité

NeoPanel Studio fonctionne principalement sur le réseau local. Les données de configuration, les notes, les appareils autorisés et la clé OpenWeather sont stockés sur le PC de l’utilisateur.

Une connexion Internet est utilisée uniquement pour les services externes choisis par l’utilisateur, notamment OpenWeather.

## Contribution

Les signalements de bugs et propositions d’amélioration peuvent être déposés dans les **Issues** GitHub.

Lors d’un signalement, indiquez si possible :

- la version de Windows ;
- la version de NeoPanel Studio ;
- le navigateur du téléphone ;
- les étapes permettant de reproduire le problème ;
- les messages visibles dans la page Diagnostic.

## Licence

NeoPanel Studio est distribué sous licence **GNU GPL-3.0-or-later**.

Vous pouvez étudier, modifier et redistribuer le code dans le respect des conditions de cette licence.

---

<div align="center">

Développé par **Anton**.

**NeoPanel Studio 1.2.2**

</div>
