import { IonButton, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import { useEffect, useRef, useState } from 'react';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import './Tab1.css';
import './Tab1.js'


const Tab1: React.FC = () => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    recordedChunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
      const buffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      // Zapisz
      await Filesystem.writeFile({
        path: `uploads/audio-${Date.now()}.webm`,
        data: base64,
        directory: Directory.Data,
      });

      // Podgląd w odtwarzaczu
      const url = URL.createObjectURL(blob);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = url;
      }
      setIsRecording(false);
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Przy unmount: zatrzymaj, jeśli nadal nagrywa
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>️Nagraj dźwięk z mikrofonu</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">️Nagraj dźwięk z mikrofonu</IonTitle>
          </IonToolbar>
        </IonHeader>
        {/* <ExploreContainer name="Tab 1 page !!!" /> */}
        <div className="audioPlayer">
          <div className='player'>
            <audio controls ref={audioPlayerRef}></audio>
          </div>
          <div className='controlButtons'>
            <div className='controlButton'><IonButton onClick={startRecording} disabled={isRecording} shape="round">⏺ nagraj</IonButton></div>
            <div className='controlButton'><IonButton onClick={stopRecording} disabled={!isRecording} shape="round">⏹ stop</IonButton></div>
          </div>
        </div>

      </IonContent>
    </IonPage>
  );
};

export default Tab1;
