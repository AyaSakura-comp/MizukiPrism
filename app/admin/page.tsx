'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic2,
  LogOut,
  Plus,
  Music2,
  Video,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  Check,
  Clock,
  Image as ImageIcon,
  CloudUpload,
  AlertCircle,
  Loader2,
  Search,
} from 'lucide-react';
import { Song, Stream } from '@/lib/types';
import { secondsToTimestamp } from '@/lib/utils';
import { loadSongs, loadStreams } from '@/lib/supabase-data';
import {
  isAuthenticated,
  logout,
  createPerformance,
  updatePerformance,
  updateSong,
  deletePerformance,
} from '@/lib/supabase-admin';

// VersionForm component
function VersionForm({
  streamId,
  songs,
  onSuccess,
  onCancel,
}: {
  streamId: string;
  songs: Song[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [songTitle, setSongTitle] = useState('');
  const [originalArtist, setOriginalArtist] = useState('');
  const [songTags, setSongTags] = useState('');
  const [startTimestamp, setStartTimestamp] = useState('');
  const [endTimestamp, setEndTimestamp] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-fill artist when existing song title is selected
  const handleSongTitleChange = (value: string) => {
    setSongTitle(value);
    const existingSong = songs.find(
      s => s.title.toLowerCase() === value.toLowerCase()
    );
    if (existingSong) {
      setOriginalArtist(existingSong.originalArtist);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await createPerformance({
        songTitle,
        originalArtist,
        songTags: songTags.split(',').map(t => t.trim()).filter(Boolean),
        streamId,
        startTimestamp,
        endTimestamp: endTimestamp || undefined,
        note,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="version-form">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">歌名</label>
          <input
            type="text"
            value={songTitle}
            onChange={e => handleSongTitleChange(e.target.value)}
            required
            placeholder="例：First Love"
            list="songs-datalist"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 placeholder-slate-400 text-sm"
            data-testid="version-song-title-input"
          />
          <datalist id="songs-datalist">
            {songs.map(s => (
              <option key={s.id} value={s.title} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">原唱者</label>
          <input
            type="text"
            value={originalArtist}
            onChange={e => setOriginalArtist(e.target.value)}
            required
            placeholder="例：宇多田光"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 placeholder-slate-400 text-sm"
            data-testid="version-artist-input"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          標籤（逗號分隔，選填）
        </label>
        <input
          type="text"
          value={songTags}
          onChange={e => setSongTags(e.target.value)}
          placeholder="例：抒情, J-POP, 經典"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 placeholder-slate-400 text-sm"
          data-testid="version-tags-input"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">開始時間戳</label>
          <input
            type="text"
            value={startTimestamp}
            onChange={e => setStartTimestamp(e.target.value)}
            required
            placeholder="例：1:23:45"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 placeholder-slate-400 text-sm"
            data-testid="version-start-timestamp-input"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            結束時間戳（選填）
          </label>
          <input
            type="text"
            value={endTimestamp}
            onChange={e => setEndTimestamp(e.target.value)}
            placeholder="例：1:30:00"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 placeholder-slate-400 text-sm"
            data-testid="version-end-timestamp-input"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          演出備註（選填）
        </label>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="例：清唱版、吉他伴奏"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 placeholder-slate-400 text-sm"
          data-testid="version-note-input"
        />
      </div>

      {error && (
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm"
          data-testid="version-form-error"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2 px-4 rounded-lg bg-gradient-to-r from-pink-400 to-blue-400 text-white font-medium text-sm shadow-md hover:brightness-105 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          data-testid="version-submit-button"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          新增版本
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
        >
          取消
        </button>
      </div>
    </form>
  );
}

// EditVersionForm component
function EditVersionForm({
  performanceId,
  initialTimestamp,
  initialEndTimestamp,
  initialNote,
  onSuccess,
  onCancel,
}: {
  performanceId: string;
  initialTimestamp: number;
  initialEndTimestamp: number | null;
  initialNote: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [startTimestamp, setStartTimestamp] = useState(secondsToTimestamp(initialTimestamp));
  const [endTimestamp, setEndTimestamp] = useState(
    initialEndTimestamp ? secondsToTimestamp(initialEndTimestamp) : ''
  );
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await updatePerformance(performanceId, startTimestamp, endTimestamp || undefined, note);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-3 pl-4 border-l-2 border-pink-200" data-testid="edit-version-form">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">開始時間戳</label>
          <input
            type="text"
            value={startTimestamp}
            onChange={e => setStartTimestamp(e.target.value)}
            required
            placeholder="例：1:23:45"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 text-sm"
            data-testid="edit-start-timestamp-input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">結束時間戳（選填）</label>
          <input
            type="text"
            value={endTimestamp}
            onChange={e => setEndTimestamp(e.target.value)}
            placeholder="例：1:30:00"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 text-sm"
            data-testid="edit-end-timestamp-input"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">演出備註</label>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="例：清唱版、吉他伴奏"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 text-sm"
          data-testid="edit-note-input"
        />
      </div>

      {error && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm"
          data-testid="edit-version-error"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="py-1.5 px-4 rounded-lg bg-pink-500 text-white text-sm font-medium hover:bg-pink-600 transition-colors disabled:opacity-60 flex items-center gap-1.5"
          data-testid="edit-version-save-button"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          儲存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="py-1.5 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
        >
          取消
        </button>
      </div>
    </form>
  );
}

// EditSongForm component
function EditSongForm({
  song,
  onSuccess,
  onCancel,
}: {
  song: Song;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(song.title);
  const [originalArtist, setOriginalArtist] = useState(song.originalArtist);
  const [tags, setTags] = useState(song.tags.join(', '));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await updateSong(song.id, title, originalArtist, tags.split(',').map(t => t.trim()).filter(Boolean));
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-3 pl-4 border-l-2 border-blue-200" data-testid="edit-song-form">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">歌名</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-slate-700 text-sm"
            data-testid="edit-song-title-input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">原唱者</label>
          <input
            type="text"
            value={originalArtist}
            onChange={e => setOriginalArtist(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-slate-700 text-sm"
            data-testid="edit-song-artist-input"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          標籤（逗號分隔）
        </label>
        <input
          type="text"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="例：抒情, J-POP, 經典"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-slate-700 text-sm"
          data-testid="edit-song-tags-input"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="py-1.5 px-4 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-60 flex items-center gap-1.5"
          data-testid="edit-song-save-button"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          儲存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="py-1.5 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
        >
          取消
        </button>
      </div>
    </form>
  );
}

// Delete Confirmation Dialog
function DeleteConfirmDialog({
  message,
  warning,
  onConfirm,
  onCancel,
}: {
  message: string;
  warning?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="delete-confirm-dialog">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-red-100 rounded-xl flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 mb-1">確認刪除</h3>
            <p className="text-sm text-slate-600">{message}</p>
            {warning && (
              <p className="text-sm text-amber-600 mt-2 flex items-center gap-1.5" data-testid="delete-warning">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {warning}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors"
            data-testid="confirm-delete-button"
          >
            確認刪除
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
            data-testid="cancel-delete-button"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Admin Page
export default function AdminPage() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [expandedStream, setExpandedStream] = useState<string | null>(null);
  const [addVersionStreamId, setAddVersionStreamId] = useState<string | null>(null);
  const [editVersionId, setEditVersionId] = useState<string | null>(null);
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);
  const [editSongId, setEditSongId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'streams' | 'songs'>('streams');

  const fetchData = useCallback(async () => {
    try {
      const [songsData, streamsData] = await Promise.all([
        loadSongs(),
        loadStreams(),
      ]);
      setSongs(songsData);
      setStreams(streamsData as Stream[]);
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/admin/login');
    } else {
      setAuthenticated(true);
      fetchData();
    }
  }, [fetchData, router]);

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };


  const handleVersionCreated = async () => {
    await fetchData();
    setAddVersionStreamId(null);
  };

  const handleVersionUpdated = async () => {
    await fetchData();
    setEditVersionId(null);
  };

  const handleSongUpdated = async () => {
    await fetchData();
    setEditSongId(null);
  };

  const handleDeleteVersion = async (performanceId: string) => {
    try {
      await deletePerformance(performanceId);
      await fetchData();
    } finally {
      setDeleteVersionId(null);
    }
  };

  // Get performances for a stream across all songs
  const getStreamPerformances = (streamId: string) => {
    const performances: Array<{ song: Song; perf: Song['performances'][0] }> = [];
    songs.forEach(song => {
      song.performances.forEach(perf => {
        if (perf.streamId === streamId) {
          performances.push({ song, perf });
        }
      });
    });
    return performances;
  };

  // Find which performance needs confirmation for delete
  const deletePerformanceData = deleteVersionId
    ? (() => {
        for (const song of songs) {
          const perf = song.performances.find(p => p.id === deleteVersionId);
          if (perf) return { song, perf };
        }
        return null;
      })()
    : null;

  if (!authenticated || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fff0f5] via-[#f0f8ff] to-[#e6e6fa] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fff0f5] via-[#f0f8ff] to-[#e6e6fa]">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-white/60 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-pink-400 to-blue-400 rounded-xl text-white shadow-lg shadow-pink-200">
              <Mic2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500">
                MizukiPrism
              </span>
              <span className="text-slate-500 text-sm ml-2">管理介面</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              data-testid="metadata-nav-button"
              onClick={() => router.push('/admin/metadata')}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-sm transition-all"
            >
              <ImageIcon size={16} />
              管理中繼資料
            </button>
            <button
              data-testid="stamp-nav-button"
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
              data-testid="deploy-nav-button"
              onClick={() => router.push('/admin/deploy')}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2 text-sm transition-all shadow-md"
            >
              <CloudUpload size={16} />
              發布更改
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4" />
              登出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6" data-testid="admin-tabs">
          <button
            onClick={() => setActiveTab('streams')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'streams'
                ? 'bg-white shadow-md text-pink-600 border border-pink-100'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
            }`}
            data-testid="streams-tab"
          >
            <Video className="w-4 h-4" />
            直播場次 ({streams.length})
          </button>
          <button
            onClick={() => setActiveTab('songs')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'songs'
                ? 'bg-white shadow-md text-blue-600 border border-blue-100'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
            }`}
            data-testid="songs-tab"
          >
            <Music2 className="w-4 h-4" />
            歌曲目錄 ({songs.length})
          </button>
        </div>

        {/* Streams Tab */}
        {activeTab === 'streams' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-700">直播場次管理</h2>
              <button
                onClick={() => router.push('/admin/channel')}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm transition-all"
                data-testid="channel-nav-button"
              >
                <Search className="w-4 h-4" />
                瀏覽頻道
              </button>
              <button
                onClick={() => router.push('/admin/discover')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-400 to-blue-400 text-white font-medium text-sm shadow-md hover:brightness-105 transition-all"
                data-testid="add-stream-button"
              >
                <Plus className="w-4 h-4" />
                匯入歌曲
              </button>
            </div>


            {streams.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Video className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>尚無直播場次</p>
              </div>
            ) : (
              <div className="space-y-3">
                {streams
                  .slice()
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map(stream => {
                    const streamPerfs = getStreamPerformances(stream.id);
                    const isExpanded = expandedStream === stream.id;

                    return (
                      <div
                        key={stream.id}
                        className="bg-white/90 rounded-2xl shadow-sm border border-white/60 overflow-hidden"
                        data-testid={`stream-item-${stream.id}`}
                      >
                        <button
                          onClick={() => setExpandedStream(isExpanded ? null : stream.id)}
                          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                          data-testid={`stream-toggle-${stream.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-pink-50 rounded-xl">
                              <Video className="w-4 h-4 text-pink-400" />
                            </div>
                            <div className="text-left">
                              <p className="font-semibold text-slate-700">{stream.title}</p>
                              <p className="text-sm text-slate-400">{stream.date} · {streamPerfs.length} 首歌</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={stream.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </a>
                            {isExpanded ? (
                              <X className="w-4 h-4 text-slate-400" />
                            ) : (
                              <Plus className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-6 pb-6 border-t border-slate-100">
                            {/* Performances list */}
                            {streamPerfs.length > 0 && (
                              <div className="mt-4 space-y-3">
                                {streamPerfs.map(({ song, perf }) => (
                                  <div key={perf.id} className="bg-slate-50 rounded-xl p-4" data-testid={`performance-item-${perf.id}`}>
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <p className="font-medium text-slate-700 text-sm">{song.title}</p>
                                        <p className="text-xs text-slate-400">{song.originalArtist}</p>
                                        <p className="text-xs text-slate-500 mt-1">
                                          開始：{secondsToTimestamp(perf.timestamp)}
                                          {perf.endTimestamp && ` → 結束：${secondsToTimestamp(perf.endTimestamp)}`}
                                          {perf.note && ` · ${perf.note}`}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => setEditVersionId(editVersionId === perf.id ? null : perf.id)}
                                          className="p-1.5 text-slate-400 hover:text-blue-500 rounded-lg hover:bg-blue-50 transition-colors"
                                          data-testid={`edit-version-button-${perf.id}`}
                                          title="編輯版本"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => setDeleteVersionId(perf.id)}
                                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                          data-testid={`delete-version-button-${perf.id}`}
                                          title="刪除版本"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {editVersionId === perf.id && (
                                      <EditVersionForm
                                        performanceId={perf.id}
                                        initialTimestamp={perf.timestamp}
                                        initialEndTimestamp={perf.endTimestamp}
                                        initialNote={perf.note}
                                        onSuccess={handleVersionUpdated}
                                        onCancel={() => setEditVersionId(null)}
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add version button/form */}
                            {addVersionStreamId === stream.id ? (
                              <div className="mt-4 bg-pink-50/50 rounded-xl p-4 border border-pink-100">
                                <h4 className="text-sm font-medium text-slate-600 mb-3">新增歌曲版本</h4>
                                <VersionForm
                                  streamId={stream.id}
                                  songs={songs}
                                  onSuccess={handleVersionCreated}
                                  onCancel={() => setAddVersionStreamId(null)}
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddVersionStreamId(stream.id)}
                                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-pink-200 text-pink-400 hover:border-pink-300 hover:text-pink-500 hover:bg-pink-50/50 transition-all text-sm font-medium"
                                data-testid={`add-version-button-${stream.id}`}
                              >
                                <Plus className="w-4 h-4" />
                                新增歌曲版本
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Songs Tab */}
        {activeTab === 'songs' && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-700">歌曲目錄管理</h2>
              <p className="text-sm text-slate-400 mt-1">在此編輯歌曲的基本資訊。如需新增歌曲，請在直播場次中新增版本。</p>
            </div>

            {songs.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Music2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>尚無歌曲</p>
              </div>
            ) : (
              <div className="space-y-3">
                {songs
                  .slice()
                  .sort((a, b) => a.title.localeCompare(b.title, 'zh-TW'))
                  .map(song => (
                    <div
                      key={song.id}
                      className="bg-white/90 rounded-2xl shadow-sm border border-white/60 p-5"
                      data-testid={`song-item-${song.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-700">{song.title}</p>
                          <p className="text-sm text-slate-500">{song.originalArtist}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {song.tags.map(tag => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-full text-xs bg-pink-50 text-pink-500 border border-pink-100"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-slate-400 mt-2">
                            {song.performances.length} 個版本
                          </p>
                        </div>
                        <button
                          onClick={() => setEditSongId(editSongId === song.id ? null : song.id)}
                          className="p-2 text-slate-400 hover:text-blue-500 rounded-xl hover:bg-blue-50 transition-colors"
                          data-testid={`edit-song-button-${song.id}`}
                          title="編輯歌曲"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>

                      {editSongId === song.id && (
                        <EditSongForm
                          song={song}
                          onSuccess={handleSongUpdated}
                          onCancel={() => setEditSongId(null)}
                        />
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      {deleteVersionId && deletePerformanceData && (
        <DeleteConfirmDialog
          message={`確定要刪除「${deletePerformanceData.song.title}」的這個版本嗎？`}
          warning="此版本可能存在於粉絲的播放清單中"
          onConfirm={() => handleDeleteVersion(deleteVersionId)}
          onCancel={() => setDeleteVersionId(null)}
        />
      )}
    </div>
  );
}
