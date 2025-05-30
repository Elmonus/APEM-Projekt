import React, {useEffect, useRef, useState} from 'react';

import {
    IonButton,
    IonCol,
    IonContent,
    IonGrid,
    IonHeader,
    IonPage,
    IonRow,
    IonText,
    IonTitle,
    IonToolbar,
    useIonViewDidEnter
} from '@ionic/react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';
import {getTrackBackground, Range} from 'react-range';
//obsługa zapisu do plików
import {Directory, Filesystem} from '@capacitor/filesystem';
// import lamejs from 'lamejs';
import * as lamejs from '@breezystack/lamejs';
import {Capacitor} from '@capacitor/core';
//nagrywanie
import {VoiceRecorder} from 'capacitor-voice-recorder';

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
    const [rangeValues, setRangeValues] = useState([0.0, duration + 0.01]);
    useEffect(() => {
        setRangeValues([parseFloat(startTime), parseFloat(endTime)]);
    }, [startTime, endTime]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isWaveformReady, setIsWaveformReady] = useState(false);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    // nagrywanie
    const [recording, setRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
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
                    ws.regions.add({start: 0, end: dur, color: 'rgba(102,126,234,0.3)'});
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

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // obsługa zapisów do pliku:


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
                alert('Nie udało się zapisać pliku. ścieżka zapisu: ' + fileName);
            }
        }
    };

// konwersja blob -> base64
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

        writeString('RIFF');
        view.setUint32(offset, length - 8, true);
        offset += 4;
        writeString('WAVEfmt ');
        view.setUint32(offset, 16, true);
        offset += 4;
        view.setUint16(offset, 1, true);
        offset += 2; // PCM
        view.setUint16(offset, 1, true);
        offset += 2; // mono
        view.setUint32(offset, sampleRate, true);
        offset += 4;
        view.setUint32(offset, sampleRate * 2, true);
        offset += 4;
        view.setUint16(offset, 2, true);
        offset += 2;
        view.setUint16(offset, 16, true);
        offset += 2;
        writeString('data');
        view.setUint32(offset, sliced.length * 2, true);
        offset += 4;

        for (let i = 0; i < sliced.length; i++) {
            const s = Math.max(-1, Math.min(1, sliced[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }

        const blob = new Blob([view], {type: 'audio/wav'});
        const filename = `fragment_${Date.now()}.wav`;

        await saveFile(blob, filename);
    };

    const saveAsMp3 = async () => {
        if (!audioBuffer) {
            alert("Brak danych audio.");
            return;
        }

        const sampleRate = audioBuffer.sampleRate; //44.1khz samplerate
        const startSample = Math.floor(parseFloat(startTime) * sampleRate);
        const endSample = Math.floor(parseFloat(endTime) * sampleRate);
        const sliced = audioBuffer.getChannelData(0).slice(startSample, endSample);

        const channels = 1; //1  mono, 2 stereo

        const kbps = 128; // 128kbps mp3
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

        const blob = new Blob(mp3Data, {type: 'audio/mp3'});
        const filename = `fragment_${Date.now()}.mp3`;

        await saveFile(blob, filename);
    };


    const startRecording = async () => {
        try {
            const perm = await VoiceRecorder.requestAudioRecordingPermission();
            if (!perm.value) {
                alert('Brak zgody na mikrofon');
                return;
            }

            await VoiceRecorder.startRecording();
            setRecording(true);
        } catch (err: any) {
            console.error('Błąd nagrywania:', err);
            alert('Błąd: ' + err.message);
        }
    };

    const stopRecording = async () => {
        try {
            const {value} = await VoiceRecorder.stopRecording();

            if (!value || !value.recordDataBase64) {
                alert('Brak danych nagrania');
                return;
            }

            const base64Audio = value.recordDataBase64;
            const filename = `recording_${Date.now()}.wav`;

            await Filesystem.writeFile({
                path: `recordings/${filename}`,
                data: base64Audio,
                directory: Directory.Documents,
            });

            // do WaveSurfer
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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // wygląd strony

    return (
        <IonPage className="ion-padding-vertical">
            <IonHeader>
                <IonToolbar>
                    <IonTitle style={{FontWeight: 600}}>Audiowerter</IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent className="ion-padding-vertical">
                <div className="content">
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
                    <div style={{textAlign: 'center', margin: '1em 0'}}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*"
                            onChange={onFileChange}
                            style={{display: 'none'}}
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
                        <div style={{textAlign: 'center', margin: '0.5em 0 2.2em 0'}}>
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
                        <div style={{margin: '-0em 0 -7em 0'}}>
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
                                renderTrack={({props, children}) => (
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
                                renderThumb={({index, props}) => (
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
                                style={{width: '100%'}}
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

                </div>
            </IonContent>
        </IonPage>
    );
};

export default Home;
