
import React, { useState } from 'react';
import { DailyLog } from '../types';

interface CalendarViewProps {
  logs: DailyLog[];
  onSelectDate: (date: string) => void;
  selectedDate: string;
}

const CalendarView: React.FC<CalendarViewProps> = ({ logs, onSelectDate, selectedDate }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = currentMonth.toLocaleString('default', { month: 'long' });

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    onSelectDate(today.toISOString().split('T')[0]);
  };

  const days = [];
  const startDay = firstDayOfMonth(year, month);
  const totalDays = daysInMonth(year, month);

  // Padding for the start of the month
  for (let i = 0; i < startDay; i++) {
    days.push(<div key={`pad-${i}`} className="aspect-square"></div>);
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const log = logs.find(l => l.date === dateStr);
    const isSelected = selectedDate === dateStr;
    const isToday = new Date().toISOString().split('T')[0] === dateStr;
    
    const duration = log?.recordingDurationMinutes || 0;
    const barWidth = Math.min((duration / 60) * 100, 100);

    days.push(
      <button 
        key={d} 
        onClick={() => onSelectDate(dateStr)}
        className={`aspect-square relative flex flex-col items-center justify-center rounded-2xl transition-all active:scale-90 border ${
          isSelected 
          ? 'border-emerald-400 bg-emerald-500/20 z-10' 
          : isToday 
            ? 'border-emerald-500/40 bg-emerald-500/5' 
            : 'border-transparent hover:border-emerald-500/10'
        }`}
      >
        <span className={`text-sm font-black ${isSelected ? 'text-emerald-300' : isToday ? 'text-emerald-400' : 'text-emerald-100/60'}`}>
          {d}
        </span>
        
        {log && (
          <div className="absolute bottom-2 left-2 right-2 flex flex-col items-center gap-0.5">
            {/* Visual indicator of recording length */}
            <div className="h-1 bg-emerald-950/50 rounded-full overflow-hidden w-full max-w-[20px]">
              <div 
                className="h-full bg-emerald-400 rounded-full" 
                style={{ width: `${Math.max(barWidth, 30)}%` }}
              ></div>
            </div>
            {log.summary && (
               <div className="absolute -top-7 right-[-4px] text-[8px] text-amber-400">
                  <i className="fas fa-sparkles scale-75"></i>
               </div>
            )}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="glass-effect rounded-[32px] p-5 border-emerald-500/10 mb-20 animate-in fade-in zoom-in duration-500">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col">
          <h2 className="text-xl font-black text-emerald-50 tracking-tight">{monthName}</h2>
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{year}</span>
        </div>
        
        <div className="flex items-center gap-1 bg-emerald-950/30 p-1 rounded-2xl border border-emerald-500/10">
          <button 
            onClick={() => setCurrentMonth(new Date(year, month - 1))}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-emerald-500/70 hover:text-emerald-400 active:bg-emerald-500/10 transition-all"
          >
            <i className="fas fa-chevron-left text-xs"></i>
          </button>
          
          <button 
            onClick={goToToday}
            className="px-3 py-1.5 text-[10px] font-black text-emerald-900 bg-emerald-400 rounded-lg uppercase tracking-tighter"
          >
            Today
          </button>

          <button 
            onClick={() => setCurrentMonth(new Date(year, month + 1))}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-emerald-500/70 hover:text-emerald-400 active:bg-emerald-500/10 transition-all"
          >
            <i className="fas fa-chevron-right text-xs"></i>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
          <div key={day} className="text-center text-[10px] font-black text-emerald-800 uppercase tracking-widest py-2">
            {day}
          </div>
        ))}
        {days}
      </div>

      <div className="mt-8 pt-6 border-t border-emerald-500/5 flex flex-wrap justify-center gap-6 text-[9px] font-black uppercase tracking-widest text-emerald-700">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
          Logs
        </div>
        <div className="flex items-center gap-2">
          <div className="text-amber-400"><i className="fas fa-sparkles text-[10px]"></i></div>
          Insight
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-lg border-2 border-emerald-500/40"></div>
          Today
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
