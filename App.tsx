
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

const checkKey = () => process.env.API_KEY || (window as any).process?.env?.API_KEY;

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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  const [models, setModels] = useState<ModelStatus[]>([
    { id: 'en-base', name: 'English Base', size: '140MB', status: 'ready', progress: 100 },
    { id: 'hi-v1', name: 'Hindi Optimized', size: '280MB', status: 'none', progress: 0 }
  ]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    if (!checkKey()) {
      setApiKeyMissing(true);
    } else {
      setApiKeyMissing(false);
    }
    loadData();
    autoCleanupAndCompress();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopTracks();
    };
  }, []);

  useEffect(() => {
    const log = logs.find(l => l.date === selectedDate);
    setCurrentLog(log || null);
  }, [selectedDate, logs]);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const loadData = async () => {
    const allLogs = await getAllLogs();
    setLogs(allLogs);
  };

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/aac',
      'audio/wav'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  };

  const startRecording = async () => {
    setMicError(null);
    try {
      if (navigator.vibrate) navigator.vibrate(50);

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        throw new Error("Device does not support standard audio recording formats.");
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: mimeType });
        const audioId = `audio_${Date.now()}`;
        await saveAudio(audioId, audioBlob);

        setIsProcessing(true);
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          // CRITICAL FIX: Pass the actual mimeType to the transcription service
          const newSegments = await transcribeAudioChunk(base64, offlineMode, mimeType);
          
          const segmentsWithAudio = newSegments.map(s => ({ ...s, audioId }));
          const today = new Date().toISOString().split('T')[0];
          
          const existing = await getLog(today);
          let updatedLog: DailyLog;
          
          const durationToAdd = recordingSeconds / 60;
          if (existing) {
            updatedLog = {
              ...existing,
              transcripts: [...existing.transcripts, ...segmentsWithAudio],
              recordingDurationMinutes: existing.recordingDurationMinutes + durationToAdd
            };
          } else {
            updatedLog = {
              date: today,
              transcripts: segmentsWithAudio,
              recordingDurationMinutes: durationToAdd
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
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);

    } catch (err: any) {
      console.error("Recording Error:", err);
      let errorMsg = "Microphone Error: " + err.message;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = "Microphone permission denied. Please allow access in browser settings.";
      } else if (err.name === 'NotFoundError') {
        errorMsg = "No microphone detected on this device.";
      }
      setMicError(errorMsg);
      setIsRecording(false);
      stopTracks();
    }
  };

  const stopRecording = () => {
    if (navigator.vibrate) navigator.vibrate([30, 30]);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopTracks();
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsRecording(false);
  };

  const handleSummarize = async () => {
    if (!currentLog) return;
    setIsProcessing(true);
    try {
      const summary = await generateDailySummary(currentLog.transcripts);
      const updated = { ...currentLog, summary };
      await saveLog(updated);
      await loadData();
      setActiveView('summary');
    } catch (error) {
      console.error("Summary failed", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!currentLog) return;
    if (window.confirm("Delete data for this day?")) {
      const audioIds = currentLog.transcripts.map(s => s.audioId).filter(Boolean) as string[];
      await deleteDayData(selectedDate, audioIds);
      await loadData();
    }
  };

  return (
    <div className="min-h-screen bg-[#020d0a] text-emerald-50 font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      {apiKeyMissing && (
        <div className="bg-rose-500/20 border-b border-rose-500/30 px-4 py-2 text-[10px] text-center font-bold text-rose-300 uppercase tracking-widest z-[70] animate-pulse">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          API_KEY not detected. App will run in Demo mode.
        </div>
      )}

      {micError && (
        <div className="bg-amber-500/20 border-b border-amber-500/30 px-4 py-3 text-[11px] text-center font-bold text-amber-200 uppercase tracking-widest z-[70] flex items-center justify-center gap-4">
          <span><i className="fas fa-microphone-slash mr-2"></i> {micError}</span>
          <button onClick={() => setMicError(null)} className="underline decoration-dotted">Dismiss</button>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-8 pt-4 bg-gradient-to-t from-[#020d0a] via-[#020d0a]/90 to-transparent">
        <div className="max-w-xl mx-auto glass-effect rounded-[32px] p-2 flex items-center justify-between border border-emerald-500/10 shadow-2xl">
          <NavBtn icon="fa-stream" active={activeView === 'timeline'} onClick={() => setActiveView('timeline')} />
          <NavBtn icon="fa-calendar-alt" active={activeView === 'calendar'} onClick={() => setActiveView('calendar')} />
          
          <div className="relative">
            {isRecording && (
              <div className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-25 -translate-y-4"></div>
            )}
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 -translate-y-4 shadow-2xl relative z-10 ${
                isRecording 
                ? 'bg-rose-500 scale-110 shadow-[0_0_30px_rgba(244,63,94,0.4)]' 
                : 'bg-emerald-500 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
              }`}
            >
              <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'} text-2xl text-slate-950`}></i>
            </button>
          </div>

          <NavBtn icon="fa-chart-pie" active={activeView === 'summary'} onClick={() => setActiveView('summary')} />
          <NavBtn icon="fa-search" active={activeView === 'search'} onClick={() => setActiveView('search')} />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-12 pb-32">
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <i className="fas fa-microchip text-slate-950 text-xl"></i>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tighter text-emerald-50 leading-none">DAYTRACK</h1>
              <p className="text-[9px] font-black text-emerald-800 uppercase tracking-[0.3em] mt-1">AI Private Log v2.5</p>
            </div>
          </div>
          
          <div className="flex flex-col items-end">
             {isRecording && (
                <div className="flex items-center gap-2 text-rose-500 animate-pulse bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                   <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                   <span className="text-[10px] font-mono font-black">{Math.floor(recordingSeconds/60)}:{(recordingSeconds%60).toString().padStart(2, '0')}</span>
                </div>
             )}
             {!isRecording && (
               <button onClick={() => setActiveView('settings')} className={`p-2 rounded-lg transition-colors ${activeView === 'settings' ? 'text-emerald-400 bg-emerald-400/10' : 'text-emerald-900'}`}>
                  <i className="fas fa-cog text-lg"></i>
               </button>
             )}
          </div>
        </header>

        {activeView === 'timeline' && (
          <div className="animate-in fade-in duration-500">
            <StatsOverview currentLog={currentLog} totalLogs={logs.length} />
            <Timeline 
              log={currentLog} 
              onSummarize={handleSummarize} 
              onDelete={handleDelete}
              isProcessing={isProcessing}
              isViewingPast={selectedDate !== new Date().toISOString().split('T')[0]}
            />
          </div>
        )}

        {activeView === 'calendar' && (
          <CalendarView 
            logs={logs} 
            selectedDate={selectedDate} 
            onSelectDate={(d) => { setSelectedDate(d); setActiveView('timeline'); }} 
          />
        )}

        {activeView === 'summary' && (
          <SummaryView summary={currentLog?.summary} />
        )}

        {activeView === 'search' && (
          <SearchView logs={logs} />
        )}

        {activeView === 'settings' && (
          <ModelManager 
            offlineMode={offlineMode} 
            setOfflineMode={setOfflineMode} 
            initialModels={models}
            onStatusChange={setModels}
          />
        )}
      </main>
    </div>
  );
};

const NavBtn = ({ icon, active, onClick }: { icon: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all ${
      active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-400/20' : 'text-emerald-900 hover:text-emerald-700'
    }`}
  >
    <i className={`fas ${icon} text-lg`}></i>
  </button>
);

export default App;
