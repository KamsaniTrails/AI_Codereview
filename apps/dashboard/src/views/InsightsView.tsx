import React, { useState, useEffect } from 'react';
import { api, type InsightsData } from '../api.js';
import { BarChart2, TrendingUp, CheckCircle, Clock, DollarSign, AlertTriangle } from 'lucide-react';

export const InsightsView: React.FC = () => {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const res = await api.getInsights();
    setData(res);
    setLoading(false);
  };

  if (loading || !data) {
    return <div className="text-center py-16 text-slate-400">Loading insights metrics...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Review Insights & Feedback Loop</h1>
        <p className="text-sm text-slate-400">Quantitative metrics measuring review acceptance, latency, cost, and category noise.</p>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-800 bg-slate-900/60 p-5 rounded-xl shadow-sm space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase">
            <span>Acceptance Rate</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100">{(data.acceptanceRate * 100).toFixed(0)}%</div>
          <div className="text-xs text-emerald-400 font-medium">+4% from user feedback loop</div>
        </div>

        <div className="border border-slate-800 bg-slate-900/60 p-5 rounded-xl shadow-sm space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase">
            <span>Avg Review Duration</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100">{data.avgReviewDurationSec}s</div>
          <div className="text-xs text-slate-400">Target p95 &lt; 30s</div>
        </div>

        <div className="border border-slate-800 bg-slate-900/60 p-5 rounded-xl shadow-sm space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase">
            <span>Avg Cost / Review</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100">${data.avgCostPerReviewUsd.toFixed(4)}</div>
          <div className="text-xs text-slate-400">Under $0.01 per review</div>
        </div>

        <div className="border border-slate-800 bg-slate-900/60 p-5 rounded-xl shadow-sm space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase">
            <span>Total Reviews</span>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100">{data.totalReviews}</div>
          <div className="text-xs text-slate-400">{data.completedReviews} successfully finished</div>
        </div>
      </div>

      {/* Findings Breakdown by Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-slate-800 bg-slate-900/60 p-6 rounded-xl space-y-4">
          <h3 className="font-semibold text-slate-200 text-base flex items-center space-x-2">
            <BarChart2 className="w-5 h-5 text-indigo-400" />
            <span>Findings by Category</span>
          </h3>
          <div className="space-y-3">
            {Object.entries(data.findingsByCategory).map(([cat, count]) => {
              const total = Object.values(data.findingsByCategory).reduce((a, b) => a + b, 0);
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-300 font-mono capitalize">
                    <span>{cat}</span>
                    <span>{count} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Noisiest Categories & Feedback Tuning */}
        <div className="border border-slate-800 bg-slate-900/60 p-6 rounded-xl space-y-4">
          <h3 className="font-semibold text-slate-200 text-base flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Noisiest Categories (Adaptive Thresholding)</span>
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            When users downvote findings in a category (&lt;30% acceptance), the platform automatically raises that category's confidence threshold to keep reviews quiet.
          </p>

          <div className="space-y-3 pt-2">
            {data.noisiestCategories.map((item) => (
              <div key={item.category} className="flex justify-between items-center p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
                <span className="text-sm font-semibold capitalize text-slate-200">{item.category}</span>
                <span className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full font-mono border border-amber-500/20">
                  {item.unhelpfulCount} downvotes (threshold bumped +15%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

