'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic2, Lock } from 'lucide-react';
import { login } from '@/lib/supabase-admin';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (login(password)) {
      router.push('/admin');
    } else {
      setError('密碼錯誤');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#fff0f5] via-[#f0f8ff] to-[#e6e6fa]">
      <div className="w-full max-w-md">
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-gradient-to-tr from-pink-400 to-blue-400 rounded-xl text-white shadow-lg shadow-pink-200">
              <Mic2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500">
                MizukiPrism
              </h1>
              <p className="text-sm text-slate-500">策展人管理介面</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-700">登入</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-600 mb-1.5">
                密碼
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="輸入密碼"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none transition-all bg-white text-slate-700 placeholder-slate-400"
                data-testid="password-input"
              />
            </div>

            {error && (
              <div
                className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm"
                data-testid="login-error"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-pink-400 to-blue-400 text-white font-semibold shadow-lg shadow-pink-200 hover:shadow-pink-300 hover:brightness-105 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="login-button"
            >
              {loading ? '登入中...' : '登入'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center">
              此介面僅供授權的策展人使用
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
