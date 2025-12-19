
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DailyLog, ConversationSegment } from '../types';
import { getAudio } from '../db';

interface TimelineProps {
  log: DailyLog | null;
  onSummarize: () => void;
  onDelete: () => void;
  isProcessing: boolean;
  offlineMode?: boolean;
  isViewingPast?: boolean;
}

const Timeline: React.FC<TimelineProps> = ({ log, onSummarize, onDelete, isProcessing, isViewingPast = false }) => {
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeSegmentId = useMemo(() => {
    if (!playingAudioId || !log) return null;
    const active = log.transcripts.find(segment => 
      playingAudioId === segment.audioId && 
      currentTime >= segment.offsetInAudio && 
      currentTime <= (segment.offsetInAudio + segment.duration + 0.3)
    );
    return active ? active.id : null;
  }, [playingAudioId, currentTime, log]);

  // Smoother scrolling logic
  useEffect(() => {
    if (activeSegmentId) {
      const element = document.getElementById(`segment-${activeSegmentId}`);
      if (element) {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center'
        });
      }
    }
  }, [activeSegmentId]);

  const playAudio = async (audioId: string) => {
    if (playingAudioId === audioId && audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
        setPlayingAudioId(null);
      }
      return;
    }

    const blob = await getAudio(audioId);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    
    audioRef.current.ontimeupdate = () => setCurrentTime(audioRef.current?.currentTime || 0);
    audioRef.current.onended = () => {
      setPlayingAudioId(null);
      setCurrentTime(0);
      URL.revokeObjectURL(url);
    };

    try {
      await audioRef.current.play();
      setPlayingAudioId(audioId);
    } catch (e) {}
  };

  if (!log || (log.transcripts.length === 0 && !isProcessing)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 glass-effect rounded-[40px] border-dashed border-2 border-emerald-900/10 mt-4">
        <div className="w-20 h-20 bg-emerald-500/5 rounded-full flex items-center justify-center mb-8 border border-emerald-500/10">
          <i className="fas fa-ghost text-3xl text-emerald-900/40"></i>
        </div>
        <h3 className="text-xl font-black mb-2 text-emerald-100 uppercase tracking-tighter">Quiet Day</h3>
        <p className="text-emerald-500/40 text-center max-w-[240px] text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">
          {isViewingPast ? "No moments recorded on this date." : "Hit the mic to start logging your day."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="flex items-center justify-between px-2">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-2xl font-black flex items-center gap-3 text-emerald-50 tracking-tighter">
            {isViewingPast ? 'ARCHIVE' : 'DAILY LOG'}
            <span className="text-[9px] bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-emerald-500/10">
              {log.date}
            </span>
          </h2>
          <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">
            Recorded Time: {log.recordingDurationMinutes.toFixed(1)} Minutes
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={onDelete}
            className="w-11 h-11 flex items-center justify-center bg-rose-500/5 text-rose-500 border border-rose-500/10 rounded-2xl transition-all hover:bg-rose-500/10"
          >
            <i className="fas fa-trash-alt text-sm"></i>
          </button>
          {!log.summary && log.transcripts.length > 0 && (
            <button 
              onClick={onSummarize}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-emerald-500 text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-tighter transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50"
            >
              {isProcessing ? 'AI READING...' : 'SUMMARIZE DAY'}
            </button>
          )}
        </div>
      </div>

      <div className="relative pl-8 sm:pl-12 border-l-[3px] border-emerald-900/10 space-y-12 pb-24">
        {log.transcripts.map((segment) => {
          const isChunkPlaying = playingAudioId === segment.audioId;
          const isActive = activeSegmentId === segment.id;

          return (
            <div key={segment.id} id={`segment-${segment.id}`} className="relative group transition-all duration-500">
              {/* Timeline Indicator */}
              <div className={`absolute -left-[33.5px] sm:-left-[43.5px] top-6 w-5 h-5 rounded-full bg-[#020d0a] border-[4px] transition-all duration-300 ${
                isActive ? 'border-emerald-400 scale-125 shadow-[0_0_20px_rgba(52,211,153,0.4)]' : 'border-emerald-900/40'
              }`}></div>
              
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border transition-all ${
                    isActive ? 'bg-emerald-400/10 border-emerald-400/30' : 'bg-emerald-900/5 border-emerald-900/10'
                  }`}>
                    <i className={`fas fa-clock text-[10px] ${isActive ? 'text-emerald-400' : 'text-emerald-800'}`}></i>
                    <span className={`text-[11px] font-mono font-black tracking-tight ${isActive ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      {segment.startTime}
                    </span>
                  </div>
                  {isActive && (
                    <div className="flex gap-1 h-3 items-end">
                      <div className="w-1 bg-emerald-400/60 rounded-full animate-[bounce_0.6s_infinite]"></div>
                      <div className="w-1 bg-emerald-400/60 rounded-full animate-[bounce_0.8s_infinite]"></div>
                      <div className="w-1 bg-emerald-400/60 rounded-full animate-[bounce_0.4s_infinite]"></div>
                    </div>
                  )}
                </div>
                
                <div className={`glass-effect p-5 sm:p-7 rounded-[32px] sm:rounded-[40px] border transition-all duration-500 ${
                  isActive 
                  ? 'border-emerald-400/40 bg-emerald-500/10 scale-[1.01] shadow-2xl z-10' 
                  : 'border-emerald-500/5 opacity-80 hover:opacity-100'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-xl transition-all ${
                        segment.speaker === 'You' 
                          ? 'text-slate-900 bg-emerald-400' 
                          : 'text-emerald-500 bg-emerald-500/5 border border-emerald-500/10'
                      }`}>
                        {segment.speaker}
                      </span>
                      {segment.audioId && (
                        <button 
                          onClick={() => playAudio(segment.audioId!)}
                          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                            isChunkPlaying ? 'bg-emerald-500 text-slate-900 shadow-xl' : 'bg-emerald-500/5 text-emerald-500 hover:bg-emerald-500/10 border border-emerald-500/10'
                          }`}
                        >
                          <i className={`fas ${isChunkPlaying && audioRef.current && !audioRef.current.paused ? 'fa-pause' : 'fa-play'} text-[10px]`}></i>
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] font-black text-emerald-900/40 italic">
                      CONF: {(segment.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className={`text-base sm:text-lg font-medium leading-relaxed transition-all duration-500 ${
                    isActive ? 'text-emerald-50' : 'text-emerald-100/50'
                  }`}>
                    {segment.text}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {isProcessing && (
          <div className="flex items-center gap-4 animate-pulse px-6 py-8 bg-emerald-500/5 rounded-[32px] border border-dashed border-emerald-500/20">
             <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
             <span className="text-[11px] font-black text-emerald-700 uppercase tracking-[0.2em]">Analyzing incoming audio streams...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Timeline;
