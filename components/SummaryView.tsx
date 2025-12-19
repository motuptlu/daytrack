
import React from 'react';
import { DailySummary } from '../types';

interface SummaryViewProps {
  summary: DailySummary | undefined;
}

const SummaryView: React.FC<SummaryViewProps> = ({ summary }) => {
  if (!summary) {
    return (
      <div className="glass-effect rounded-3xl p-12 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/20">
          <i className="fas fa-sparkles text-2xl text-indigo-400"></i>
        </div>
        <h3 className="text-xl font-bold mb-3">No summary available</h3>
        <p className="text-slate-400 max-w-md">
          Once you have recorded conversations, use the "Generate Daily Summary" button to get AI-powered insights into your day.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="glass-effect rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <i className="fas fa-quote-right text-8xl text-indigo-400"></i>
        </div>
        
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
          <i className="fas fa-lightbulb text-amber-400"></i>
          Day Overview
        </h2>
        <p className="text-lg text-slate-300 leading-relaxed mb-6 font-medium">
          {summary.overview}
        </p>

        <div className="flex flex-wrap gap-2">
          {summary.topics.map((topic, idx) => (
            <span key={idx} className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs font-semibold border border-slate-700">
              # {topic}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-effect rounded-3xl p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-3 text-emerald-400">
            <i className="fas fa-list-check"></i>
            Action Items
          </h3>
          <ul className="space-y-3">
            {summary.actionItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-3 text-slate-300 text-sm">
                <i className="fas fa-circle-check mt-1 text-emerald-500/40"></i>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-effect rounded-3xl p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-3 text-indigo-400">
            <i className="fas fa-star"></i>
            Key Events
          </h3>
          <ul className="space-y-3">
            {summary.keyEvents.map((event, idx) => (
              <li key={idx} className="flex items-start gap-3 text-slate-300 text-sm">
                <i className="fas fa-location-arrow mt-1 text-indigo-500/40"></i>
                {event}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="glass-effect rounded-3xl p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center">
            <i className="fas fa-face-smile text-xl text-amber-400"></i>
          </div>
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Estimated Mood</div>
            <div className="text-xl font-bold">{summary.mood}</div>
          </div>
        </div>
        <button className="text-sm font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-2">
          Share Summary <i className="fas fa-arrow-up-right-from-square"></i>
        </button>
      </div>
    </div>
  );
};

export default SummaryView;
