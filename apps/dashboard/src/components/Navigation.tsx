import React from 'react';
import { GitPullRequest, Database, Sliders, BarChart2, CheckCircle2, ShieldAlert } from 'lucide-react';

export type TabType = 'reviews' | 'repos' | 'settings' | 'insights' | 'evals';

interface NavigationProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onTabChange }) => {
  const tabs = [
    { id: 'reviews' as TabType, label: 'Reviews', icon: GitPullRequest },
    { id: 'repos' as TabType, label: 'Repositories', icon: Database },
    { id: 'settings' as TabType, label: 'Settings', icon: Sliders },
    { id: 'insights' as TabType, label: 'Insights & Feedback', icon: BarChart2 },
    { id: 'evals' as TabType, label: 'AI Benchmark Evals', icon: CheckCircle2 }
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('reviews')}>
          <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-indigo-500/20">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-lg bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              AI Code Reviewer
            </div>
            <div className="text-xs text-slate-400 font-mono">Multi-Agent RAG Platform</div>
          </div>
        </div>

        <nav className="flex space-x-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center space-x-3">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs text-slate-400 font-mono">App Live</span>
        </div>
      </div>
    </header>
  );
};

