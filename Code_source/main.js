"use strict";

const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const { startServer } = require("./server");

let mainWindow = null;

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  const localUrl = "http://127.0.0.1:3000";
  let retries = 0;

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(localUrl)) event.preventDefault();
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode) => {
    if (errorCode === -3 || retries >= 15) return;
    retries += 1;
    setTimeout(() => mainWindow?.loadURL(localUrl), 300);
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.loadURL(localUrl);
}

app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
