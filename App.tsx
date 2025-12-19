
import React, { useState, useEffect, useRef } from 'react';
import { ViewType, DailyLog, ModelStatus } from './types';
import { getLog, saveLog, getAllLogs, saveAudio, deleteDayData, autoCleanupAndCompress } from './db';
import { transcribeAudioChunk, generateDailySummary } from './geminiService';
import Timeline from './components/Timeline';
import CalendarView from './components/CalendarView';
import SummaryView from './components/SummaryView';
import SearchView from './components/SearchView';
import StatsOverview from './components/StatsOverview';
import ModelManager from './components/ModelManager';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('timeline');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [viewingLog, setViewingLog] = useState<DailyLog | null>(null);
  const [allLogs, setAllLogs] = useState<DailyLog[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  
  const wakeLockRef = useRef<any>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const todayStr = new Date().toISOString().split('T')[0];

  const [offlineMode, setOfflineMode] = useState(() => localStorage.getItem('offlineMode') === 'true');
  const [downloadedModels, setDownloadedModels] = useState<ModelStatus[]>(() => {
    const saved = localStorage.getItem('downloadedModels');
    return saved ? JSON.parse(saved) : [
      { id: 'en', name: 'English (US)', size: '154 MB', status: 'none', progress: 0 },
      { id: 'hi', name: 'Hindi (India)', size: '182 MB', status: 'none', progress: 0 }
    ];
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    autoCleanupAndCompress();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const log = await getLog(selectedDate);
      if (log) {
        setViewingLog(log);
      } else if (selectedDate === todayStr) {
        const newLog: DailyLog = { date: todayStr, transcripts: [], recordingDurationMinutes: 0 };
        await saveLog(newLog);
        setViewingLog(newLog);
      } else {
        setViewingLog(null);
      }
      const logs = await getAllLogs();
      setAllLogs(logs);
    };
    loadData();
  }, [selectedDate, todayStr]);

  const formatTimer = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const processChunk = async (blob: Blob) => {
    if (blob.size < 100) return;
    setIsTranscribing(true);
    const audioId = `audio_${Date.now()}`;
    await saveAudio(audioId, blob);

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const segments = await transcribeAudioChunk(base64, offlineMode);
      
      if (segments.length > 0) {
        setViewingLog(prev => {
          if (!prev) return prev;
          const updatedTranscripts = [...prev.transcripts, ...segments.map(s => ({ ...s, audioId }))];
          const updatedLog = { 
            ...prev, 
            transcripts: updatedTranscripts,
            recordingDurationMinutes: prev.recordingDurationMinutes + 0.5 
          };
          saveLog(updatedLog);
          return updatedLog;
        });
        const logs = await getAllLogs();
        setAllLogs(logs);
      }
      setIsTranscribing(false);
    };
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) processChunk(e.data);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      if ('wakeLock' in navigator) {
        try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (e) {}
      }

      chunkIntervalRef.current = window.setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.start();
        }
      }, 30000);
    } catch (err) {
      alert("Microphone permission is required.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    setIsRecording(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#020d0a] text-emerald-50">
      {/* Header - Fixed & Compact */}
      <header className="px-4 py-4 sm:p-6 border-b border-emerald-900/20 flex justify-between items-center sticky top-0 bg-[#020d0a]/95 backdrop-blur-xl z-[60]">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <i className="fas fa-layer-group text-slate-900 text-sm"></i>
          </div>
          <h1 className="text-sm sm:text-xl font-black tracking-tighter uppercase italic">DayTrack</h1>
        </div>
        
        <nav className="flex gap-1 sm:gap-2">
          {(['timeline', 'calendar', 'summary', 'search', 'settings'] as ViewType[]).map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center transition-all ${
                activeView === view ? 'bg-emerald-500 text-slate-900' : 'bg-emerald-500/5 text-emerald-500 hover:bg-emerald-500/10'
              }`}
            >
              <i className={`fas fa-${view === 'timeline' ? 'list-ul' : view === 'calendar' ? 'calendar-day' : view === 'summary' ? 'sparkles' : view === 'search' ? 'magnifying-glass' : 'sliders-h'} text-[10px] sm:text-xs`}></i>
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-48">
        <StatsOverview currentLog={viewingLog} totalLogs={allLogs.length} />

        <div className="w-full">
          {activeView === 'timeline' && (
            <Timeline 
              log={viewingLog} 
              isProcessing={isSummarizing || isTranscribing}
              onSummarize={async () => {
                if (!viewingLog || viewingLog.transcripts.length === 0) return;
                setIsSummarizing(true);
                const summary = await generateDailySummary(viewingLog.transcripts);
                const updated = {...viewingLog, summary};
                await saveLog(updated);
                setViewingLog(updated);
                setIsSummarizing(false);
              }}
              onDelete={async () => {
                if (viewingLog && window.confirm("Delete this entire day?")) {
                  const audioIds = viewingLog.transcripts.map(t => t.audioId).filter(Boolean) as string[];
                  await deleteDayData(viewingLog.date, audioIds);
                  setViewingLog(null);
                  const logs = await getAllLogs();
                  setAllLogs(logs);
                }
              }}
              isViewingPast={selectedDate !== todayStr}
            />
          )}

          {activeView === 'calendar' && (
            <CalendarView 
              logs={allLogs} 
              selectedDate={selectedDate} 
              onSelectDate={(d) => { setSelectedDate(d); setActiveView('timeline'); }} 
            />
          )}

          {activeView === 'summary' && <SummaryView summary={viewingLog?.summary} />}
          {activeView === 'search' && <SearchView logs={allLogs} />}
          {activeView === 'settings' && (
            <ModelManager 
              offlineMode={offlineMode} 
              setOfflineMode={(val) => { setOfflineMode(val); localStorage.setItem('offlineMode', String(val)); }} 
              initialModels={downloadedModels}
              onStatusChange={(m) => { setDownloadedModels(m); localStorage.setItem('downloadedModels', JSON.stringify(m)); }}
            />
          )}
        </div>
      </main>

      {/* Record Controls - Floating Bottom Left */}
      <div className="fixed bottom-6 left-6 z-[100] flex flex-col-reverse sm:flex-row items-start sm:items-center gap-4 pointer-events-none">
        <button 
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 pointer-events-auto ${
            isRecording ? 'bg-rose-500 shadow-rose-500/40' : 'bg-emerald-500 shadow-emerald-500/40'
          }`}
        >
          <div className={`absolute inset-0 rounded-full border-4 border-white/20 scale-110 ${isRecording ? 'animate-ping' : ''}`}></div>
          <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'} text-xl sm:text-2xl ${isRecording ? 'text-white' : 'text-slate-900'}`}></i>
        </button>

        {isRecording && (
          <div className="bg-[#041611]/80 backdrop-blur-xl border border-emerald-500/30 px-5 py-3 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 pointer-events-auto animate-in slide-in-from-left-4 fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse"></div>
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">Recording</span>
            </div>
            <div className="h-4 w-[1px] bg-emerald-900 hidden sm:block"></div>
            <span className="text-sm font-mono font-black text-emerald-100 tabular-nums">
              {formatTimer(recordingSeconds)}
            </span>
          </div>
        )}

        {(isTranscribing || isSummarizing) && !isRecording && (
          <div className="bg-amber-500/10 backdrop-blur-md border border-amber-500/20 px-4 py-2 rounded-xl flex items-center gap-2 pointer-events-auto">
            <i className="fas fa-circle-notch fa-spin text-[10px] text-amber-500"></i>
            <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">AI Processing</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
