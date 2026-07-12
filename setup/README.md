# NeoPanel Studio V10.3 sécurisé

Version basée sur la V10.2 sécurisée.

## Ajouts V10.3

- Lancement d'applications durci : seules les extensions `.exe` et `.lnk` sont acceptées.
- Scripts refusés : `.bat`, `.cmd`, `.ps1`, `.vbs`, `.js`, `.reg`, `.scr`, `.com`, `.msi`.
- Plus de commande shell libre pour lancer une application : le chemin est validé puis passé en argument à une commande fixe.
- URLs personnalisées limitées à `http://` et `https://`.
- Textes utilisateur nettoyés côté serveur : noms de pages, boutons, chemins, infos appareil.
- Appareils mieux identifiés quand le navigateur le permet : OS, navigateur, plateforme, modèle approximatif, marque/navigateur, mobile/PC.
- Accès LAN uniquement conservé.
- Socket.io et Express restent protégés.

## Informations appareil

Le logiciel ne récupère pas de photos, contacts, fichiers ou données personnelles du téléphone. Il utilise uniquement les informations techniques fournies par le navigateur : User-Agent, plateforme, navigateur, modèle si disponible, statut mobile/PC.

Sur iPhone/Safari, Apple limite volontairement les informations disponibles. Il est donc normal de voir seulement “iPhone”, “iOS / iPadOS”, “Safari” et l'adresse IP locale.

## Audit npm

À lancer sur le PC de développement après remplacement des fichiers :

```powershell
npm install
npm audit
```

Si des vulnérabilités apparaissent :

```powershell
npm audit fix
```

Puis relancer :

```powershell
npm audit
npm start
```
