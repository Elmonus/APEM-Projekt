const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    convertAudio: (options) => ipcRenderer.invoke('convert-audio', options),
    saveFile: (options) => ipcRenderer.invoke('save-file', options),
    getAppInfo: () => ipcRenderer.invoke('get-app-info')
});