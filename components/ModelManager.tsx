
import React, { useState } from 'react';
import { ModelStatus } from '../types';
import { saveLog, saveAudio } from '../db';

interface ModelManagerProps {
  onStatusChange: (models: ModelStatus[]) => void;
  initialModels: ModelStatus[];
  offlineMode: boolean;
  setOfflineMode: (val: boolean) => void;
}

const ModelManager: React.FC<ModelManagerProps> = ({ 
  onStatusChange, 
  initialModels, 
  offlineMode, 
  setOfflineMode 
}) => {
  const [models, setModels] = useState<ModelStatus[]>(initialModels);
  const [isInjecting, setIsInjecting] = useState(false);

  const startDownload = (id: string) => {
    setModels(prev => prev.map(m => 
      m.id === id ? { ...m, status: 'downloading' as const, progress: 0, error: undefined } : m
    ));

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 12;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setModels(prev => {
          const updated = prev.map(m => m.id === id ? { ...m, status: 'ready' as const, progress: 100 } : m);
          onStatusChange(updated);
          return updated;
        });
      } else {
        setModels(prev => prev.map(m => m.id === id ? { ...m, progress } : m));
      }
    }, 400);
  };

  const injectDemoData = async () => {
    setIsInjecting(true);
    const today = new Date().toISOString().split('T')[0];
    
    const demoSegments = [
      {
        id: 'demo-1',
        startTime: '09:15:00',
        offsetInAudio: 0,
        duration: 45,
        speaker: 'You',
        text: "Today's goal is to finalize the architectural review for the new distributed system. I need to focus on latency metrics.",
        confidence: 0.99
      },
      {
        id: 'demo-2',
        startTime: '11:30:00',
        offsetInAudio: 0,
        duration: 30,
        speaker: 'Person 1',
        text: "The client mentioned that the mobile app response time is lagging in the APAC region. We should check the CDN nodes.",
        confidence: 0.96
      },
      {
        id: 'demo-3',
        startTime: '14:20:00',
        offsetInAudio: 0,
        duration: 60,
        speaker: 'You',
        text: "Meeting with the design team went well. We decided on a minimalist emerald theme to reduce cognitive load.",
        confidence: 0.98
      }
    ];

    const demoLog = {
      date: today,
      transcripts: demoSegments,
      recordingDurationMinutes: 135,
      summary: {
        overview: "A highly productive day focused on system architecture and design refinement. Key technical hurdles in APAC latency were identified.",
        keyEvents: ["Architecture Review", "Client Feedback Session", "UI/UX Emerald Theme Alignment"],
        actionItems: ["Check CDN nodes for APAC region", "Document design tokens", "Update latency benchmarks"],
        mood: "Focused & Analytical",
        topics: ["System Architecture", "Performance", "Design Systems"]
      }
    };

    await saveLog(demoLog);
    // Give it a moment for UI feedback
    setTimeout(() => {
      setIsInjecting(false);
      window.location.reload(); // Quickest way to refresh all views with new DB state
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* SHOWCASE SECTION */}
      <div className="glass-effect rounded-[32px] p-8 border-emerald-500/20 bg-emerald-500/5 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <i className="fas fa-magic text-8xl text-emerald-400"></i>
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-black text-emerald-50 mb-2 tracking-tighter">PREVIEW & SHOWCASE</h2>
          <p className="text-xs text-emerald-700 font-bold uppercase tracking-widest mb-6">Instantly visualize DayTrack's full power</p>
          <button 
            onClick={injectDemoData}
            disabled={isInjecting}
            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all border shadow-2xl ${
              isInjecting 
              ? 'bg-emerald-900/20 border-emerald-900/30 text-emerald-700 animate-pulse' 
              : 'bg-emerald-500 border-emerald-400 text-slate-950 hover:scale-[1.02] active:scale-95'
            }`}
          >
            {isInjecting ? 'Populating IndexedDB...' : 'Generate Demo Day Data'}
          </button>
          <p className="mt-4 text-[10px] text-emerald-900 text-center font-bold">This will add a sample log to your timeline for today.</p>
        </div>
      </div>

      <div className="glass-effect rounded-3xl p-8 border-amber-500/10 bg-amber-500/5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${offlineMode ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400'}`}>
              <i className={`fas ${offlineMode ? 'fa-plane' : 'fa-globe'} text-2xl`}></i>
            </div>
            <div>
              <h2 className="text-xl font-bold">Offline Mode</h2>
              <p className="text-sm text-slate-400">Process everything locally in your browser.</p>
            </div>
          </div>
          <button 
            onClick={() => setOfflineMode(!offlineMode)}
            className={`px-8 py-3 rounded-2xl font-bold transition-all border ${
              offlineMode 
              ? 'bg-amber-500 border-amber-400 text-slate-900 shadow-lg shadow-amber-500/20' 
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {offlineMode ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      <div className="glass-effect rounded-3xl p-8">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
          <i className="fas fa-microchip text-emerald-400"></i>
          AI Models
        </h2>
        <div className="grid grid-cols-1 gap-6 mt-8">
          {models.map(model => (
            <div key={model.id} className="bg-slate-800/30 border border-slate-700 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <i className="fas fa-language text-xl text-emerald-400"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{model.name}</h3>
                    <p className="text-xs text-emerald-800 font-mono">{model.size}</p>
                  </div>
                </div>
              </div>
              {model.status === 'downloading' ? (
                <div className="space-y-2">
                  <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${model.progress}%` }}></div>
                  </div>
                </div>
              ) : model.status === 'ready' ? (
                <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest"><i className="fas fa-check mr-2"></i> Installed</div>
              ) : (
                <button onClick={() => startDownload(model.id)} className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all">Download</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ModelManager;
