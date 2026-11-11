import React, { useState, useEffect } from 'react';
import { api, type Repo } from '../api.js';
import { Sliders, Save, CheckCircle2 } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [settings, setSettings] = useState<Repo['settings']>({
    confidenceThreshold: 0.60,
    enabledAgents: ['bug', 'security', 'quality', 'test'],
    ignoreGlobs: ['**/node_modules/**', '**/dist/**'],
    maxComments: 10,
    reviewDrafts: false
  });
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const data = await api.getRepos();
    setRepos(data);
    if (data.length > 0) {
      setSelectedRepoId(data[0].id);
      setSettings(data[0].settings);
    }
  };

  const handleRepoSelect = (repoId: string) => {
    setSelectedRepoId(repoId);
    const found = repos.find(r => r.id === repoId);
    if (found) {
      setSettings(found.settings);
    }
  };

  const handleToggleAgent = (agent: string) => {
    setSettings(prev => {
      const exists = prev.enabledAgents.includes(agent);
      return {
        ...prev,
        enabledAgents: exists
          ? prev.enabledAgents.filter(a => a !== agent)
          : [...prev.enabledAgents, agent]
      };
    });
  };

  const handleSave = async () => {
    if (!selectedRepoId) return;
    await api.updateRepoSettings(selectedRepoId, settings);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Review Policy Settings</h1>
        <p className="text-sm text-slate-400">Configure thresholds, active specialist agents, and ignore patterns per repository.</p>
      </div>

      <div className="flex items-center space-x-3">
        <label className="text-sm text-slate-300 font-medium">Repository:</label>
        <select
          value={selectedRepoId}
          onChange={(e) => handleRepoSelect(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
        >
          {repos.map(r => (
            <option key={r.id} value={r.id}>{r.fullName}</option>
          ))}
        </select>
      </div>

      <div className="border border-slate-800 bg-slate-900/60 rounded-xl p-6 space-y-6 shadow-sm">
        {/* Confidence Threshold Slider */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-slate-200">Confidence Threshold</label>
            <span className="text-sm font-mono text-indigo-400 font-bold">
              {(settings.confidenceThreshold * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs text-slate-400">Findings with confidence below this threshold are suppressed to prevent noisy comments.</p>
          <input
            type="range"
            min="0.30"
            max="0.95"
            step="0.05"
            value={settings.confidenceThreshold}
            onChange={(e) => setSettings({ ...settings, confidenceThreshold: parseFloat(e.target.value) })}
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>

        {/* Enabled Specialist Agents */}
        <div className="space-y-3 pt-4 border-t border-slate-800">
          <label className="text-sm font-semibold text-slate-200">Active Specialist Agents</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'bug', label: 'Bug Agent (Logic, Nulls, Off-by-one, Awaits)' },
              { id: 'security', label: 'Security Agent (SQL Injection, Secrets, Auth)' },
              { id: 'quality', label: 'Quality Agent (Readability, Naming, Style)' },
              { id: 'test', label: 'Test Agent (Coverage Gaps & Proposed Tests)' }
            ].map(agent => (
              <label key={agent.id} className="flex items-center space-x-3 p-3 bg-slate-950/60 border border-slate-800 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enabledAgents.includes(agent.id)}
                  onChange={() => handleToggleAgent(agent.id)}
                  className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <span className="text-xs text-slate-300 font-medium">{agent.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Max Inline Comments Cap */}
        <div className="space-y-2 pt-4 border-t border-slate-800">
          <label className="text-sm font-semibold text-slate-200">Maximum Inline Comments per PR</label>
          <p className="text-xs text-slate-400">Caps inline PR comments. Critical findings are always displayed.</p>
          <input
            type="number"
            min="1"
            max="50"
            value={settings.maxComments}
            onChange={(e) => setSettings({ ...settings, maxComments: parseInt(e.target.value, 10) || 10 })}
            className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 font-mono"
          />
        </div>

        {/* Review Draft PRs */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-200">Review Draft Pull Requests</div>
            <div className="text-xs text-slate-400">When disabled, draft PRs will be skipped until marked ready for review.</div>
          </div>
          <input
            type="checkbox"
            checked={settings.reviewDrafts}
            onChange={(e) => setSettings({ ...settings, reviewDrafts: e.target.checked })}
            className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700 w-5 h-5 cursor-pointer"
          />
        </div>

        {/* Save Button */}
        <div className="pt-4 flex items-center space-x-3">
          <button
            onClick={handleSave}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
          {savedSuccess && (
            <span className="flex items-center space-x-1.5 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>Saved successfully!</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

