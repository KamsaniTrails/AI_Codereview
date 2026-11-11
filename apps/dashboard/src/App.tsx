import React, { useState, useEffect } from 'react';
import { Navigation, type TabType } from './components/Navigation.js';
import { ReviewsView } from './views/ReviewsView.js';
import { ReviewDetailView } from './views/ReviewDetailView.js';
import { ReposView } from './views/ReposView.js';
import { SettingsView } from './views/SettingsView.js';
import { InsightsView } from './views/InsightsView.js';
import { EvalsView } from './views/EvalsView.js';
import { GitHubCallbackView } from './views/GitHubCallbackView.js';

export const App: React.FC = () => {
  const isCallbackPath =
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/github/callback');

  const [isCallback, setIsCallback] = useState(isCallbackPath);
  const [currentTab, setCurrentTab] = useState<TabType>(isCallbackPath ? 'repos' : 'reviews');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setIsCallback(window.location.pathname.startsWith('/github/callback'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectReview = (id: string) => {
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
          <ReviewDetailView reviewId={selectedReviewId} onBack={handleBackToReviews} />
        ) : (
          <>
            {currentTab === 'reviews' && <ReviewsView onSelectReview={handleSelectReview} />}
            {currentTab === 'repos' && <ReposView />}
            {currentTab === 'settings' && <SettingsView />}
            {currentTab === 'insights' && <InsightsView />}
            {currentTab === 'evals' && <EvalsView />}
          </>
        )}
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-400 font-mono">
        AI Code Review Platform • Production-grade Multi-Agent System with RAG, Static Analysis & Evals
      </footer>
    </div>
  );
};

export default App;
