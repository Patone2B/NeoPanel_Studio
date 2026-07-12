<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>NeoPanel_Studio V10</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#030712" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="G19 Neo" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="manifest.webmanifest" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="screen">
    <aside class="sidebar">
      <h1>NeoPanel_Studio</h1>
      <div id="time" class="time">--:--</div>
      <div id="date" class="date">--</div>
      <button onclick="showPage('dash')">Dashboard</button>
      <button onclick="showPage('clock')">Horloge</button>
      <button onclick="showPage('cockpit')">Cockpit</button>
      <button onclick="showPage('weather')">Météo</button>
      <button onclick="showPage('media')">Média</button>
      <button onclick="showPage('audioapps')">Audio apps</button>
      <button onclick="showPage('apps')">Apps</button>
      <button onclick="showPage('customapps')">Config apps</button>
      <button onclick="showPage('custompages')">Pages perso</button>
      <button onclick="showPage('notes')">Notes</button>
      <button onclick="showPage('davinci')">DaVinci</button>
      <button onclick="showPage('obs')">OBS</button>
      <button onclick="showPage('browser')">Web</button>
      <button onclick="showPage('system')">Système</button>
      <button onclick="showPage('diagnostic')">Diagnostic</button>
      <button onclick="showPage('network')">Réseau</button>
      <button onclick="showPage('themes')">Thèmes</button>
      <button onclick="showPage('settings')">Réglages</button>
      <button onclick="showPage('about')">À propos</button>
      <p id="status">Connexion...</p>
    </aside>

    <section class="content">
      <section id="loginBox" class="login cardlike">
        <div>
          <h2>Connexion V10 sécurisée</h2>
          <p>Le QR contient seulement l’adresse locale. Le code à 6 chiffres est affiché uniquement sur le PC et change à chaque lancement.</p>
          <div id="pcSessionCodePanel" class="pcSessionCodePanel hidden">
            <span>Code de session PC</span>
            <strong id="pcSessionCode">------</strong>
            <small>À saisir sur l’iPhone. Ce code ne va jamais dans le QR code.</small>
          </div>
        </div>
        <div class="loginRow">
          <input id="pinInput" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Code session" />
          <button onclick="unlockByPin()">Autoriser cet appareil</button>
          <button onclick="generateQr()">QR adresse</button>
        </div>
        <div id="qrBox" class="qrBox hidden">
          <img id="qrImage" alt="QR code de connexion" />
          <div><p>Scanne avec l’iPhone le QR code, puis entre le code affiché sur le PC.</p><small id="qrUrl"></small></div>
        </div>
        <p id="loginMessage" class="message"></p>
      </section>

      <div id="app" class="hidden">
        <div class="rotateHint">Tourne l’iPhone en mode paysage pour utiliser NeoPanel_Studio.</div>
        <section id="dash" class="page active">
          <div id="alertsBox" class="alertBox hidden"></div>
          <div id="cards" class="cards movable">
            <div class="card" draggable="true"><span>CPU</span><strong id="cpu">--%</strong><i id="cpuBar"></i></div>
            <div class="card" draggable="true"><span>GPU</span><strong id="gpu">--%</strong><i id="gpuBar"></i></div>
            <div class="card" draggable="true"><span>RAM</span><strong id="ram">--%</strong><i id="ramBar"></i></div>
          </div>
          <canvas id="cpuCanvas" width="640" height="140"></canvas>
        </section>

        <section id="clock" class="page">
          <div class="clockPage">
            <div id="bigClock" class="bigClock">--:--</div>
            <div id="bigDate" class="bigDate">--</div>
            <div class="clockGrid"><div>CPU <b id="clockCpu">--%</b></div><div>GPU <b id="clockGpu">--%</b></div><div>RAM <b id="clockRam">--%</b></div></div>
          </div>
        </section>

        <section id="cockpit" class="page">
          <h2>Mode Cockpit</h2>
          <div class="cockpitGrid"><div class="dial"><span>CPU</span><b id="cockpitCpu">--%</b></div><div class="dial"><span>GPU</span><b id="cockpitGpu">--%</b></div><div class="dial"><span>RAM</span><b id="cockpitRam">--%</b></div></div>
          <div class="telemetry"><p>FPS : <span id="fps">RTSS</span></p><p>Ping : <span id="ping">LAN</span></p><p>Download : <span id="download">--</span> Ko/s</p><p>Upload : <span id="upload">--</span> Ko/s</p></div>
        </section>

        <section id="weather" class="page">
          <h2>Météo</h2>
          <div class="weatherPanel cardlike">
            <div class="weatherMain"><span id="weatherCity">Ville non configurée</span><strong id="weatherTemp">--°</strong><em id="weatherDesc">Ajoute ta clé API.</em></div>
            <div class="weatherDetails"><p>Ressenti : <b id="weatherFeels">--</b></p><p>Humidité : <b id="weatherHumidity">--</b></p><p>Vent : <b id="weatherWind">--</b></p></div>
          </div>
          <div class="settingsBox weatherSettings">
            <input id="weatherCityInput" placeholder="Ville, ex : Calvi" />
            <input id="weatherApiInput" type="password" placeholder="Clé API OpenWeather" />
            <button onclick="saveWeatherSettings()">Sauvegarder / tester</button>
            <button onclick="loadWeather()">Actualiser</button>
          </div>
          <p id="weatherMessage" class="message"></p>
        </section>

        <section id="media" class="page"><h2>Contrôle multimédia</h2><div class="bigbuttons"><button onclick="sendAction('previous')">⏮</button><button onclick="sendAction('play-pause')">⏯</button><button onclick="sendAction('next')">⏭</button><button onclick="sendAction('volume-down')">🔉</button><button onclick="sendAction('mute')">🔇</button><button onclick="sendAction('volume-up')">🔊</button></div></section>

        <section id="audioapps" class="page">
          <h2>Volume par application</h2>
          <div class="settingsBox"><button onclick="loadAudioSessions()">Rafraîchir</button><button onclick="openVolumeMixer()">Ouvrir mélangeur Windows</button></div>
          <p id="audioSessionsMessage" class="message"></p>
          <div id="audioSessionsList" class="audioList cardlike"></div>
          <p class="message">Le contrôle précis fonctionne si SoundVolumeView.exe est placé dans le dossier tools du projet. Sinon, le bouton ouvre le mélangeur Windows.</p>
        </section>
        <section id="apps" class="page"><h2>Lancer une application</h2><div class="bigbuttons"><button onclick="launchApp('davinci')">DaVinci</button><button onclick="launchApp('steam')">Steam</button><button onclick="launchApp('obs')">OBS</button><button onclick="launchApp('discord')">Discord</button><button onclick="launchApp('chrome')">Chrome</button><button onclick="launchApp('blender')">Blender</button></div></section>

        <section id="customapps" class="page">
          <h2>Configuration des applications</h2>
          <p class="message">Détecte automatiquement les applications, corrige avec Parcourir, ou choisis un raccourci .lnk depuis le bureau.</p>
          <div class="bigbuttons"><button onclick="detectApps()">Détecter automatiquement</button><button onclick="saveAppsConfig()">Sauvegarder</button><button onclick="loadAppsConfig()">Recharger</button></div>
          <div id="appsConfigList" class="configList"></div>
          <p id="appsConfigMessage" class="message"></p>
          <p><a href="/docs/raccourcis-g19-neo.pdf" target="_blank">Ouvrir le PDF des raccourcis clavier à copier-coller</a></p>
        </section>

        <section id="custompages" class="page">
          <h2>Pages personnalisées</h2>
          <p class="message">Crée jusqu’à 3 pages destinées à tes logiciels. Chaque page peut avoir un chemin principal et 10 boutons configurables.</p>
          <div class="bigbuttons"><button onclick="saveAppsConfig()">Sauvegarder les pages</button><button onclick="loadAppsConfig()">Recharger</button><button onclick="renderCustomPagesRuntime()">Afficher les boutons</button></div>
          <div id="customPagesEditor" class="pagesEditor"></div>
          <h2>Boutons utilisables</h2>
          <div id="customPagesRuntime" class="runtimePages"></div>
          <p id="customPagesMessage" class="message"></p>
        </section>

        <section id="notes" class="page">
          <h2>Notes partagées</h2>
          <p class="message">Ces notes sont partagées entre l’interface PC et l’iPhone sur le réseau local.</p>
          <textarea id="sharedNotes" class="notesArea" placeholder="Écris une note ici..."></textarea>
          <div class="settingsBox"><button onclick="saveNotes()">Sauvegarder les notes</button><button onclick="loadNotes()">Recharger</button></div>
          <p id="notesMessage" class="message"></p>
        </section>

        <section id="davinci" class="page"><h2>DaVinci Resolve</h2><div class="bigbuttons"><button onclick="launchApp('davinci')">Lancer</button><button onclick="shortcut('davinci_play')">Lecture</button><button onclick="shortcut('davinci_cut')">Couper</button><button onclick="shortcut('davinci_marker')">Marqueur</button><button onclick="shortcut('davinci_undo')">Undo</button><button onclick="shortcut('davinci_redo')">Redo</button></div></section>
        <section id="obs" class="page"><h2>OBS</h2><div class="bigbuttons"><button onclick="launchApp('obs')">Lancer OBS</button><button onclick="shortcut('obs_start')">Start</button><button onclick="shortcut('obs_stop')">Stop</button><button onclick="shortcut('obs_record')">Record</button></div></section>
        <section id="browser" class="page"><h2>Navigateur</h2><div class="bigbuttons"><button onclick="launchApp('chrome')">Chrome</button><button onclick="shortcut('browser_refresh')">Actualiser</button><button onclick="shortcut('browser_fullscreen')">Plein écran PC</button><button onclick="shortcut('browser_newtab')">Nouvel onglet</button><button onclick="showInstallHelp()">Installer iPhone</button></div><div id="installHelp" class="installHelp hidden"><b>iPhone :</b> Safari → Partager → Ajouter à l’écran d’accueil. Ensuite, ouvre G19 Neo depuis l’icône : l’interface s’affiche sans barre Safari. Le vrai plein écran par bouton est bloqué par iOS.</div></section>

        <section id="system" class="page">
          <h2>Système</h2>
          <p>GPU actif : <span id="gpuName">--</span></p>
          <div class="settingsBox"><select id="gpuSelect"></select><button onclick="saveGpuChoice()">Utiliser ce GPU</button><button onclick="loadGpus()">Rafraîchir</button></div>
          <p>Disque : <span id="disk">--%</span></p><p>Clients : <span id="clients">--</span></p><p id="gpuMessage" class="message"></p>
        </section>

        <section id="diagnostic" class="page">
          <h2>Diagnostic</h2>
          <div class="bigbuttons"><button onclick="loadDiagnostic()">Rafraîchir diagnostic</button><button class="danger" onclick="restartServerConfirm()">Redémarrer serveur</button></div>
          <p id="diagnosticMessage" class="message"></p>
          <div id="diagnosticList" class="diagGrid"></div>
          <h2>Derniers logs</h2>
          <div id="diagnosticLogs" class="logsList cardlike"></div>
        </section>

        <section id="network" class="page">
          <h2>Réseau</h2>
          <div class="bigbuttons"><button onclick="loadNetwork()">Rafraîchir réseau</button><button onclick="copyNetworkUrl()">Copier adresse téléphone</button></div>
          <p id="networkMessage" class="message"></p>
          <div id="networkList" class="diagGrid"></div>
          <h2>Interfaces détectées</h2>
          <div id="networkInterfaces" class="logsList cardlike"></div>
        </section>

        <section id="themes" class="page"><h2>Thèmes</h2><div class="bigbuttons"><button onclick="setTheme('blue')">Blue LCD</button><button onclick="setTheme('amber')">Amber</button><button onclick="setTheme('green')">Green</button><button onclick="setTheme('red')">Red</button><button onclick="setTheme('wasteland')">Wasteland</button><button onclick="setTheme('space')">Space Opera</button><button onclick="setTheme('neon')">Neon City</button><button onclick="setTheme('oled')">OLED</button><button onclick="setTheme('cyberpunk')">Cyberpunk</button><button onclick="setTheme('rpg')">Fantasy RPG</button><button onclick="setTheme('tactical')">Tactical HUD</button><button onclick="setTheme('arcade')">Retro Arcade</button><button onclick="setTheme('stealth')">Stealth Ops</button><button onclick="setTheme('ocean')">Ocean Quest</button><button onclick="setTheme('racer')">Racing HUD</button><button onclick="setTheme('horror')">Horror Night</button></div></section>

        <section id="settings" class="page">
          <h2>Sécurité V10</h2>
          <div class="settingsBox">
            <div class="sessionCodeCard">
              <span>Code de session affiché sur le PC</span>
              <strong id="sessionCodeBox">------</strong>
              <small>Le QR code ne contient pas ce code.</small>
            </div>
            <button onclick="loadSecurityDevices()">Rafraîchir sécurité</button>
            <button class="danger" onclick="disconnectAllDevices()">Déconnecter tous les appareils</button>
            <button onclick="resetSecurity()">Réinitialiser appareils autorisés</button>
          </div>
          <p id="securityMessage" class="message"></p>
          <h2>Appareils autorisés / bloqués</h2>
          <div id="securityDevicesList" class="securityList cardlike"></div>
          <h2>Journal sécurité</h2>
          <div id="securityEventsList" class="logsList cardlike"></div>

          <h2>Code de session</h2>
          <div class="settingsBox"><input id="oldPin" type="password" inputmode="numeric" placeholder="Code actuel" /><input id="newPin" type="password" inputmode="numeric" placeholder="Non utilisé en V10" /><button onclick="changePin()">Information code V10</button></div>
          <p class="message">En V10, le code est généré automatiquement à chaque lancement. Pour le changer, redémarre NeoPanel Studio.</p><p id="settingsMessage" class="message"></p>

          <h2>Réparer session</h2>
          <div class="settingsBox"><button onclick="repairSession()">Supprimer le token local et reconnecter</button></div>
          <p class="message">Utile si l’application affiche “Session invalide”. Cela force la création d’un nouveau token après saisie du PIN.</p>

          <h2>Mode performance faible</h2>
          <div class="settingsBox"><label class="checkline"><input id="performanceMode" type="checkbox" onchange="togglePerformanceMode()" /> Réduire les rafraîchissements et les animations</label></div>
          <p id="performanceMessage" class="message"></p>

          <h2>Alertes</h2>
          <div class="settingsBox alertSettings"><label><input id="alertsEnabled" type="checkbox" /> Alertes actives</label><input id="alertCpu" type="number" placeholder="CPU %" /><input id="alertGpu" type="number" placeholder="GPU %" /><input id="alertRam" type="number" placeholder="RAM %" /><input id="alertDisk" type="number" placeholder="Disque %" /><button onclick="saveAlertSettings()">Sauvegarder alertes</button></div>
          <p id="alertsMessage" class="message"></p>

          <h2>Logs</h2>
          <div class="settingsBox"><button onclick="loadLogs()">Rafraîchir les logs</button></div><div id="logsList" class="logsList cardlike"></div>

          <h2>Volume par application</h2>
          <div class="settingsBox"><button onclick="showPage('audioapps')">Ouvrir la page Audio apps</button><button onclick="openVolumeMixer()">Ouvrir mélangeur Windows</button></div><p class="message">Test séparé dans la page Audio apps.</p>
        </section>

        <section id="about" class="page"><h2>À propos</h2><p><b><h1>À quoi sert NeoDeck ?</h1></b></p>
          <p>NeoPanel_Studio est un logiciel qui permet de transformer un ancien smartphone, une tablette ou un petit écran secondaire en tableau de bord de contrôle pour PC Windows.</p>
          <p>L’objectif est simple : donner une seconde vie à un appareil inutilisé, tout en offrant un accès rapide aux informations et commandes importantes du PC.</p>
          <p>Depuis le téléphone, il est possible de :</p></section>
          <li>surveiller l’utilisation du CPU et de la RAM ; </li>
          <li>afficher l’heure, la météo et les informations système ;</li>
<li>contrôler la musique ;</li>
<li></li>lancer des applications ;</li>
<li></li>utiliser des raccourcis pour DaVinci Resolve, OBS, le navigateur ou d’autres logiciels ;</li>
<li></li>créer ses propres pages personnalisées ;</li>
<li></li>configurer des boutons adaptés à ses besoins ;</li>
<li>accéder à une interface locale sans cloud, sans compte et sans serveur externe.</li>
<br>
<p>Le logiciel fonctionne sur le réseau local : le PC héberge l’interface, et le téléphone s’y connecte simplement avec <strong>l’adresse locale</strong> ou un <strong>QR code.</strong>
Aucune donnée personnelle n’est envoyée sur Internet.</p>
<br>
<br>
<p>Pour contribuer au projet, téléchargez ou contactez-nous. Visitez notre <a href="https://github.com/Patone2B/NeoPanel_Studio.git">dépôt GitHub</a>.</p>
      </div>
    </section>
  </main>

  <div id="setupWizard" class="setupWizard hidden">
    <div class="setupCard">
      <h2>Assistant de premier lancement</h2>
      <p>1. Crée ou vérifie ton PIN dans Réglages.</p>
      <p>2. Détecte automatiquement les applications.</p>
      <p>3. Corrige les chemins avec Parcourir si besoin.</p>
      <p>4. Scanne le QR code avec l’iPhone.</p>
      <div class="bigbuttons"><button onclick="showPage('customapps'); closeSetupWizard(false)">Configurer les apps</button><button onclick="finishSetupWizard()">Terminer</button></div>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="app.js"></script>
</body>
</html>
