import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';
import { getTrackBackground, Range } from 'react-range';
import * as lamejs from '@breezystack/lamejs';
import './App.css';

// Electron API
const { ipcRenderer } = window.require('electron');

const App: React.FC = () => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [rangeValues, setRangeValues] = useState([0, 0]);
  const [isWaveformReady, setIsWaveformReady] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [volume, setVolume] = useState(1.0);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Inicjalizacja WaveSurfer
  useEffect(() => {
    if (waveformRef.current && !wavesurferRef.current) {
      const ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#667eea',
        progressColor: '#764ba2',
        height: 150,
        backend: 'WebAudio',
        plugins: [
          (RegionsPlugin as any).create({
            dragSelection: true,
            content: 'resize'
          } )
        ]
      });

      ws.on('ready', () => {
        const dur = ws.getDuration();
        setDuration(dur);
        setStartTime(0);
        setEndTime(dur);
        setRangeValues([0, dur]);
        setIsWaveformReady(true);

        // Pobierz AudioBuffer
        const backend = (ws as any).backend?.buffer || (ws as any)._backend?.buffer;
        if (backend && 'buffer' in backend) {
          setAudioBuffer((backend as any).buffer);
        }
      });

      (ws as any).on('region-created', (region: any) => {
        setStartTime(region.start);
        setEndTime(region.end);
        setRangeValues([region.start, region.end]);
      });

      (ws as any).on('region-updated', (region: any) => {
        setStartTime(region.start);
        setEndTime(region.end);
        setRangeValues([region.start, region.end]);
      });

      wavesurferRef.current = ws;
    }

    return () => {
      wavesurferRef.current?.destroy();
    };
  }, []);

  // Aktualizacja range values
  useEffect(() => {
    setRangeValues([startTime, endTime]);
  }, [startTime, endTime]);

  // Obsługa plików
  const handleFileSelect = async () => {
    try {
      const result = await ipcRenderer.invoke('open-file');
      if (result.success) {
        setFileName(result.fileName);
        setCurrentFilePath(result.filePath);
        
        // Konwertuj base64 na blob
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/*' });
        
        loadAudioBlob(blob);
      }
    } catch (error) {
      console.error('Error opening file:', error);
      alert('Błąd otwierania pliku');
    }
  };

  const loadAudioBlob = async (blob: Blob) => {
    if (!wavesurferRef.current) return;
    
    wavesurferRef.current.empty();
    wavesurferRef.current.loadBlob(blob);
    
    // Dekoduj audio buffer
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    setAudioBuffer(decoded);
  };



  // Nagrywanie
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        loadAudioBlob(blob);
        setFileName('Nagranie.webm');
        setCurrentFilePath(null);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      alert('Błąd nagrywania: ' + error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  // Odtwarzanie
  const playAll = () => wavesurferRef.current?.play();
  const pause = () => wavesurferRef.current?.pause();
  
  const playRegion = () => {
    if (wavesurferRef.current && startTime < endTime) {
      wavesurferRef.current.play(startTime, endTime);
    }
  };

  // Eksport WAV
  const saveAsWav = async () => {
    if (!audioBuffer) {
      alert("Brak danych audio.");
      return;
    }

    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    const sliced = audioBuffer.getChannelData(0).slice(startSample, endSample);

    // Tworzenie WAV
    const length = sliced.length * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    let offset = 0;

    const writeString = (s: string) => {
      for (let i = 0; i < s.length; i++) {
        view.setUint8(offset + i, s.charCodeAt(i));
      }
      offset += s.length;
    };

    // WAV header
    writeString('RIFF');
    view.setUint32(offset, length - 8, true); offset += 4;
    writeString('WAVEfmt ');
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * 2, true); offset += 4;
    view.setUint16(offset, 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString('data');
    view.setUint32(offset, sliced.length * 2, true); offset += 4;

    // Audio data
    for (let i = 0; i < sliced.length; i++) {
      const s = Math.max(-1, Math.min(1, sliced[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    // Zapisz przez Electron
    const result = await ipcRenderer.invoke('save-file', {
      data: new Uint8Array(buffer),
      fileName: `audio_${Date.now()}.wav`
    });

    if (result.success) {
      alert(`Zapisano: ${result.filePath}`);
    }
  };

  // Eksport MP3
  const saveAsMp3 = async () => {
    if (!audioBuffer) {
      alert("Brak danych audio.");
      return;
    }

    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    const sliced = audioBuffer.getChannelData(0).slice(startSample, endSample);

    // Enkodowanie MP3
    const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
    const mp3Data: Uint8Array[] = [];
    const blockSize = 1152;

    for (let i = 0; i < sliced.length; i += blockSize) {
      const chunk = sliced.slice(i, i + blockSize);
      const int16 = new Int16Array(chunk.length);
      for (let j = 0; j < chunk.length; j++) {
        int16[j] = chunk[j] * 32767;
      }
      const mp3buf = mp3encoder.encodeBuffer(int16);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    // Złącz bufory
    let totalLength = 0;
    mp3Data.forEach(buf => totalLength += buf.length);
    const output = new Uint8Array(totalLength);
    let offset = 0;
    mp3Data.forEach(buf => {
      output.set(buf, offset);
      offset += buf.length;
    });

    // Zapisz przez Electron
    const result = await ipcRenderer.invoke('save-file', {
      data: output,
      fileName: `audio_${Date.now()}.mp3`
    });

    if (result.success) {
      alert(`Zapisano: ${result.filePath}`);
    }
  };

  // Konwersja z FFmpeg
  const convertWithFFmpeg = async (format: string) => {
    if (!currentFilePath) {
      alert('FFmpeg wymaga oryginalnego pliku');
      return;
    }

    try {
      const result = await ipcRenderer.invoke('convert-audio', {
        inputPath: currentFilePath,
        outputFormat: format,
        trimStart: startTime,
        trimEnd: endTime
      });

      if (result.success) {
        const saveResult = await ipcRenderer.invoke('save-file', {
          data: result.data,
          fileName: `audio_${Date.now()}.${format}`
        });

        if (saveResult.success) {
          alert(`Zapisano: ${saveResult.filePath}`);
        }
      }
    } catch (error) {
      console.error('Conversion error:', error);
      alert('Błąd konwersji: ' + error);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎵 Audiowerter</h1>
      </header>

      <main className="app-content">
        <div className="section">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setFileName(file.name);
                loadAudioBlob(file);
              }
            }}
            style={{ display: 'none' }}
          />
          
          <button className="btn btn-primary" onClick={handleFileSelect}>
            📂 Wybierz plik audio
          </button>
          
          <button 
            className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? '⏹️ Zatrzymaj nagrywanie' : '🎙️ Nagraj audio'}
          </button>
        </div>

        {fileName && (
          <div className="file-info">
            <p>Plik: {fileName}</p>
            {duration > 0 && <p>Długość: {duration.toFixed(2)}s</p>}
          </div>
        )}

        <div 
          ref={waveformRef} 
          className="waveform-container"
          style={{ display: duration > 0 ? 'block' : 'none' }}
        />

        {duration > 0 && (
          <>
            <div className="range-container">
              <Range
                values={rangeValues}
                step={0.01}
                min={0}
                max={duration}
                onChange={(values) => {
                  setRangeValues(values);
                  setStartTime(values[0]);
                  setEndTime(values[1]);
                }}
                renderTrack={({ props, children }) => (
                  <div
                    {...props}
                    className="range-track"
                    style={{
                      ...props.style,
                      background: getTrackBackground({
                        values: rangeValues,
                        colors: ['#ccc', '#667eea', '#ccc'],
                        min: 0,
                        max: duration,
                      }),
                    }}
                  >
                    {children}
                  </div>
                )}
                renderThumb={({ index, props }) => (
                  <div
                    {...props}
                    className="range-thumb"
                    style={props.style}
                  >
                    <div className="range-label">
                      {rangeValues[index].toFixed(2)}s
                    </div>
                  </div>
                )}
              />
            </div>

            <div className="volume-control">
              <label>Głośność: {Math.round(volume * 100)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => {
                  const vol = parseFloat(e.target.value);
                  setVolume(vol);
                  wavesurferRef.current?.setVolume(vol);
                }}
              />
            </div>

            <div className="controls">
              <button className="btn" onClick={playAll}>▶️ Odtwórz</button>
              <button className="btn" onClick={playRegion}>🔂 Odtwórz zaznaczenie</button>
              <button className="btn" onClick={pause}>⏸️ Pauza</button>
            </div>

            <div className="export-section">
              <h3>Eksportuj jako:</h3>
              <div className="export-buttons">
                <button className="btn btn-success" onClick={saveAsWav}>
                  💾 WAV
                </button>
                <button className="btn btn-success" onClick={saveAsMp3}>
                  💾 MP3
                </button>
                {currentFilePath && (
                  <>
                    <button className="btn btn-success" onClick={() => convertWithFFmpeg('flac')}>
                      💾 FLAC (FFmpeg)
                    </button>
                    <button className="btn btn-success" onClick={() => convertWithFFmpeg('ogg')}>
                      💾 OGG (FFmpeg)
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;