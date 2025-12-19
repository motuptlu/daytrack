
import React, { useState, useEffect, useMemo } from 'react';
import { DailyLog } from '../types';
import { getStorageStats, getAllLogs } from '../db';

interface StatsProps {
  currentLog: DailyLog | null;
  totalLogs: number;
}

const StatsOverview: React.FC<StatsProps> = ({ currentLog, totalLogs }) => {
  const [storage, setStorage] = useState({ usageMB: 0, quotaMB: 0, percentUsed: 0 });
  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const stats = await getStorageStats();
      setStorage(stats);
      const all = await getAllLogs();
      setRecentLogs(all.slice(-5).reverse());
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [currentLog]);

  const storageProgress = Math.min((storage.usageMB / 5120) * 100, 100);

  return (
    <div className="space-y-4 mb-10">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatItem icon="fa-stopwatch" value={currentLog?.recordingDurationMinutes.toFixed(0) || '0'} label="MINS" />
        <StatItem icon="fa-comment-dots" value={currentLog?.transcripts.length.toString() || '0'} label="LINES" />
        <StatItem icon="fa-calendar" value={totalLogs.toString()} label="DAYS" />
        <StatItem icon="fa-database" value={`${storage.usageMB}MB`} label="SIZE" />
      </div>

      <div className="glass-effect rounded-[20px] p-3 border-emerald-500/5">
        <div className="flex justify-between items-center mb-1.5 px-1">
          <span className="text-[8px] font-black text-emerald-800 uppercase tracking-[0.2em]">IndexedDB Storage</span>
          <span className="text-[8px] font-mono text-emerald-600 font-bold">{storage.percentUsed.toFixed(1)}%</span>
        </div>
        <div className="h-1 w-full bg-emerald-950/40 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-1000"
            style={{ width: `${storageProgress}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

const StatItem = ({ icon, value, label }: { icon: string, value: string, label: string }) => (
  <div className="glass-effect rounded-2xl p-4 border-emerald-500/5 flex flex-col items-center justify-center gap-1">
    <i className={`fas ${icon} text-emerald-500/30 text-xs`}></i>
    <div className="text-lg font-black text-emerald-50 leading-none">{value}</div>
    <div className="text-[7px] font-black text-emerald-800 uppercase tracking-widest">{label}</div>
  </div>
);

export default StatsOverview;
