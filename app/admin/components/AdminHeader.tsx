'use client';

import { useRouter } from 'next/navigation';
import { Mic2, ImageIcon, Clock, CloudUpload, LogOut } from 'lucide-react';
import { logout } from '@/lib/supabase-admin';

export default function AdminHeader() {
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push('/admin/login');
  }

  return (
    <header className="bg-white/80 backdrop-blur-xl border-b border-white/60 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <button
          onClick={() => router.push('/admin')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="p-2 bg-gradient-to-tr from-pink-400 to-blue-400 rounded-xl text-white shadow-lg shadow-pink-200">
            <Mic2 className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500">
              MizukiPrism
            </span>
            <span className="text-slate-500 text-sm ml-2">管理介面</span>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/metadata')}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-sm transition-all"
          >
            <ImageIcon size={16} />
            管理中繼資料
          </button>
          <button
            onClick={() => router.push('/admin/stamp')}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-sm transition-all"
          >
            <Clock size={16} />
            標記時間
          </button>
          <a
            href="/"
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            粉絲頁面
          </a>
          <button
            onClick={() => router.push('/admin/deploy')}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2 text-sm transition-all shadow-md"
          >
            <CloudUpload size={16} />
            發布更改
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
          >
            <LogOut className="w-4 h-4" />
            登出
          </button>
        </div>
      </div>
    </header>
  );
}
