import React, { useState, useEffect, useRef } from 'react';
import {
  api,
  type Review,
  type Finding,
  type DiffFile,
  type DiffLine
} from '../api.js';
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  ShieldAlert,
  Bug,
  Code,
  Layers,
  CheckCircle2,
  MessageSquare,
  Send,
  Bot,
  Sparkles,
  Copy,
  Check,
  FileCode,
  CornerDownRight,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  FileText
} from 'lucide-react';

interface ReviewDetailViewProps {
  reviewId: string;
  initialTab?: 'diff' | 'chat' | 'findings' | 'debug';
  onBack: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export const ReviewDetailView: React.FC<ReviewDetailViewProps> = ({
  reviewId,
  initialTab = 'diff',
  onBack
}) => {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'diff' | 'chat' | 'findings' | 'debug'>(initialTab);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, number>>({});
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  // Chatbot state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    load();
  }, [reviewId]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getReview(reviewId);
      setReview(data);

      // Initialize welcome chat message
      if (data) {
        const repoName = data.repoFullName || 'Repository';
        setChatMessages([
          {
            id: 'msg-welcome',
            sender: 'assistant',
            text: `👋 **హలో! Welcome to the Codebase RAG Assistant** for **${repoName}** (PR #${data.prNumber}).\n\nI have indexed the files, PR diffs, and specialist agent findings. You can ask me to:\n- 📄 **Explain any file or diff change** in simple terms\n- 🛡️ **Scan for security or edge-case risks**\n- 🧪 **Generate unit tests** for modified functions\n- 🇮🇳 **Explain in Telugu (తెలుగులో వివరణ)**`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (findingId: string, value: 1 | -1) => {
    await api.sendFeedback(findingId, value);
    setFeedbackSent((prev) => ({ ...prev, [findingId]: value }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippetId(id);
    setTimeout(() => setCopiedSnippetId(null), 2500);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || chatInput;
    if (!text.trim() || chatLoading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setChatInput('');
    setChatLoading(true);

    try {
      const response = await api.sendReviewChat(reviewId, userMsg.text);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: response.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ **Error communicating with RAG agent:** ${err.message || 'Server timeout'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const getSeverityBadge = (sev: Finding['severity']) => {
    switch (sev) {
      case 'critical':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            CRITICAL
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            HIGH
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            {sev.toUpperCase()}
          </span>
        );
    }
  };

  if (loading || !review) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-slate-400 text-sm font-medium">Loading pull request review details...</div>
      </div>
    );
  }

  const findings = review.findings || [];
  const diffFiles: DiffFile[] = review.diffFiles && review.diffFiles.length > 0
    ? review.diffFiles
    : [
        {
          filename: findings[0]?.file || 'README.md',
          status: 'modified',
          additions: 1,
          deletions: 0,
          lines: [
            { type: 'header', lineNum: null, content: '@@ -0,0 +1,1 @@' },
            { type: 'added', lineNum: 1, content: findings[0]?.evidence || '# AI_Interview' }
          ]
        }
      ];

  const quickPrompts = [
    { label: '📄 Explain this file', prompt: 'Explain the purpose and changes of this file' },
    { label: '🛡️ Security Analysis', prompt: 'Are there any security vulnerabilities or leaked secrets?' },
    { label: '🧪 Generate Unit Test', prompt: 'Suggest automated unit tests for this PR' },
    { label: '🇮🇳 తెలుగులో వివరించు', prompt: 'ఈ ఫైల్ లో ఏం మార్పులు చేసారో తెలుగులో వివరంగా చెప్పు' },
    { label: '🚀 Code Quality Tips', prompt: 'How can this code be improved for production quality?' }
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-sm text-slate-400 hover:text-slate-200 transition-colors bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Reviews</span>
        </button>

        <div className="flex items-center space-x-2">
          {review.repoFullName && (
            <a
              href={`https://github.com/${review.repoFullName}/pull/${review.prNumber}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors"
            >
              <span>View on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          )}
        </div>
      </div>

      {/* PR Summary Card */}
      <div className="border border-slate-800 bg-slate-900/70 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-slate-100">
                PR #{review.prNumber}: {review.summary?.split('\n')[0] || `Pull Request Review`}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                {review.status}
              </span>
            </div>
            <div className="flex items-center space-x-3 text-xs text-slate-400 font-mono mt-1.5">
              <span>Repo: <strong className="text-slate-300">{review.repoFullName || 'Connected Repo'}</strong></span>
              <span>•</span>
              <span>Commit: <strong className="text-slate-300">{review.headSha?.slice(0, 7) || 'HEAD'}</strong></span>
            </div>
          </div>

          <div className="flex items-center space-x-4 bg-slate-950/80 px-4 py-2 rounded-lg border border-slate-800 font-mono text-xs">
            <div>
              <span className="text-slate-500 block">AI Model</span>
              <span className="text-indigo-400 font-semibold">{review.model}</span>
            </div>
            <div className="border-l border-slate-800 pl-4">
              <span className="text-slate-500 block">Findings</span>
              <span className="text-amber-400 font-semibold">{findings.length} Flagged</span>
            </div>
            <div className="border-l border-slate-800 pl-4">
              <span className="text-slate-500 block">Est. Cost</span>
              <span className="text-slate-200 font-semibold">${Number(review.costUsd || 0).toFixed(4)}</span>
            </div>
          </div>
        </div>

        {review.summary && (
          <div className="mt-4 p-4 bg-slate-950/60 border border-slate-800/80 rounded-lg text-sm text-slate-300">
            <h4 className="text-xs uppercase font-mono text-slate-400 font-semibold mb-1.5 flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Executive Multi-Agent Summary</span>
            </h4>
            <p className="whitespace-pre-line leading-relaxed text-slate-300">{review.summary}</p>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-800 flex space-x-2">
        <button
          onClick={() => setActiveTab('diff')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'diff'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          } rounded-t-lg`}
        >
          <Code className="w-4 h-4" />
          <span>Unified Code Diff & Inline Comments</span>
          {findings.length > 0 && (
            <span className="ml-1.5 px-2 py-0.2 rounded-full text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {findings.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'chat'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          } rounded-t-lg`}
        >
          <Bot className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>🤖 Codebase RAG Chat ("Ask AI")</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Interactive
          </span>
        </button>

        <button
          onClick={() => setActiveTab('findings')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'findings'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          } rounded-t-lg`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Findings Overview ({findings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('debug')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'debug'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          } rounded-t-lg`}
        >
          <Layers className="w-4 h-4" />
          <span>RAG Call Graph</span>
        </button>
      </div>

      {/* TAB 1: Unified Code Diff with Inline Comments */}
      {activeTab === 'diff' && (
        <div className="space-y-6">
          <div className="bg-indigo-950/30 border border-indigo-900/50 p-4 rounded-xl flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>
                <strong>Unified Diff View:</strong> Code changes are shown line-by-line. AI findings and actionable{' '}
                <code className="text-emerald-300 font-mono bg-slate-900 px-1 py-0.5 rounded">```suggestion</code> blocks are anchored directly beneath the affected line.
              </span>
            </div>
          </div>

          {diffFiles.map((file, fileIdx) => {
            return (
              <div
                key={file.filename || fileIdx}
                className="border border-slate-800 bg-slate-900/70 rounded-xl overflow-hidden shadow-sm"
              >
                {/* File Header */}
                <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-mono text-xs text-slate-200">
                    <FileCode className="w-4 h-4 text-indigo-400" />
                    <span className="font-semibold">{file.filename}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase text-[10px]">
                      {file.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 font-mono text-xs">
                    <span className="text-emerald-400 font-semibold">+{file.additions}</span>
                    <span className="text-rose-400 font-semibold">-{file.deletions}</span>
                  </div>
                </div>

                {/* Diff Lines Table */}
                <div className="divide-y divide-slate-800/50 font-mono text-xs">
                  {file.lines.map((line, lineIndex) => {
                    const isAdded = line.type === 'added' || line.content.startsWith('+');
                    const isRemoved = line.type === 'removed' || line.content.startsWith('-');
                    const isHeader = line.type === 'header' || line.content.startsWith('@@');

                    // Check if any finding belongs to this line
                    const lineFindings = findings.filter(
                      (f) =>
                        f.file === file.filename &&
                        (line.lineNum === f.lineStart || (lineIndex === 1 && f.lineStart === 1))
                    );

                    return (
                      <React.Fragment key={lineIndex}>
                        <div
                          className={`flex items-start transition-colors ${
                            isHeader
                              ? 'bg-slate-800/60 text-slate-400 py-1 px-4 select-none'
                              : isAdded
                              ? 'bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/30'
                              : isRemoved
                              ? 'bg-rose-950/20 text-rose-300 hover:bg-rose-950/30'
                              : 'bg-slate-900/30 text-slate-300 hover:bg-slate-900/50'
                          }`}
                        >
                          {/* Line Number */}
                          <div className="w-12 py-1 px-2 text-right text-slate-600 select-none border-r border-slate-800/70 font-mono text-[11px]">
                            {line.lineNum ?? ''}
                          </div>

                          {/* Sign Indicator */}
                          <div className="w-6 py-1 text-center font-bold select-none text-slate-500">
                            {isAdded ? '+' : isRemoved ? '-' : isHeader ? ' ' : ' '}
                          </div>

                          {/* Line Content */}
                          <div className="flex-1 py-1 px-2 whitespace-pre overflow-x-auto text-slate-200 font-mono">
                            {line.content.replace(/^[+-]/, '') || line.content}
                          </div>
                        </div>

                        {/* Anchored Inline Finding & Suggestion Block */}
                        {lineFindings.map((finding) => {
                          const currentFeedback = feedbackSent[finding.id];
                          const hasCopied = copiedSnippetId === finding.id;

                          return (
                            <div
                              key={finding.id}
                              className="bg-slate-950 border-y-2 border-indigo-500/70 p-4 pl-16 space-y-3 shadow-inner"
                            >
                              {/* Finding Header */}
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-2.5">
                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                                      🤖 {finding.agent}
                                    </span>
                                    {getSeverityBadge(finding.severity)}
                                    <h4 className="font-semibold text-slate-100 text-sm">{finding.title}</h4>
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    <span>Line {finding.lineStart}:{finding.lineEnd}</span>
                                    <span className="mx-2">•</span>
                                    <span>Confidence: {Math.round((finding.confidence || 0.95) * 100)}%</span>
                                  </div>
                                </div>

                                {/* Feedback Rating Buttons */}
                                <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                                  <button
                                    onClick={() => handleFeedback(finding.id, 1)}
                                    className={`p-1.5 rounded transition-colors ${
                                      currentFeedback === 1
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                    title="Helpful suggestion"
                                  >
                                    <ThumbsUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleFeedback(finding.id, -1)}
                                    className={`p-1.5 rounded transition-colors ${
                                      currentFeedback === -1
                                        ? 'bg-rose-500/20 text-rose-400'
                                        : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                    title="Unhelpful suggestion"
                                  >
                                    <ThumbsDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Finding Message */}
                              <p className="text-xs text-slate-300 leading-relaxed">{finding.message}</p>

                              {/* Actionable GitHub Suggestion Block */}
                              {finding.suggestion && (
                                <div className="border border-emerald-500/40 bg-emerald-950/15 rounded-lg overflow-hidden font-mono">
                                  <div className="bg-emerald-950/50 px-3 py-1.5 border-b border-emerald-500/30 flex items-center justify-between text-xs">
                                    <span className="text-emerald-300 font-semibold flex items-center space-x-1.5">
                                      <CornerDownRight className="w-3.5 h-3.5" />
                                      <span>Suggested change (```suggestion)</span>
                                    </span>
                                    <button
                                      onClick={() => copyToClipboard(finding.suggestion!, finding.id)}
                                      className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors text-[11px]"
                                    >
                                      {hasCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                      <span>{hasCopied ? 'Copied!' : 'Copy Suggestion'}</span>
                                    </button>
                                  </div>
                                  <pre className="p-3 text-emerald-300 text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                    {finding.suggestion}
                                  </pre>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: Interactive RAG Codebase Chatbot ("Ask AI") */}
      {activeTab === 'chat' && (
        <div className="border border-slate-800 bg-slate-900/70 rounded-xl overflow-hidden flex flex-col h-[650px] shadow-sm">
          {/* Chatbot Header */}
          <div className="bg-slate-950/90 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 p-0.5 flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Bot className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Codebase RAG Assistant</h3>
                <p className="text-xs text-slate-400">
                  Full context on <strong className="text-slate-300">{review.repoFullName || 'Repository'}</strong> & PR #{review.prNumber}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>RAG Index Active</span>
            </div>
          </div>

          {/* Quick Action Prompt Chips */}
          <div className="px-5 py-3 bg-slate-950/40 border-b border-slate-800 flex items-center space-x-2 overflow-x-auto">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Suggested:</span>
            {quickPrompts.map((qp, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(qp.prompt)}
                disabled={chatLoading}
                className="px-2.5 py-1 rounded-full text-xs bg-slate-800/80 hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-300 border border-slate-700 hover:border-indigo-500/40 transition-colors whitespace-nowrap flex items-center space-x-1 disabled:opacity-50"
              >
                <span>{qp.label}</span>
              </button>
            ))}
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start space-x-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-indigo-400" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  <div className="whitespace-pre-line font-sans">
                    {msg.text}
                  </div>
                  <div
                    className={`text-[10px] mt-1.5 font-mono ${
                      msg.sender === 'user' ? 'text-indigo-200 text-right' : 'text-slate-500'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1 text-white text-xs font-bold">
                    You
                  </div>
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="flex items-center space-x-3 text-slate-400 text-xs py-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-indigo-400 animate-pulse" />
                </div>
                <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                  <span className="text-slate-400 text-xs ml-1 font-mono">Analyzing codebase RAG chunks...</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center space-x-3"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask anything: 'Explain this file', 'Any security risks?', or 'తెలుగులో వివరించు'..."
              disabled={chatLoading}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatLoading}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: Findings Overview */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-200 flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              <span>All Flagged Issues ({findings.length})</span>
            </h2>
          </div>

          {findings.length === 0 ? (
            <div className="p-8 text-center border border-slate-800 bg-slate-900/40 rounded-xl text-slate-400 text-sm">
              No issues found! All checks and specialist agents passed cleanly.
            </div>
          ) : (
            findings.map((f) => {
              const currentFeedback = feedbackSent[f.id];
              return (
                <div
                  key={f.id}
                  className="border border-slate-800 bg-slate-900/60 rounded-xl p-5 space-y-4 shadow-sm"
                >
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
                        title="Unhelpful finding"
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
                      <div className="text-indigo-400 text-xs font-semibold uppercase mb-1">
                        Suggested Fix (```suggestion):
                      </div>
                      <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap">{f.suggestion}</pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: RAG Context & Call Graph Debug */}
      {activeTab === 'debug' && (
        <div className="border border-indigo-900/50 bg-indigo-950/20 rounded-xl p-5 space-y-4">
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
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-indigo-400 font-semibold mb-1">Target Repository Index</div>
              <div className="text-slate-400">{review.repoFullName || 'KamsaniTrails/AI_Interview'} (Sha: {review.headSha?.slice(0, 7)})</div>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-indigo-400 font-semibold mb-1">Active Specialist Agents</div>
              <div className="text-slate-400">QualityAgent, SecurityAgent, BugAgent, TestAgent</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
