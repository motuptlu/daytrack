
import React, { useState, useMemo } from 'react';
import { DailyLog } from '../types';

interface SearchViewProps {
  logs: DailyLog[];
}

const SearchView: React.FC<SearchViewProps> = ({ logs }) => {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    const matches: { date: string, segment: any }[] = [];

    logs.forEach(log => {
      log.transcripts.forEach(seg => {
        if (seg.text.toLowerCase().includes(lowerQuery)) {
          matches.push({ date: log.date, segment: seg });
        }
      });
    });

    return matches;
  }, [query, logs]);

  return (
    <div className="space-y-6">
      <div className="glass-effect rounded-3xl p-6">
        <div className="relative">
          <i className="fas fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
          <input 
            type="text" 
            placeholder="Search transcripts, speakers, or topics..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-slate-200"
          />
        </div>
      </div>

      <div className="space-y-4">
        {query && results.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            No results found for "{query}"
          </div>
        )}

        {results.map((res, idx) => (
          <div key={idx} className="glass-effect rounded-2xl p-5 border-l-4 border-indigo-500 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{res.date}</span>
                <span className="text-xs text-slate-600 font-mono">{res.segment.startTime}</span>
              </div>
              <span className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded uppercase font-bold">{res.segment.speaker}</span>
            </div>
            <p className="text-slate-300 italic">"...{res.segment.text}..."</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SearchView;
