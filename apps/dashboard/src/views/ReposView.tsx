import React, { useState, useEffect, useRef } from 'react';
import { api, type Repo } from '../api.js';
import {
  RefreshCw,
  Database,
  GitBranch,
  GitCommit,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ExternalLink,
  Plus
} from 'lucide-react';

export const ReposView: React.FC = () => {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  const appSlug = (import.meta as any).env?.VITE_GITHUB_APP_SLUG || 'ai-code-reviewer-app';
  const addRepoUrl = `https://github.com/apps/${appSlug}/installations/new`;

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadRepos = async (isBackgroundPoll = false) => {
    if (!isBackgroundPoll) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await api.getRepos();
      setRepos(data);
      setError(null);
    } catch (err: any) {
      if (!isBackgroundPoll) {
        setError(err.message || 'Failed to load repositories');
      }
    } finally {
      if (!isBackgroundPoll) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadRepos();
  }, []);

  // Poll every 5 seconds while any repo is in PENDING or INDEXING state
  useEffect(() => {
    const hasActiveJobs = repos.some((r) => {
      const st = r.indexStatus?.toUpperCase();
      return st === 'PENDING' || st === 'INDEXING';
    });

    if (hasActiveJobs) {
      pollTimerRef.current = setInterval(() => {
        loadRepos(true);
      }, 5000);
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [repos]);

  const handleReindex = async (repoId: string) => {
    setActionInProgressId(repoId);
    try {
      await api.reindexRepo(repoId);
      await loadRepos(true);
    } catch (err: any) {
      setError(err.message || 'Reindexing failed');
    } finally {
      setActionInProgressId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toUpperCase();
    switch (s) {
      case 'INDEXED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>INDEXED</span>
          </span>
        );
      case 'INDEXING':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>INDEXING</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>FAILED</span>
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Clock className="w-3.5 h-3.5" />
            <span>PENDING</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Add Repository Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Installed Repositories</h1>
          <p className="text-sm text-slate-400">
            Repositories authorized through GitHub App with vector index status.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => loadRepos()}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>

          <a
            href={addRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add repository</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70 ml-0.5" />
          </a>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl border border-rose-800/80 bg-rose-950/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadRepos()}
            className="text-xs font-semibold text-rose-200 underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm">Loading installed repositories from database...</p>
        </div>
      ) : repos.length === 0 ? (
        /* Empty state */
        <div className="border border-slate-800 bg-slate-900/40 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-4">
          <div className="w-14 h-14 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/20">
            <Database className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-200">No repositories connected yet</h3>
            <p className="text-sm text-slate-400">
              Install our GitHub App to authorize repositories and enable automated AI code reviews with AST vector indexing.
            </p>
          </div>
          <div className="pt-2">
            <a
              href={addRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add repository</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          </div>
        </div>
      ) : (
        /* Repositories Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repos.map((repo) => {
            const isActing = actionInProgressId === repo.id;
            const statusUpper = repo.indexStatus?.toUpperCase();
            const isIndexing = statusUpper === 'INDEXING';
            const isFailed = statusUpper === 'FAILED';

            return (
              <div
                key={repo.id}
                className="border border-slate-800 bg-slate-900/60 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="p-2.5 bg-slate-800 rounded-lg text-indigo-400 flex-shrink-0">
                        <Database className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-100 truncate">{repo.fullName}</h3>
                        <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                          <span className="flex items-center space-x-1">
                            <GitBranch className="w-3.5 h-3.5" />
                            <span>{repo.defaultBranch || 'main'}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <GitCommit className="w-3.5 h-3.5" />
                            <span>{repo.lastIndexedSha?.slice(0, 7) || 'Unindexed'}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0">{getStatusBadge(repo.indexStatus)}</div>
                  </div>

                  {/* Failure Error Banner */}
                  {isFailed && repo.indexError && (
                    <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg p-2.5 space-y-1">
                      <div className="font-semibold text-rose-400 flex items-center space-x-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Indexing Error:</span>
                      </div>
                      <p className="font-mono text-[11px] break-all leading-tight">{repo.indexError}</p>
                    </div>
                  )}
                </div>

                {/* Footer with Active Agents and Re-index / Retry Button */}
                <div className="text-xs text-slate-400 border-t border-slate-800/80 pt-3 flex justify-between items-center">
                  <div className="truncate max-w-[60%]">
                    Active agents:{' '}
                    <span className="text-slate-300 font-mono">
                      {(repo.activeAgents || repo.settings?.enabledAgents || ['bug', 'security', 'quality', 'test']).join(
                        ', '
                      )}
                    </span>
                  </div>

                  <button
                    disabled={isActing || isIndexing}
                    onClick={() => handleReindex(repo.id)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isFailed
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isActing || isIndexing ? 'animate-spin' : ''}`} />
                    <span>{isActing || isIndexing ? 'Indexing...' : isFailed ? 'Retry' : 'Re-index'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
