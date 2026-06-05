import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, MousePointerClick, ScrollText } from 'lucide-react';
import { api } from '../api.js';

// 各リンクの「文書内での絶対的な縦位置(px)」を offsetParent を辿って算出する。
function absoluteTop(el) {
  let y = 0;
  let node = el;
  while (node) {
    y += node.offsetTop || 0;
    node = node.offsetParent;
  }
  return y;
}

function linkIdFromHref(href = '') {
  // /click/:campaignId/:emailId/:linkId?url=... から linkId を取り出す
  const match = href.match(/\/click\/[^/]+\/[^/]+\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function EmailHeatmap({ campaignId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('click'); // 'click' | 'read'
  const [zones, setZones] = useState([]);
  const [docHeight, setDocHeight] = useState(0);
  const iframeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setZones([]);
    setDocHeight(0);
    api
      .campaignHeatmap(campaignId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function measure() {
    const iframe = iframeRef.current;
    if (!iframe || !data) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;
      const total = Math.max(
        doc.body.scrollHeight,
        doc.documentElement?.scrollHeight || 0,
        1
      );
      const clickMap = new Map((data.clicks_by_link || []).map((c) => [c.link_id, c]));
      const anchors = Array.from(doc.querySelectorAll('a[href*="/click/"]'));
      const found = [];
      for (const a of anchors) {
        const linkId = linkIdFromHref(a.getAttribute('href') || '');
        if (!linkId) continue;
        const stats = clickMap.get(linkId) || { clicks: 0, unique_clicks: 0 };
        found.push({
          linkId,
          top: absoluteTop(a),
          height: a.offsetHeight || 20,
          clicks: stats.clicks,
          unique_clicks: stats.unique_clicks,
          text: (a.textContent || '').trim().slice(0, 40)
        });
      }
      // iframe の高さを実コンテンツに合わせ、オーバーレイと1:1で重なるようにする
      iframe.style.height = `${total}px`;
      setDocHeight(total);
      setZones(found);
    } catch (err) {
      setError('プレビューの計測に失敗しました（同一オリジン制約の可能性）: ' + err.message);
    }
  }

  const maxClicks = useMemo(
    () => zones.reduce((max, z) => Math.max(max, z.clicks), 0),
    [zones]
  );

  // 読了推定: 各リンク位置で「そこ以深をクリックした延べユニーク数」を累積し、深いほど到達が減る曲線にする
  const readBands = useMemo(() => {
    if (!zones.length || !docHeight) return [];
    const sorted = [...zones].sort((a, b) => a.top - b.top);
    const totalReach = sorted.reduce((sum, z) => sum + z.unique_clicks, 0);
    if (totalReach <= 0) return [];
    const bands = [];
    let prevTop = 0;
    for (let i = 0; i < sorted.length; i += 1) {
      const reach = sorted.slice(i).reduce((sum, z) => sum + z.unique_clicks, 0);
      bands.push({
        top: prevTop,
        height: Math.max(sorted[i].top - prevTop, 1),
        intensity: reach / totalReach
      });
      prevTop = sorted[i].top;
    }
    // 最後のリンク以降（フッターまで）
    if (prevTop < docHeight) {
      bands.push({ top: prevTop, height: docHeight - prevTop, intensity: 0 });
    }
    return bands;
  }, [zones, docHeight]);

  if (loading) return <section className="panel"><p className="empty">読み込み中...</p></section>;
  if (error) return <section className="panel"><div className="alert">{error}</div></section>;

  const hasHtml = Boolean(data?.html_content);
  const totalClicks = zones.reduce((sum, z) => sum + z.clicks, 0);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-heading">
          <h2>ヒートマップ</h2>
          <div className="tabs">
            <button className={mode === 'click' ? 'active' : ''} onClick={() => setMode('click')}>
              <MousePointerClick size={15} /> クリック
            </button>
            <button className={mode === 'read' ? 'active' : ''} onClick={() => setMode('read')}>
              <ScrollText size={15} /> 読了推定
            </button>
          </div>
        </div>

        {mode === 'read' && (
          <div className="heatmap-caveat">
            <AlertTriangle size={16} />
            <span>
              <strong>読了推定について：</strong>
              メールはJavaScriptが動かず、スクロール深度を直接計測できません。これは
              <strong>クリックの縦位置分布からの推定</strong>です（下のリンクがクリックされた＝そこまで読まれた可能性）。
              クリックした人のみが対象で、Apple Mailのプライバシー保護(MPP)等の影響もあるため、
              <strong>正確な読了率ではなく傾向の目安</strong>として参照してください。
            </span>
          </div>
        )}

        {!hasHtml && (
          <p className="empty">
            このメールにHTML本文が登録されていません。ヒートマップを重ねるには、メール作成時にHTML本文を保存してください。
          </p>
        )}

        {hasHtml && (
          <>
            <p className="panel-note">
              {mode === 'click'
                ? `トラッキングリンク ${zones.length} 件 / 合計クリック ${totalClicks} 件。色が濃いほどクリックが集中しています。`
                : '上が濃いほど多くの人が到達（読んだ）と推定される領域です。'}
            </p>
            <div className="heatmap-stage">
              <iframe
                ref={iframeRef}
                srcDoc={data.html_content}
                className="heatmap-iframe"
                sandbox="allow-same-origin"
                title="ヒートマップ対象メール"
                onLoad={measure}
              />
              {docHeight > 0 && (
                <div className="heatmap-overlay">
                  {mode === 'click' &&
                    zones.map((z, i) => (
                      <div
                        key={`${z.linkId}-${i}`}
                        className="heatmap-zone"
                        style={{
                          top: `${(z.top / docHeight) * 100}%`,
                          height: `${(Math.max(z.height, 16) / docHeight) * 100}%`,
                          background:
                            maxClicks > 0
                              ? `rgba(239, 68, 68, ${0.18 + 0.62 * (z.clicks / maxClicks)})`
                              : 'rgba(148, 163, 184, 0.2)'
                        }}
                        title={`${z.linkId}: ${z.clicks}クリック / ${z.unique_clicks}ユニーク`}
                      >
                        <span className="heatmap-zone-label">
                          {z.clicks} ({z.unique_clicks})
                        </span>
                      </div>
                    ))}
                  {mode === 'read' &&
                    readBands.map((b, i) => (
                      <div
                        key={i}
                        className="heatmap-band"
                        style={{
                          top: `${(b.top / docHeight) * 100}%`,
                          height: `${(b.height / docHeight) * 100}%`,
                          background: `rgba(13, 148, 136, ${0.12 + 0.58 * b.intensity})`
                        }}
                      />
                    ))}
                </div>
              )}
            </div>

            {mode === 'click' && zones.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>リンクID</th><th>テキスト</th><th>クリック</th><th>ユニーク</th></tr>
                  </thead>
                  <tbody>
                    {[...zones].sort((a, b) => b.clicks - a.clicks).map((z, i) => (
                      <tr key={`${z.linkId}-row-${i}`}>
                        <td>{z.linkId}</td>
                        <td>{z.text || '-'}</td>
                        <td>{z.clicks}</td>
                        <td>{z.unique_clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {mode === 'click' && zones.length === 0 && (
              <p className="empty">
                HTML本文内にトラッキングリンク（/click/...）が見つかりませんでした。リンクをトラッキング形式に置き換えてから保存してください。
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
