
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

// Key check outside component for better initialization
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
  const [models, setModels] = useState<ModelStatus[]>([
    { id: 'en-base', name: 'English Base', size: '140MB', status: 'ready', progress: 100 },
    { id: 'hi-v1', name: 'Hindi Optimized', size: '280MB', status: 'none', progress: 0 }
  ]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Basic check for API key
    if (!checkKey()) {
      setApiKeyMissing(true);
    } else {
      setApiKeyMissing(false);
    }
    loadData();
    autoCleanupAndCompress();
  }, []);

  useEffect(() => {
    const log = logs.find(l => l.date === selectedDate);
    setCurrentLog(log || null);
  }, [selectedDate, logs]);

  const loadData = async () => {
    const allLogs = await getAllLogs();
    setLogs(allLogs);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const audioId = `audio_${Date.now()}`;
        await saveAudio(audioId, audioBlob);

        setIsProcessing(true);
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const newSegments = await transcribeAudioChunk(base64, offlineMode);
          
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
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (err) {
      console.error("Mic access denied", err);
      setIsRecording(false);
      alert("Unable to access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
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
    if (window.confirm("Delete all data for this day?")) {
      const audioIds = currentLog.transcripts.map(s => s.audioId).filter(Boolean) as string[];
      await deleteDayData(selectedDate, audioIds);
      await loadData();
    }
  };

  return (
    <div className="min-h-screen bg-[#020d0a] text-emerald-50 font-sans selection:bg-emerald-500/30">
      {apiKeyMissing && (
        <div className="bg-rose-500/20 border-b border-rose-500/30 px-4 py-2 text-[10px] text-center font-bold text-rose-300 uppercase tracking-widest z-[70] animate-pulse">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          API_KEY not detected. Update Netlify Site Settings and Redeploy.
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-8 pt-4 bg-gradient-to-t from-[#020d0a] via-[#020d0a]/90 to-transparent">
        <div className="max-w-xl mx-auto glass-effect rounded-[32px] p-2 flex items-center justify-between border border-emerald-500/10 shadow-2xl">
          <NavBtn icon="fa-stream" active={activeView === 'timeline'} onClick={() => setActiveView('timeline')} />
          <NavBtn icon="fa-calendar-alt" active={activeView === 'calendar'} onClick={() => setActiveView('calendar')} />
          
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 -translate-y-4 shadow-2xl ${
              isRecording 
              ? 'bg-rose-500 scale-110 animate-pulse' 
              : 'bg-emerald-500 hover:scale-105 active:scale-95'
            }`}
          >
            <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'} text-2xl text-slate-950`}></i>
          </button>

          <NavBtn icon="fa-chart-pie" active={activeView === 'summary'} onClick={() => setActiveView('summary')} />
          <NavBtn icon="fa-search" active={activeView === 'search'} onClick={() => setActiveView('search')} />
          <NavBtn icon="fa-cog" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 pt-12 pb-32">
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <i className="fas fa-microchip text-slate-950 text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-emerald-50">DAYTRACK</h1>
              <p className="text-[9px] font-black text-emerald-800 uppercase tracking-[0.3em]">AI Private Log v2.0</p>
            </div>
          </div>
          
          <div className="flex flex-col items-end">
             {isRecording && (
                <div className="flex items-center gap-2 text-rose-500 animate-pulse">
                   <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                   <span className="text-xs font-mono font-black">{Math.floor(recordingSeconds/60)}:{(recordingSeconds%60).toString().padStart(2, '0')}</span>
                </div>
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
    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
      active ? 'bg-emerald-500/10 text-emerald-400' : 'text-emerald-900 hover:text-emerald-700'
    }`}
  >
    <i className={`fas ${icon} text-lg`}></i>
  </button>
);

export default App;
