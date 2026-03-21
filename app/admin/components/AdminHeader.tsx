'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic2, ImageIcon, Clock, CloudUpload, LogOut, Menu, X } from 'lucide-react';
import { logout } from '@/lib/supabase-admin';

export default function AdminHeader() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    router.push('/admin/login');
  }

  function nav(path: string) {
    setMenuOpen(false);
    router.push(path);
  }

  return (
    <header className="bg-white/80 backdrop-blur-xl border-b border-white/60 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => nav('/admin')}
          className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity shrink-0"
        >
          <div className="p-1.5 sm:p-2 bg-gradient-to-tr from-pink-400 to-blue-400 rounded-xl text-white shadow-lg shadow-pink-200">
            <Mic2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <span className="font-bold text-base sm:text-lg bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500">
              MizukiPrism
            </span>
            <span className="text-slate-500 text-xs sm:text-sm ml-1.5 sm:ml-2 hidden sm:inline">管理介面</span>
          </div>
        </button>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-2 lg:gap-3">
          <button
            onClick={() => nav('/admin/metadata')}
            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 text-sm transition-all"
          >
            <ImageIcon size={15} />
            中繼資料
          </button>
          <button
            onClick={() => nav('/admin/stamp')}
            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 text-sm transition-all"
          >
            <Clock size={15} />
            標記時間
          </button>
          <a
            href="/"
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
          >
            粉絲頁面
          </a>
          <button
            onClick={() => nav('/admin/deploy')}
            className="px-3 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 flex items-center gap-1.5 text-sm transition-all shadow-md"
          >
            <CloudUpload size={15} />
            發布更改
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-500 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-50"
          >
            <LogOut className="w-4 h-4" />
            登出
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 text-slate-600 hover:text-slate-800 transition-colors rounded-lg hover:bg-slate-100"
          aria-label="選單"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white/95 backdrop-blur-xl px-4 pb-3 pt-2 space-y-1">
          <button
            onClick={() => nav('/admin/metadata')}
            className="w-full text-left px-3 py-2.5 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-3 text-sm transition-all"
          >
            <ImageIcon size={16} />
            管理中繼資料
          </button>
          <button
            onClick={() => nav('/admin/stamp')}
            className="w-full text-left px-3 py-2.5 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-3 text-sm transition-all"
          >
            <Clock size={16} />
            標記時間
          </button>
          <a
            href="/"
            className="block px-3 py-2.5 text-sm text-slate-500 hover:text-slate-800 transition-colors rounded-lg hover:bg-slate-100"
          >
            粉絲頁面
          </a>
          <button
            onClick={() => nav('/admin/deploy')}
            className="w-full text-left px-3 py-2.5 text-white rounded-lg flex items-center gap-3 text-sm transition-all bg-slate-800 hover:bg-slate-700"
          >
            <CloudUpload size={16} />
            發布更改
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2.5 text-slate-500 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 flex items-center gap-3 text-sm"
          >
            <LogOut size={16} />
            登出
          </button>
        </div>
      )}
    </header>
  );
}
