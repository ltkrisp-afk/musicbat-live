import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { SharedRadioPlayer } from '../components/shared-radio-player';
function App() {
  const [track, setTrack] = useState(''), [key, setKey] = useState(''), [error, setError] = useState(''), [heard, setHeard] = useState(0);
  return <main><h1>MusicBat isolated playback verification</h1><p>Generated test signals only.</p>
    <SharedRadioPlayer onTrack={(id, key)=>{setTrack(id??'');setKey(key)}} onError={setError} onPlay={()=>setError('')} onProgress={setHeard} onEnded={()=>{}} />
    <p>Heard seconds: <output data-testid="heard">{heard.toFixed(2)}</output></p><output data-testid="track">{track}</output><output data-testid="performance">{key}</output><p role="alert">{error}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
