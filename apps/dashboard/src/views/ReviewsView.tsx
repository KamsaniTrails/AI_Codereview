import React, { useState, useEffect } from 'react';
import { api, type Review } from '../api.js';
import {
  GitPullRequest,
  ArrowRight,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
  Zap,
  Loader2,
  RefreshCw,
  Sparkles,
  Bot,
  MessageSquare
} from 'lucide-react';

interface ReviewsViewProps {
  onSelectReview: (id: string, tab?: 'diff' | 'chat' | 'findings' | 'debug') => void;
  onOpenAskAi?: () => void;
}

export const ReviewsView: React.FC<ReviewsViewProps> = ({ onSelectReview, onOpenAskAi }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const data = await api.getReviews();
    setReviews(data);
    setLoading(false);
  };

  const handleQuickImport = async (repoName: string) => {
    setConnecting(true);
    try {
      await api.connectRepo(repoName);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to import repository PRs');
    } finally {
      setConnecting(false);
    }
  };

  const filtered = statusFilter === 'all' ? reviews : reviews.filter((r) => r.status === statusFilter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'done':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>Done</span>
          </span>
        );
      case 'running':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
            <Clock className="w-3 h-3" />
            <span>Running</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Ban className="w-3 h-3" />
            <span>Cancelled</span>
          </span>
        );
      case 'failed':
      default:
        return (
          <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm">Loading pull request reviews...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Pull Request Reviews</h1>
          <p className="text-sm text-slate-400">
            History of automated context-aware multi-agent review runs.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {onOpenAskAi && (
            <button
              onClick={onOpenAskAi}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 text-xs font-semibold transition-colors"
            >
              <Bot className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Ask AI (RAG Chat)</span>
            </button>
          )}

          <button
            onClick={load}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <div className="flex space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
            {['all', 'done', 'running', 'cancelled'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {reviews.length === 0 ? (
        /* Empty State with 1-Click Connect Button */
        <div className="border border-slate-800 bg-slate-900/40 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-5">
          <div className="w-14 h-14 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/20">
            <GitPullRequest className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold text-slate-200">No Pull Request Reviews Yet</h3>
            <p className="text-sm text-slate-400">
              Connect your repository to instantly import and run multi-agent AI reviews on your Pull Requests with zero configuration.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => handleQuickImport('KamsaniTrails/AI_Interview')}
              disabled={connecting}
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting & Reviewing PRs...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>Connect KamsaniTrails/AI_Interview (1-Click)</span>
                </>
              )}
            </button>

            {onOpenAskAi && (
              <button
                onClick={onOpenAskAi}
                className="inline-flex items-center space-x-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-sm font-semibold transition-all"
              >
                <Bot className="w-4 h-4 text-emerald-400" />
                <span>Open Ask AI Chat</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="border border-slate-800 bg-slate-900/60 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/70 text-xs uppercase text-slate-400 border-b border-slate-800 font-mono">
              <tr>
                <th className="px-6 py-4">PR / Commit</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Model</th>
                <th className="px-6 py-4">Tokens / Cost</th>
                <th className="px-6 py-4">Summary</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((rev) => (
                <tr key={rev.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-100">
                    <div className="flex items-center space-x-2">
                      <GitPullRequest className="w-4 h-4 text-indigo-400" />
                      <span>PR #{rev.prNumber}</span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {rev.headSha?.slice(0, 7) || 'HEAD'}
                    </div>
                  </td>
                  <td className="px-6 py-4">{getStatusBadge(rev.status)}</td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-300">{rev.model}</td>
                  <td className="px-6 py-4 font-mono text-xs">
                    <div className="text-slate-200">
                      {(rev.tokensIn || 0) + (rev.tokensOut || 0)} tokens
                    </div>
                    <div className="text-slate-400">${Number(rev.costUsd || 0).toFixed(4)}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400 max-w-xs truncate">
                    {rev.summary || 'AI review generated successfully.'}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => onSelectReview(rev.id, 'chat')}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 rounded-lg text-xs font-semibold border border-emerald-500/30 transition-all shadow-sm"
                      title="Chat with AI about this PR"
                    >
                      <Bot className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Ask AI</span>
                    </button>

                    <button
                      onClick={() => onSelectReview(rev.id, 'diff')}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-medium border border-indigo-500/30 transition-all shadow-sm"
                    >
                      <span>Diff & Findings</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
