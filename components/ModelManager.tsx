
import React, { useState, useEffect } from 'react';
import { ModelStatus } from '../types';

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

  const startDownload = (id: string) => {
    // Reset status and clear previous errors
    setModels(prev => prev.map(m => 
      m.id === id ? { ...m, status: 'downloading' as const, progress: 0, error: undefined } : m
    ));

    let progress = 0;
    const failureThreshold = Math.random() * 80 + 10; // Fail at a random point between 10% and 90%
    const willFail = Math.random() < 0.2; // 20% chance to fail

    const interval = setInterval(() => {
      progress += Math.random() * 12;

      if (willFail && progress >= failureThreshold) {
        clearInterval(interval);
        setModels(prev => {
          const updated = prev.map(m => 
            m.id === id ? { 
              ...m, 
              status: 'none' as const, 
              progress: 0, 
              error: 'Connection timeout: Model server unreachable.' 
            } : m
          );
          onStatusChange(updated);
          return updated;
        });
        return;
      }

      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setModels(prev => {
          const updated = prev.map(m => 
            m.id === id ? { ...m, status: 'ready' as const, progress: 100, error: undefined } : m
          );
          onStatusChange(updated);
          return updated;
        });
      } else {
        setModels(prev => prev.map(m => 
          m.id === id ? { ...m, progress } : m
        ));
      }
    }, 400);
  };

  const removeModel = (id: string) => {
    const updated = models.map(m => 
      m.id === id ? { ...m, status: 'none' as const, progress: 0, error: undefined } : m
    );
    setModels(updated);
    onStatusChange(updated);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Master Offline Toggle */}
      <div className="glass-effect rounded-3xl p-8 border-amber-500/10 bg-amber-500/5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${offlineMode ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400'}`}>
              <i className={`fas ${offlineMode ? 'fa-plane' : 'fa-globe'} text-2xl`}></i>
            </div>
            <div>
              <h2 className="text-xl font-bold">Offline Transcription Mode</h2>
              <p className="text-sm text-slate-400">When enabled, DayTrack processes everything locally.</p>
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
          <i className="fas fa-microchip text-indigo-400"></i>
          Offline Transcription Models
        </h2>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          Download language models to enable real-time transcription without an internet connection. 
          Models are stored securely in your browser's local cache.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {models.map(model => (
            <div key={model.id} className={`bg-slate-800/50 border rounded-2xl p-6 transition-all hover:border-slate-600 ${model.error ? 'border-rose-500/50 shadow-lg shadow-rose-500/5' : 'border-slate-700'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${model.error ? 'bg-rose-500/10' : 'bg-indigo-500/10'}`}>
                    <i className={`fas fa-language text-xl ${model.error ? 'text-rose-400' : 'text-indigo-400'}`}></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{model.name}</h3>
                    <p className="text-xs text-slate-500 font-mono">{model.size}</p>
                  </div>
                </div>
                {model.status === 'ready' && (
                  <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20">
                    <i className="fas fa-check-circle mr-1"></i> READY
                  </span>
                )}
                {model.error && (
                  <span className="text-[10px] font-bold bg-rose-500/10 text-rose-400 px-2 py-1 rounded-full border border-rose-500/20 animate-pulse">
                    <i className="fas fa-circle-exclamation mr-1"></i> FAILED
                  </span>
                )}
              </div>

              {model.status === 'downloading' ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>DOWNLOADING...</span>
                    <span>{Math.round(model.progress)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-300" 
                      style={{ width: `${model.progress}%` }}
                    ></div>
                  </div>
                </div>
              ) : model.status === 'ready' ? (
                <button 
                  onClick={() => removeModel(model.id)}
                  className="w-full py-2 bg-slate-700/50 hover:bg-rose-500/10 hover:text-rose-400 text-slate-400 rounded-xl text-sm font-bold transition-all border border-slate-700"
                >
                  Remove Model
                </button>
              ) : (
                <div className="space-y-3">
                  {model.error && (
                    <p className="text-[11px] text-rose-400 bg-rose-500/5 p-2 rounded-lg border border-rose-500/10 flex items-center gap-2">
                      <i className="fas fa-triangle-exclamation"></i>
                      {model.error}
                    </p>
                  )}
                  <button 
                    onClick={() => startDownload(model.id)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
                  >
                    <i className={`fas ${model.error ? 'fa-rotate-right' : 'fa-download'} mr-2`}></i> 
                    {model.error ? 'Retry Download' : 'Download'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="glass-effect rounded-3xl p-6 bg-indigo-500/10 border-indigo-500/20">
        <h3 className="text-lg font-bold mb-2 flex items-center gap-2 text-indigo-400">
          <i className="fas fa-triangle-exclamation"></i>
          Storage Advice
        </h3>
        <p className="text-sm text-slate-400">
          Models require significant disk space. If you encounter errors, ensure your browser has enough space allocated for IndexedDB. 
          Hindi models include specialized phonetic mapping for better accuracy.
        </p>
      </div>
    </div>
  );
};

export default ModelManager;
