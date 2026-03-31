const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');

let mainWindow;
let overlayServer;
let config = { apiUrl: '', apiKey: '' };
let scoreboardState = {
    p1Name: '', p2Name: '',
    p1Score: '0', p2Score: '0',
    p1Team: '', p2Team: '',
    round: ''
};

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const OVERLAY_PORT = 4455;

// Load saved config
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load config:', e);
    }
}

// Save config
function saveConfig(data) {
    config = { apiUrl: data.apiUrl, apiKey: data.apiKey };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Start the overlay HTTP server
function startOverlayServer() {
    const server = express();

    // Serve overlay static files
    server.use('/overlay', express.static(path.join(__dirname, '..', 'overlay')));

    // API: get current scoreboard state
    server.get('/state', (req, res) => {
        res.json(scoreboardState);
    });

    // API: get config (only apiUrl, not the key — overlay needs this)
    server.get('/config', (req, res) => {
        res.json({ apiUrl: config.apiUrl, apiKey: config.apiKey });
    });

    overlayServer = server.listen(OVERLAY_PORT, () => {
        console.log(`Overlay server running on http://localhost:${OVERLAY_PORT}`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 620,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        title: 'LVBL Scoreboard',
        autoHideMenuBar: true
    });

    // Show setup or control panel based on config
    if (config.apiUrl && config.apiKey) {
        mainWindow.loadFile(path.join(__dirname, 'control.html'));
    } else {
        mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    }
}

// IPC handlers
ipcMain.on('save-config', (event, data) => {
    saveConfig(data);
    mainWindow.loadFile(path.join(__dirname, 'control.html'));
});

ipcMain.on('get-config', (event) => {
    event.returnValue = config;
});

ipcMain.on('get-overlay-url', (event) => {
    event.returnValue = `http://localhost:${OVERLAY_PORT}/overlay/scoreboard.html`;
});

ipcMain.on('update-state', (event, data) => {
    scoreboardState = { ...scoreboardState, ...data };
});

ipcMain.on('open-setup', (event) => {
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
});

app.whenReady().then(() => {
    loadConfig();
    startOverlayServer();
    createWindow();
});

app.on('window-all-closed', () => {
    if (overlayServer) overlayServer.close();
    app.quit();
});
