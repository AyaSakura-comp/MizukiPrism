'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, CloudUpload } from 'lucide-react';

export default function DeployPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fff0f5] via-[#f0f8ff] to-[#e6e6fa] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <button
          onClick={() => router.push('/admin')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6 text-sm"
        >
          <ArrowLeft size={16} />
          返回管理介面
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-green-100 rounded-xl">
            <CloudUpload className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">發布更改</h1>
        </div>

        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-800">資料即時同步</p>
            <p className="text-sm text-green-700 mt-1">
              所有歌曲和演出資料直接儲存於 Supabase，粉絲頁面會即時反映更改，無需手動發布。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
