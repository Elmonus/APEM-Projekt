const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');

let mainWindow;
let pythonProcess = null;
const FLASK_PORT = 5001;
const FLASK_URL = `http://localhost:${FLASK_PORT}`;

// Funkcja sprawdzająca czy serwer Flask działa
async function waitForFlask(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            console.log(`Trying to connect to ${FLASK_URL}/health`);
            const response = await axios.get(`${FLASK_URL}/health`);  // Dodaj 'const response ='
            console.log('Flask server is running!', response.data);
            return true;
        } catch (error) {
            console.log(`Waiting for Flask server... (${i + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    return false;
}

// Funkcja uruchamiająca serwer Python
function startPythonServer() {
    return new Promise((resolve, reject) => {
        const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, 'app', 'app.py');

        console.log('=== Starting Python Server ===');
        console.log('Python command:', pythonPath);
        console.log('Script path:', scriptPath);

        pythonProcess = spawn(pythonPath, [scriptPath], {
            cwd: path.join(__dirname, 'app'),
            env: { ...process.env, FLASK_ENV: 'production' }
        });

        let serverStarted = false;

        pythonProcess.stdout.on('data', (data) => {
            console.log(`[Python STDOUT]: ${data}`);

            // Sprawdź czy Flask wystartował
            if (data.toString().includes('Running on http://127.0.0.1:5001') && !serverStarted) {
                serverStarted = true;
                setTimeout(() => resolve(true), 500); // Dodatkowe 500ms na pewno
            }
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`[Python STDERR]: ${data}`);

            // Flask wypisuje info na stderr
            if (data.toString().includes('Running on http://127.0.0.1:5001') && !serverStarted) {
                serverStarted = true;
                setTimeout(() => resolve(true), 500);
            }
        });

        pythonProcess.on('error', (error) => {
            console.error('[Python ERROR]:', error);
            reject(error);
        });

        pythonProcess.on('close', (code) => {
            console.log(`[Python EXIT] Process exited with code ${code}`);
            pythonProcess = null;
            if (!serverStarted) {
                reject(new Error('Python process exited before server started'));
            }
        });

        // Timeout na wypadek gdyby coś poszło nie tak
        setTimeout(() => {
            if (!serverStarted) {
                reject(new Error('Timeout waiting for Flask to start'));
            }
        }, 10000);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'icon.png'),
        title: 'Audiowerter - Konwerter Audio'
    });

    // Ładuj aplikację z serwera Flask
    mainWindow.loadURL(FLASK_URL);

    // Otwórz DevTools w trybie deweloperskim
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    try {
        // Uruchom serwer Python i poczekaj aż wystartuje
        await startPythonServer();
        console.log('Flask server started successfully!');

        // Teraz możemy otworzyć okno
        createWindow();
    } catch (error) {
        console.error('Failed to start Flask server:', error);
        dialog.showErrorBox('Błąd', 'Nie udało się uruchomić serwera. Sprawdź czy Python i wszystkie zależności są zainstalowane.');
        app.quit();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Zakończ proces Pythona przy zamykaniu aplikacji
app.on('before-quit', () => {
    if (pythonProcess) {
        pythonProcess.kill();
    }
});

// Obsługa komunikacji z rendererem
ipcMain.handle('get-server-url', () => {
    return FLASK_URL;
});

// Funkcja pomocnicza do sprawdzania dostępności Pythona
ipcMain.handle('check-python', async () => {
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    
    return new Promise((resolve) => {
        const checkProcess = spawn(pythonPath, ['--version']);
        
        checkProcess.on('close', (code) => {
            resolve(code === 0);
        });
        
        checkProcess.on('error', () => {
            resolve(false);
        });
    });
});