// app/admin/deploy/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  GitCommit,
  GitBranch,
  CloudUpload,
  Check,
  AlertCircle,
  Loader2,
  FileJson,
  Plus,
  Minus,
} from 'lucide-react';

interface GitStatus {
  status: string;
  path: string;
}

export default function DeployPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GitStatus[]>([]);
  const [diff, setDiff] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/deploy');
      const data = await res.json();
      if (res.ok) {
        setStatus(data.status);
        setDiff(data.diff);
        setHasChanges(data.hasChanges);
        
        // Auto-generate commit message if changes exist and message is empty
        if (data.hasChanges && !commitMessage) {
          setCommitMessage(`feat: update song catalog (${new Date().toLocaleDateString('zh-TW')})`);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [commitMessage]);

  useEffect(() => {
    fetch('/api/auth/check', { method: 'POST' })
      .then((res) => {
        if (!res.ok) router.replace('/admin/login');
        else {
          setAuthenticated(true);
          fetchStatus();
        }
      });
  }, [router, fetchStatus]);

  async function handleDeploy() {
    if (!commitMessage || isDeploying) return;
    
    setIsDeploying(true);
    setError(null);
    setResult(null);
    
    try {
      const res = await fetch('/api/admin/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: commitMessage,
          push: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult('發布成功！更改已提交並推送到 GitHub。');
        setCommitMessage('');
        fetchStatus();
      } else {
        throw new Error(data.output || '發布失敗');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsDeploying(false);
    }
  }

  if (!authenticated || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/admin')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-slate-800">發布更改</h1>
        </div>

        {/* Status result */}
        {result && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3 text-green-700 shadow-sm">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium">{result}</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 shadow-sm">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold mb-1">發生錯誤</p>
              <pre className="text-xs bg-black/5 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">{error}</pre>
            </div>
          </div>
        )}

        {!hasChanges && !result && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <Check className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">一切就緒</h2>
            <p className="text-slate-500">目前沒有待發布的資料更改。</p>
            <button
              onClick={() => router.push('/admin')}
              className="mt-6 px-6 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all font-medium"
            >
              返回管理面板
            </button>
          </div>
        )}

        {hasChanges && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Col: Commit Form */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <GitCommit size={18} className="text-pink-500" />
                  提交更改
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1 tracking-wider">
                      提交訊息
                    </label>
                    <textarea
                      value={commitMessage}
                      onChange={e => setCommitMessage(e.target.value)}
                      placeholder="例如：feat: 新增 2026-02-28 歌回資料"
                      rows={4}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-300 text-sm"
                    />
                  </div>
                  <button
                    onClick={handleDeploy}
                    disabled={!commitMessage || isDeploying}
                    className="w-full py-3 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-xl font-bold shadow-lg shadow-pink-100 hover:brightness-105 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isDeploying ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        發布中...
                      </>
                    ) : (
                      <>
                        <CloudUpload size={18} />
                        確認發布
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-center text-slate-400">
                    這將會執行 `git commit` 並 `git push` 到遠端儲存庫。
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <GitBranch size={18} className="text-blue-500" />
                  變更檔案 ({status.length})
                </h2>
                <div className="space-y-2">
                  {status.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm p-2 hover:bg-slate-50 rounded-lg">
                      <span className={`w-6 text-center font-mono font-bold text-xs ${
                        f.status === 'M' ? 'text-blue-500' : f.status === 'A' ? 'text-green-500' : 'text-slate-400'
                      }`}>
                        {f.status}
                      </span>
                      <FileJson size={14} className="text-slate-400" />
                      <span className="text-slate-600 truncate">{f.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Col: Diff Preview */}
            <div className="lg:col-span-2">
              <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full min-h-[500px]">
                <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                    Git Diff Preview
                  </span>
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-auto font-mono text-xs leading-relaxed">
                  {diff ? (
                    diff.split('\n').map((line, i) => {
                      const color = line.startsWith('+') ? 'text-emerald-400' : 
                                   line.startsWith('-') ? 'text-rose-400' : 
                                   line.startsWith('@@') ? 'text-cyan-400' : 'text-slate-400';
                      const bg = line.startsWith('+') ? 'bg-emerald-400/10' : 
                                line.startsWith('-') ? 'bg-rose-400/10' : '';
                      return (
                        <div key={i} className={`${color} ${bg} px-1 -mx-1`}>
                          {line}
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-slate-600 italic">無差異內容可顯示</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
