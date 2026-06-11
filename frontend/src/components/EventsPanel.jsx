import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCcw } from 'lucide-react';
import { api } from '../api.js';

const eventLabels = { open: '開封', click: 'クリック', conversion: 'コンバージョン' };
const PAGE_SIZE = 20;

function formatJst(ts) {
  if (!ts) return '-';
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function EventsPanel({ campaignId }) {
  const [type, setType] = useState('all');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ events: [], total: 0, labels: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const d = await api.campaignEvents(campaignId, { type, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      setData(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, type, page]);

  useEffect(() => {
    setPage(0);
  }, [type, campaignId]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  async function exportCsv() {
    setError('');
    try {
      const all = await api.campaignEvents(campaignId, { type, limit: 5000, offset: 0 });
      const header = ['日時', '種別', 'メールID', 'イベント名', 'リンクID', '遷移先URL', 'デバイス', 'OS', 'IP', 'ボット'];
      const rows = all.events.map((e) => [
        formatJst(e.created_at),
        eventLabels[e.event_type] || e.event_type,
        e.email_id,
        all.labels?.[e.link_id] || '',
        e.link_id || '',
        e.target_url || '',
        e.device_type || '',
        e.os || '',
        e.ip_address || '',
        e.is_bot ? 'bot' : ''
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `events_${campaignId}_${type}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>リアルタイムイベント</h2>
        <div className="events-controls">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">すべての種別</option>
            <option value="open">開封</option>
            <option value="click">クリック</option>
            <option value="conversion">コンバージョン</option>
          </select>
          <button className="ghost" onClick={load} disabled={loading}><RefreshCcw size={16} /> 更新</button>
          <button className="ghost" onClick={exportCsv}><Download size={16} /> CSV</button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>日時</th><th>種別</th><th>メールID</th><th>イベント名</th><th>リンク</th><th>デバイス</th><th>OS</th><th>IPアドレス</th></tr>
          </thead>
          <tbody>
            {data.events.map((event) => (
              <tr key={event.id}>
                <td>{formatJst(event.created_at)}</td>
                <td>
                  {eventLabels[event.event_type] || event.event_type}
                  {event.is_bot ? <span className="bot-badge">ボット</span> : ''}
                </td>
                <td>{event.email_id}</td>
                <td>{data.labels?.[event.link_id] || '-'}</td>
                <td>{event.link_id || '-'}</td>
                <td>{event.device_type || '-'}</td>
                <td>{event.os || '-'}</td>
                <td>{event.ip_address || '-'}</td>
              </tr>
            ))}
            {!data.events.length && (
              <tr><td colSpan="8" className="empty">{loading ? '読み込み中...' : 'イベントがありません'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button className="ghost" onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={page === 0 || loading}>
          <ChevronLeft size={16} /> 前へ
        </button>
        <span className="pager-info">{data.total === 0 ? '0件' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, data.total)} / ${data.total}件`}（{page + 1}/{totalPages}ページ）</span>
        <button className="ghost" onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))} disabled={page + 1 >= totalPages || loading}>
          次へ <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}
