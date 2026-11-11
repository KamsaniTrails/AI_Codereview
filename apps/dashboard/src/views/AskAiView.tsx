import React, { useState, useEffect, useRef } from 'react';
import { api, type Repo } from '../api.js';
import {
  Bot,
  Send,
  Sparkles,
  FileCode,
  ShieldCheck,
  Database,
  RefreshCw,
  ArrowRight,
  MessageSquare,
  CheckCircle2,
  GitPullRequest
} from 'lucide-react';

interface AskAiViewProps {
  onSelectReview?: (id: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  latestReviewId?: string;
}

export const AskAiView: React.FC<AskAiViewProps> = ({ onSelectReview }) => {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('KamsaniTrails/AI_Interview');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadRepos();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadRepos = async () => {
    try {
      const list = await api.getRepos();
      setRepos(list);
      const activeName = list[0]?.fullName || 'KamsaniTrails/AI_Interview';
      setSelectedRepo(activeName);

      setMessages([
        {
          id: 'welcome',
          sender: 'assistant',
          text: `👋 **హలో! Welcome to the Codebase RAG Chatbox ("Ask AI")!**\n\nActive Repository: **${activeName}**\n\nనేను మీ కోడ్‌బేస్ లోని ప్రతి ఫైల్ మరియు Pull Request ని అర్థం చేసుకొని వివరిస్తాను. మీరు కింద ఉన్న ఆప్షన్స్ క్లిక్ చేయవచ్చు లేదా నేరుగా అడగవచ్చు:\n- 📄 **"Explain the files in this repository"**\n- 🇮🇳 **"తెలుగులో వివరించు (Explain in Telugu)"**\n- 🛡️ **"Check for security vulnerabilities"**\n- 🧪 **"Generate automated unit tests"**`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch {
      setMessages([
        {
          id: 'welcome',
          sender: 'assistant',
          text: `👋 **Welcome to the Codebase RAG Chatbox ("Ask AI")!**\n\nAsk me to explain files, review changes in Telugu or English, check security issues, or write unit tests.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  };

  const handleSend = async (customText?: string) => {
    const query = customText || input;
    if (!query.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: query.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInput('');
    setLoading(true);

    try {
      const res = await api.sendGlobalChat(userMsg.text, selectedRepo);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: res.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latestReviewId: res.latestReviewId
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ Error contacting RAG Engine: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    { label: '📄 Explain this repo & files', query: 'Explain the files and architecture in this repository' },
    { label: '🇮🇳 తెలుగులో వివరించు', query: 'ఈ ప్రాజెక్ట్ మరియు ఫైల్స్ గురించి తెలుగులో వివరించు' },
    { label: '🛡️ Security Audit', query: 'Are there any security vulnerabilities or leaked secrets?' },
    { label: '🧪 Write Unit Tests', query: 'Generate unit tests for this repository' },
    { label: '🚀 What changed in PR #1?', query: 'Explain the changes made in PR #1' }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-emerald-950/40 border border-indigo-500/30 rounded-2xl p-6 shadow-md">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Bot className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-slate-100">Codebase RAG Assistant ("Ask AI")</h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>RAG Vector Index Ready</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Ask questions about any file, pull request diff, security findings, or request explanations in Telugu / English.
            </p>
          </div>
        </div>

        {/* Repository Picker */}
        <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2">
          <Database className="w-4 h-4 text-indigo-400" />
          <span className="text-xs text-slate-400 font-medium">Repo:</span>
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer"
          >
            {repos.length > 0 ? (
              repos.map((r) => (
                <option key={r.id} value={r.fullName} className="bg-slate-900">
                  {r.fullName}
                </option>
              ))
            ) : (
              <option value="KamsaniTrails/AI_Interview" className="bg-slate-900">
                KamsaniTrails/AI_Interview
              </option>
            )}
          </select>
        </div>
      </div>

      {/* Main Chat Container */}
      <div className="border border-slate-800 bg-slate-900/70 rounded-2xl overflow-hidden flex flex-col h-[580px] shadow-xl">
        {/* Quick Prompts Bar */}
        <div className="px-5 py-3.5 bg-slate-950/70 border-b border-slate-800 flex items-center space-x-2 overflow-x-auto">
          <span className="text-xs text-slate-400 font-semibold flex items-center space-x-1 whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Quick Prompts:</span>
          </span>
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qp.query)}
              disabled={loading}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800 hover:bg-indigo-600/30 text-slate-200 hover:text-indigo-200 border border-slate-700 hover:border-indigo-500/50 transition-all whitespace-nowrap disabled:opacity-50"
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start space-x-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-emerald-400" />
                </div>
              )}

              <div className="space-y-2 max-w-[82%]">
                <div
                  className={`rounded-2xl px-5 py-3.5 text-xs sm:text-sm leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none shadow-md'
                      : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  <div className="whitespace-pre-line font-sans">{m.text}</div>
                  <div
                    className={`text-[10px] mt-2 font-mono ${
                      m.sender === 'user' ? 'text-indigo-200 text-right' : 'text-slate-500'
                    }`}
                  >
                    {m.timestamp}
                  </div>
                </div>

                {m.latestReviewId && onSelectReview && (
                  <button
                    onClick={() => onSelectReview(m.latestReviewId!)}
                    className="inline-flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium pl-1 transition-colors"
                  >
                    <GitPullRequest className="w-3.5 h-3.5" />
                    <span>Open Unified Diff & Inline Suggestions for this PR</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {m.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1 text-white text-xs font-bold shadow">
                  You
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center space-x-3 text-slate-400 text-xs">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-emerald-400 animate-spin" />
              </div>
              <div className="bg-slate-950 border border-slate-800 px-4 py-2.5 rounded-xl flex items-center space-x-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                <span className="font-mono text-slate-300">Searching codebase RAG embeddings & generating answer...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center space-x-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI anything: 'Explain README.md', 'తెలుగులో వివరించు', 'Check security issues'..."
            disabled={loading}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition-all shadow-lg shadow-indigo-500/20"
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
