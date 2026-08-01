# NeoPanel Studio

<p align="center">
  <img src="NeoPanel_Studio/Code_soure/public/icons/icon-512.png" alt="NeoPanel Studio" width="180"/>
</p>

<p align="center">

**Transformez un ancien smartphone en véritable tableau de bord pour votre PC Windows.**

Application locale, open source et gratuite permettant de surveiller son ordinateur, contrôler ses applications et accéder rapidement à ses outils favoris depuis un téléphone, une tablette ou un navigateur.

</p>

---

## Aperçu

NeoPanel Studio est une application développée avec **Electron**, **Node.js** et **Express**.

Le logiciel exécute un serveur web local directement sur l'ordinateur. Un téléphone ou une tablette connecté(e) au même réseau peut alors accéder à une interface moderne permettant de piloter le PC.

Aucun compte n'est nécessaire.

Aucun abonnement n'est requis.

Le logiciel fonctionne entièrement sur votre réseau local.

---

# Fonctionnalités

### Tableau de bord système

- Surveillance du processeur
- Surveillance de la mémoire
- Surveillance du stockage
- Surveillance du réseau
- Horloge plein écran
- Mode Cockpit

---

### Contrôle du PC

- Contrôle multimédia Windows
- Contrôle du navigateur
- Lancement d'applications
- Pages personnalisables
- Notes synchronisées
- Météo OpenWeather
- Thèmes graphiques

---

### Compatibilité

- Windows 10
- Windows 11
- Android (PWA)
- iPhone / iPad (Safari)

---


# Architecture

NeoPanel Studio repose sur une architecture volontairement simple afin de faciliter sa maintenance et son évolution.

```
                 Smartphone
              (Chrome / Safari)
                      │
               HTTP / WebSocket
                      │
              Express (server.js)
                      │
          Electron Application
                 (main.js)
                      │
          Windows & API système
```

Le projet est séparé en trois parties :

| Élément | Description |
|---------|-------------|
| Electron | Application Windows |
| Express | Serveur local et API |
| HTML / CSS / JavaScript | Interface utilisateur |

---

# Structure du projet

```
NeoPanel Studio
│
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── manifest.webmanifest
│   └── sw.js
│
├── main.js
├── preload.js
├── server.js
│
├── package.json
├── package-lock.json
│
├── README.md
├── CHANGELOG.md
└── LICENSE
```

---

# Technologies utilisées

Le projet utilise les technologies suivantes :

- Electron
- Node.js
- Express
- Socket.IO
- HTML5
- CSS3
- JavaScript
- systeminformation
- QRCode

Le projet ne nécessite aucune base de données.

Toutes les informations sont stockées localement.

---

# Installation

Cloner le dépôt :

```bash
git clone https://github.com/VOTRE-NOM/NeoPanel-Studio.git
```

Installer les dépendances :

```bash
npm install
```

Lancer le logiciel :

```bash
npm start
```

Créer l'installateur Windows :

```bash
npm run make
```

---

# Sécurité

NeoPanel Studio est conçu pour fonctionner exclusivement sur un réseau local.

Le logiciel intègre plusieurs mécanismes destinés à limiter les accès non autorisés tout en conservant une utilisation simple.

Les données utilisateur restent stockées localement sur l'ordinateur.

Par mesure de sécurité, les détails techniques des protections intégrées ne sont volontairement pas documentés publiquement.

---

# Développement

Le projet a été conçu pour être facilement modifiable.

Les principaux fichiers sont :

| Fichier | Rôle |
|---------|------|
| main.js | Démarrage d'Electron |
| server.js | Serveur local et logique principale |
| preload.js | Communication sécurisée Electron |
| public/index.html | Interface utilisateur |
| public/style.css | Apparence |
| public/app.js | Fonctionnement de l'interface |

---

# Contribuer

Les contributions sont les bienvenues.

Avant de proposer une modification :

- tester les changements sur une installation propre ;
- documenter les nouveautés importantes ;
- respecter l'organisation actuelle du projet.

Les Pull Requests sont les bienvenues.

---

# Roadmap

### Version actuelle

- Interface responsive
- Tableau de bord système
- Contrôle multimédia
- Notes synchronisées
- Météo
- Pages personnalisées
- Sécurité locale

### À venir

- Surveillance GPU avancée
- Nouveaux raccourcis logiciels
- Widgets supplémentaires
- Améliorations des performances
- Fonctionnalités communautaires

---

# Licence

NeoPanel Studio est distribué sous licence **GNU GPL v3.0 ou ultérieure**.

Vous êtes libre de modifier, redistribuer et améliorer le logiciel dans le respect des conditions de cette licence.

---

# Remerciements

Merci à tous les utilisateurs, testeurs et contributeurs qui participent à l'amélioration de NeoPanel Studio.

---

<p align="center">

**NeoPanel Studio**

*Open Source • Gratuit • Développé avec ❤️ pour la communauté*

</p>
