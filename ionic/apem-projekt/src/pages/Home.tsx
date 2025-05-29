import React, { useEffect, useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle,
  IonContent, IonInput, IonButton, IonText, useIonViewDidEnter
} from '@ionic/react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';
import { Range, getTrackBackground } from 'react-range';

//obsługa zapisu do plików
import { IonCol, IonGrid, IonRow } from '@ionic/react';
import { Filesystem, Directory } from '@capacitor/filesystem';
// import lamejs from 'lamejs';
import * as lamejs from '@breezystack/lamejs';
import { Capacitor } from '@capacitor/core';
//nagrywanie
//import { Media } from '@capacitor-community/media';
// import { registerPlugin } from '@capacitor/core';
// const AudioRecorder = registerPlugin<any>('AudioRecorder');
import { VoiceRecorder } from 'capacitor-voice-recorder';
//await VoiceRecorder.requestAudioRecordingPermission();


const Home: React.FC = () => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState('0.00');
  const [endTime, setEndTime] = useState('0.00');
  const STEP = 0.01;
  const MIN = 0;
  const MAX = duration; // zaktualizuje się po załadowaniu pliku
  const [rangeValues, setRangeValues] = useState([0.0, duration+0.01]);
  useEffect(() => {
    setRangeValues([parseFloat(startTime), parseFloat(endTime)]);
  }, [startTime, endTime]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isWaveformReady, setIsWaveformReady] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  // nagrywanie
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder|null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Inicjalizacja Wavesurfer + RegionsPlugin
useIonViewDidEnter(() => {
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
          regionColor: 'rgba(102,126,234,0.3)'
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
      if (ws.regions) {
        ws.regions.clear();
        ws.regions.add({ start: 0, end: dur, color: 'rgba(102,126,234,0.3)' });
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

  //  Wczytywanie pliku
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !wavesurferRef.current) return;

    setFileName(f.name);
    const ws: any = wavesurferRef.current;
    ws.empty();
    if (ws.regions) {
      ws.regions.clear();
    }
    ws.load(URL.createObjectURL(f));
    decodeAudioBufferFromBlob(f)
      .then(decoded => {
        setAudioBuffer(decoded); // ← najważniejsze
      })
      .catch(err => {
        console.error("Błąd dekodowania pliku:", err);
      });
  };

  // funkcje odtwarzania
  const playAll = () => {
    wavesurferRef.current?.play();
  };

  const playRegion = () => {
    const s = parseFloat(startTime);
    const e = parseFloat(endTime);
    if (!isNaN(s) && !isNaN(e) && s < e && e <= duration) {
      wavesurferRef.current.play(s, e);
    }
  };

  const pause = () => {
    wavesurferRef.current?.pause();
  };

  const [volume, setVolume] = useState(1.0);

  ///////////////////////////////////////////////////////////////////////////////////////////
  // obsługa zapisów do pliku:

  // const extractRegionBuffer = (): Float32Array => {
  //   const buffer = wavesurferRef.current.backend.buffer;
  //   const sampleRate = buffer.sampleRate;
  //   const startSample = Math.floor(parseFloat(startTime) * sampleRate);
  //   const endSample = Math.floor(parseFloat(endTime) * sampleRate);
  //   const fullData = buffer.getChannelData(0);
  //   return fullData.slice(startSample, endSample);
  // };

const saveFile = async (blob: Blob, fileName: string, subdir = 'audio') => {
  if (Capacitor.getPlatform() === 'web') {
    // Web –  przez <a download>
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    //  Android – zapis przez @capacitor/filesystem
    try {
      const base64 = await blobToBase64(blob);
      // await Filesystem.mkdir({
      //   directory: Directory.External,
      //   path: subdir,
      //   recursive: true,
      // }).catch(() => {});

      await Filesystem.writeFile({
        directory: Directory.External,
        path: fileName,
        data: base64,
      });

      alert(`📁 Zapisano: ${fileName}`);
    } catch (err) {
      console.error('❌ Błąd zapisu pliku:', err);
      alert('❌ Błąd zapisu pliku:' + err);
      alert('Nie udało się zapisać pliku. ścieżka zapisu: '+ fileName);
    }
  }
};

// Pomocnicza konwersja blob -> base64
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
});



  const decodeAudioBufferFromBlob = async (blob: Blob): Promise<AudioBuffer> => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    return await audioCtx.decodeAudioData(arrayBuffer);
  };

  const extractRegionBuffer = (): Float32Array | null => {
    if (!audioBuffer) {
      console.warn('AudioBuffer niegotowy');
      return null;
    }

    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(parseFloat(startTime) * sampleRate);
    const endSample = Math.floor(parseFloat(endTime) * sampleRate);
    const fullData = audioBuffer.getChannelData(0);
    return fullData.slice(startSample, endSample);
  };
  
  // const saveAsWav = async () => {
  //   if (!isWaveformReady) {
  //     alert('Plik jeszcze się nie załadował. Spróbuj za chwilę.');
  //     return;
  //   }
  //   const regionData = extractRegionBuffer();
  //   if (!regionData || regionData.length === 0) {
  //     alert('Nie można wyodrębnić zaznaczonego fragmentu.');
  //     return;
  //   }
  //   const sampleRate = wavesurferRef.current.backend.buffer.sampleRate;

  //   const length = regionData.length * 2 + 44;
  //   const buffer = new ArrayBuffer(length);
  //   const view = new DataView(buffer);
  //   let offset = 0;

  //   const writeString = (s: string) => {
  //     for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  //     offset += s.length;
  //   };

  //   writeString('RIFF');
  //   view.setUint32(offset, length - 8, true); offset += 4;
  //   writeString('WAVEfmt ');
  //   view.setUint32(offset, 16, true); offset += 4;
  //   view.setUint16(offset, 1, true); offset += 2;
  //   view.setUint16(offset, 1, true); offset += 2;
  //   view.setUint32(offset, sampleRate, true); offset += 4;
  //   view.setUint32(offset, sampleRate * 2, true); offset += 4;
  //   view.setUint16(offset, 2, true); offset += 2;
  //   view.setUint16(offset, 16, true); offset += 2;
  //   writeString('data');
  //   view.setUint32(offset, regionData.length * 2, true); offset += 4;

  //   for (let i = 0; i < regionData.length; i++) {
  //     const s = Math.max(-1, Math.min(1, regionData[i]));
  //     view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  //     offset += 2;
  //   }

  //   const blob = new Blob([view], { type: 'audio/wav' });
  //   const base64 = await blobToBase64(blob);
  //   const fileName = `fragment_${Date.now()}.wav`;

  //   await Filesystem.writeFile({
  //     directory: Directory.Documents,
  //     path: `audio/${fileName}`,
  //     data: base64,
  //   });

  //   alert(`Zapisano WAV: ${fileName}`);
  // };

//   const saveAsWav = async () => {
//     await Filesystem.mkdir({
//       path: 'audio',
//       directory: Directory.Documents,
//       recursive: true,
//     }).catch(() => {
//       // folder już istnieje – ignorujemy
//     });

//   if (!audioBuffer) {
//     alert("AudioBuffer niegotowy");
//     return;
//   }

//   const sampleRate = audioBuffer.sampleRate;
//   const startSample = Math.floor(parseFloat(startTime) * sampleRate);
//   const endSample = Math.floor(parseFloat(endTime) * sampleRate);
//   const channelData = audioBuffer.getChannelData(0);
//   const sliced = channelData.slice(startSample, endSample);

//   const length = sliced.length * 2 + 44;
//   const buffer = new ArrayBuffer(length);
//   const view = new DataView(buffer);
//   let offset = 0;

//   const writeString = (s: string) => {
//     for (let i = 0; i < s.length; i++) {
//       view.setUint8(offset++, s.charCodeAt(i));
//     }
//   };

//   writeString('RIFF');
//   view.setUint32(offset, length - 8, true); offset += 4;
//   writeString('WAVEfmt ');
//   view.setUint32(offset, 16, true); offset += 4;
//   view.setUint16(offset, 1, true); offset += 2;
//   view.setUint16(offset, 1, true); offset += 2;
//   view.setUint32(offset, sampleRate, true); offset += 4;
//   view.setUint32(offset, sampleRate * 2, true); offset += 4;
//   view.setUint16(offset, 2, true); offset += 2;
//   view.setUint16(offset, 16, true); offset += 2;
//   writeString('data');
//   view.setUint32(offset, sliced.length * 2, true); offset += 4;

//   for (let i = 0; i < sliced.length; i++) {
//     const val = Math.max(-1, Math.min(1, sliced[i]));
//     view.setInt16(offset, val < 0 ? val * 0x8000 : val * 0x7FFF, true);
//     offset += 2;
//   }

//   const blob = new Blob([view], { type: 'audio/wav' });
//   const base64 = await blobToBase64(blob);
//   const fileName = `fragment_${Date.now()}.wav`;

//   await Filesystem.writeFile({
//     directory: Directory.Documents,
//     path: `audio/${fileName}`,
//     data: base64,
//   });

//   alert("WAV zapisany!");
// };
const saveAsWav = async () => {
  if (!audioBuffer) {
    alert("Brak danych audio.");
    return;
  }

  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor(parseFloat(startTime) * sampleRate);
  const endSample = Math.floor(parseFloat(endTime) * sampleRate);
  const sliced = audioBuffer.getChannelData(0).slice(startSample, endSample);

  const length = sliced.length * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    offset += s.length;
  };

  writeString('RIFF'); view.setUint32(offset, length - 8, true); offset += 4;
  writeString('WAVEfmt '); view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2; // PCM
  view.setUint16(offset, 1, true); offset += 2; // mono
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * 2, true); offset += 4;
  view.setUint16(offset, 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString('data'); view.setUint32(offset, sliced.length * 2, true); offset += 4;

  for (let i = 0; i < sliced.length; i++) {
    const s = Math.max(-1, Math.min(1, sliced[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  const blob = new Blob([view], { type: 'audio/wav' });
  const filename = `fragment_${Date.now()}.wav`;

  await saveFile(blob, filename); // tu jest kluczowe
};



  // const saveAsMp3 = async () => {
  //   if (!isWaveformReady) {
  //     alert('Plik jeszcze się nie załadował. Spróbuj za chwilę.');
  //     return;
  //   }
  //   const samples = extractRegionBuffer();
  //   if (!samples || samples.length === 0) {
  //     alert('Nie można wyodrębnić fragmentu.');
  //     return;
  //   }
  //   const sampleRate = wavesurferRef.current.backend.buffer.sampleRate;

  //   const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
  //   const mp3Data: Uint8Array[] = [];
  //   const blockSize = 1152;

  //   for (let i = 0; i < samples.length; i += blockSize) {
  //     const sampleChunk = samples.slice(i, i + blockSize);
  //     const buffer16 = new Int16Array(sampleChunk.length);
  //     for (let j = 0; j < sampleChunk.length; j++) {
  //       buffer16[j] = sampleChunk[j] * 32767;
  //     }
  //     const mp3buf = mp3encoder.encodeBuffer(buffer16);
  //     if (mp3buf.length > 0) mp3Data.push(mp3buf);
  //   }

  //   const finalBuf = mp3encoder.flush();
  //   if (finalBuf.length > 0) mp3Data.push(finalBuf);

  //   const blob = new Blob(mp3Data, { type: 'audio/mp3' });
  //   const base64 = await blobToBase64(blob);
  //   const fileName = `fragment_${Date.now()}.mp3`;

  //   await Filesystem.writeFile({
  //     directory: Directory.Documents,
  //     path: `audio/${fileName}`,
  //     data: base64,
  //   });

  //   alert(`Zapisano MP3: ${fileName}`);
  // };
  
//   const saveAsMp3 = async () => {
//     await Filesystem.mkdir({
//       path: 'audio',
//       directory: Directory.Documents,
//       recursive: true,
//     }).catch(() => {
//       // folder już istnieje – ignorujemy
//     });
//   if (!audioBuffer) {
//     alert("AudioBuffer niegotowy");
//     return;
//   }

//   const sampleRate = audioBuffer.sampleRate;
//   const startSample = Math.floor(parseFloat(startTime) * sampleRate);
//   const endSample = Math.floor(parseFloat(endTime) * sampleRate);
//   const channelData = audioBuffer.getChannelData(0);
//   const sliced = channelData.slice(startSample, endSample);

//   const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
//   const mp3Data: Uint8Array[] = [];
//   const blockSize = 1152;

//   for (let i = 0; i < sliced.length; i += blockSize) {
//     const chunk = sliced.slice(i, i + blockSize);
//     const buffer16 = new Int16Array(chunk.length);
//     for (let j = 0; j < chunk.length; j++) {
//       buffer16[j] = chunk[j] * 32767;
//     }
//     const mp3buf = mp3encoder.encodeBuffer(buffer16);
//     if (mp3buf.length > 0) mp3Data.push(mp3buf);
//   }

//   const endBuf = mp3encoder.flush();
//   if (endBuf.length > 0) mp3Data.push(endBuf);

//   const blob = new Blob(mp3Data, { type: 'audio/mp3' });
//   const base64 = await blobToBase64(blob);
//   const fileName = `fragment_${Date.now()}.mp3`;

//   await Filesystem.writeFile({
//     directory: Directory.Documents,
//     path: `audio/${fileName}`,
//     data: base64,
//   });

//   alert("MP3 zapisany!");
// };

const saveAsMp3 = async () => {
  if (!audioBuffer) {
    alert("Brak danych audio.");
    return;
  }

  const sampleRate = audioBuffer.sampleRate; //44.1khz (normal mp3 samplerate)
  const startSample = Math.floor(parseFloat(startTime) * sampleRate);
  const endSample = Math.floor(parseFloat(endTime) * sampleRate);
  const sliced = audioBuffer.getChannelData(0).slice(startSample, endSample);

  const channels = 1; //1 for mono or 2 for stereo

  const kbps = 128; //encode 128kbps mp3
  const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
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

  const blob = new Blob(mp3Data, { type: 'audio/mp3' });
  const filename = `fragment_${Date.now()}.mp3`;

  await saveFile(blob, filename); // kluczowy moment
};



  // const blobToBase64 = (blob: Blob): Promise<string> =>
  //   new Promise((resolve, reject) => {
  //     const reader = new FileReader();
  //     reader.onerror = reject;
  //     reader.onloadend = () => {
  //       const dataUrl = reader.result as string;
  //       resolve(dataUrl.split(',')[1]); // usuń "data:audio/..."
  //     };
  //     reader.readAsDataURL(blob);
  //   });

////////////////////////////////////////////////////////////////////////////////////////////
// nagrywanie
////////////////////////////////////////////////////////////////////////////////////////////
// nagrywanie
// const startRecording = async () => {
//   try {
//   const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//   console.log("🎙️ Mikrofon działa!", stream);
//   alert("🎙️ Mikrofon działa!" + stream);
//   } catch (err:any) {
//     console.error("❌ Błąd mikrofonu:", err);
//     alert("❌ Błąd mikrofonu:" + err);
//     alert("Błąd mikrofonu: " + err.message);
//   }
//   try {
//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     const mr = new MediaRecorder(stream);
//     setMediaRecorder(mr);
//     setAudioChunks([]);

//     mr.ondataavailable = ev => {
//       if (ev.data.size > 0) {
//         setAudioChunks(prev => [...prev, ev.data]);
//       }
//     };

//     mr.onstop = async () => {
//       const blob = new Blob(audioChunks, { type: 'audio/webm' });
//       // 1) załaduj do Wavesurfera
//       wavesurferRef.current.empty();
//       wavesurferRef.current.clearRegions?.();
//       wavesurferRef.current.loadBlob(blob);
//       // 2) zdekoduj i zapisz audioBuffer
//       const decoded = await decodeAudioBufferFromBlob(blob);
//       setAudioBuffer(decoded);
//       setDuration(decoded.duration);
//       setStartTime('0.00');
//       setEndTime(decoded.duration.toFixed(2));
//       // 3) zapisz w wewnętrznym katalogu
//       const base64 = await blobToBase64(blob);
//       await Filesystem.mkdir({
//         directory: Directory.Data,
//         path: 'recordings',
//         recursive: true
//       }).catch(()=>{});
//       const name = `recording_${Date.now()}.webm`;
//       await Filesystem.writeFile({
//         directory: Directory.Data,
//         path: `recordings/${name}`,
//         data: base64
//       });
//       setFileName(name);
//     };

//     mr.start();
//     setRecording(true);
//   } catch (err) {
//     alert('Brak dostępu do mikrofonu: ' + err);
//   }
// };

// const stopRecording = () => {
//   mediaRecorder?.stop();
//   mediaRecorder?.stream.getTracks().forEach(t => t.stop());
//   setRecording(false);
// };

const startRecording = async () => {
  try {
    const perm = await VoiceRecorder.requestAudioRecordingPermission();
    if (!perm.value) {
      alert('Brak zgody na mikrofon');
      return;
    }

    await VoiceRecorder.startRecording();
    setRecording(true);
  } catch (err:any ) {
    console.error('Błąd nagrywania:', err);
    alert('Błąd: ' + err.message);
  }
};

const stopRecording = async () => {
  try {
    const { value } = await VoiceRecorder.stopRecording();

    if (!value || !value.recordDataBase64) {
      alert('Brak danych nagrania');
      return;
    }

    const base64Audio = value.recordDataBase64;
    const filename = `recording_${Date.now()}.wav`;

    await Filesystem.writeFile({
      path: `recordings/${filename}`,
      data: base64Audio, // ✅ tylko base64 string
      directory: Directory.Documents,
    });

    // Załaduj do WaveSurfer
    const blob = new Blob([Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))], {
      type: 'audio/wav',
    });
    wavesurferRef.current.loadBlob(blob);

    alert(`🎙️ Nagranie zapisane jako ${filename}`);
    setRecording(false);
  } catch (err: any) {
    console.error('❌ Błąd przy zatrzymywaniu:', err);
    alert('❌ Błąd przy zatrzymywaniu:' + err);
    alert('Błąd: ' + err.message);
  }
};


////////////////////////////////////////////////////////////////////////////////////////////

  return (
    <IonPage className="ion-padding-vertical">
      <IonHeader>
        <IonToolbar>
          <IonTitle style={{FontWeight: 600}}>Audiowerter</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding-vertical"><div className="content">
        {/* <input
          type="file"
          accept="audio/*"
          onChange={onFileChange}
          style={{ display: 'block', margin: '1em auto' }}
        />
        {fileName && (
          <IonText className="ion-text-center" color="medium">
            <p>Wybrano: {fileName}</p>
          </IonText>
        )} */}
        <div style={{ textAlign: 'center', margin: '1em 0' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />

          <IonButton expand="block" onClick={() => fileInputRef.current?.click()}>
            📂 Wybierz plik audio
          </IonButton>
        </div>
        <IonButton
            expand="block"
            color={recording ? 'danger' : 'primary'}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? '⏹️ Zatrzymaj nagrywanie' : '🎙️ Nagraj audio'}
          </IonButton>

        {/* Wyświetlanie start/end */}
        {duration > 0 && (
          <div style={{ textAlign: 'center', margin: '0.5em 0 2.2em 0' }}>
            {/* <IonText>Start: {startTime}s</IonText>{' • '}
            <IonText>Koniec: {endTime}s</IonText> */}
            <IonText>Długość utworu: {duration.toFixed(2)}s</IonText>
          </div>
        )}

        

        {/* Kontener dla fali */}
        {true && (
          <div
            ref={waveformRef}
            style={{
              width: '100%',
              height: '10em',
              background: '#f0f0f0',
              margin: '0em 0 0em 0'
            }}
          />
        )}
        

        {/* <IonInput
          placeholder="Start [s]"
          type="number"
          min="0"
          max={duration.toString()}
          step="0.01"
          value={startTime}
          onIonChange={e => setStartTime(e.detail.value!)}
        />
        <IonInput
          placeholder="End [s]"
          type="number"
          min="0"
          max={duration.toString()}
          step="0.01"
          value={endTime}
          onIonChange={e => setEndTime(e.detail.value!)}
        /> */}

        {duration > 0 && (
          <div style={{ margin: '-0em 0 -7em 0' }}>
            <Range
              values={rangeValues}
              step={STEP}
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
                  style={{
                    ...props.style,
                    height: '10em',
                    width: '100%',
                    background: getTrackBackground({
                      values: rangeValues,
                      colors: ['#ccc', '#537535', '#ccc'],
                      min: 0,
                      max: duration,
                    }),
                    borderRadius: '4px',
                    position: 'relative',
                    top: '-10.3em'
                  }}
                >
                  {children}
                </div>
              )}
              renderThumb={({ index, props }) => (
                <div
                  {...props}
                  style={{
                    ...props.style,
                    height: '10em',
                    width: '7px',
                    borderRadius: '15%',
                    backgroundColor: "#537535",
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    boxShadow: '0px 2px 6px #aaa',
                    fontSize: '20px',
                    userSelect: 'none',
                    cursor: 'grab',
                    bottom: '-2em'
                  }}
                >

                  <div style={{
                    position: 'absolute',
                    bottom: '-28px',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    backgroundColor: '#537535',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    {rangeValues[index].toFixed(2)}s
                  </div>
                </div>
              )}
            />
          </div>
        )}

        {duration > 0 && (
          <div className="ion-padding">
            <label htmlFor="volume">Głośność: {Math.round(volume * 100)}%</label>
            <input
              id="volume"
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
              style={{ width: '100%' }}
            />
          </div>
        )}

        <IonButton expand="block" onClick={playAll} disabled={duration == 0}>
          ▶️ Odtwórz
        </IonButton>

        <IonButton
          expand="block"
          onClick={playRegion}
          disabled={parseFloat(startTime) >= parseFloat(endTime)}
        >
          🔂 Odtwórz zaznaczenie
        </IonButton>

        <IonButton expand="block" onClick={pause} disabled={duration == 0}>
          ⏸️ Pauza
        </IonButton>

        {/* {duration > 0 && ( */}
        <IonGrid fixed={true}>
          <IonRow>
            <IonCol>
              <IonButton expand="block" onClick={saveAsWav} disabled={duration == 0}>
                💾 Eksportuj do WAV
              </IonButton>
            </IonCol>
            <IonCol>
              <IonButton expand="block" onClick={saveAsMp3} disabled={duration == 0}>
                💾 Eksportuj do MP3
              </IonButton>
            </IonCol>
          </IonRow>
        </IonGrid>
        {/* )} */}

      </div></IonContent>
    </IonPage>
  );
};

export default Home;


// import React, { useRef, useState } from 'react';
// import {
//   IonPage, IonHeader, IonToolbar, IonTitle,
//   IonContent, IonInput, IonButton, IonText, useIonViewDidEnter
// } from '@ionic/react';
// import WaveSurfer from 'wavesurfer.js';
// import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';

// const Home: React.FC = () => {
//   const waveformRef = useRef<HTMLDivElement>(null);
//   // uchwyt jako any, żeby TS nie łapał braków w definicjach
//   const wavesurferRef = useRef<any>(null);

//   const [fileName, setFileName] = useState<string|null>(null);
//   const [duration, setDuration] = useState(0);
//   const [startTime, setStartTime] = useState('0.00');
//   const [endTime, setEndTime] = useState('0.00');

//   // 1️⃣ Inicjalizacja Wavesurfer + RegionsPlugin
//   useIonViewDidEnter(() => {
//     if (waveformRef.current && !wavesurferRef.current) {
//       const ws = (WaveSurfer as any).create({
//         container: waveformRef.current,
//         waveColor: '#667eea',
//         progressColor: '#764ba2',
//         height: 150,
//         backend: 'WebAudio',
//         plugins: [
//           (RegionsPlugin as any).create({
//             dragSelection: {
//               slop: 5  // piksele tolerancji przed rozpoczęciem regionu
//             },
//             regionColor: 'rgba(102,126,234,0.3)'
//           })
//         ]
//       });

//       wavesurferRef.current = ws;

//       // gdy gotowy z plikiem, ustawiamy długość
//       ws.on('ready', () => {
//         const dur = ws.getDuration();
//         setDuration(dur);
//         setStartTime('0.00');
//         setEndTime(dur.toFixed(2));

//         if (ws.regions) {
//           ws.regions.add({      // <— TU
//             start: 0,
//             end: dur,
//             color: 'rgba(102,126,234,0.3)'
//           });
//         }
//       });

//       // gdy użytkownik tworzy region (drag)
//       ws.on('region-created', (reg: any) => {
//         setStartTime(reg.start.toFixed(2));
//         setEndTime(reg.end.toFixed(2));
//       });

//       // gdy użytkownik zmienia zakres regionu
//       ws.on('region-updated', (reg: any) => {
//         setStartTime(reg.start.toFixed(2));
//         setEndTime(reg.end.toFixed(2));
//       });
//     }
//   });

//   // 2️⃣ Wczytywanie pliku przez URL, zamiast loadBlob
//   const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const f = e.target.files?.[0];
//     if (!f || !wavesurferRef.current) return;

//     setFileName(f.name);
//     const ws: any = wavesurferRef.current;

//     ws.empty();
//     if (ws.regions) {
//       ws.regions.clear();    // <— TU
//     }
//     ws.load(URL.createObjectURL(f));
//   };

//   return (
//     <IonPage>
//       <IonHeader>
//         <IonToolbar><IonTitle>Audiowerter</IonTitle></IonToolbar>
//       </IonHeader>

//       <IonContent className="ion-padding">
//         <input
//           type="file"
//           accept="audio/*"
//           onChange={onFileChange}
//           style={{ display:'block', margin:'1em auto' }}
//         />
//         {fileName && <IonText>Wybrano: {fileName}</IonText>}

//         {/* Wyświetlamy start/end nad falą */}
//         <div style={{ textAlign:'center', marginTop:10 }}>
//           <IonText>Start: {startTime}s</IonText>{' • '}
//           <IonText>Koniec: {endTime}s</IonText>
//         </div>

//         <div
//           ref={waveformRef}
//           style={{
//             width: '100%',
//             height: 150,
//             background: '#f0f0f0',
//             margin: '1em 0'
//           }}
//         />

//         <IonText>Długość utworu: {duration.toFixed(2)} s</IonText>

//         <IonInput
//           placeholder="Start [s]"
//           type="number"
//           min="0"
//           max={duration.toString()}
//           step="0.01"
//           value={startTime}
//           onIonChange={e => setStartTime(e.detail.value!)}
//         />
//         <IonInput
//           placeholder="End [s]"
//           type="number"
//           min="0"
//           max={duration.toString()}
//           step="0.01"
//           value={endTime}
//           onIonChange={e => setEndTime(e.detail.value!)}
//         />

//         <IonButton expand="block" onClick={playAll}>▶️ Odtwórz całość</IonButton>
//         <IonButton
//           expand="block"
//           onClick={playRegion}
//           disabled={parseFloat(startTime) >= parseFloat(endTime)}
//         >
//           🔂 Odtwórz zaznaczenie
//         </IonButton>
//       </IonContent>
//     </IonPage>
//   );
// };

// export default Home;




// import { IonContent, IonHeader, IonInput, IonPage, IonTitle, IonToolbar } from '@ionic/react';
// import ExploreContainer from '../components/ExploreContainer';
// import './Home.css';

// import React, { useRef, useState, useEffect } from 'react';
// import {IonButton, IonText } from '@ionic/react';
// import WaveSurfer from 'wavesurfer.js';
// import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';
// import { FilePicker } from '@capawesome/capacitor-file-picker';
// import { Filesystem, Directory } from '@capacitor/filesystem';
// // import { FFmpegKit } from 'ffmpeg-kit-react-native';
// // import lamejs from 'lamejs';
// import lamejs from 'lamejs';
// import { Capacitor } from '@capacitor/core';

// const Home: React.FC = () => {

//   // async function pickAudioFile() {
//   //   const result = await FilePicker.pickFiles({ types: ['audio/*'] });
//   //   if (result.files.length > 0) {
//   //     const file = result.files[0];
//   //     // file.blob – obiekt Blob z zawartością pliku
//   //     // file.name, file.mimeType – nazwa i typ MIME
//   //     return file;
//   //   }
//   // }

//   // waveform i edycja nagrania:
//   const waveformRef = useRef<HTMLDivElement>(null);
//   const wavesurferRef = useRef<any>(null);
//   const [fileName, setFileName] = useState<string | null>(null);
//   // edycja nagrania:
//   const [region, setRegion] = useState<{ start: number; end: number } | null>(null);
//   const [startTime, setStartTime] = useState('');
//   const [endTime, setEndTime] = useState('');
//   const [inputPath, setInputPath] = useState<string | null>(null);

//   // 1) Inicjalizacja WaveSurfer
//   // useEffect(() => {
//   //   if (waveformRef.current && !wavesurferRef.current) {
//   //     wavesurferRef.current = WaveSurfer.create({
//   //       container: waveformRef.current,
//   //       waveColor: '#667eea',
//   //       progressColor: '#764ba2',
//   //       height: 200,
//   //       plugins: [ RegionsPlugin.create() ]
//   //     });
//   //     // eventy na regiony, play itp. 
//   //     wavesurferRef.current.on('region-updated', (r: any) => {
//   //       setRegion({ start: r.start, end: r.end });
//   //       setStartTime(r.start.toFixed(2));
//   //       setEndTime(r.end.toFixed(2));
//   //     });

//   //     wavesurferRef.current.on('region-created', (r: any) => {
//   //       setRegion({ start: r.start, end: r.end });
//   //       setStartTime(r.start.toFixed(2));
//   //       setEndTime(r.end.toFixed(2));
//   //     });
//   //   }
//   // }, []);
//   const audioCtx = useRef<AudioContext | null>(null);
// useEffect(() => {
//   if (waveformRef.current && !wavesurferRef.current) {
//     wavesurferRef.current = WaveSurfer.create({
//       container: waveformRef.current,
//       waveColor: '#667eea',
//       progressColor: '#764ba2',
//       height: 200,
//       backend: 'WebAudio',
//       plugins: [ RegionsPlugin.create() ]
//     });
//     wavesurferRef.current.on('ready', () => console.log('🌊 Wavesurfer ready'));
//   }
// }, []);
// // odtwarzanie
// const playAll = () => {
//   const ac = audioCtx.current;
//   if (ac && ac.state === 'suspended') {
//     ac.resume().then(() => wavesurferRef.current!.play());
//   } else {
//     wavesurferRef.current!.play();
//   }
// };
// const playRegion = () => {
//   const ac = audioCtx.current;
//   if (ac && ac.state === 'suspended') {
//     ac.resume().then(() => {
//       wavesurferRef.current!.play(parseFloat(startTime), parseFloat(endTime));
//     });
//   } else {
//     wavesurferRef.current!.play(parseFloat(startTime), parseFloat(endTime));
//   }
// };
// const resumeAudioContext = async () => {
//   const wf = wavesurferRef.current;
//   if (!wf) return;
//   // backend może mieć metodę getAudioContext lub pole ac
//   const backend = (wf.backend as any);
//   const ac: AudioContext | undefined =
//     typeof backend.getAudioContext === 'function'
//       ? backend.getAudioContext()
//       : backend.ac;
//   if (ac && ac.state === 'suspended') {
//     await ac.resume();
//     console.log('AudioContext resumed');
//   }
// };

//   // 2) Funkcja pickAudioFile z rozszerzonym flow
//   const pickAudioFile = async () => {
//     try {
//       // zgodę na dostęp do plików (na Android <11)
//       await FilePicker.requestPermissions(); 

//       // natywny picker — wybrać tylko audio
//       const result = await FilePicker.pickFiles({
//         types: ['audio/*'],
//       });

//       // if (result.files.length === 0) {
//       //   return;
//       // }
//       if (!result.files.length || !result.files[0].blob) return;

//       // const file = result.files[0];
//       // if (!file.blob) return;
//       const { name, blob } = result.files[0];

//       setFileName(name);

//       //czysczenie zawartości
//       wavesurferRef.current.empty();
//       wavesurferRef.current.clearRegions();

//       // (c) Blob z zawartością pliku
//       // const blob = file.blob; // odczyt przez file.blob

//       // (d) Załaduj do WaveSurfer
//       wavesurferRef.current.loadBlob(blob);

//       wavesurferRef.current.once('ready', () => {
//         // np. utwórz domyślny region obejmujący cały utwór
//         wavesurferRef.current.addRegion({
//           start: 0,
//           end: wavesurferRef.current.getDuration(),
//           color: 'rgba(102,126,234,0.3)'
//         });
//       });

//       // (e) Zapisz na później w filesystem (opcjonalnie)
//       // if (!blob) {
//       //   console.error('Brak danych blob – nie można przekonwertować do Base64');
//       //   return;
//       // }
//       //zapis
//       const base64 = await blobToBase64(blob);
//       const fullPath = `audio/imported_${Date.now()}_${name}`;
//       await Filesystem.writeFile({
//         path: fullPath,
//         data: base64,
//         directory: Directory.Documents
//       });

//       //ważne - ustawienie app ID, na razie io.ionic.starter
//       setInputPath(`/storage/emulated/0/Android/data/io.ionic.starter/files/Documents/${fullPath}`);

//     } catch (err: any) {
//       console.error('Błąd podczas wybierania pliku:', err);
//       alert('Nie udało się wybrać pliku: ' + (err.message || err));
//     }
//   };

//   // Pomocnicza funkcja konwersji Blob → Base64
//   const blobToBase64 = (blob: Blob): Promise<string> =>
//     new Promise((resolve, reject) => {
//       const reader = new FileReader();
//       reader.onerror = () => reject(reader.error);
//       reader.onload = () => {
//         const dataUrl = reader.result as string;
//         resolve(dataUrl.split(',')[1]);
//       };
//       reader.readAsDataURL(blob);
//     });

//   // // 4. Eksport jako WAV
//   // const exportWav = async () => {
//   //   if (!inputPath || !startTime || !endTime) return;
//   //   const outputPath = `/storage/emulated/0/Music/przycięte_${Date.now()}.wav`;

//   //   const command = `-y -i "${inputPath}" -ss ${startTime} -to ${endTime} -c copy "${outputPath}"`;

//   //   await FFmpegKit.execute(command);
//   //   alert('Zapisano WAV w: ' + outputPath);
//   // };

//   // // 5. Eksport jako MP3
//   // const exportMp3 = async () => {
//   //   if (!inputPath || !startTime || !endTime) return;
//   //   const outputPath = `/storage/emulated/0/Music/fragment_${Date.now()}.mp3`;

//   //   const command = `-y -i "${inputPath}" -ss ${startTime} -to ${endTime} -acodec libmp3lame -qscale:a 2 "${outputPath}"`;

//   //   await FFmpegKit.execute(command);
//   //   alert('Zapisano MP3 w: ' + outputPath);
//   // };

//   // 4) Zapis do WAV
//   const saveWav = async () => {
//     const buffer = wavesurferRef.current.backend.buffer;
//     // konwersja do WAV (WebAudioBuffer → WAV)
//     const numChan = buffer.numberOfChannels;
//     const length = buffer.length * numChan * 2 + 44;
//     const arrBuf = new ArrayBuffer(length);
//     const view = new DataView(arrBuf);
//     let offset = 0;
//     const writeString = (s: string) => {
//       for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
//       offset += s.length;
//     };
//     writeString('RIFF'); view.setUint32(offset, length - 8, true); offset += 4;
//     writeString('WAVEfmt '); view.setUint32(offset, 16, true); offset += 4;
//     view.setUint16(offset, 1, true); offset += 2;
//     view.setUint16(offset, numChan, true); offset += 2;
//     view.setUint32(offset, buffer.sampleRate, true); offset += 4;
//     view.setUint32(offset, buffer.sampleRate * numChan * 2, true); offset += 4;
//     view.setUint16(offset, numChan * 2, true); offset += 2;
//     view.setUint16(offset, 16, true); offset += 2;
//     writeString('data'); view.setUint32(offset, length - offset - 4, true); offset += 4;
//     const interleaved = region
//       ? buffer.getChannelData(0).slice(region.start * buffer.sampleRate, region.end * buffer.sampleRate)
//       : buffer.getChannelData(0);
//     for (let i = 0; i < interleaved.length; i++) {
//       const s = Math.max(-1, Math.min(1, interleaved[i]));
//       view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
//       offset += 2;
//     }
//     const wavBlob = new Blob([view], { type: 'audio/wav' });
//     const base64 = await new Promise<string>(res => {
//       const r = new FileReader();
//       r.onloadend = () => res((r.result as string).split(',')[1]);
//       r.readAsDataURL(wavBlob);
//     });
//     await Filesystem.writeFile({ directory: Directory.Documents, path: `audio/edited_${Date.now()}.wav`, data: base64 });
//     alert('Zapisano WAV');
//   };

//   // 5) Zapis do MP3 (przez lamejs)
//   const saveMp3 = async () => {
//     const samples = wavesurferRef.current.backend.buffer.getChannelData(0);
//     const sampleRate = wavesurferRef.current.backend.buffer.sampleRate;
//     const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
//     const mp3Data: Uint8Array[] = [];
//     const blockSize = 1152;
//     for (let i = 0; i < samples.length; i += blockSize) {
//       const slice = samples.subarray(i, i + blockSize);
//       const mp3buf = mp3encoder.encodeBuffer(slice as any);
//       if (mp3buf.length) mp3Data.push(mp3buf);
//     }
//     const endBuf = mp3encoder.flush();
//     if (endBuf.length) mp3Data.push(endBuf);
//     const blob = new Blob(mp3Data, { type: 'audio/mp3' });
//     const base64 = await new Promise<string>(res => {
//       const r = new FileReader();
//       r.onloadend = () => res((r.result as string).split(',')[1]);
//       r.readAsDataURL(blob);
//     });
//     await Filesystem.writeFile({ directory: Directory.Documents, path: `audio/edited_${Date.now()}.mp3`, data: base64 });
//     alert('Zapisano MP3');
//   };

//   return (
//  <IonPage>
//     <IonHeader>
//       <IonToolbar>
//         <IonTitle><br/>Audiowerter</IonTitle>
//       </IonToolbar>
//     </IonHeader>
//     <IonContent className="ion-padding">
//       {/* <IonButton expand="block" onClick={pickAudioFile}>
//         Wybierz plik z telefonu
//       </IonButton> */}
//       { Capacitor.isNativePlatform() ? (
//   // Na natywnym urządzeniu/emulatorze wciąż możesz użyć inputa
//   <input
//     type="file"
//     accept="audio/*"
//     onChange={async e => {
//       const f = e.target.files?.[0];
//       if (!f) return;

//       alert(`Załadowano plik (web fallback): ${f.name}`);
//       setFileName(f.name);

//       // Wyczyść starą falę
//       wavesurferRef.current?.empty();
//       wavesurferRef.current?.clearRegions();

//       // Załaduj nowy plik do wavesurfer
//       wavesurferRef.current?.loadBlob(f);

//       wavesurferRef.current?.once('ready', () => {
//         wavesurferRef.current.addRegion({
//           start: 0,
//           end: wavesurferRef.current.getDuration(),
//           color: 'rgba(102,126,234,0.3)',
//         });
//       });
//     }}
//     style={{
//       display: 'block',
//       margin: '1em auto',
//       width: '80%',
//       padding: '0.5em'
//     }}
//   />
// ) : (
//   // w przeglądarce również ten sam input
//   <input
//     type="file"
//     accept="audio/*"
//     onChange={async e => {
//       const f = e.target.files?.[0];
//       if (!f) return;

//       alert(`Załadowano plik (web fallback): ${f.name}`);
//       setFileName(f.name);

//       // Wyczyść starą falę
//       wavesurferRef.current?.empty();
//       wavesurferRef.current?.clearRegions();

//       // Załaduj nowy plik do wavesurfer
//       wavesurferRef.current?.loadBlob(f);

//       wavesurferRef.current?.once('ready', () => {
//         wavesurferRef.current.addRegion({
//           start: 0,
//           end: wavesurferRef.current.getDuration(),
//           color: 'rgba(102,126,234,0.3)',
//         });
//       });
//     }}
//     style={{ display: 'block', margin: '1em auto' }}
//   />
// )}

//         {fileName && (
//           <IonText className="ion-text-center" color="medium">
//             <p>Wybrano: {fileName}</p>
//           </IonText>
//         )}

//         <div
//           ref={waveformRef}
//           style={{
//             marginTop: 20,
//             height: 200,
//             width: '100%',
//             background: '#f0f0f0',
//           }}
//         />
        
//         {/* kontrole do przycinania i exportu */}
//         <div className="ion-padding-vertical">
//           <IonInput
//             label="Start [sekundy]"
//             type="number"
//             value={startTime}
//             onIonChange={(e) => setStartTime(e.detail.value!)}
//           />
//           <IonInput
//             label="Koniec [sekundy]"
//             type="number"
//             value={endTime}
//             onIonChange={(e) => setEndTime(e.detail.value!)}
//           />
//           <IonButton expand="block" onClick={() => wavesurferRef.current.play()}>
//             ▶️ Odtwórz całość
//           </IonButton>
//           <IonButton
//             expand="block"
//             onClick={() =>
//               wavesurferRef.current.play(parseFloat(startTime), parseFloat(endTime))
//             }
//             disabled={!startTime || !endTime}
//           >
//             🔂 Odtwórz zaznaczenie
//           </IonButton>
//           {/* <IonButton expand="block" color="success" onClick={exportWav}>
//             💾 Zapisz jako WAV
//           </IonButton> */}
//           {/* <IonButton expand="block" color="tertiary" onClick={exportMp3}>
//             💾 Zapisz jako MP3
//           </IonButton> */}
//           {/* <IonButton expand="block" onClick={saveWav}
//             disabled={!wavesurferRef.current?.backend?.buffer}>
//             💾 Zapisz jako WAV
//           </IonButton>

//           <IonButton expand="block" onClick={saveMp3}
//             disabled={!wavesurferRef.current?.backend?.buffer}>
//             💾 Zapisz jako MP3
//           </IonButton> */}
// <IonButton expand="block" onClick={async () => {
//   await resumeAudioContext();
//   wavesurferRef.current?.play();
// }}>
//   ▶️ Odtwórz całość
// </IonButton>

// <IonButton
//   expand="block"
//   disabled={!startTime || !endTime}
//   onClick={async () => {
//     await resumeAudioContext();
//     wavesurferRef.current?.play(parseFloat(startTime), parseFloat(endTime));
//   }}
// >
//   🔂 Odtwórz zaznaczenie
// </IonButton>
//         </div>
//       </IonContent>
//     </IonPage>
//   );
// };

// export default Home;
