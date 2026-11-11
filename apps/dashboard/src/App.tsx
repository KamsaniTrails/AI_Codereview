import React, { useState, useEffect } from 'react';
import { Navigation, type TabType } from './components/Navigation.js';
import { ReviewsView } from './views/ReviewsView.js';
import { ReviewDetailView } from './views/ReviewDetailView.js';
import { AskAiView } from './views/AskAiView.js';
import { ReposView } from './views/ReposView.js';
import { SettingsView } from './views/SettingsView.js';
import { InsightsView } from './views/InsightsView.js';
import { EvalsView } from './views/EvalsView.js';
import { GitHubCallbackView } from './views/GitHubCallbackView.js';
import { Bot } from 'lucide-react';

export const App: React.FC = () => {
  const isCallbackPath =
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/github/callback');

  const [isCallback, setIsCallback] = useState(isCallbackPath);
  const [currentTab, setCurrentTab] = useState<TabType>(isCallbackPath ? 'repos' : 'reviews');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviewInitialTab, setReviewInitialTab] = useState<'diff' | 'chat' | 'findings' | 'debug'>('diff');

  useEffect(() => {
    const handlePopState = () => {
      setIsCallback(window.location.pathname.startsWith('/github/callback'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectReview = (id: string, tab: 'diff' | 'chat' | 'findings' | 'debug' = 'diff') => {
    setReviewInitialTab(tab);
    setSelectedReviewId(id);
  };

  const handleBackToReviews = () => {
    setSelectedReviewId(null);
  };

  const handleTabChange = (tab: TabType) => {
    setSelectedReviewId(null);
    setIsCallback(false);
    setCurrentTab(tab);
  };

  const handleCallbackSuccess = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    setIsCallback(false);
    setCurrentTab('repos');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navigation currentTab={currentTab} onTabChange={handleTabChange} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isCallback ? (
          <GitHubCallbackView onSuccess={handleCallbackSuccess} />
        ) : selectedReviewId ? (
          <ReviewDetailView
            reviewId={selectedReviewId}
            initialTab={reviewInitialTab}
            onBack={handleBackToReviews}
          />
        ) : (
          <>
            {currentTab === 'reviews' && (
              <ReviewsView
                onSelectReview={handleSelectReview}
                onOpenAskAi={() => handleTabChange('ask-ai')}
              />
            )}
            {currentTab === 'ask-ai' && (
              <AskAiView onSelectReview={handleSelectReview} />
            )}
            {currentTab === 'repos' && <ReposView />}
            {currentTab === 'settings' && <SettingsView />}
            {currentTab === 'insights' && <InsightsView />}
            {currentTab === 'evals' && <EvalsView />}
          </>
        )}
      </main>

      {/* Floating Ask AI Button across all views */}
      {currentTab !== 'ask-ai' && (
        <button
          onClick={() => handleTabChange('ask-ai')}
          className="fixed bottom-6 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-sm font-semibold shadow-2xl shadow-indigo-500/30 border border-indigo-400/40 transition-all hover:scale-105"
        >
          <Bot className="w-5 h-5 animate-pulse" />
          <span>Ask AI (RAG Chat)</span>
        </button>
      )}

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-400 font-mono">
        AI Code Review Platform • Production-grade Multi-Agent System with RAG, Static Analysis & Evals
      </footer>
    </div>
  );
};

export default App;
