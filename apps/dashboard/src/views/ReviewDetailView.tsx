import React, { useState, useEffect } from 'react';
import { api, type Review, type Finding } from '../api.js';
import { ArrowLeft, ThumbsUp, ThumbsDown, ShieldAlert, Bug, Code, Layers, CheckCircle2 } from 'lucide-react';

interface ReviewDetailViewProps {
  reviewId: string;
  onBack: () => void;
}

export const ReviewDetailView: React.FC<ReviewDetailViewProps> = ({ reviewId, onBack }) => {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, number>>({});
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  useEffect(() => {
    load();
  }, [reviewId]);

  const load = async () => {
    setLoading(true);
    const data = await api.getReview(reviewId);
    setReview(data);
    setLoading(false);
  };

  const handleFeedback = async (findingId: string, value: 1 | -1) => {
    await api.sendFeedback(findingId, value);
    setFeedbackSent(prev => ({ ...prev, [findingId]: value }));
  };

  const getSeverityBadge = (sev: Finding['severity']) => {
    switch (sev) {
      case 'critical':
        return <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">CRITICAL</span>;
      case 'high':
        return <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">HIGH</span>;
      case 'medium':
        return <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">MEDIUM</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">{sev.toUpperCase()}</span>;
    }
  };

  if (loading || !review) {
    return <div className="text-center py-16 text-slate-400">Loading review details...</div>;
  }

  const findings = review.findings || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Reviews</span>
        </button>

        <button
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            showDebugPanel
              ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{showDebugPanel ? 'Hide RAG Context Debug' : 'Show RAG Context Debug'}</span>
        </button>
      </div>

      {/* Review Header Banner */}
      <div className="border border-slate-800 bg-slate-900/60 rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Review for Pull Request #{review.prNumber}</h1>
            <p className="text-xs text-slate-400 font-mono mt-1">Commit SHA: {review.headSha}</p>
          </div>
          <div className="text-right font-mono text-xs text-slate-400">
            <div>Model: <span className="text-slate-200">{review.model}</span></div>
            <div>Cost: <span className="text-slate-200">${Number(review.costUsd || 0).toFixed(4)}</span></div>
          </div>
        </div>

        {review.summary && (
          <div className="mt-4 p-4 bg-slate-950/60 border border-slate-800/80 rounded-lg text-sm text-slate-300">
            <h4 className="text-xs uppercase font-mono text-slate-400 font-semibold mb-2">Executive Summary</h4>
            <p className="whitespace-pre-line leading-relaxed">{review.summary}</p>
          </div>
        )}
      </div>

      {/* RAG Context Debug Panel (Spec page 20) */}
      {showDebugPanel && (
        <div className="border border-indigo-900/50 bg-indigo-950/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-indigo-400 text-sm font-semibold">
            <Layers className="w-4 h-4" />
            <span>Retrieved RAG Context Chunks & Call Graph</span>
          </div>
          <div className="text-xs text-slate-400 leading-relaxed">
            Chunks retrieved across semantic search and keyword index using Reciprocal Rank Fusion (RRF):
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-indigo-400 font-semibold mb-1">Source: Call Graph (Callees & Callers)</div>
              <div className="text-slate-400">authService.verifySession() → token.validate() [lines 40-52]</div>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-indigo-400 font-semibold mb-1">Source: Semantic Vector Search (Cosine Sim 0.89)</div>
              <div className="text-slate-400">db/client.ts → query() with parameter substitution [lines 12-28]</div>
            </div>
          </div>
        </div>
      )}

      {/* Findings List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
          <ShieldAlert className="w-5 h-5 text-indigo-400" />
          <span>Inline Findings ({findings.length})</span>
        </h2>

        {findings.length === 0 ? (
          <div className="p-8 text-center border border-slate-800 bg-slate-900/40 rounded-xl text-slate-400 text-sm">
            No issues found! All checks and specialist agents passed cleanly.
          </div>
        ) : (
          findings.map((f) => {
            const currentFeedback = feedbackSent[f.id];
            return (
              <div key={f.id} className="border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2.5">
                      {getSeverityBadge(f.severity)}
                      <h3 className="font-semibold text-slate-100 text-base">{f.title}</h3>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      <span>{f.file}</span>
                      <span className="text-indigo-400 ml-1">L{f.lineStart}:{f.lineEnd}</span>
                      <span className="mx-2">•</span>
                      <span>Agent: <strong className="text-slate-300">{f.agent}</strong></span>
                      <span className="mx-2">•</span>
                      <span>Confidence: {(f.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* Feedback Buttons (Thumbs up / Thumbs down) */}
                  <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => handleFeedback(f.id, 1)}
                      className={`p-1.5 rounded transition-colors ${
                        currentFeedback === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Helpful finding"
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleFeedback(f.id, -1)}
                      className={`p-1.5 rounded transition-colors ${
                        currentFeedback === -1 ? 'bg-rose-500/20 text-rose-400' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Unhelpful finding (tunes future threshold)"
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">{f.message}</p>

                {f.evidence && (
                  <div className="text-xs bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 font-mono text-slate-300">
                    <div className="text-slate-400 text-xs font-semibold uppercase mb-1">Code Evidence:</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap">{f.evidence}</pre>
                  </div>
                )}

                {f.suggestion && (
                  <div className="text-xs bg-indigo-950/20 p-3 rounded-lg border border-indigo-900/40 font-mono">
                    <div className="text-indigo-400 text-xs font-semibold uppercase mb-1">Suggested Fix (```suggestion):</div>
                    <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap">{f.suggestion}</pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

