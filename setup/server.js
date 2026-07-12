const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const si = require("systeminformation");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const fs = require("fs");
const QRCode = require("qrcode");
const { execFile } = require("child_process");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const APP_VERSION = "V10.3";
const SESSION_CODE = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const DEFAULT_PIN = SESSION_CODE;

// Données utilisateur Windows : PIN, notes, météo, appareils, pages personnalisées.
// On évite d'écrire dans le dossier d'installation (ex: Program Files).
const DATA_DIR = getUserDataDir();

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");

function getUserDataDir() {
  const appName = "NeoPanel Studio";

  // Windows : C:\Users\Nom\AppData\Roaming\NeoPanel Studio\data
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, appName, "data");
  }

  // macOS : ~/Library/Application Support/NeoPanel Studio/data
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName, "data");
  }

  // Linux : ~/.config/NeoPanel Studio/data
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, appName, "data");
  }

  return path.join(os.homedir(), ".config", appName, "data");
}

const defaultSettings = {
  pinHash: hashPin(DEFAULT_PIN),
  performanceMode: false,
  firstLaunchDone: false,
  alerts: { enabled: true, cpu: 90, gpu: 90, ram: 90, disk: 90 },
  statsIntervalMs: 4000,
  gpuIntervalMs: 8000,
  maxLoginAttempts: 5,
  lockMs: 120000,
  selectedGpuIndex: 0,
  weather: { apiKey: "", city: "Calvi", units: "metric" },
  trustedDevices: {},
  blockedIps: [],
  securityEvents: [],
  appPaths: {},
  customPages: [
    { id: "page1", title: "Page 1", appPath: "", buttons: [] },
    { id: "page2", title: "Page 2", appPath: "", buttons: [] },
    { id: "page3", title: "Page 3", appPath: "", buttons: [] }
  ]
};

let settings = loadSettings();
let gpuCache = { gpu: 0, vram: 0, gpuName: "GPU", selectedGpuIndex: settings.selectedGpuIndex, gpuList: [], gpuSource: "systeminformation" };
let weatherCache = { updatedAt: 0, data: null, error: "Météo non configurée" };
const appLogs = [];
let connectedClients = 0;

const sessions = new Map();
const loginFailures = new Map();
const pairingCodes = new Map();
const apiHits = new Map();
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: false } });

  app.set("trust proxy", false);

  // V10.2 : en-têtes de durcissement navigateur.
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });

  // V10.2 : mini anti-abus pour éviter de spammer le serveur local.
  app.use((req, res, next) => {
    const ip = normalizeIp(getIp(req));
    if (!rateLimitIp(ip, 180, 60_000)) {
      logSecurity("rate-limit", req, `Trop de requêtes depuis ${ip}`);
      return res.status(429).json({ ok: false, error: "Trop de requêtes. Réessaie dans une minute." });
    }
    next();
  });

  // V10 : sécurité réseau globale.
  // Le serveur écoute sur 0.0.0.0 pour rester accessible au téléphone,
  // mais chaque requête est filtrée : uniquement loopback ou réseau local privé.
  app.use((req, res, next) => {
    const ip = normalizeIp(getIp(req));
    if (!isAllowedNetworkIp(ip)) {
      logSecurity("blocked-network", req, `Connexion refusée hors réseau local : ${ip}`);
      return denyRequest(req, res, "Accès refusé : réseau local uniquement.");
    }
    if (isIpBlocked(ip)) {
      logSecurity("blocked-ip", req, `Connexion refusée : appareil bloqué ${ip}`);
      return denyRequest(req, res, "Appareil bloqué depuis le PC.");
    }
    next();
  });

  app.use(express.static(path.join(__dirname, "public"), { maxAge: "0", etag: false }));
  app.use(express.json({ limit: "600kb" }));

  app.use("/api", (req, res, next) => {
    if (!CSRF_SAFE_METHODS.has(req.method) && !isAllowedOrigin(req)) {
      logSecurity("bad-origin", req, `Origine refusée : ${req.headers.origin || req.headers.referer || "sans origine"}`);
      return res.status(403).json({ ok: false, error: "Origine refusée." });
    }

    if (isPublicApiRoute(req)) return next();
    if (isLocalRequest(req)) return next();

    const token = extractToken(req);
    if (!isValidToken(token, req)) {
      logSecurity("unauthorized-api", req, `API refusée sans appareil autorisé : ${req.method} ${req.path}`);
      return res.status(403).json({ ok: false, error: "Appareil non autorisé. Entre le code de session affiché sur le PC." });
    }
    next();
  });

  app.get("/api/info", (req, res) => {
    res.json({
      ok: true,
      version: APP_VERSION,
      localUrl: `http://127.0.0.1:${PORT}`,
      networkUrl: `http://${getLanIp()}:${PORT}`,
      pinEnabled: true,
      qrEnabled: true,
      selectedGpuIndex: settings.selectedGpuIndex,
      weatherConfigured: Boolean(settings.weather.apiKey),
      performanceMode: Boolean(settings.performanceMode),
      sessionCode: isLocalRequest(req) ? SESSION_CODE : undefined
    });
  });

  app.get("/api/session", (req, res) => {
    const token = String(req.headers.authorization || req.query.token || "").replace(/^Bearer\s+/i, "");
    res.json({ ok: true, valid: isValidToken(token) });
  });

  app.get("/api/diagnostic", async (req, res) => {
    const token = String(req.headers.authorization || req.query.token || "").replace(/^Bearer\s+/i, "");
    const diag = await buildDiagnostic(token);
    res.json({ ok: true, ...diag });
  });

  app.get("/api/network", (req, res) => {
    res.json({ ok: true, ...buildNetworkInfo() });
  });

  app.post("/api/restart", (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    if (req.body.confirm !== "REDEMARRER") return res.status(400).json({ ok: false, error: "Confirmation attendue : REDEMARRER" });
    logEvent("system", "Redémarrage demandé depuis l’interface");
    res.json({ ok: true, message: "Redémarrage lancé." });
    setTimeout(restartApplication, 600);
  });

  app.post("/api/login", (req, res) => {
    const ip = normalizeIp(getIp(req));
    const state = loginFailures.get(ip);
    if (state?.lockedUntil && Date.now() < state.lockedUntil) {
      return res.status(429).json({ ok: false, error: "Trop d'essais. Réessaie dans 2 minutes." });
    }

    if (isIpBlocked(ip)) {
      logSecurity("blocked-login", req, `Tentative de connexion d'un appareil bloqué : ${ip}`);
      return res.status(403).json({ ok: false, error: "Appareil bloqué depuis le PC." });
    }

    if (!verifyPin(String(req.body.pin || ""))) {
      registerFailure(ip);
      logSecurity("failed-code", req, `Code de session incorrect depuis ${ip}`);
      return res.status(403).json({ ok: false, error: "Code de session incorrect" });
    }

    loginFailures.delete(ip);
    const deviceName = String(req.body.deviceName || req.headers["user-agent"] || "Téléphone").slice(0, 120);
    const token = createSession(ip, deviceName, req, req.body.deviceInfo || {});
    logSecurity("authorized-device", req, `Appareil autorisé : ${deviceName} (${ip})`);
    io.emit("security-alert", { type: "authorized-device", ip, deviceName, message: "Nouvel appareil autorisé." });
    res.json({ ok: true, token });
  });

  app.post("/api/change-pin", (req, res) => {
    const localAdmin = isLocalRequest(req);
    if (!localAdmin && !isValidToken(req.body.token, req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    const oldPin = String(req.body.oldPin || "");
    const newPin = String(req.body.newPin || "").trim();

    if (!verifyPin(oldPin)) return res.status(403).json({ ok: false, error: "Ancien PIN incorrect" });
    if (!/^\d{4,8}$/.test(newPin)) return res.status(400).json({ ok: false, error: "PIN attendu : 4 à 8 chiffres" });

    sessions.clear();
    logEvent("security", "Demande de changement de code : en V10 le code est généré automatiquement au lancement");
    res.json({ ok: true, message: "V10 : le code est généré automatiquement à chaque lancement. Redémarre l'application pour obtenir un nouveau code." });
  });

  app.post("/api/repair-session", (req, res) => {
    const tokenToRemove = String(req.body.token || "");
    if (tokenToRemove) {
      sessions.delete(tokenToRemove);
      if (settings.trustedDevices?.[tokenToRemove]) delete settings.trustedDevices[tokenToRemove];
    }
    saveSettings();
    logEvent("security", "Session réparée / token local supprimé");
    res.json({ ok: true, message: "Session réparée. Entre le PIN sur le téléphone pour créer un nouveau token." });
  });

  app.get("/api/logs", (req, res) => {
    res.json({ ok: true, logs: appLogs.slice(-80).reverse() });
  });

  app.get("/api/performance", (req, res) => {
    res.json({ ok: true, enabled: Boolean(settings.performanceMode) });
  });

  app.post("/api/performance", (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    settings.performanceMode = Boolean(req.body.enabled);
    settings.statsIntervalMs = settings.performanceMode ? 8000 : 4000;
    settings.gpuIntervalMs = settings.performanceMode ? 12000 : 8000;
    saveSettings();
    logEvent("performance", settings.performanceMode ? "Mode performance faible activé" : "Mode performance faible désactivé");
    res.json({ ok: true, enabled: settings.performanceMode });
  });

  app.get("/api/alerts/settings", (req, res) => {
    res.json({ ok: true, alerts: settings.alerts || defaultSettings.alerts });
  });

  app.post("/api/alerts/settings", (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    const a = req.body.alerts || {};
    settings.alerts = {
      enabled: Boolean(a.enabled),
      cpu: clampNumber(a.cpu, 1, 100, 90),
      gpu: clampNumber(a.gpu, 1, 100, 90),
      ram: clampNumber(a.ram, 1, 100, 90),
      disk: clampNumber(a.disk, 1, 100, 90)
    };
    saveSettings();
    logEvent("alerts", "Seuils alertes mis à jour");
    res.json({ ok: true, alerts: settings.alerts });
  });

  app.get("/api/audio/sessions", async (req, res) => {
    const result = await getAudioSessions();
    res.json(result);
  });

  app.post("/api/audio/app-volume", async (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    const result = await setAppVolume(String(req.body.session || ""), Number(req.body.volume));
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/api/audio/open-mixer", (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    openWindowsTool("sndvol.exe");
    res.json({ ok: true, message: "Mélangeur de volume Windows ouvert." });
  });

  app.post("/api/reset-security", (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    settings.trustedDevices = {};
    saveSettings();
    sessions.clear();
    res.json({ ok: true });
  });

  app.get("/api/pairing-qr", async (req, res) => {
    if (!isLocalRequest(req)) return res.status(403).json({ ok: false, error: "QR générable depuis le PC uniquement." });

    // V10 : le QR ne contient que l'adresse locale. Aucun code secret dans l'URL.
    const url = `http://${getLanIp()}:${PORT}/`;
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 360 });
    res.json({ ok: true, qr, url, codeVisibleOnPcOnly: true });
  });

  app.post("/api/pair", (req, res) => {
    res.json({ ok: false, needsPin: true, message: "Entre le code de session affiché sur le PC." });
  });

  app.get("/api/security/devices", (req, res) => {
    res.json({ ok: true, sessionCode: SESSION_CODE, devices: getSecurityDevices(), blockedIps: settings.blockedIps || [], events: (settings.securityEvents || []).slice(-80).reverse() });
  });

  app.post("/api/security/block", (req, res) => {
    const ip = normalizeIp(String(req.body.ip || ""));
    if (!isAllowedNetworkIp(ip) || isLocalhostIp(ip)) return res.status(400).json({ ok: false, error: "IP invalide ou locale PC." });
    blockIp(ip, io);
    res.json({ ok: true, blockedIps: settings.blockedIps || [], devices: getSecurityDevices() });
  });

  app.post("/api/security/unblock", (req, res) => {
    const ip = normalizeIp(String(req.body.ip || ""));
    settings.blockedIps = (settings.blockedIps || []).filter(x => x !== ip);
    saveSettings();
    logEvent("security", `IP débloquée : ${ip}`);
    res.json({ ok: true, blockedIps: settings.blockedIps || [], devices: getSecurityDevices() });
  });

  app.post("/api/security/disconnect-all", (req, res) => {
    sessions.clear();
    for (const socket of io.sockets.sockets.values()) {
      if (!isLocalhostIp(normalizeIp(socket.handshake.address))) socket.disconnect(true);
    }
    logEvent("security", "Tous les appareils distants ont été déconnectés");
    io.emit("security-alert", { type: "disconnect-all", message: "Tous les appareils distants ont été déconnectés." });
    res.json({ ok: true });
  });

  app.get("/api/gpus", async (req, res) => {
    try {
      const graphics = await si.graphics();
      const controllers = graphics.controllers || [];
      res.json({ ok: true, selectedGpuIndex: settings.selectedGpuIndex, gpus: controllers.map((g, index) => gpuInfo(g, index)) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/gpu/select", async (req, res) => {
    if (!isValidToken(req.body.token, req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    const index = Number(req.body.index);
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ ok: false, error: "GPU invalide" });
    settings.selectedGpuIndex = index;
    saveSettings();
    await updateGpuCache();
    res.json({ ok: true, selectedGpuIndex: settings.selectedGpuIndex });
  });



  app.get("/api/setup", (req, res) => {
    res.json({ ok: true, firstLaunchDone: Boolean(settings.firstLaunchDone), version: APP_VERSION });
  });

  app.post("/api/setup/done", (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    settings.firstLaunchDone = true;
    saveSettings();
    res.json({ ok: true });
  });

  app.get("/api/apps/config", (req, res) => {
    res.json({ ok: true, defaults: getDefaultApps(), appPaths: settings.appPaths || {}, customPages: normalizeCustomPages(settings.customPages) });
  });

  app.post("/api/apps/config", (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    settings.appPaths = sanitizeAppPaths(req.body.appPaths || {});
    settings.customPages = normalizeCustomPages(req.body.customPages || []);
    saveSettings();
    logEvent("apps", "Configuration applications sauvegardée");
    res.json({ ok: true, appPaths: settings.appPaths, customPages: settings.customPages });
  });

  app.post("/api/apps/detect", async (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    const detected = await detectApps();
    settings.appPaths = { ...(settings.appPaths || {}), ...detected };
    saveSettings();
    logEvent("apps", "Détection automatique des applications terminée");
    res.json({ ok: true, detected, appPaths: settings.appPaths });
  });

  app.post("/api/browse", async (req, res) => {
    if (!isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Parcourir est disponible depuis le PC local uniquement." });
    const result = await browseForFile(String(req.body.kind || "app"));
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.get("/api/notes", (req, res) => {
    res.json({ ok: true, notes: loadNotes() });
  });

  app.post("/api/notes", (req, res) => {
    if (!isValidToken(req.body.token, req) && !isLocalRequest(req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    const notes = String(req.body.notes || "").slice(0, 20000);
    saveNotes(notes);
    io.emit("notes-updated", { notes });
    res.json({ ok: true, notes });
  });

  app.get("/api/weather/settings", (req, res) => {
    res.json({ ok: true, city: settings.weather.city || "", configured: Boolean(settings.weather.apiKey), units: settings.weather.units || "metric" });
  });

  app.post("/api/weather/settings", async (req, res) => {
    if (!isValidToken(req.body.token, req)) return res.status(403).json({ ok: false, error: "Session invalide" });
    settings.weather.apiKey = String(req.body.apiKey || "").trim();
    settings.weather.city = String(req.body.city || "").trim() || "Calvi";
    settings.weather.units = req.body.units === "imperial" ? "imperial" : "metric";
    saveSettings();
    weatherCache = { updatedAt: 0, data: null, error: "" };
    const result = await getWeather(true);
    res.json({ ok: !result.error, ...result });
  });

  app.get("/api/weather", async (req, res) => {
    res.json(await getWeather(false));
  });

  app.post("/api/action", (req, res) => {
    const { token, action, appName, shortcut, audioDevice, path: appPath, keys, pageId, buttonIndex } = req.body;
    if (!isValidToken(token, req)) return res.status(403).json({ ok: false, error: "Session invalide" });

    try {
      if (["volume-up", "volume-down", "mute", "play-pause", "next", "previous"].includes(action)) mediaKey(action);
      if (action === "launch") launchApp(appName);
      if (action === "launchPath") launchPath(appPath);
      if (action === "shortcut") runShortcut(shortcut);
      if (action === "shortcutKeys") runShortcutKeys(keys);
      if (action === "customButton") runCustomButton(pageId, buttonIndex);
      if (action === "audio") setAudioDevice(audioDevice);
      if (action === "open-mixer") openWindowsTool("sndvol.exe");
      if (action === "lock") execFile("rundll32.exe", ["user32.dll,LockWorkStation"], { windowsHide: true });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  io.use((socket, next) => {
    const ip = normalizeIp(socket.handshake.address || "");
    const token = String(socket.handshake.auth?.token || socket.handshake.query?.token || "");
    if (!isAllowedNetworkIp(ip)) return next(new Error("Réseau local uniquement"));
    if (isIpBlocked(ip)) return next(new Error("Appareil bloqué"));
    if (isLocalhostIp(ip) || isValidSocketToken(token, socket)) return next();
    logEvent("security", `Socket.io refusé sans autorisation : ${ip}`);
    return next(new Error("Appareil non autorisé"));
  });

  io.on("connection", socket => {
    connectedClients = io.engine.clientsCount;
    const token = String(socket.handshake.auth?.token || socket.handshake.query?.token || "");
    const session = sessions.get(token);
    if (session) session.socketId = socket.id;
    io.emit("clients", { count: connectedClients });
    socket.on("disconnect", () => {
      connectedClients = io.engine.clientsCount;
      io.emit("clients", { count: connectedClients });
    });
  });

  async function emitStats() {
    try {
      const [load, mem, disks, net] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats()
      ]);
      const network = net?.[0] || {};
      io.emit("stats", {
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        date: new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" }),
        cpu: Math.round(load.currentLoad || 0),
        ram: Math.round((mem.used / mem.total) * 100),
        disk: Math.round(disks?.[0]?.use || 0),
        download: Math.round((network.rx_sec || 0) / 1024),
        upload: Math.round((network.tx_sec || 0) / 1024),
        cpuTemp: "--",
        fps: "RTSS",
        ping: "LAN",
        performanceMode: Boolean(settings.performanceMode),
        alerts: buildAlerts({ cpu: Math.round(load.currentLoad || 0), ram: Math.round((mem.used / mem.total) * 100), disk: Math.round(disks?.[0]?.use || 0), gpu: gpuCache.gpu }),
        ...gpuCache
      });
    } catch {
      io.emit("stats", { time: "--:--", cpu: 0, ram: 0, gpu: 0, vram: null, disk: 0 });
    }
  }

  updateGpuCache();
  scheduleGpuUpdate();
  emitStats();
  scheduleStatsEmit(emitStats);
  setInterval(() => getWeather(false), 10 * 60 * 1000);

  server.listen(PORT, HOST, () => {
    console.log(`NeoPanel Studio ${APP_VERSION} lancé : http://${HOST}:${PORT}`);
    console.log(`Adresse téléphone : http://${getLanIp()}:${PORT}`);
    console.log(`Code de session V10 : ${SESSION_CODE}`);
  });
}

function scheduleGpuUpdate() {
  setTimeout(async () => {
    await updateGpuCache();
    scheduleGpuUpdate();
  }, settings.gpuIntervalMs || 8000);
}

function scheduleStatsEmit(emitStatsFn) {
  setTimeout(async () => {
    try {
      if (typeof emitStatsFn === "function") {
        await emitStatsFn();
      }
    } catch (error) {
      console.warn("Stats update skipped:", error.message);
    }
    scheduleStatsEmit(emitStatsFn);
  }, settings.statsIntervalMs || 4000);
}

async function updateGpuCache() {
  try {
    const graphics = await si.graphics();
    const controllers = graphics.controllers || [];
    const index = Math.min(Math.max(Number(settings.selectedGpuIndex || 0), 0), Math.max(controllers.length - 1, 0));
    const gpu = controllers[index] || controllers[0] || {};

    let usage = Number(gpu.utilizationGpu || 0);
    let source = "systeminformation";

    // V8 : meilleure chance de lecture GPU sous Windows, surtout AMD.
    // Si systeminformation renvoie 0 ou rien, on tente les compteurs natifs Windows.
    if (process.platform === "win32" && (!usage || usage < 1)) {
      const win = await getWindowsGpuUsageByPhysIndex(index);
      if (win.ok) {
        usage = win.usage;
        source = win.source;
      }
    }

    gpuCache = {
      gpu: Math.max(0, Math.min(100, Math.round(usage || 0))),
      vram: gpu.memoryTotal ? Math.round(((gpu.memoryUsed || 0) / gpu.memoryTotal) * 100) : 0,
      gpuName: gpu.model || "GPU",
      selectedGpuIndex: index,
      gpuList: controllers.map((g, i) => gpuInfo(g, i)),
      gpuSource: source
    };
  } catch (err) {
    gpuCache = { gpu: 0, vram: 0, gpuName: "GPU non détecté", selectedGpuIndex: settings.selectedGpuIndex, gpuList: [], gpuSource: "erreur" };
    logEvent("gpu", "Lecture GPU impossible : " + err.message);
  }
}

async function getWindowsGpuUsageByPhysIndex(index) {
  if (process.platform !== "win32") return { ok: false, usage: 0, source: "non-windows" };

  // Les compteurs Windows retournent des lignes de type :
  // pid_1234_luid_..._phys_0_eng_0_engtype_3D -> utilisation en %.
  // On additionne les moteurs 3D/Compute/Video/Copy du GPU physique sélectionné.
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$samples = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage').CounterSamples
$items = @{}
foreach ($s in $samples) {
  $n = [string]$s.InstanceName
  $physMatch = [regex]::Match($n, 'phys_([0-9]+)')
  if (-not $physMatch.Success) { continue }
  if ($n -notmatch 'engtype_(3D|Compute|Compute_0|Copy|Video|VideoDecode|VideoEncode)') { continue }
  $phys = [int]$physMatch.Groups[1].Value
  if (-not $items.ContainsKey($phys)) { $items[$phys] = 0 }
  $items[$phys] += [double]$s.CookedValue
}
$result = @()
foreach ($k in $items.Keys) { $result += [pscustomobject]@{ index = $k; usage = [math]::Round([math]::Min(100, $items[$k]), 0) } }
$result | Sort-Object index | ConvertTo-Json -Compress
`;
  return new Promise(resolve => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true, timeout: 2500 }, (err, stdout) => {
      if (err || !stdout) return resolve({ ok: false, usage: 0, source: "windows-counter-indisponible" });
      try {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const exact = list.find(x => Number(x.index) === Number(index));
        const fallback = list[0];
        const item = exact || fallback;
        if (!item) return resolve({ ok: false, usage: 0, source: "windows-counter-vide" });
        resolve({ ok: true, usage: Number(item.usage || 0), source: exact ? "windows-gpu-counter" : "windows-gpu-counter-fallback" });
      } catch {
        resolve({ ok: false, usage: 0, source: "windows-counter-json-erreur" });
      }
    });
  });
}

function gpuInfo(g, index) {
  return {
    index,
    name: g.model || `GPU ${index + 1}`,
    vendor: g.vendor || "",
    vram: g.memoryTotal || 0,
    bus: g.bus || ""
  };
}

async function getWeather(force) {
  if (!settings.weather.apiKey) return { ok: false, error: "Ajoute une clé API OpenWeather dans Météo." };
  if (!force && weatherCache.data && Date.now() - weatherCache.updatedAt < 10 * 60 * 1000) return { ok: true, ...weatherCache.data };
  try {
    const city = encodeURIComponent(settings.weather.city || "Calvi");
    const units = settings.weather.units || "metric";
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${settings.weather.apiKey}&units=${units}&lang=fr`;
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || "Erreur météo");
    const data = {
      city: json.name,
      temp: Math.round(json.main?.temp),
      feels: Math.round(json.main?.feels_like),
      humidity: json.main?.humidity,
      wind: Math.round((json.wind?.speed || 0) * (units === "metric" ? 3.6 : 1)),
      description: json.weather?.[0]?.description || "--",
      icon: json.weather?.[0]?.icon || "",
      units,
      updatedAt: Date.now()
    };
    weatherCache = { updatedAt: Date.now(), data, error: "" };
    return { ok: true, ...data };
  } catch (err) {
    weatherCache.error = err.message;
    return { ok: false, error: err.message };
  }
}

function loadSettings() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
      return structuredCloneSafe(defaultSettings);
    }
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return { ...structuredCloneSafe(defaultSettings), ...raw, weather: { ...defaultSettings.weather, ...(raw.weather || {}) }, alerts: { ...defaultSettings.alerts, ...(raw.alerts || {}) }, trustedDevices: raw.trustedDevices || {}, appPaths: raw.appPaths || {}, customPages: normalizeCustomPages(raw.customPages || defaultSettings.customPages) };
  } catch {
    return structuredCloneSafe(defaultSettings);
  }
}

function logEvent(type, message) {
  const entry = { time: new Date().toLocaleString("fr-FR"), type, message };
  appLogs.push(entry);
  if (appLogs.length > 200) appLogs.shift();
  if (type === "security") {
    settings.securityEvents = settings.securityEvents || [];
    settings.securityEvents.push(entry);
    if (settings.securityEvents.length > 300) settings.securityEvents.shift();
    try { saveSettings(); } catch {}
  }
}

function logSecurity(type, req, message) {
  const ip = normalizeIp(getIp(req));
  const ua = String(req.headers?.["user-agent"] || "Navigateur inconnu").slice(0, 180);
  logEvent("security", `${message} | IP ${ip} | ${ua}`);
}

function buildAlerts(values) {
  const a = settings.alerts || defaultSettings.alerts;
  if (!a.enabled) return [];
  const out = [];
  if (values.cpu >= a.cpu) out.push(`CPU ${values.cpu}%`);
  if (values.gpu >= a.gpu) out.push(`GPU ${values.gpu}%`);
  if (values.ram >= a.ram) out.push(`RAM ${values.ram}%`);
  if (values.disk >= a.disk) out.push(`Disque ${values.disk}%`);
  
  return out;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function isLocalRequest(req) {
  return isLocalhostIp(normalizeIp(getIp(req)));
}

function normalizeIp(ip) {
  let value = String(ip || "").split(",")[0].trim();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  if (value === "::1") value = "127.0.0.1";
  return value;
}

function isLocalhostIp(ip) {
  const value = normalizeIp(ip);
  return value === "127.0.0.1" || value === "localhost";
}

function isAllowedNetworkIp(ip) {
  const value = normalizeIp(ip);
  if (isLocalhostIp(value)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  const m = value.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  if (value.startsWith("fe80:")) return true;
  return false;
}

function isIpBlocked(ip) {
  const value = normalizeIp(ip);
  return (settings.blockedIps || []).includes(value);
}

function extractToken(req) {
  return String(req.headers.authorization || req.query.token || req.body?.token || "").replace(/^Bearer\s+/i, "");
}

function isPublicApiRoute(req) {
  const publicRoutes = new Set(["GET /info", "GET /session", "POST /login", "POST /pair"]);
  if (req.method === "GET" && ["/pairing-qr", "/network"].includes(req.path)) return isLocalRequest(req);
  return publicRoutes.has(`${req.method} ${req.path}`);
}

function denyRequest(req, res, message) {
  if (req.path && req.path.startsWith("/api")) {
    return res.status(403).json({ ok: false, error: message });
  }
  res.status(403).type("html").send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accès refusé</title><style>body{margin:0;background:#030712;color:#e5faff;font-family:Arial;display:grid;place-items:center;min-height:100vh}.box{border:1px solid #00d9ff;border-radius:18px;padding:24px;max-width:520px;background:#0f172a}h1{color:#00d9ff}</style></head><body><div class="box"><h1>Accès refusé</h1><p>${escapeHtmlServer(message)}</p><p>Retourne sur le PC pour autoriser ou débloquer cet appareil.</p></div></body></html>`);
}

function escapeHtmlServer(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

function rateLimitIp(ip, maxHits, windowMs) {
  const now = Date.now();
  const key = normalizeIp(ip);
  const item = apiHits.get(key) || { start: now, count: 0 };
  if (now - item.start > windowMs) { item.start = now; item.count = 0; }
  item.count += 1;
  apiHits.set(key, item);
  return item.count <= maxHits;
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || "";
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = normalizeIp(url.hostname);
    return isAllowedNetworkIp(host) && Number(url.port || PORT) === PORT;
  } catch {
    return false;
  }
}

function isAllowedSocketOrigin(socket) {
  const origin = socket.handshake.headers?.origin || "";
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = normalizeIp(url.hostname);
    return isAllowedNetworkIp(host) && Number(url.port || PORT) === PORT;
  } catch {
    return false;
  }
}

function saveSettings() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function structuredCloneSafe(obj) { return JSON.parse(JSON.stringify(obj)); }
function hashPin(pin) { return crypto.createHash("sha256").update(String(pin)).digest("hex"); }
function verifyPin(pin) { return String(pin || "").trim() === SESSION_CODE; }

function createSession(ip, deviceName, req, deviceInfo = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const userAgent = String(req?.headers?.["user-agent"] || "").slice(0, 220);
  const enriched = buildDeviceInfo(userAgent, deviceInfo);
  const device = {
    token,
    deviceName: sanitizeText(deviceName || enriched.label || "Appareil", 120),
    ip: normalizeIp(ip),
    userAgent,
    browser: enriched.browser,
    os: enriched.os,
    brand: enriched.brand,
    model: enriched.model,
    platform: enriched.platform,
    mobile: enriched.mobile,
    details: enriched.details,
    createdAt: now,
    lastSeen: now,
    status: "authorized"
  };
  sessions.set(token, device);
  settings.trustedDevices = settings.trustedDevices || {};
  settings.trustedDevices[token] = { ...device, token: undefined };
  saveSettings();
  return token;
}

function isValidToken(token, req) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (isIpBlocked(session.ip)) {
    sessions.delete(token);
    return false;
  }
  if (req) {
    const reqIp = normalizeIp(getIp(req));
    if (!isLocalhostIp(reqIp) && normalizeIp(session.ip) !== reqIp) return false;
    const ua = String(req.headers?.["user-agent"] || "");
    if (session.userAgent && ua && session.userAgent !== ua.slice(0, 220)) return false;
  }
  session.lastSeen = Date.now();
  return true;
}

function isValidSocketToken(token, socket) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  const ip = normalizeIp(socket.handshake.address || "");
  if (!isLocalhostIp(ip) && normalizeIp(session.ip) !== ip) return false;
  const ua = String(socket.handshake.headers?.["user-agent"] || "").slice(0, 220);
  if (session.userAgent && ua && session.userAgent !== ua) return false;
  return isValidToken(token);
}

function getSecurityDevices() {
  const activeTokens = new Set(sessions.keys());
  const saved = Object.entries(settings.trustedDevices || {}).map(([token, d]) => ({
    token,
    deviceName: d.deviceName || "Appareil",
    ip: normalizeIp(d.ip || ""),
    browser: d.browser || detectBrowser(d.userAgent || ""),
    os: d.os || detectOs(d.userAgent || ""),
    brand: d.brand || "",
    model: d.model || "",
    platform: d.platform || "",
    mobile: Boolean(d.mobile),
    details: d.details || "",
    createdAt: d.createdAt || 0,
    lastSeen: sessions.get(token)?.lastSeen || d.lastSeen || d.createdAt || 0,
    status: isIpBlocked(d.ip) ? "blocked" : (activeTokens.has(token) ? "authorized" : "disconnected")
  }));
  for (const [token, d] of sessions.entries()) {
    if (!saved.some(x => x.token === token)) saved.push({ ...d, status: isIpBlocked(d.ip) ? "blocked" : "authorized" });
  }
  return saved.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).map(d => ({ ...d, token: undefined }));
}

function blockIp(ip, io) {
  const value = normalizeIp(ip);
  settings.blockedIps = Array.from(new Set([...(settings.blockedIps || []), value]));
  for (const [token, session] of sessions.entries()) {
    if (normalizeIp(session.ip) === value) sessions.delete(token);
  }
  saveSettings();
  logEvent("security", `IP bloquée : ${value}`);
  for (const socket of io.sockets.sockets.values()) {
    const socketIp = normalizeIp(socket.handshake.address || "");
    if (socketIp === value) socket.disconnect(true);
  }
}

function detectBrowser(ua) {
  const u = String(ua || "");
  if (/Edg\//.test(u)) return "Microsoft Edge";
  if (/OPR\//.test(u)) return "Opera";
  if (/CriOS|Chrome\//.test(u)) return "Chrome";
  if (/Firefox\//.test(u)) return "Firefox";
  if (/Safari\//.test(u)) return "Safari";
  return "Navigateur inconnu";
}

function detectOs(ua) {
  const u = String(ua || "");
  if (/iPhone|iPad|iPod/.test(u)) return "iOS / iPadOS";
  if (/Android/.test(u)) return "Android";
  if (/Windows/.test(u)) return "Windows";
  if (/Mac OS X|Macintosh/.test(u)) return "macOS";
  if (/Linux/.test(u)) return "Linux";
  return "Système inconnu";
}

function registerFailure(ip) {
  const current = loginFailures.get(ip) || { count: 0, lockedUntil: 0 };
  current.count += 1;
  if (current.count >= settings.maxLoginAttempts) {
    current.lockedUntil = Date.now() + settings.lockMs;
    current.count = 0;
  }
  loginFailures.set(ip, current);
}

function getIp(req) { return normalizeIp(req.socket?.remoteAddress || req.ip || "127.0.0.1"); }
function runPowerShell(script, callback) { execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true }, callback || (() => {})); }

function mediaKey(command) {
  const codes = { mute: 173, "volume-down": 174, "volume-up": 175, next: 176, previous: 177, "play-pause": 179 };
  const keyCode = codes[command];
  if (!keyCode) return;
  const script = `$code = 'using System; using System.Runtime.InteropServices; public class MediaKeys { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); }'; Add-Type -TypeDefinition $code; [MediaKeys]::keybd_event(${keyCode},0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 40; [MediaKeys]::keybd_event(${keyCode},0,2,[UIntPtr]::Zero);`;
  runPowerShell(script, err => { if (err) console.error("Commande média échouée", err.message); });
}

function launchApp(appName) {
  const configured = settings.appPaths?.[appName];
  const defaults = getDefaultApps();
  const target = configured || defaults[appName]?.path;
  if (target) launchPath(target);
}

function launchPath(target) {
  const clean = validateLaunchTarget(target);
  if (!clean.ok) {
    logEvent("security", clean.error || "Lancement refusé");
    return;
  }
  const resolved = resolveShortcutIfNeeded(clean.path);
  if (process.platform === "win32") {
    startWindowsPath(resolved, err => {
      if (err) logEvent("apps", "Lancement impossible : " + err.message);
    });
  } else {
    execFile("open", [resolved], err => { if (err) logEvent("apps", "Lancement impossible : " + err.message); });
  }
}

function resolveShortcutIfNeeded(filePath) {
  // Les .lnk sont acceptés directement par start sous Windows. Cette fonction garde le chemin intact
  // pour ne pas ralentir le lancement ; l'utilisateur peut aussi sélectionner un .exe.
  return filePath;
}

function runShortcut(name) {
  const shortcuts = {
    davinci_play: "Space", davinci_cut: "Ctrl+B", davinci_marker: "M", davinci_undo: "Ctrl+Z", davinci_redo: "Ctrl+Y",
    obs_start: "Ctrl+Shift+1", obs_stop: "Ctrl+Shift+2", obs_record: "Ctrl+Shift+3",
    browser_refresh: "F5", browser_fullscreen: "F11", browser_newtab: "Ctrl+T",
    windows_capture: "PrintScreen", windows_lock: "LOCK"
  };
  const key = shortcuts[name];
  if (!key) return;
  if (key === "LOCK") return execFile("rundll32.exe", ["user32.dll,LockWorkStation"], { windowsHide: true });
  runShortcutKeys(key);
}

function runShortcutKeys(keys) {
  const sendKeys = shortcutToSendKeys(String(keys || ""));
  if (!sendKeys) return;
  runPowerShell(`$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('${sendKeys.replace(/'/g, "''")}');`);
}

function runCustomButton(pageId, buttonIndex) {
  const pages = normalizeCustomPages(settings.customPages);
  const page = pages.find(p => p.id === pageId);
  const btn = page?.buttons?.[Number(buttonIndex)];
  if (!btn || !btn.label) return;
  if (btn.type === "launch") return launchPath(btn.target || page.appPath);
  if (btn.type === "shortcut") return runShortcutKeys(btn.keys);
  if (btn.type === "url") return openSafeUrl(btn.target);
}

function shortcutToSendKeys(input) {
  const raw = input.trim();
  if (!raw) return "";
  if (raw === " ") return " ";
  const parts = raw.split("+").map(x => x.trim()).filter(Boolean);
  let mods = "";
  const keys = [];
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === "ctrl" || p === "control") mods += "^";
    else if (p === "shift" || p === "maj") mods += "+";
    else if (p === "alt" || p === "option") mods += "%";
    else keys.push(part);
  }
  const key = keys.join("+") || raw;
  const map = { space: " ", enter: "{ENTER}", tab: "{TAB}", esc: "{ESC}", escape: "{ESC}", backspace: "{BACKSPACE}", delete: "{DELETE}", del: "{DELETE}", up: "{UP}", down: "{DOWN}", left: "{LEFT}", right: "{RIGHT}", printscreen: "{PRTSC}", prtsc: "{PRTSC}" };
  const lower = key.toLowerCase();
  let finalKey = map[lower] || (/^f\d{1,2}$/i.test(key) ? `{${key.toUpperCase()}}` : key);
  if (finalKey.length === 1) finalKey = finalKey.toLowerCase();
  return mods + finalKey;
}

function setAudioDevice(name) { console.log("Changement audio demandé :", name, "(prévu avec SoundVolumeView)"); }

async function buildDiagnostic(token) {
  const graphics = await si.graphics().catch(() => ({ controllers: [] }));
  const mem = await si.mem().catch(() => null);
  const cpu = await si.cpu().catch(() => null);
  return {
    version: APP_VERSION,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    dataDir: DATA_DIR,
    settingsFileExists: fs.existsSync(SETTINGS_FILE),
    tokenPresent: Boolean(token),
    tokenValid: isValidToken(token),
    clients: connectedClients,
    hostname: os.hostname(),
    localUrl: `http://127.0.0.1:${PORT}`,
    networkUrl: `http://${getLanIp()}:${PORT}`,
    selectedGpuIndex: settings.selectedGpuIndex,
    gpuActive: gpuCache.gpuName,
    gpuValue: gpuCache.gpu,
    gpuSource: gpuCache.gpuSource || "--",
    gpuCount: graphics.controllers?.length || 0,
    weatherConfigured: Boolean(settings.weather.apiKey),
    weatherCity: settings.weather.city || "",
    performanceMode: Boolean(settings.performanceMode),
    audioAppVolume: await getAudioSessions(),
    memoryMb: mem ? Math.round(mem.used / 1024 / 1024) + " / " + Math.round(mem.total / 1024 / 1024) : "--",
    cpuModel: cpu?.brand || "--",
    recentLogs: appLogs.slice(-10).reverse()
  };
}

function buildNetworkInfo() {
  const interfaces = [];
  const nets = os.networkInterfaces();
  for (const [name, list] of Object.entries(nets)) {
    for (const net of list || []) {
      if (net.family === "IPv4") interfaces.push({ name, address: net.address, internal: net.internal, mac: net.mac, cidr: net.cidr });
    }
  }
  return { hostname: os.hostname(), port: PORT, host: HOST, localUrl: `http://127.0.0.1:${PORT}`, networkUrl: `http://${getLanIp()}:${PORT}`, clients: connectedClients, interfaces, localOnly: true, blockedIps: settings.blockedIps || [] };
}

function restartApplication() {
  try {
    const electron = require("electron");
    if (electron?.app?.relaunch) {
      electron.app.relaunch();
      electron.app.exit(0);
      return;
    }
  } catch {}
  process.exit(0);
}

function findSoundVolumeView() {
  const candidates = [
    path.join(__dirname, "tools", "SoundVolumeView.exe"),
    path.join(DATA_DIR, "SoundVolumeView.exe"),
    path.join(process.cwd(), "SoundVolumeView.exe")
  ];
  return candidates.find(file => fs.existsSync(file)) || "";
}

async function getAudioSessions() {
  if (process.platform !== "win32") return { ok: true, available: false, message: "Volume par application disponible uniquement sous Windows.", sessions: [] };
  const tool = findSoundVolumeView();
  if (!tool) {
    return { ok: true, available: false, message: "Contrôle par application non actif : place SoundVolumeView.exe dans le dossier tools. Le bouton peut quand même ouvrir le mélangeur Windows.", sessions: [] };
  }
  const out = path.join(os.tmpdir(), `g19-audio-${Date.now()}.csv`);
  return new Promise(resolve => {
    execFile(tool, ["/scomma", out], { windowsHide: true }, err => {
      if (err || !fs.existsSync(out)) return resolve({ ok: true, available: false, message: "SoundVolumeView trouvé, mais lecture des sessions impossible.", sessions: [] });
      const csv = fs.readFileSync(out, "utf8");
      fs.unlink(out, () => {});
      const sessions = parseSoundVolumeCsv(csv).slice(0, 30);
      resolve({ ok: true, available: true, message: sessions.length ? "Sessions audio détectées." : "Aucune application audio active détectée.", sessions });
    });
  });
}

function parseSoundVolumeCsv(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const nameIndex = headers.findIndex(h => h.includes("name") || h.includes("nom"));
  const appIndex = headers.findIndex(h => h.includes("application") || h.includes("process") || h.includes("executable"));
  const volIndex = headers.findIndex(h => h.includes("volume"));
  return lines.slice(1).map(line => {
    const cols = splitCsvLine(line);
    const name = cols[nameIndex] || cols[appIndex] || "Application";
    const app = cols[appIndex] || name;
    const volume = Number(String(cols[volIndex] || "").replace("%", ""));
    return { id: name, name, app, volume: Number.isFinite(volume) ? Math.round(volume) : null };
  }).filter(s => s.name && !/Speakers|Haut-parleurs|Microphone/i.test(s.name));
}

function splitCsvLine(line) {
  const out = []; let cur = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim());
}

async function setAppVolume(sessionName, volume) {
  const tool = findSoundVolumeView();
  if (!tool) return { ok: false, error: "SoundVolumeView.exe absent. Impossible de régler une application précisément." };
  const vol = Math.max(0, Math.min(100, Math.round(volume || 0)));
  if (!sessionName) return { ok: false, error: "Session audio manquante." };
  return new Promise(resolve => {
    execFile(tool, ["/SetVolume", sessionName, String(vol)], { windowsHide: true }, err => {
      if (err) return resolve({ ok: false, error: "Réglage refusé par SoundVolumeView." });
      logEvent("audio", `Volume ${sessionName} réglé à ${vol}%`);
      resolve({ ok: true, message: `Volume réglé à ${vol}%` });
    });
  });
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254")) return net.address;
    }
  }
  return "127.0.0.1";
}

if (require.main === module) startServer();

function getDefaultApps() {
  return {
    davinci: { label: "DaVinci Resolve", path: "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe" },
    steam: { label: "Steam", path: "C:\\Program Files (x86)\\Steam\\steam.exe" },
    chrome: { label: "Chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
    obs: { label: "OBS Studio", path: "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe" },
    discord: { label: "Discord", path: path.join(process.env.LOCALAPPDATA || "", "Discord", "Update.exe") },
    blender: { label: "Blender", path: "C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe" }
  };
}

async function detectApps() {
  const defaults = getDefaultApps();
  const found = {};
  for (const [key, item] of Object.entries(defaults)) {
    const candidates = buildAppCandidates(key, item.path);
    const hit = candidates.find(p => p && fs.existsSync(p));
    if (hit) found[key] = hit;
  }
  return found;
}

function buildAppCandidates(key, defaultPath) {
  const pf = process.env.ProgramFiles || "C:\\Program Files";
  const pfx86 = process.env['ProgramFiles(x86)'] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || "";
  const list = [defaultPath];
  if (key === "chrome") list.push(path.join(pf, "Google", "Chrome", "Application", "chrome.exe"), path.join(pfx86, "Google", "Chrome", "Application", "chrome.exe"));
  if (key === "obs") list.push(path.join(pf, "obs-studio", "bin", "64bit", "obs64.exe"));
  if (key === "steam") list.push(path.join(pfx86, "Steam", "steam.exe"), path.join(pf, "Steam", "steam.exe"));
  if (key === "davinci") list.push(path.join(pf, "Blackmagic Design", "DaVinci Resolve", "Resolve.exe"));
  if (key === "discord") list.push(path.join(local, "Discord", "Update.exe"));
  if (key === "blender") {
    const foundation = path.join(pf, "Blender Foundation");
    if (fs.existsSync(foundation)) {
      for (const dir of fs.readdirSync(foundation)) list.push(path.join(foundation, dir, "blender.exe"));
    }
  }
  return [...new Set(list)];
}

function browseForFile(kind) {
  if (process.platform !== "win32") return Promise.resolve({ ok: false, error: "Parcourir est prévu pour Windows dans cette version." });
  const filter = kind === "shortcut" ? "Raccourcis et programmes (*.lnk;*.exe)|*.lnk;*.exe|Tous les fichiers (*.*)|*.*" : "Programmes et raccourcis (*.exe;*.lnk)|*.exe;*.lnk|Tous les fichiers (*.*)|*.*";
  const ps = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title='Choisir une application ou un raccourci'; $d.Filter='${filter}'; $d.Multiselect=$false; if($d.ShowDialog() -eq 'OK'){ $d.FileName }`;
  return new Promise(resolve => {
    execFile("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", ps], { windowsHide: false, timeout: 120000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: err.message });
      const selected = String(stdout || "").trim();
      if (!selected) return resolve({ ok: false, error: "Aucun fichier sélectionné." });
      const valid = validateLaunchTarget(selected);
      if (!valid.ok) return resolve({ ok: false, error: valid.error });
      resolve({ ok: true, path: valid.path });
    });
  });
}

function sanitizeAppPaths(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    const key = sanitizeKey(k, 40);
    const value = sanitizeText(v, 600);
    if (!value || validateLaunchTarget(value).ok) out[key] = value;
    else logEvent("security", `Chemin application refusé : ${value}`);
  }
  return out;
}

function normalizeCustomPages(pages) {
  const basePages = Array.isArray(pages) && pages.length ? pages : defaultSettings.customPages;
  return basePages.slice(0, 5).map((p, idx) => ({
    id: sanitizeKey(p.id || `page${idx + 1}`, 30),
    title: sanitizeText(p.title || `Page ${idx + 1}`, 40),
    appPath: validateLaunchTarget(p.appPath || "").ok ? sanitizeText(p.appPath || "", 600) : "",
    buttons: Array.from({ length: 10 }, (_, i) => {
      const b = (p.buttons || [])[i] || {};
      return {
        label: sanitizeText(b.label || "", 40),
        type: ["launch", "shortcut", "url"].includes(b.type) ? b.type : "shortcut",
        target: sanitizeButtonTarget(b.type, b.target),
        keys: sanitizeText(b.keys || "", 80)
      };
    })
  }));
}

function sanitizeText(value, max = 120) {
  return String(value || "").replace(/[ -]/g, "").slice(0, max);
}

function sanitizeKey(value, max = 40) {
  const cleaned = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, max);
  return cleaned || "item";
}

function validateLaunchTarget(target) {
  const clean = String(target || "").trim().slice(0, 600);
  if (!clean) return { ok: false, error: "Chemin vide" };
  if (/^(https?:|file:|javascript:|data:)/i.test(clean)) return { ok: false, error: "Lancement refusé : seules les applications .exe et raccourcis .lnk sont autorisés." };
  // Caractères interdits pour éviter l'injection dans les fallbacks Windows.
  if (/[<>|?*&;%!`"\r\n]/.test(clean)) return { ok: false, error: "Chemin refusé : caractère interdit." };
  const ext = path.extname(clean).toLowerCase();
  if (![".exe", ".lnk"].includes(ext)) return { ok: false, error: "Fichier refusé : seuls .exe et .lnk sont autorisés." };
  if (/\.(bat|cmd|ps1|vbs|js|jse|wsf|reg|scr|com|msi)$/i.test(clean)) return { ok: false, error: "Script ou installateur refusé." };
  return { ok: true, path: clean };
}

function sanitizeButtonTarget(type, target) {
  const kind = ["launch", "shortcut", "url"].includes(type) ? type : "shortcut";
  const value = sanitizeText(target || "", 600).trim();
  if (!value) return "";
  if (kind === "launch") return validateLaunchTarget(value).ok ? value : "";
  if (kind === "url") return isSafeUrl(value) ? value : "";
  return sanitizeText(value, 80);
}

function isSafeUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

function openSafeUrl(url) {
  const clean = String(url || "").trim().slice(0, 600);
  if (!isSafeUrl(clean)) {
    logEvent("security", "URL refusée : protocole non autorisé");
    return;
  }
  if (process.platform === "win32") {
    startWindowsPath(clean, err => {
      if (err) logEvent("apps", "Ouverture URL impossible : " + err.message);
    });
  } else {
    execFile("open", [clean], err => { if (err) logEvent("apps", "Ouverture URL impossible : " + err.message); });
  }
}

function startWindowsPath(target, callback) {
  const value = String(target || "");
  // Commande fixe, argument contrôlé : pas de commande libre venant de l'utilisateur.
  const ps = "$p=$args[0]; Start-Process -LiteralPath $p";
  execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps, value], { windowsHide: true }, err => {
    if (!err) return callback && callback(null);
    // Fallback utile pour certains raccourcis .lnk et certaines applis Windows.
    execFile("cmd.exe", ["/d", "/s", "/c", "start", "", value], { windowsHide: true }, callback || (() => {}));
  });
}

function openWindowsTool(toolName) {
  const safe = String(toolName || "");
  if (!/^[a-zA-Z0-9_.-]+\.exe$/.test(safe)) return;
  execFile("cmd.exe", ["/d", "/s", "/c", "start", "", safe], { windowsHide: true }, err => {
    if (err) logEvent("system", "Ouverture outil Windows impossible : " + err.message);
  });
}

function buildDeviceInfo(userAgent, rawInfo = {}) {
  const info = rawInfo && typeof rawInfo === "object" ? rawInfo : {};
  const brands = Array.isArray(info.brands) ? info.brands.map(b => sanitizeText(b.brand || b, 30)).filter(Boolean).join(", ") : "";
  const model = sanitizeText(info.model || "", 80);
  const platform = sanitizeText(info.platform || "", 60);
  const platformVersion = sanitizeText(info.platformVersion || "", 60);
  const uaFullVersion = sanitizeText(info.uaFullVersion || "", 60);
  const os = platform ? `${platform}${platformVersion ? " " + platformVersion : ""}` : detectOs(userAgent);
  const browser = brands || detectBrowser(userAgent);
  const mobile = Boolean(info.mobile) || /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);
  const fallbackModel = /iPhone/i.test(userAgent) ? "iPhone" : (/iPad/i.test(userAgent) ? "iPad" : (/Android/i.test(userAgent) ? "Android" : ""));
  const details = [model || fallbackModel, platform, uaFullVersion ? "Navigateur " + uaFullVersion : ""].filter(Boolean).join(" / ");
  return {
    label: model || fallbackModel || os || "Appareil",
    browser,
    os,
    brand: brands,
    model: model || fallbackModel,
    platform,
    mobile,
    details
  };
}

function loadNotes() {
  try { return fs.existsSync(NOTES_FILE) ? String(JSON.parse(fs.readFileSync(NOTES_FILE, "utf8")).notes || "") : ""; }
  catch { return ""; }
}

function saveNotes(notes) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(NOTES_FILE, JSON.stringify({ notes, updatedAt: Date.now() }, null, 2));
}

module.exports = { startServer };
