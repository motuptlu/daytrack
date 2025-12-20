
import React, { useState, useEffect, useRef } from 'react';
import { ViewType, DailyLog, ModelStatus, ConversationSegment } from './types';
import { getLog, saveLog, getAllLogs, saveAudio, deleteDayData, autoCleanupAndCompress } from './db';
import { transcribeAudioChunk, generateDailySummary } from './geminiService';
import Timeline from './components/Timeline';
import CalendarView from './components/CalendarView';
import SummaryView from './components/SummaryView';
import SearchView from './components/SearchView';
import StatsOverview from './components/StatsOverview';
import ModelManager from './components/ModelManager';

const checkKey = () => !!process.env.API_KEY;

type PermissionState = 'prompt' | 'granted' | 'denied' | 'error' | 'unknown';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('timeline');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [currentLog, setCurrentLog] = useState<DailyLog | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState>('unknown');
  const [diagInfo, setDiagInfo] = useState<string>('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!checkKey()) setApiKeyMissing(true);
    loadData();
    autoCleanupAndCompress();
    runDiagnostics();
    
    // Auto-check permissions on load
    initialPermissionCheck();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopTracks();
    };
  }, []);

  useEffect(() => {
    const log = logs.find(l => l.date === selectedDate);
    setCurrentLog(log || null);
  }, [selectedDate, logs]);

  const runDiagnostics = () => {
    const isWebView = /wv|Version\/[\d\.]+/.test(navigator.userAgent);
    const info = [
      `Mode: ${isWebView ? 'APK/WebView' : 'Browser/PWA'}`,
      `HTTPS: ${window.isSecureContext ? 'Yes' : 'No'}`,
      `MicAPI: ${!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)}`
    ].join(' • ');
    setDiagInfo(info);
  };

  const initialPermissionCheck = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionStatus('error');
      setMicError("APK Config Error: Microphone API not enabled in this APK. Please check APK Manifest permissions.");
      return;
    }

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'microphone' as any });
        setPermissionStatus(result.state as PermissionState);
        result.onchange = () => setPermissionStatus(result.state as PermissionState);
      } else {
        setPermissionStatus('prompt');
      }
    } catch (e) {
      setPermissionStatus('prompt');
    }
  };

  const initAudioContext = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    } catch (e) { console.warn(e); }
  };

  const requestMicrophoneAccess = async () => {
    setMicError(null);
    try {
      await initAudioContext();
      // This is the CRITICAL call that triggers the Android System Dialog
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionStatus('granted');
      stream.getTracks().forEach(t => t.stop());
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionStatus('denied');
        setMicError("Android Denied: Phone Settings > Apps > DayTrack > Permissions में Mic Allow करें।");
      } else {
        setPermissionStatus('error');
        setMicError(`APK Error: ${err.name}. Make sure 'Record Audio' is ticked in APK settings.`);
      }
    }
  };

  const startRecording = async () => {
    if (permissionStatus === 'denied') {
      alert("Microphone is blocked in Android Settings. Please allow it to record.");
      return;
    }

    setMicError(null);
    try {
      await initAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      
      streamRef.current = stream;
      setPermissionStatus('granted');

      // Use a more standard mimeType for Android WebView
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/aac';
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: mimeType });
        const audioId = `audio_${Date.now()}`;
        await saveAudio(audioId, audioBlob);

        setIsProcessing(true);
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const newSegments = await transcribeAudioChunk(base64, offlineMode, mimeType);
          
          const segmentsWithAudio = newSegments.map(s => ({ ...s, audioId }));
          const today = new Date().toISOString().split('T')[0];
          
          const existing = await getLog(today);
          let updatedLog: DailyLog;
          
          if (existing) {
            updatedLog = {
              ...existing,
              transcripts: [...existing.transcripts, ...segmentsWithAudio],
              recordingDurationMinutes: existing.recordingDurationMinutes + (recordingSeconds / 60)
            };
          } else {
            updatedLog = {
              date: today,
              transcripts: segmentsWithAudio,
              recordingDurationMinutes: recordingSeconds / 60
            };
          }
          
          await saveLog(updatedLog);
          await loadData();
          setIsProcessing(false);
          setRecordingSeconds(0);
        };
      };

      recorder.start();
      setIsRecording(true);
      if (navigator.vibrate) navigator.vibrate(50);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);

    } catch (err: any) {
      setMicError(`Critical: ${err.name}`);
      setIsRecording(false);
      stopTracks();
    }
  };

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopTracks();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    if (navigator.vibrate) navigator.vibrate([30, 30]);
  };

  const loadData = async () => {
    const allLogs = await getAllLogs();
    setLogs(allLogs);
  };

  const handleSummarize = async () => {
    if (!currentLog || currentLog.transcripts.length === 0) return;
    setIsProcessing(true);
    try {
      const summary = await generateDailySummary(currentLog.transcripts);
      const updatedLog = { ...currentLog, summary };
      await saveLog(updatedLog);
      await loadData();
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!currentLog) return;
    if (window.confirm(`Delete data for ${currentLog.date}?`)) {
      const audioIds = currentLog.transcripts.map(t => t.audioId).filter((id): id is string => !!id);
      await deleteDayData(currentLog.date, audioIds);
      await loadData();
      setCurrentLog(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#020d0a] text-emerald-50 font-sans selection:bg-emerald-500/30 overflow-x-hidden pb-12">
      
      {/* APK STATUS OVERLAY */}
      <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none">
        {apiKeyMissing && (
          <div className="bg-rose-500/20 backdrop-blur-md border-b border-rose-500/30 px-4 py-2 text-[9px] text-center font-black text-rose-300 uppercase tracking-widest pointer-events-auto">
            DEMO MODE: ADD API_KEY TO SETTINGS
          </div>
        )}

        {permissionStatus === 'prompt' && (
          <div className="bg-emerald-500 text-slate-950 px-4 py-3 flex items-center justify-between shadow-2xl pointer-events-auto">
            <span className="text-[10px] font-black uppercase">Enable APK Microphone</span>
            <button onClick={requestMicrophoneAccess} className="bg-slate-950 text-emerald-400 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase">Allow</button>
          </div>
        )}

        {micError && (
          <div className="bg-rose-600 text-white px-4 py-3 flex items-start gap-3 shadow-2xl pointer-events-auto">
            <i className="fas fa-microchip mt-1 text-xs"></i>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase leading-tight">{micError}</p>
            </div>
            <button onClick={() => setMicError(null)} className="opacity-50 text-xs"><i className="fas fa-times"></i></button>
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-8 pt-4 bg-gradient-to-t from-[#020d0a] via-[#020d0a]/90 to-transparent">
        <div className="max-w-xl mx-auto glass-effect rounded-[32px] p-2 flex items-center justify-between border border-emerald-500/10 shadow-2xl">
          <NavBtn icon="fa-stream" active={activeView === 'timeline'} onClick={() => setActiveView('timeline')} />
          <NavBtn icon="fa-calendar-alt" active={activeView === 'calendar'} onClick={() => setActiveView('calendar')} />
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 -translate-y-4 shadow-2xl ${
              isRecording ? 'bg-rose-500 scale-110 shadow-rose-500/40' : 'bg-emerald-500 shadow-emerald-500/20'
            }`}
          >
            <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'} text-2xl text-slate-950`}></i>
          </button>
          <NavBtn icon="fa-chart-pie" active={activeView === 'summary'} onClick={() => setActiveView('summary')} />
          <NavBtn icon="fa-search" active={activeView === 'search'} onClick={() => setActiveView('search')} />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 pt-24 pb-32">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-black tracking-tighter text-emerald-50 leading-none">DAYTRACK</h1>
            <p className="text-[8px] font-black text-emerald-800 uppercase tracking-[0.2em] mt-2 opacity-60">{diagInfo}</p>
          </div>
          {isRecording && (
            <div className="flex items-center gap-2 text-rose-500 animate-pulse bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
               <span className="text-[10px] font-mono font-black">{Math.floor(recordingSeconds/60)}:{(recordingSeconds%60).toString().padStart(2, '0')}</span>
            </div>
          )}
        </header>

        {activeView === 'timeline' && <Timeline log={currentLog} onSummarize={handleSummarize} onDelete={handleDelete} isProcessing={isProcessing} isViewingPast={selectedDate !== new Date().toISOString().split('T')[0]} />}
        {activeView === 'calendar' && <CalendarView logs={logs} selectedDate={selectedDate} onSelectDate={(d) => { setSelectedDate(d); setActiveView('timeline'); }} />}
        {activeView === 'summary' && <SummaryView summary={currentLog?.summary} />}
        {activeView === 'search' && <SearchView logs={logs} />}
        {activeView === 'settings' && <ModelManager offlineMode={offlineMode} setOfflineMode={setOfflineMode} initialModels={[]} onStatusChange={() => {}} />}
      </main>
    </div>
  );
};

const NavBtn = ({ icon, active, onClick }: { icon: string, active: boolean, onClick: () => void }) => (
  <button onClick={onClick} className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-400/20' : 'text-emerald-900'}`}>
    <i className={`fas ${icon} text-lg`}></i>
  </button>
);

export default App;
