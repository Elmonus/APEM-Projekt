import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { RegionsPluginOptions } from 'wavesurfer.js/dist/plugins/regions.js';
import { getTrackBackground, Range } from 'react-range';
import * as lamejs from '@breezystack/lamejs';
import './App.css';
import { saveAs } from 'file-saver';

// Electron API
const { ipcRenderer } = window.require('electron');

const App: React.FC = () => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const [isWaveformReady, setIsWaveformReady] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState('0.00');
  const [endTime, setEndTime] = useState('0.00');
  const [rangeValues, setRangeValues] = useState([0.0, 0.0]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // nagrywanie
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);

  const [volume, setVolume] = useState(1.0);

  useEffect(() => {
    setRangeValues([parseFloat(startTime), parseFloat(endTime)]);
  }, [startTime, endTime]);

  useEffect(() => {
    if (waveformRef.current && !wavesurferRef.current) {
      const ws: any = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#667eea',
        progressColor: '#764ba2',
        height: 150,
        backend: 'WebAudio',
        plugins: [
          RegionsPlugin.create({
            dragSelection: true,
          })
        ]
      });
      wavesurferRef.current = ws;

      ws.on('ready', () => {
        const dur = ws.getDuration();
        setDuration(dur);
        setStartTime('0.00');
        setEndTime(dur.toFixed(2));
        setIsWaveformReady(true);

        const buffer = ws.backend?.buffer;
        if (buffer) {
          setAudioBuffer(buffer);
        }

        // wyczyść stare, dodaj nowy region
        const regionsPlugin = ws.plugins[0];
        if (regionsPlugin) {
          regionsPlugin.clearRegions();
          regionsPlugin.addRegion({
            start: 0, 
            end: dur, 
            color: 'rgba(102,126,234,0.3)'
          });
        }
      });

      ws.on('region-created', (reg: any) => {
        setStartTime(reg.start.toFixed(2));
        setEndTime(reg.end.toFixed(2));
      });
      ws.on('region-updated', (reg: any) => {
        setStartTime(reg.start.toFixed(2));
        setEndTime(reg.end.toFixed(2));
      });
    }
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !wavesurferRef.current) return;

    setFileName(f.name);
    const ws: any = wavesurferRef.current;
    ws.empty();
    
    // Wyczyść regiony
    const regionsPlugin = ws.plugins[0];
    if (regionsPlugin) {
      regionsPlugin.clearRegions();
    }
    
    ws.load(URL.createObjectURL(f));
    decodeAudioBufferFromBlob(f)
        .then(decoded => {
          setAudioBuffer(decoded);
        })
        .catch(err => {
          console.error("Błąd dekodowania pliku:", err);
        });
  };

  const decodeAudioBufferFromBlob = async (blob: Blob): Promise<AudioBuffer> => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    return await audioCtx.decodeAudioData(arrayBuffer);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioChunks([]);
        
        // Załaduj nagranie do wavesurfer
        if (wavesurferRef.current) {
          const ws = wavesurferRef.current;
          ws.empty();
          
          // Wyczyść regiony przed załadowaniem
          const regionsPlugin = ws.plugins[0];
          if (regionsPlugin) {
            regionsPlugin.clearRegions();
          }
          
          // Ustaw callback dla ready event PRZED załadowaniem
          ws.once('ready', () => {
            const dur = ws.getDuration();
            setDuration(dur);
            setStartTime('0.00');
            setEndTime(dur.toFixed(2));
            setRangeValues([0, dur]);
            
            // Dodaj nowy region po załadowaniu
            if (regionsPlugin) {
              regionsPlugin.addRegion({
                start: 0,
                end: dur,
                color: 'rgba(102,126,234,0.3)'
              });
            }
          });
          
          ws.loadBlob(blob);
          
          // Dekoduj audio buffer
          try {
            const decoded = await decodeAudioBufferFromBlob(blob);
            setAudioBuffer(decoded);
          } catch (err) {
            console.error("Błąd dekodowania nagrania:", err);
          }
        }
        
        setFileName('Nagranie.webm');
        setRecording(false);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecordingStream(stream);
      setRecording(true);
    } catch (error) {
      console.error('Błąd rozpoczęcia nagrywania:', error);
      alert('Nie można uzyskać dostępu do mikrofonu');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      
      // Zatrzymaj wszystkie ścieżki audio
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        setRecordingStream(null);
      }
      
      setMediaRecorder(null);
    }
  };

  const saveAsWav = async () => {
    if (!audioBuffer) return alert('Brak danych audio');

    const sampleRate = audioBuffer.sampleRate;
    const start = Math.floor(parseFloat(startTime) * sampleRate);
    const end = Math.floor(parseFloat(endTime) * sampleRate);
    const data = audioBuffer.getChannelData(0).slice(start, end);

    const wavBuffer = createWavFile(data, sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    saveAs(blob, `audio_${Date.now()}.wav`);
  };

  const saveAsMp3 = async () => {
    if (!audioBuffer) return alert('Brak danych audio');

    const sampleRate = audioBuffer.sampleRate;
    const start = Math.floor(parseFloat(startTime) * sampleRate);
    const end = Math.floor(parseFloat(endTime) * sampleRate);
    const data = audioBuffer.getChannelData(0).slice(start, end);

    const mp3Encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
    const samples = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      samples[i] = data[i] * 32767;
    }

    const mp3Data: Uint8Array[] = [];
    const blockSize = 1152;
    for (let i = 0; i < samples.length; i += blockSize) {
      const chunk = samples.subarray(i, i + blockSize);
      const mp3buf = mp3Encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }
    const endBuf = mp3Encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    const blob = new Blob(mp3Data, { type: 'audio/mp3' });
    saveAs(blob, `audio_${Date.now()}.mp3`);
  };

  const createWavFile = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    let offset = 0;

    const writeString = (s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
    };

    writeString('RIFF');
    view.setUint32(offset, 36 + samples.length * 2, true);
    offset += 4;
    writeString('WAVE');
    writeString('fmt ');
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 1, true); offset += 2; // PCM
    view.setUint16(offset, 1, true); offset += 2; // Mono
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * 2, true); offset += 4;
    view.setUint16(offset, 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString('data');
    view.setUint32(offset, samples.length * 2, true); offset += 4;

    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return buffer;
  };

  // funkcje odtwarzania
  const playAll = () => {
    wavesurferRef.current?.play();
  };

  const playRegion = () => {
    const s = parseFloat(startTime);
    const e = parseFloat(endTime);
    if (!isNaN(s) && !isNaN(e) && s < e && e <= duration && wavesurferRef.current) {
      // Zatrzymaj jeśli coś gra
      wavesurferRef.current.pause();
      // Ustaw pozycję i odtwórz
      wavesurferRef.current.setTime(s);
      wavesurferRef.current.play();
      
      // Ustaw timeout do zatrzymania
      const playDuration = (e - s) * 1000;
      setTimeout(() => {
        if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
          wavesurferRef.current.pause();
        }
      }, playDuration);
    }
  };

  const pause = () => {
    wavesurferRef.current?.pause();
  };

  return (
      <div className="app">
        <header className="app-header">
          <h1>Audiowerter</h1>
        </header>
        
        <main className="app-content">
          <div className="section">
            <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={onFileChange}
                style={{ display: 'none' }}
            />
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
              Wybierz plik audio
            </button>
            <button
                className={`btn ${recording ? 'btn-danger' : 'btn-primary'}`}
                onClick={recording ? stopRecording : startRecording}
            >
              {recording ? 'Zatrzymaj nagrywanie' : 'Nagraj audio'}
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
              style={{ visibility: isWaveformReady ? 'visible' : 'hidden' }}
          />

          {isWaveformReady && (
              <>
                <div className="range-container">
                  <Range
                      values={rangeValues}
                      step={0.01}
                      min={0}
                      max={duration}
                      onChange={(values) => {
                        setRangeValues(values);
                        setStartTime(values[0].toFixed(2));
                        setEndTime(values[1].toFixed(2));
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
                  <button className="btn" onClick={playAll}>Odtwórz</button>
                  <button className="btn" onClick={playRegion}>Odtwórz zaznaczenie</button>
                  <button className="btn" onClick={pause}>Pauza</button>
                </div>

                <div className="export-section">
                  <h3>Eksportuj jako:</h3>
                  <div className="export-buttons">
                    <button className="btn btn-success" onClick={saveAsWav}>
                      WAV
                    </button>
                    <button className="btn btn-success" onClick={saveAsMp3}>
                      MP3
                    </button>
                  </div>
                </div>
              </>
          )}
        </main>
      </div>
  );
};

export default App;