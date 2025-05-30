console.log('Renderer.js loaded!');

// Test czy DOM jest załadowany
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    console.log('Body content:', document.body.innerHTML.substring(0, 200));
    
    // Sprawdź czy elementy istnieją
    console.log('uploadForm:', document.getElementById('uploadForm'));
    console.log('audioEditor:', document.getElementById('audioEditor'));
});

// Zmienne globalne
let currentAudioBuffer = null;
let currentBlob = null;
let currentFileName = null;
let currentFile = null; // Dodajemy zmienną dla pliku
let audioContext = null;
let sourceNode = null;
let trimStart = 0;
let trimEnd = 0;
let zoom = 1;
let isPlaying = false;

// Sprawdź czy electronAPI istnieje
if (!window.electronAPI) {
    console.error('ElectronAPI not found! Check preload.js');
    window.electronAPI = {
        getAppInfo: () => Promise.resolve({ version: '1.0.0', platform: 'unknown' }),
        convertAudio: () => Promise.reject(new Error('ElectronAPI not loaded')),
        saveFile: () => Promise.reject(new Error('ElectronAPI not loaded'))
    };
}

// Wyświetl informacje o aplikacji
window.electronAPI.getAppInfo().then(info => {
    const appInfoElement = document.getElementById('appInfo');
    if (appInfoElement) {
        appInfoElement.textContent = `v${info.version} | ${info.platform}`;
    }
}).catch(err => {
    console.log('AppInfo error:', err);
});

// Upload pliku
const uploadForm = document.getElementById('uploadForm');
const audioFileInput = document.getElementById('audioFile');
const fileNameDisplay = document.getElementById('fileName');
const audioEditor = document.getElementById('audioEditor');

if (audioFileInput) {
    audioFileInput.addEventListener('change', (e) => {
        const fileName = e.target.files[0]?.name || 'Nie wybrano pliku';
        fileNameDisplay.textContent = fileName;
    });
}

if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const file = audioFileInput.files[0];
        if (!file) {
            alert('Wybierz plik!');
            return;
        }

        currentFileName = file.name;
        currentFile = file;
        await loadAudioFile(file);
    });
}

async function loadAudioFile(file) {
    try {
        console.log('Loading file:', file.name, file.size);
        
        // Inicjalizacja Audio Context
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext created');
        }

        // Wczytaj plik
        console.log('Reading file...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('File read, buffer size:', arrayBuffer.byteLength);
        
        try {
            console.log('Decoding audio...');
            currentAudioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
            console.log('Audio decoded successfully:', currentAudioBuffer.duration, 'seconds');
            continueAfterDecode();
        } catch (decodeError) {
            console.error('Decode error:', decodeError);
            // Spróbuj alternatywnej metody
            return new Promise((resolve, reject) => {
                audioContext.decodeAudioData(
                    arrayBuffer.slice(0),
                    (buffer) => {
                        console.log('Audio decoded (callback):', buffer.duration, 'seconds');
                        currentAudioBuffer = buffer;
                        continueAfterDecode();
                        resolve();
                    },
                    (error) => {
                        console.error('Decode error (callback):', error);
                        alert('Nie można zdekodować pliku audio. Sprawdź czy plik nie jest uszkodzony.');
                        reject(error);
                    }
                );
            });
        }
        
    } catch (error) {
        console.error('Error loading file:', error);
        alert('Błąd wczytywania pliku: ' + error.message);
    }
}

function continueAfterDecode() {
    if (!currentAudioBuffer) return;
    
    currentBlob = currentFile;

    // Ustaw wartości początkowe
    trimStart = 0;
    trimEnd = currentAudioBuffer.duration;
    zoom = 1;

    // Pokaż edytor
    console.log('Showing editor...');
    const audioEditor = document.getElementById('audioEditor');
    if (audioEditor) {
        audioEditor.style.display = 'block';
    } else {
        console.error('audioEditor element not found!');
        return;
    }
    
    // Narysuj waveform
    console.log('Drawing waveform...');
    drawWaveform();
    
    // Ustaw suwaki
    updateSliders();
    
    // Ustaw wartości w polach
    const trimEndInput = document.getElementById('trimEnd');
    const trimStartInput = document.getElementById('trimStart');
    
    if (trimEndInput) {
        trimEndInput.value = trimEnd.toFixed(1);
        trimEndInput.max = trimEnd.toFixed(1);
    }
    if (trimStartInput) {
        trimStartInput.max = trimEnd.toFixed(1);
    }

    // Przewiń do edytora
    audioEditor.scrollIntoView({ behavior: 'smooth' });
    console.log('File loaded successfully!');
}

// Rysowanie waveform
function drawWaveform() {
    const canvas = document.getElementById('waveform');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Ustaw rozmiar canvas
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // Czyść canvas
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!currentAudioBuffer) return;
    
    // Pobierz dane audio
    const channelData = currentAudioBuffer.getChannelData(0);
    const samples = Math.floor(channelData.length / zoom);
    const blockSize = Math.floor(samples / canvas.width);
    const blocks = [];
    
    // Przetwórz dane
    for (let i = 0; i < canvas.width; i++) {
        let sum = 0;
        let max = 0;
        for (let j = 0; j < blockSize; j++) {
            const sample = channelData[i * blockSize + j] || 0;
            sum += Math.abs(sample);
            max = Math.max(max, Math.abs(sample));
        }
        blocks.push(max);
    }
    
    // Narysuj waveform
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 1;
    
    const middle = canvas.height / 2;
    ctx.beginPath();
    
    for (let i = 0; i < blocks.length; i++) {
        const x = i;
        const height = blocks[i] * middle * 0.9;
        
        ctx.moveTo(x, middle - height);
        ctx.lineTo(x, middle + height);
    }
    
    ctx.stroke();
    
    // Zaznacz obszar przycięcia
    const startX = (trimStart / currentAudioBuffer.duration) * canvas.width;
    const endX = (trimEnd / currentAudioBuffer.duration) * canvas.width;
    
    ctx.fillStyle = 'rgba(102, 126, 234, 0.2)';
    ctx.fillRect(startX, 0, endX - startX, canvas.height);
    
    // Linie graniczne
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, canvas.height);
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, canvas.height);
    ctx.stroke();
}

// Obsługa suwaków
const startHandle = document.getElementById('startHandle');
const endHandle = document.getElementById('endHandle');
const sliderTrack = document.getElementById('sliderTrack');
const sliderRange = document.getElementById('sliderRange');

let isDragging = false;
let currentHandle = null;

function updateSliders() {
    if (!currentAudioBuffer) return;
    
    const startPercent = (trimStart / currentAudioBuffer.duration) * 100;
    const endPercent = (trimEnd / currentAudioBuffer.duration) * 100;
    
    if (startHandle) startHandle.style.left = startPercent + '%';
    if (endHandle) endHandle.style.left = endPercent + '%';
    
    if (sliderRange) {
        sliderRange.style.left = startPercent + '%';
        sliderRange.style.width = (endPercent - startPercent) + '%';
    }
    
    // Aktualizuj wyświetlane czasy
    const startTimeEl = document.getElementById('startTime');
    const endTimeEl = document.getElementById('endTime');
    const durationEl = document.getElementById('duration');
    
    if (startTimeEl) startTimeEl.textContent = formatTime(trimStart);
    if (endTimeEl) endTimeEl.textContent = formatTime(trimEnd);
    if (durationEl) durationEl.textContent = formatTime(trimEnd - trimStart);
}

function handleMouseDown(e, handle) {
    isDragging = true;
    currentHandle = handle;
    e.preventDefault();
}

function handleMouseMove(e) {
    if (!isDragging || !currentHandle || !currentAudioBuffer) return;
    
    const rect = sliderTrack.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const time = (percent / 100) * currentAudioBuffer.duration;
    
    if (currentHandle === startHandle) {
        trimStart = Math.min(time, trimEnd - 0.1);
        const trimStartInput = document.getElementById('trimStart');
        if (trimStartInput) trimStartInput.value = trimStart.toFixed(1);
    } else {
        trimEnd = Math.max(time, trimStart + 0.1);
        const trimEndInput = document.getElementById('trimEnd');
        if (trimEndInput) trimEndInput.value = trimEnd.toFixed(1);
    }
    
    updateSliders();
    drawWaveform();
}

function handleMouseUp() {
    isDragging = false;
    currentHandle = null;
}

if (startHandle) startHandle.addEventListener('mousedown', (e) => handleMouseDown(e, startHandle));
if (endHandle) endHandle.addEventListener('mousedown', (e) => handleMouseDown(e, endHandle));
document.addEventListener('mousemove', handleMouseMove);
document.addEventListener('mouseup', handleMouseUp);

// Obsługa manualnego wprowadzania czasu
const trimStartInput = document.getElementById('trimStart');
if (trimStartInput) {
    trimStartInput.addEventListener('input', (e) => {
        trimStart = Math.max(0, Math.min(parseFloat(e.target.value), trimEnd - 0.1));
        updateSliders();
        drawWaveform();
    });
}

const trimEndInput = document.getElementById('trimEnd');
if (trimEndInput) {
    trimEndInput.addEventListener('input', (e) => {
        trimEnd = Math.min(currentAudioBuffer.duration, Math.max(parseFloat(e.target.value), trimStart + 0.1));
        updateSliders();
        drawWaveform();
    });
}

const applyManualTrimBtn = document.getElementById('applyManualTrim');
if (applyManualTrimBtn) {
    applyManualTrimBtn.addEventListener('click', () => {
        updateSliders();
        drawWaveform();
    });
}

// Zoom
const zoomInBtn = document.getElementById('zoomIn');
if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
        zoom = Math.min(zoom * 1.5, 10);
        const zoomLevelEl = document.getElementById('zoomLevel');
        if (zoomLevelEl) zoomLevelEl.textContent = zoom.toFixed(1) + 'x';
        drawWaveform();
    });
}

const zoomOutBtn = document.getElementById('zoomOut');
if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
        zoom = Math.max(zoom / 1.5, 1);
        const zoomLevelEl = document.getElementById('zoomLevel');
        if (zoomLevelEl) zoomLevelEl.textContent = zoom.toFixed(1) + 'x';
        drawWaveform();
    });
}

const zoomResetBtn = document.getElementById('zoomReset');
if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', () => {
        zoom = 1;
        const zoomLevelEl = document.getElementById('zoomLevel');
        if (zoomLevelEl) zoomLevelEl.textContent = '1.0x';
        drawWaveform();
    });
}

// Odtwarzanie
const playOriginalBtn = document.getElementById('playOriginal');
if (playOriginalBtn) {
    playOriginalBtn.addEventListener('click', () => {
        if (currentAudioBuffer) {
            playAudio(0, currentAudioBuffer.duration);
        }
    });
}

const playSelectionBtn = document.getElementById('playSelection');
if (playSelectionBtn) {
    playSelectionBtn.addEventListener('click', () => {
        if (currentAudioBuffer) {
            playAudio(trimStart, trimEnd);
        }
    });
}

const stopPlaybackBtn = document.getElementById('stopPlayback');
if (stopPlaybackBtn) {
    stopPlaybackBtn.addEventListener('click', stopAudio);
}

function playAudio(start, end) {
    if (!currentAudioBuffer || isPlaying) return;
    
    stopAudio();
    
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = currentAudioBuffer;
    sourceNode.connect(audioContext.destination);
    
    const duration = end - start;
    sourceNode.start(0, start, duration);
    isPlaying = true;
    
    // Animacja progress bar
    const progressBar = document.getElementById('progressBar');
    const startTime = Date.now();
    
    function updateProgress() {
        if (!isPlaying) return;
        
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        const position = ((start + elapsed) / currentAudioBuffer.duration) * 100;
        
        if (progressBar) progressBar.style.left = position + '%';
        
        if (progress < 1) {
            requestAnimationFrame(updateProgress);
        } else {
            isPlaying = false;
            if (progressBar) progressBar.style.left = '-2px';
        }
    }
    
    updateProgress();
    
    sourceNode.onended = () => {
        isPlaying = false;
        if (progressBar) progressBar.style.left = '-2px';
    };
}

function stopAudio() {
    if (sourceNode) {
        sourceNode.stop();
        sourceNode = null;
    }
    isPlaying = false;
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.left = '-2px';
}

// Nagrywanie
let mediaRecorder;
let audioChunks = [];
let recordedBlob = null;
let startTime;
let timerInterval;
let recordingAnalyser;
let recordingDataArray;
let animationId;

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const timer = document.getElementById('timer');
const recordingCanvas = document.getElementById('visualizer');
const recordingCtx = recordingCanvas ? recordingCanvas.getContext('2d') : null;

// Ustawienie rozmiaru canvas
if (recordingCanvas) {
    recordingCanvas.width = recordingCanvas.offsetWidth;
    recordingCanvas.height = recordingCanvas.offsetHeight;
}

function updateTimer() {
    const elapsed = Date.now() - startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    if (timer) timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function drawRecordingVisualizer() {
    if (!recordingCtx) return;
    
    animationId = requestAnimationFrame(drawRecordingVisualizer);

    recordingAnalyser.getByteTimeDomainData(recordingDataArray);

    recordingCtx.fillStyle = '#f0f0f0';
    recordingCtx.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);

    recordingCtx.lineWidth = 2;
    recordingCtx.strokeStyle = '#667eea';
    recordingCtx.beginPath();

    const sliceWidth = recordingCanvas.width / recordingDataArray.length;
    let x = 0;

    for (let i = 0; i < recordingDataArray.length; i++) {
        const v = recordingDataArray[i] / 128.0;
        const y = v * recordingCanvas.height / 2;

        if (i === 0) {
            recordingCtx.moveTo(x, y);
        } else {
            recordingCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    recordingCtx.lineTo(recordingCanvas.width, recordingCanvas.height / 2);
    recordingCtx.stroke();
}

if (startBtn) {
    startBtn.onclick = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Audio context dla wizualizacji
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            const source = audioContext.createMediaStreamSource(stream);
            recordingAnalyser = audioContext.createAnalyser();
            recordingAnalyser.fftSize = 2048;
            const bufferLength = recordingAnalyser.frequencyBinCount;
            recordingDataArray = new Uint8Array(bufferLength);
            source.connect(recordingAnalyser);

            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
                currentFileName = 'nagranie.webm';
                currentFile = recordedBlob;
                
                // Załaduj nagranie do edytora
                await loadAudioFile(recordedBlob);
                
                // Zatrzymanie wizualizacji
                cancelAnimationFrame(animationId);
                if (recordingCtx) {
                    recordingCtx.fillStyle = '#f0f0f0';
                    recordingCtx.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);
                }
            };

            mediaRecorder.start();
            startTime = Date.now();
            timerInterval = setInterval(updateTimer, 100);
            
            startBtn.disabled = true;
            startBtn.classList.add('recording');
            if (pauseBtn) pauseBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = false;

            drawRecordingVisualizer();
        } catch (error) {
            alert('Nie można uzyskać dostępu do mikrofonu: ' + error.message);
        }
    };
}

if (pauseBtn) {
    pauseBtn.onclick = () => {
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.pause();
            pauseBtn.textContent = '▶️ Wznów';
            clearInterval(timerInterval);
        } else {
            mediaRecorder.resume();
            pauseBtn.textContent = '⏸️ Pauza';
            timerInterval = setInterval(updateTimer, 100);
        }
    };
}

if (stopBtn) {
    stopBtn.onclick = () => {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        clearInterval(timerInterval);
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.classList.remove('recording');
        }
        if (pauseBtn) {
            pauseBtn.disabled = true;
            pauseBtn.textContent = '⏸️ Pauza';
        }
        if (stopBtn) stopBtn.disabled = true;
    };
}

// Eksport z przycięciem
const exportForm = document.getElementById('exportForm');
const exportResult = document.getElementById('exportResult');

if (exportForm) {
    exportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentAudioBuffer) {
            alert('Najpierw wczytaj lub nagraj audio!');
            return;
        }

        const format = document.getElementById('exportFormat').value;
        if (exportResult) exportResult.innerHTML = '<div class="loading"></div> Przetwarzanie i konwertowanie...';

        try {
            // Utwórz przycięty AudioBuffer
            const sampleRate = currentAudioBuffer.sampleRate;
            const startSample = Math.floor(trimStart * sampleRate);
            const endSample = Math.floor(trimEnd * sampleRate);
            const duration = endSample - startSample;
            
            const trimmedBuffer = audioContext.createBuffer(
                currentAudioBuffer.numberOfChannels,
                duration,
                sampleRate
            );
            
            for (let channel = 0; channel < currentAudioBuffer.numberOfChannels; channel++) {
                const sourceData = currentAudioBuffer.getChannelData(channel);
                const targetData = trimmedBuffer.getChannelData(channel);
                
                for (let i = 0; i < duration; i++) {
                    targetData[i] = sourceData[startSample + i];
                }
            }
            
            // Konwertuj AudioBuffer do WAV
            const wavBlob = await audioBufferToWav(trimmedBuffer);
            
            // Konwertuj przez Electron API
            const result = await window.electronAPI.convertAudio({
                inputBuffer: await wavBlob.arrayBuffer(),
                outputFormat: format,
                trimStart: trimStart,
                trimEnd: trimEnd
            });
            
            if (result.success) {
                // Zapisz plik
                const baseName = currentFileName ? 
                    currentFileName.replace(/\.[^/.]+$/, '') : 'audio';
                const fileName = `${baseName}_trimmed.${format}`;
                
                const saveResult = await window.electronAPI.saveFile({
                    buffer: result.buffer,
                    defaultName: fileName
                });
                
                if (saveResult.success && exportResult) {
                    exportResult.innerHTML = `
                        <div class="result">
                            ✅ Plik zapisany pomyślnie!<br>
                            <small>${saveResult.filePath}</small>
                        </div>
                    `;
                } else if (saveResult.canceled && exportResult) {
                    exportResult.innerHTML = '<div class="result error">Anulowano zapisywanie</div>';
                }
            } else if (exportResult) {
                exportResult.innerHTML = '<div class="result error">❌ Błąd konwersji</div>';
            }
        } catch (error) {
            console.error('Export error:', error);
            if (exportResult) {
                exportResult.innerHTML = `<div class="result error">❌ Błąd: ${error.message}</div>`;
            }
        }
    });
}

// Konwersja AudioBuffer do WAV
function audioBufferToWav(buffer) {
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const channels = [];
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                   // PCM (uncompressed)
    setUint16(buffer.numberOfChannels);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels); // avg. bytes/sec
    setUint16(buffer.numberOfChannels * 2);        // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this demo)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 8);                   // chunk length

    // write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++)
        channels.push(buffer.getChannelData(i));

    while (pos < length) {
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true);          // write 16-bit sample
            pos += 2;
        }
        offset++; // next source sample
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

// Formatowanie czasu
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
}

// Obsługa zmiany rozmiaru okna
window.addEventListener('resize', () => {
    if (currentAudioBuffer) {
        drawWaveform();
    }
});

console.log('Renderer.js fully loaded');