const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Ustaw ścieżkę do ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;
const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        },
        icon: path.join(__dirname, 'icon.png'),
        title: 'Audiowerter'
    });

    // W trybie dev ładuj z localhost, w produkcji z build
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Handlers dla React

// Konwersja audio
ipcMain.handle('convert-audio', async (event, options) => {
    const { inputPath, outputFormat, trimStart, trimEnd } = options;
    
    try {
        const tempDir = app.getPath('temp');
        const outputFileName = `converted_${Date.now()}.${outputFormat}`;
        const outputPath = path.join(tempDir, outputFileName);
        
        return new Promise((resolve, reject) => {
            let command = ffmpeg(inputPath);
            
            if (trimStart !== undefined && trimEnd !== undefined) {
                const duration = trimEnd - trimStart;
                command = command
                    .setStartTime(trimStart)
                    .setDuration(duration);
            }
            
            switch (outputFormat) {
                case 'mp3':
                    command = command.audioCodec('libmp3lame').audioBitrate('192k');
                    break;
                case 'wav':
                    command = command.audioCodec('pcm_s16le').audioFrequency(44100);
                    break;
                case 'flac':
                    command = command.audioCodec('flac').audioChannels(2);
                    break;
                case 'ogg':
                    command = command.audioCodec('libvorbis').audioQuality(5);
                    break;
            }
            
            command
                .on('end', async () => {
                    const data = await fs.readFile(outputPath);
                    await fs.unlink(outputPath).catch(() => {});
                    resolve({ success: true, data, format: outputFormat });
                })
                .on('error', reject)
                .save(outputPath);
        });
    } catch (error) {
        throw error;
    }
});

// Zapisywanie pliku
ipcMain.handle('save-file', async (event, options) => {
    const { data, fileName } = options;
    
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: fileName,
            filters: [
                { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (!result.canceled && result.filePath) {
            await fs.writeFile(result.filePath, Buffer.from(data));
            return { success: true, filePath: result.filePath };
        }
        
        return { success: false, canceled: true };
    } catch (error) {
        throw error;
    }
});

// Otwieranie pliku
ipcMain.handle('open-file', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg', 'webm'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            const data = await fs.readFile(filePath);
            return {
                success: true,
                filePath,
                fileName: path.basename(filePath),
                data: data.toString('base64')
            };
        }
        
        return { success: false, canceled: true };
    } catch (error) {
        throw error;
    }
});