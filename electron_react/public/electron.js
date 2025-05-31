const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
    const win = new BrowserWindow({
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
        }
    });

    win.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.webContents.openDevTools({ mode: 'detach' });

    win.webContents.on('crashed', () => {
        console.error('⚠️ Renderer process crashed!');
    });
    win.on('unresponsive', () => {
        console.error('⚠️ Window became unresponsive');
    });

    process.on('uncaughtException', (err) => {
        console.error('💥 Uncaught Exception:', err);
    });
    process.on('unhandledRejection', (reason) => {
        console.error('💥 Unhandled Promise rejection:', reason);
    });

}
app.whenReady().then(createWindow);