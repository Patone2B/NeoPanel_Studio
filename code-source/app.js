let socket = null;
let token = localStorage.getItem("neopanelToken") || "";
let cpuHistory = Array(30).fill(0);
let draggedCard = null;
let latestStats = null;
let drawing = false;
let deferredInstallPrompt = null;
let audioSessionsCache = [];

function setupSocket() {
  if (socket) {
    try { socket.disconnect(); } catch {}
  }

  socket = io({ auth: { token } });

  socket.on("connect", () => setText("status", "Connecté"));
  socket.on("disconnect", () => setText("status", "Déconnecté"));
  socket.on("connect_error", err => {
    setText("status", "Socket refusé");
    if (token) setText("loginMessage", err.message || "Connexion refusée");
  });
  socket.on("clients", data => setText("clients", data.count));
  socket.on("stats", data => { latestStats = data; if (!drawing) { drawing = true; requestAnimationFrame(renderStats); } });
  socket.on("security-alert", data => {
    const msg = data?.message || "Nouvel événement sécurité.";
    setText("securityMessage", msg);
    loadSecurityDevices();
  });
  socket.on("notes-updated", data => {
    const el = document.getElementById('sharedNotes');
    if (el && document.activeElement !== el) el.value = data.notes || '';
  });
}

init();

async function init() {
  registerServiceWorker();
  setupSocket();
  await loadPcSessionCode();
  initPairingFromUrl();
  initDragCards();
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstallPrompt = e; });
  const savedTheme = localStorage.getItem("neopanelTheme"); if (savedTheme) setTheme(savedTheme);
  if (token) await verifyStoredSession();
  loadGpus();
  loadWeatherSettings();
  loadWeather();
}

async function loadPcSessionCode() {
  try {
    const res = await fetch("/api/info", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    const panel = document.getElementById("pcSessionCodePanel");
    const codeEl = document.getElementById("pcSessionCode");
    if (data.sessionCode && panel && codeEl) {
      codeEl.textContent = data.sessionCode;
      panel.classList.remove("hidden");
      setText("loginMessage", "Code affiché sur le PC. Sur iPhone, entre ce code après avoir scanné le QR.");
    } else if (panel) {
      panel.classList.add("hidden");
    }
  } catch {}
}

function initPairingFromUrl() {
  const params = new URLSearchParams(location.search);
  const pair = params.get("pair");
  if (!pair) return;
  pairWithCode(pair);
}

async function unlockByPin() {
  const pin = document.getElementById("pinInput").value.trim();
  const deviceInfo = await getBrowserDeviceInfo();
  const deviceName = buildReadableDeviceName(deviceInfo);
  const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, deviceName, deviceInfo }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return setText("loginMessage", data.error || "PIN incorrect");
  token = data.token;
  localStorage.setItem("neopanelToken", token);
  showApp();
  loadSecurityDevices();
}


async function getBrowserDeviceInfo() {
  const info = { userAgent: navigator.userAgent, platform: navigator.platform || '', mobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) };
  try {
    if (navigator.userAgentData) {
      info.mobile = Boolean(navigator.userAgentData.mobile);
      info.platform = navigator.userAgentData.platform || info.platform;
      info.brands = navigator.userAgentData.brands || [];
      if (navigator.userAgentData.getHighEntropyValues) {
        const high = await navigator.userAgentData.getHighEntropyValues(['architecture','model','platformVersion','uaFullVersion','fullVersionList']);
        Object.assign(info, high);
      }
    }
  } catch {}
  return info;
}

function buildReadableDeviceName(info) {
  const ua = info?.userAgent || navigator.userAgent;
  const model = info?.model || (/iPhone/i.test(ua) ? 'iPhone' : (/iPad/i.test(ua) ? 'iPad' : (/Android/i.test(ua) ? 'Android' : 'PC')));
  const platform = info?.platform || navigator.platform || '';
  const browser = Array.isArray(info?.brands) && info.brands.length ? info.brands.map(b => b.brand || b).join(', ') : detectBrowserClient(ua);
  return [model, platform, browser].filter(Boolean).join(' - ').slice(0, 120);
}

function detectBrowserClient(ua) {
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Navigateur';
}

async function generateQr() {
  const res = await fetch("/api/pairing-qr");
  const data = await res.json();
  document.getElementById("qrImage").src = data.qr;
  document.getElementById("qrUrl").textContent = data.url || "";
  document.getElementById("qrBox").classList.remove("hidden");
  setText("loginMessage", "Scanne le QR avec l'iPhone puis entre le code de session affiché sur le PC.");
}

async function pairWithCode(code) {
  const res = await fetch("/api/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
  const data = await res.json().catch(() => ({}));
  history.replaceState({}, document.title, "/");
  setText("loginMessage", data.message || data.error || "Entre le code de session affiché sur le PC.");
}

async function verifyStoredSession() {
  try {
    const res = await fetch("/api/session?token=" + encodeURIComponent(token));
    const data = await res.json();
    if (data.valid) return showApp();
  } catch {}
  localStorage.removeItem("neopanelToken");
  token = "";
  setText("loginMessage", "Session expirée. Entre le code de session affiché sur le PC.");
}

function showApp() { document.getElementById("loginBox").classList.add("hidden"); document.getElementById("app").classList.remove("hidden"); setupSocket(); loadSecurityDevices(); }
function showPage(id) { document.querySelectorAll(".page").forEach(p => p.classList.remove("active")); document.getElementById(id)?.classList.add("active"); if (id === "system") loadGpus(); if (id === "weather") loadWeather(); if (id === "audioapps") loadAudioSessions(); if (id === "diagnostic") loadDiagnostic(); if (id === "network") loadNetwork(); if (id === "customapps") loadAppsConfig(); if (id === "notes") loadNotes(); if (id === "settings") { loadPerformanceMode(); loadAlertSettings(); loadLogs(); loadSecurityDevices(); } }


function renderStats() {
  drawing = false;
  const data = latestStats || {};
  setText("time", data.time); setText("date", data.date || ""); setText("bigClock", data.time); setText("bigDate", data.date || "");
  setText("cpu", data.cpu + "%"); setText("gpu", data.gpu + "%"); setText("ram", data.ram + "%");
  setText("disk", data.disk + "%"); setText("download", data.download); setText("upload", data.upload); setText("gpuName", data.gpuName);
  setText("fps", data.fps); setText("ping", data.ping); setText("clockCpu", data.cpu + "%"); setText("clockGpu", data.gpu + "%"); setText("clockRam", data.ram + "%");
  setText("cockpitCpu", data.cpu + "%"); setText("cockpitGpu", data.gpu + "%"); setText("cockpitRam", data.ram + "%");
  renderAlerts(data.alerts || []);
  setBar("cpuBar", data.cpu); setBar("gpuBar", data.gpu); setBar("ramBar", data.ram);
  cpuHistory.push(data.cpu || 0); if (cpuHistory.length > 30) cpuHistory.shift(); drawGraph();
}

async function sendAction(action) { return postAction({ action }); }
async function launchApp(appName) { return postAction({ action: "launch", appName }); }
async function shortcut(shortcut) { return postAction({ action: "shortcut", shortcut }); }
async function audioDevice(audioDevice) { return postAction({ action: "audio", audioDevice }); }

async function postAction(payload) {
  try {
    const res = await fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...payload }) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      localStorage.removeItem("neopanelToken");
      location.reload();
      return data;
    }
    if (!res.ok || data.ok === false) {
      const message = data.error || "Action impossible.";
      setText("appsActionMessage", message);
      setText("appsConfigMessage", message);
      return data;
    }
    setText("appsActionMessage", data.message || "Application lancée.");
    return data;
  } catch {
    const message = "Le serveur ne répond pas. Vérifie la connexion locale.";
    setText("appsActionMessage", message);
    setText("appsConfigMessage", message);
    return { ok: false, error: message };
  }
}


async function resetSecurity() {
  const res = await fetch("/api/reset-security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
  setText("settingsMessage", res.ok ? "Appareils autorisés réinitialisés." : "Erreur de réinitialisation");
  if (res.ok) { localStorage.removeItem("neopanelToken"); token = ""; setTimeout(() => location.reload(), 900); }
}

async function repairSession() {
  const oldToken = token || localStorage.getItem("neopanelToken") || "";
  const res = await fetch("/api/repair-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: oldToken }) });
  const data = await res.json().catch(() => ({}));
  localStorage.removeItem("neopanelToken");
  token = "";
  setText("settingsMessage", data.message || "Session réparée. Reconnecte-toi avec le PIN.");
  setTimeout(() => location.reload(), 900);
}


async function loadSecurityDevices() {
  try {
    const res = await fetch('/api/security/devices', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (!res.ok) return;
    const data = await res.json();
    setText('sessionCodeBox', data.sessionCode || '------');

    const list = document.getElementById('securityDevicesList');
    if (list) {
      const devices = data.devices || [];
      list.innerHTML = devices.length ? devices.map(d => `
        <div class="securityDevice">
          <div>
            <b>${escapeHtml(d.deviceName || 'Appareil')}</b>
            <small>${escapeHtml(d.os || '')} / ${escapeHtml(d.browser || '')}</small>
            <small>Modèle : ${escapeHtml(d.model || (d.mobile ? 'Mobile' : 'PC'))}</small>
            <small>Marque/navigateur : ${escapeHtml(d.brand || '')}</small>
            <small>IP : ${escapeHtml(d.ip || '')}</small>
            <small>Détails : ${escapeHtml(d.details || '')}</small>
            <small>Dernière activité : ${d.lastSeen ? new Date(d.lastSeen).toLocaleString('fr-FR') : '--'}</small>
            <small>Statut : ${escapeHtml(d.status || '')}</small>
          </div>
          <div class="securityActions">
            ${d.ip && d.status !== 'blocked' ? `<button class="danger" onclick="blockDevice('${escapeAttr(d.ip)}')">Bloquer</button>` : ''}
            ${d.ip && d.status === 'blocked' ? `<button onclick="unblockDevice('${escapeAttr(d.ip)}')">Débloquer</button>` : ''}
          </div>
        </div>`).join('') : '<p>Aucun appareil distant autorisé pour cette session.</p>';
    }

    const events = document.getElementById('securityEventsList');
    if (events) {
      events.innerHTML = (data.events || []).map(e => `<p><b>${escapeHtml(e.time)}</b> ${escapeHtml(e.message)}</p>`).join('') || '<p>Aucun événement sécurité.</p>';
    }
  } catch {}
}

async function blockDevice(ip) {
  const res = await fetch('/api/security/block', { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + token}, body: JSON.stringify({ token, ip }) });
  const data = await res.json().catch(() => ({}));
  setText('securityMessage', res.ok ? 'Appareil bloqué : ' + ip : (data.error || 'Blocage impossible'));
  loadSecurityDevices();
}

async function unblockDevice(ip) {
  const res = await fetch('/api/security/unblock', { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + token}, body: JSON.stringify({ token, ip }) });
  const data = await res.json().catch(() => ({}));
  setText('securityMessage', res.ok ? 'Appareil débloqué : ' + ip : (data.error || 'Déblocage impossible'));
  loadSecurityDevices();
}

async function disconnectAllDevices() {
  const ok = confirm('Déconnecter tous les appareils distants ?');
  if (!ok) return;
  const res = await fetch('/api/security/disconnect-all', { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + token}, body: JSON.stringify({ token }) });
  setText('securityMessage', res.ok ? 'Tous les appareils distants sont déconnectés.' : 'Déconnexion impossible.');
  loadSecurityDevices();
}


async function togglePerformanceMode() {
  const enabled = document.getElementById("performanceMode").checked;
  const res = await fetch("/api/performance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, enabled }) });
  const data = await res.json().catch(() => ({}));
  setText("performanceMessage", res.ok ? (data.enabled ? "Mode performance faible activé." : "Mode performance faible désactivé.") : (data.error || "Erreur performance"));
}

async function loadPerformanceMode() {
  try { const res = await fetch("/api/performance"); const data = await res.json(); const el = document.getElementById("performanceMode"); if (el) el.checked = Boolean(data.enabled); } catch {}
}

async function loadLogs() {
  try {
    const res = await fetch("/api/logs"); const data = await res.json();
    const box = document.getElementById("logsList"); if (!box) return;
    box.innerHTML = (data.logs || []).map(l => `<p><b>${escapeHtml(l.time)}</b> [${escapeHtml(l.type)}] ${escapeHtml(l.message)}</p>`).join("") || "<p>Aucun log pour l’instant.</p>";
  } catch {}
}

async function loadAlertSettings() {
  try {
    const res = await fetch("/api/alerts/settings"); const data = await res.json(); const a = data.alerts || {};
    setChecked("alertsEnabled", a.enabled); setValue("alertCpu", a.cpu); setValue("alertGpu", a.gpu); setValue("alertRam", a.ram); setValue("alertDisk", a.disk);
  } catch {}
}

async function saveAlertSettings() {
  const alerts = { enabled: document.getElementById("alertsEnabled").checked, cpu: val("alertCpu"), gpu: val("alertGpu"), ram: val("alertRam"), disk: val("alertDisk") };
  const res = await fetch("/api/alerts/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, alerts }) });
  const data = await res.json().catch(() => ({}));
  setText("alertsMessage", res.ok ? "Alertes sauvegardées." : (data.error || "Erreur alertes"));
}

async function loadAudioSessions() {
  try {
    const res = await fetch("/api/audio/sessions");
    const data = await res.json();
    setText("audioSessionsMessage", data.message || "Contrôle audio par application indisponible.");
    const list = document.getElementById("audioSessionsList");
    if (!list) return;
    const sessions = data.sessions || [];
    audioSessionsCache = sessions;
    if (!sessions.length) { list.innerHTML = "<p>Aucune application audio contrôlable détectée.</p>"; return; }
    list.innerHTML = sessions.map((item, idx) => `
      <div class="audioRow">
        <div><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.app || "")}</small></div>
        <input id="appVol${idx}" type="range" min="0" max="100" value="${item.volume ?? 50}" />
        <button onclick="setApplicationVolumeByIndex(${idx})">Appliquer</button>
      </div>`).join("");
  } catch { setText("audioSessionsMessage", "Erreur lecture audio."); }
}

async function setApplicationVolumeByIndex(index) {
  const item = audioSessionsCache[index];
  if (!item) return setText("audioSessionsMessage", "Session audio introuvable.");
  const volume = document.getElementById("appVol" + index)?.value ?? 50;
  return setApplicationVolume(item.id, volume);
}

async function setApplicationVolume(session, volume) {
  const res = await fetch("/api/audio/app-volume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, session, volume }) });
  const data = await res.json().catch(() => ({}));
  setText("audioSessionsMessage", res.ok ? (data.message || "Volume modifié.") : (data.error || "Volume par application indisponible."));
}

async function openVolumeMixer() {
  const res = await fetch("/api/audio/open-mixer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
  const data = await res.json().catch(() => ({}));
  setText("audioSessionsMessage", data.message || (res.ok ? "Mélangeur ouvert." : "Erreur ouverture mélangeur."));
}

async function loadDiagnostic() {
  try {
    const res = await fetch("/api/diagnostic?token=" + encodeURIComponent(token));
    const data = await res.json();
    const box = document.getElementById("diagnosticList");
    if (box) box.innerHTML = [
      ["Version", data.version], ["Token valide", data.tokenValid ? "Oui" : "Non"], ["Clients", data.clients],
      ["URL PC", data.localUrl], ["URL téléphone", data.networkUrl], ["GPU actif", data.gpuActive],
      ["GPU", data.gpuValue + "%"], ["Source GPU", data.gpuSource || "--"], ["GPU détectés", data.gpuCount],
      ["Météo", data.weatherConfigured ? "Configurée" : "Non configurée"], ["Mode faible", data.performanceMode ? "Oui" : "Non"],
      ["Node", data.node], ["Plateforme", data.platform + " " + data.arch], ["Mémoire", data.memoryMb], ["Dossier data", data.dataDir]
    ].map(([k,v]) => `<div class="diagItem"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("");
    const logs = document.getElementById("diagnosticLogs");
    if (logs) logs.innerHTML = (data.recentLogs || []).map(l => `<p><b>${escapeHtml(l.time)}</b> [${escapeHtml(l.type)}] ${escapeHtml(l.message)}</p>`).join("") || "<p>Aucun log.</p>";
    setText("diagnosticMessage", "Diagnostic actualisé.");
  } catch { setText("diagnosticMessage", "Erreur diagnostic."); }
}

async function restartServerConfirm() {
  const ok = confirm("Redémarrer le serveur NeoPanel Studio ? L'application va se relancer.");
  if (!ok) return;
  const confirmText = prompt("Pour confirmer, écris exactement : REDEMARRER");
  if (confirmText !== "REDEMARRER") return setText("diagnosticMessage", "Redémarrage annulé.");
  const res = await fetch("/api/restart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, confirm: confirmText }) });
  const data = await res.json().catch(() => ({}));
  setText("diagnosticMessage", data.message || data.error || "Redémarrage demandé.");
}

async function loadNetwork() {
  try {
    const res = await fetch("/api/network");
    const data = await res.json();
    const box = document.getElementById("networkList");
    if (box) box.innerHTML = [["Nom PC", data.hostname], ["Port", data.port], ["Adresse PC", data.localUrl], ["Adresse téléphone", data.networkUrl], ["Clients", data.clients]].map(([k,v]) => `<div class="diagItem"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("");

    const interfaces = document.getElementById("networkInterfaces");
    const ipv4 = Array.isArray(data.interfaces) ? data.interfaces.filter(n => n && n.address) : [];
    if (interfaces) {
      if (ipv4.length) {
        interfaces.innerHTML = ipv4.map(n => {
          const tags = [n.internal ? "interne" : "réseau", n.private ? "privée" : "publique"].join(" · ");
          return `<p><b>${escapeHtml(n.name || "Interface réseau")}</b> — ${escapeHtml(n.address)}<br><small>${escapeHtml(tags)}${n.cidr ? " · " + escapeHtml(n.cidr) : ""}</small></p>`;
        }).join("");
      } else {
        const usedAddress = data.selectedAddress || location.hostname || "127.0.0.1";
        interfaces.innerHTML = `<p><b>Adresse utilisée par NeoPanel</b> — ${escapeHtml(usedAddress)}</p><p class="message">Aucune autre interface IPv4 n’a été remontée par Windows. Si le téléphone se connecte, NeoPanel fonctionne normalement. Un VPN ou une carte virtuelle peut modifier cette liste.</p>`;
      }
    }
    setText("networkMessage", ipv4.length ? `${ipv4.length} interface(s) IPv4 détectée(s).` : "Connexion active, mais aucune autre interface IPv4 n’est listée par Windows.");
  } catch { setText("networkMessage", "Impossible de lire les informations réseau."); }
}

async function copyNetworkUrl() {
  try {
    const res = await fetch("/api/network"); const data = await res.json();
    await navigator.clipboard.writeText(data.networkUrl || "");
    setText("networkMessage", "Adresse téléphone copiée : " + data.networkUrl);
  } catch { setText("networkMessage", "Copie impossible. Rafraîchis la page réseau."); }
}

function renderAlerts(alerts) {
  const box = document.getElementById("alertsBox"); if (!box) return;
  if (!alerts.length) { box.classList.add("hidden"); box.textContent = ""; return; }
  box.classList.remove("hidden"); box.textContent = "Alerte : " + alerts.join(" / ");
}

async function loadGpus() {
  try {
    const res = await fetch("/api/gpus"); const data = await res.json(); if (!data.ok) return;
    const select = document.getElementById("gpuSelect"); if (!select) return;
    select.innerHTML = "";
    data.gpus.forEach(g => { const opt = document.createElement("option"); opt.value = g.index; opt.textContent = `${g.index + 1} - ${g.name}${g.vram ? " / " + Math.round(g.vram) + " MB" : ""}`; select.appendChild(opt); });
    select.value = data.selectedGpuIndex;
  } catch {}
}

async function saveGpuChoice() {
  const index = Number(document.getElementById("gpuSelect").value || 0);
  const res = await fetch("/api/gpu/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, index }) });
  const data = await res.json().catch(() => ({}));
  setText("gpuMessage", res.ok ? "GPU sauvegardé." : (data.error || "Erreur GPU"));
}

async function loadWeatherSettings() {
  try {
    const res = await fetch("/api/weather/settings");
    const data = await res.json();
    setValue("weatherCityInput", data.city || "");
    setText("weatherKeyStatus", data.configured ? "Clé API déjà enregistrée. Laisse le champ vide pour la conserver." : "Aucune clé API enregistrée.");
  } catch {}
}

async function saveWeatherSettings() {
  const city = document.getElementById("weatherCityInput").value.trim();
  const apiKey = document.getElementById("weatherApiInput").value.trim();
  const res = await fetch("/api/weather/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, city, apiKey, units: "metric" }) });
  const data = await res.json().catch(() => ({}));
  setText("weatherMessage", res.ok && data.ok ? (data.keyPreserved ? "Météo mise à jour. La clé enregistrée a été conservée." : "Météo configurée.") : (data.error || "Erreur météo"));
  setText("weatherKeyStatus", data.configured ? "Clé API déjà enregistrée. Laisse le champ vide pour la conserver." : "Aucune clé API enregistrée.");
  if (res.ok && data.ok) document.getElementById("weatherApiInput").value = "";
  renderWeather(data);
}

async function loadWeather() {
  try { const res = await fetch("/api/weather"); const data = await res.json(); renderWeather(data); } catch {}
}

function renderWeather(data) {
  if (!data || !data.ok) { setText("weatherDesc", data?.error || "Météo non disponible"); return; }
  setText("weatherCity", data.city || "--"); setText("weatherTemp", data.temp + "°C"); setText("weatherDesc", data.description || "--");
  setText("weatherFeels", data.feels + "°C"); setText("weatherHumidity", data.humidity + "%"); setText("weatherWind", data.wind + " km/h");
}

function installFullscreen() {
  showInstallHelp();
}

function showInstallHelp() {
  const box = document.getElementById("installHelp");
  if (box) box.classList.toggle("hidden");
  setText("status", "iPhone : Safari → Partager → Ajouter à l’écran d’accueil");
}

function setTheme(theme) { document.body.className = theme === "blue" ? "" : theme; localStorage.setItem("neopanelTheme", theme); }
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value ?? ""; }
function setValue(id, value) { const el = document.getElementById(id); if (el) el.value = value ?? ""; }
function setChecked(id, value) { const el = document.getElementById(id); if (el) el.checked = Boolean(value); }
function val(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function escapeHtml(text) { return String(text ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "\'":"&#039;" }[c] || c)); }
function escapeAttr(text) { return escapeHtml(text).replace(/`/g, "&#096;"); }
function setBar(id, value) { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, Math.min(100, value || 0)) + "%"; }

function drawGraph() {
  const canvas = document.getElementById("cpuCanvas"); if (!canvas) return;
  const ctx = canvas.getContext("2d"); const accent = getComputedStyle(document.body).getPropertyValue("--accent");
  ctx.clearRect(0,0,canvas.width,canvas.height); ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath();
  cpuHistory.forEach((value,index) => { const x = (index/(cpuHistory.length-1))*canvas.width; const y = canvas.height - ((value||0)/100)*canvas.height; index === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y); });
  ctx.stroke();
}

function initDragCards() {
  document.querySelectorAll(".card[draggable='true']").forEach(card => {
    card.addEventListener("dragstart", () => draggedCard = card);
    card.addEventListener("dragover", e => e.preventDefault());
    card.addEventListener("drop", e => { e.preventDefault(); if (draggedCard && draggedCard !== card) card.parentNode.insertBefore(draggedCard, card.nextSibling); });
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}


let appsConfigCache = { defaults: {}, appPaths: {} };

async function checkSetupWizard() {
  try {
    const res = await fetch('/api/setup');
    const data = await res.json();
    if (data.ok && !data.firstLaunchDone) document.getElementById('setupWizard')?.classList.remove('hidden');
  } catch {}
}

function closeSetupWizard() { document.getElementById('setupWizard')?.classList.add('hidden'); }

async function finishSetupWizard() {
  await fetch('/api/setup/done', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token }) });
  closeSetupWizard();
}

async function loadAppsConfig() {
  try {
    const res = await fetch('/api/apps/config');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur configuration');
    appsConfigCache = data;
    renderAppsConfig();
  } catch (err) { setText('appsConfigMessage', err.message); }
}

function renderAppsConfig() {
  const box = document.getElementById('appsConfigList');
  if (!box) return;
  const defaults = appsConfigCache.defaults || {};
  const appPaths = appsConfigCache.appPaths || {};
  box.innerHTML = Object.entries(defaults).map(([key, item]) => {
    const value = escapeHtml(appPaths[key] || item.path || '');
    return `<div class="configRow"><b>${escapeHtml(item.label || key)}</b><input id="appPath_${key}" value="${value}" placeholder="Chemin .exe ou raccourci .lnk" /><button onclick="browseAppPath('${key}')">Parcourir</button><button onclick="launchPathFromConfig('${key}')">Tester</button></div>`;
  }).join('');
}


function collectAppsConfig() {
  const defaults = appsConfigCache.defaults || {};
  const appPaths = {};
  for (const key of Object.keys(defaults)) appPaths[key] = document.getElementById('appPath_' + key)?.value || '';
  return { appPaths };
}

async function saveAppsConfig() {
  try {
    const payload = collectAppsConfig();
    const res = await fetch('/api/apps/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, ...payload }) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur sauvegarde');
    setText('appsConfigMessage', 'Configuration sauvegardée.');
    await loadAppsConfig();
  } catch (err) { setText('appsConfigMessage', err.message); }
}

async function detectApps() {
  try {
    const res = await fetch('/api/apps/detect', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token }) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur détection');
    setText('appsConfigMessage', 'Détection terminée. Corrige avec Parcourir si besoin.');
    await loadAppsConfig();
  } catch (err) { setText('appsConfigMessage', err.message); }
}

async function browseAppPath(key) {
  const selected = await browseFile('app');
  if (selected) document.getElementById('appPath_' + key).value = selected;
}


async function browseFile(kind) {
  try {
    const res = await fetch('/api/browse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ kind }) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Aucun fichier');
    return data.path;
  } catch (err) { alert(err.message); return ''; }
}

async function launchPathFromConfig(key) {
  const p = document.getElementById('appPath_' + key)?.value;
  return postAction({ action:'launchPath', path:p });
}




async function loadNotes() {
  try { const res = await fetch('/api/notes'); const data = await res.json(); if (data.ok) document.getElementById('sharedNotes').value = data.notes || ''; } catch {}
}
async function saveNotes() {
  try { const notes = document.getElementById('sharedNotes')?.value || ''; const res = await fetch('/api/notes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, notes }) }); const data = await res.json(); if (!data.ok) throw new Error(data.error || 'Erreur'); setText('notesMessage','Notes sauvegardées.'); } catch (err) { setText('notesMessage', err.message); }
}

setTimeout(checkSetupWizard, 600);
