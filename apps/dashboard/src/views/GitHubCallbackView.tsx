import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

interface GitHubCallbackViewProps {
  onSuccess: () => void;
}

export const GitHubCallbackView: React.FC<GitHubCallbackViewProps> = ({ onSuccess }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState<number>(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const installationIdStr = params.get('installation_id');

    if (!installationIdStr) {
      setStatus('error');
      setErrorMessage('No installation_id found in GitHub callback query parameters.');
      return;
    }

    const installationId = parseInt(installationIdStr, 10);
    if (isNaN(installationId)) {
      setStatus('error');
      setErrorMessage('Invalid installation_id parameter received from GitHub.');
      return;
    }

    // Call POST /api/installations/sync
    api
      .syncInstallation(installationId)
      .then((res) => {
        setSyncedCount(res.count ?? (res.repos ? res.repos.length : 0));
        setStatus('success');
        // Auto-redirect to repos view after 1.5s
        setTimeout(() => {
          onSuccess();
        }, 1500);
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to sync repositories from GitHub installation.');
      });
  }, [onSuccess]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-xl text-center space-y-6">
        {status === 'loading' && (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/20">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Connecting GitHub App</h2>
              <p className="text-sm text-slate-400">
                Fetching authorized repositories and queuing AST vector indexing...
              </p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Repositories Connected!</h2>
              <p className="text-sm text-slate-400">
                Successfully synced {syncedCount} {syncedCount === 1 ? 'repository' : 'repositories'}. Redirecting to dashboard...
              </p>
            </div>
            <button
              onClick={onSuccess}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <span>Go to Repositories</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-100">Sync Failed</h2>
              <p className="text-sm text-rose-300 font-mono bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50 break-words">
                {errorMessage}
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={onSuccess}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                <span>Continue to Repositories</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

