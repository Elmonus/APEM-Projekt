const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

// Ustaw ścieżki do ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'icon.png'), // Opcjonalna ikona
        title: 'Audiowerter - Konwerter Audio'
    });

    mainWindow.loadFile('renderer/index.html');

    // Otwórz DevTools w trybie deweloperskim
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Obsługa konwersji audio
ipcMain.handle('convert-audio', async (event, options) => {
    const { inputPath, outputFormat, trimStart, trimEnd, inputBuffer } = options;

    try {
        // Utwórz folder tymczasowy jeśli nie istnieje
        const tempDir = path.join(app.getPath('temp'), 'audiowerter');
        await fs.mkdir(tempDir, { recursive: true });

        // Zapisz buffer do pliku tymczasowego jeśli przekazano buffer
        let sourceFile = inputPath;
        if (inputBuffer) {
            sourceFile = path.join(tempDir, `temp_${Date.now()}.wav`);
            await fs.writeFile(sourceFile, Buffer.from(inputBuffer));
        }

        // Wygeneruj nazwę pliku wyjściowego
        const outputFile = path.join(tempDir, `output_${Date.now()}.${outputFormat}`);

        return new Promise((resolve, reject) => {
            let command = ffmpeg(sourceFile);

            // Dodaj przycinanie jeśli określono
            if (trimStart !== undefined && trimEnd !== undefined) {
                const duration = trimEnd - trimStart;
                command = command
                    .setStartTime(trimStart)
                    .setDuration(duration);
            }

            // Ustaw parametry dla różnych formatów
            switch (outputFormat) {
                case 'mp3':
                    command = command
                        .audioCodec('libmp3lame')
                        .audioBitrate('192k');
                    break;
                case 'wav':
                    command = command
                        .audioCodec('pcm_s16le')
                        .audioFrequency(44100);
                    break;
                case 'flac':
                    command = command
                        .audioCodec('flac')
                        .audioChannels(2)
                        .addOption('-compression_level', '5');
                    break;
                case 'ogg':
                    command = command
                        .audioCodec('libvorbis')
                        .audioQuality(5);
                    break;
            }

            command
                .on('end', async () => {
                    try {
                        // Odczytaj plik wyjściowy
                        const outputBuffer = await fs.readFile(outputFile);

                        // Usuń pliki tymczasowe
                        await fs.unlink(outputFile).catch(() => {});
                        if (inputBuffer) {
                            await fs.unlink(sourceFile).catch(() => {});
                        }

                        resolve({
                            success: true,
                            buffer: outputBuffer,
                            format: outputFormat
                        });
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', (error) => {
                    // Usuń pliki tymczasowe w przypadku błędu
                    fs.unlink(outputFile).catch(() => {});
                    if (inputBuffer) {
                        fs.unlink(sourceFile).catch(() => {});
                    }
                    reject(error);
                })
                .save(outputFile);
        });
    } catch (error) {
        throw error;
    }
});

// Obsługa zapisu pliku
ipcMain.handle('save-file', async (event, options) => {
    const { buffer, defaultName } = options;

    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: defaultName,
            filters: [
                { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!result.canceled && result.filePath) {
            await fs.writeFile(result.filePath, Buffer.from(buffer));
            return { success: true, filePath: result.filePath };
        }

        return { success: false, canceled: true };
    } catch (error) {
        throw error;
    }
});

// Informacje o aplikacji
ipcMain.handle('get-app-info', () => {
    return {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch
    };
});