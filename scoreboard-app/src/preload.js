const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit bridge between the (now isolated, Node-free) renderer and the
// main process. Only these five channels are exposed — never ipcRenderer or require.
// Compatible with sandbox:true (only the 'electron' module is used here).
contextBridge.exposeInMainWorld('lvbl', {
    getConfig: () => ipcRenderer.sendSync('get-config'),
    getOverlayUrl: () => ipcRenderer.sendSync('get-overlay-url'),
    saveConfig: (data) => ipcRenderer.send('save-config', data),
    updateState: (state) => ipcRenderer.send('update-state', state),
    openSetup: () => ipcRenderer.send('open-setup'),
});
