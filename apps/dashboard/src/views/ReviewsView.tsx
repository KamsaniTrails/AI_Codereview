import React, { useState, useEffect } from 'react';
import { api, type Review } from '../api.js';
import { GitPullRequest, ArrowRight, CheckCircle2, Clock, XCircle, Ban } from 'lucide-react';

interface ReviewsViewProps {
  onSelectReview: (id: string) => void;
}

export const ReviewsView: React.FC<ReviewsViewProps> = ({ onSelectReview }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const data = await api.getReviews();
    setReviews(data);
    setLoading(false);
  };

  const filtered = statusFilter === 'all' ? reviews : reviews.filter(r => r.status === statusFilter);

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
            <span>Cancelled (Stale)</span>
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
    return <div className="text-center py-16 text-slate-400">Loading reviews...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Pull Request Reviews</h1>
          <p className="text-sm text-slate-400">History of automated context-aware multi-agent review runs.</p>
        </div>

        <div className="flex space-x-2">
          {['all', 'done', 'running', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-slate-700 text-white border border-slate-600'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

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
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{rev.headSha.slice(0, 7)}</div>
                </td>
                <td className="px-6 py-4">{getStatusBadge(rev.status)}</td>
                <td className="px-6 py-4 font-mono text-xs text-slate-300">{rev.model}</td>
                <td className="px-6 py-4 font-mono text-xs">
                  <div className="text-slate-200">{(rev.tokensIn || 0) + (rev.tokensOut || 0)} tokens</div>
                  <div className="text-slate-400">${Number(rev.costUsd || 0).toFixed(4)}</div>
                </td>
                <td className="px-6 py-4 text-xs text-slate-400 max-w-xs truncate">
                  {rev.summary || 'Processing review...'}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onSelectReview(rev.id)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded-lg text-xs font-medium border border-indigo-500/30 transition-colors"
                  >
                    <span>Inspect</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

