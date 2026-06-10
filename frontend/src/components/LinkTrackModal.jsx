import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

// /click/<campaignId>/<emailId>/<linkId>?...url=ENCODED を解析（既存の計測リンク判定）
function trackingInfo(href = '') {
  const m = href.match(/\/click\/([^/]+)\/[^/]+\/[^/?#]+\?(?:[^#]*&)?url=([^&#]+)/);
  if (!m) return null;
  let url = m[2];
  try {
    url = decodeURIComponent(m[2]);
  } catch {
    /* デコード不能ならそのまま */
  }
  return { campaignId: m[1], url };
}

// 計測リンクに入れる「元URL」。別キャンペーンの計測リンクは中のURLに復元（二重ラップ防止）
const effectiveUrl = (href) => {
  const info = trackingInfo(href);
  return info ? info.url : href;
};

function isTrackable(href, campaignId) {
  const info = trackingInfo(href);
  if (info) {
    // このキャンペーンの計測リンクは変換済み → 対象外
    if (info.campaignId === campaignId) return false;
    // 別キャンペーン（別メール）の計測リンク → 中の元URLを再変換対象にする
    return /^https?:\/\//i.test(info.url);
  }
  return /^https?:\/\//i.test(href);
}

// テキスト中の生URL検出パターン（末尾の句読点・閉じ括弧は除外）
const BARE_URL_PATTERN = 'https?:\\/\\/[^\\s<>"\'）)]+';
const trimTrailing = (url) => url.replace(/[.,;:!?。、）)]+$/, '');

// DOM順に変換対象を収集（aタグ + テキスト直書きの生URL）
// 戻り値: [{type:'anchor', node, url, text} | {type:'text', node, matches:[{url,index,length}]}]
function collectTargets(root, campaignId) {
  const targets = [];
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        // 既存アンカーは中身を生URLとして拾わない（二重変換防止）
        if (child.tagName === 'A') {
          const href = child.getAttribute('href') || '';
          if (isTrackable(href, campaignId)) {
            targets.push({ type: 'anchor', node: child, url: effectiveUrl(href), text: (child.textContent || '').trim() });
          }
        } else {
          walk(child);
        }
      } else if (child.nodeType === 3) {
        const text = child.nodeValue || '';
        const re = new RegExp(BARE_URL_PATTERN, 'gi');
        const matches = [];
        let m;
        while ((m = re.exec(text))) {
          const raw = trimTrailing(m[0]);
          if (raw && isTrackable(raw, campaignId)) {
            matches.push({ url: effectiveUrl(raw), index: m.index, length: raw.length });
          }
        }
        if (matches.length) targets.push({ type: 'text', node: child, matches });
      }
    }
  };
  walk(root);
  return targets;
}

// 本文HTMLから変換対象URL（aタグ・生URL）をDOM順でフラット抽出
function extractOccurrences(html, campaignId) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(html || '', 'text/html');
  } catch {
    return [];
  }
  const occ = [];
  for (const t of collectTargets(doc.body, campaignId)) {
    if (t.type === 'anchor') occ.push({ url: t.url, text: t.text });
    else for (const mt of t.matches) occ.push({ url: mt.url, text: '' });
  }
  return occ;
}

// plan: 出現順index -> linkId（null はスキップ）で書き換え
// 戻り値: { html, links:[{ linkId, url, trackingUrl }] }
function buildHtml(html, base, campaignId, plan) {
  const cleanBase = (base || '').replace(/\/$/, '');
  let doc;
  try {
    doc = new DOMParser().parseFromString(html || '', 'text/html');
  } catch {
    return { html: html || '', links: [] };
  }
  const makeUrl = (linkId, originalUrl) =>
    `${cleanBase}/click/${campaignId}/{{EMAIL_ID}}/${encodeURIComponent(linkId)}?url=${encodeURIComponent(originalUrl)}`;

  const links = [];
  const seen = new Set();
  const pushLink = (linkId, originalUrl, trackingUrl) => {
    if (seen.has(linkId)) return;
    seen.add(linkId);
    links.push({ linkId, url: originalUrl, trackingUrl });
  };

  let i = -1;
  for (const t of collectTargets(doc.body, campaignId)) {
    if (t.type === 'anchor') {
      i += 1;
      const linkId = plan[i];
      if (!linkId) continue;
      const trackingUrl = makeUrl(linkId, t.url);
      t.node.setAttribute('href', trackingUrl);
      pushLink(linkId, t.url, trackingUrl);
    } else {
      // テキストノードを分割し、変換対象URLを <a> に置き換える
      const text = t.node.nodeValue || '';
      const frag = doc.createDocumentFragment();
      let cursor = 0;
      let replaced = false;
      for (const mt of t.matches) {
        i += 1;
        const linkId = plan[i];
        if (mt.index > cursor) frag.appendChild(doc.createTextNode(text.slice(cursor, mt.index)));
        if (!linkId) {
          frag.appendChild(doc.createTextNode(text.slice(mt.index, mt.index + mt.length)));
        } else {
          const trackingUrl = makeUrl(linkId, mt.url);
          const a = doc.createElement('a');
          a.setAttribute('href', trackingUrl);
          a.textContent = mt.url;
          frag.appendChild(a);
          pushLink(linkId, mt.url, trackingUrl);
          replaced = true;
        }
        cursor = mt.index + mt.length;
      }
      if (cursor < text.length) frag.appendChild(doc.createTextNode(text.slice(cursor)));
      if (replaced && t.node.parentNode) t.node.parentNode.replaceChild(frag, t.node);
    }
  }
  return { html: doc.body.innerHTML, links };
}

export default function LinkTrackModal({ html, baseUrl, campaignId, onApply, onClose }) {
  const occurrences = useMemo(() => extractOccurrences(html, campaignId), [html, campaignId]);

  const [groups, setGroups] = useState(() => {
    const map = new Map();
    occurrences.forEach((occ, idx) => {
      if (!map.has(occ.url)) map.set(occ.url, []);
      map.get(occ.url).push({ ...occ, idx });
    });
    return Array.from(map.entries()).map(([url, occ], gi) => {
      const fallback = `link-${gi + 1}`;
      const guess = occ[0].text && occ[0].text.length <= 20 ? occ[0].text : fallback;
      return {
        url,
        occ,
        selected: true,
        split: false,
        name: guess,
        names: occ.map((o, oi) =>
          o.text && o.text.length <= 20 ? o.text : `${fallback}-${oi + 1}`
        )
      };
    });
  });

  function patchGroup(url, patch) {
    setGroups((gs) => gs.map((g) => (g.url === url ? { ...g, ...patch } : g)));
  }

  function patchSplitName(url, oi, value) {
    setGroups((gs) =>
      gs.map((g) => {
        if (g.url !== url) return g;
        const names = [...g.names];
        names[oi] = value;
        return { ...g, names };
      })
    );
  }

  const selectedCount = groups
    .filter((g) => g.selected)
    .reduce((n, g) => n + g.occ.length, 0);

  const allSelected = groups.length > 0 && groups.every((g) => g.selected);
  function toggleAll() {
    const next = !allSelected;
    setGroups((gs) => gs.map((g) => ({ ...g, selected: next })));
  }

  function apply() {
    const plan = occurrences.map(() => null);
    const used = new Set();
    const slug = (raw) =>
      (raw || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-ぁ-んァ-ヶ一-龠ー]/g, '')
        .slice(0, 24) || 'link';
    // メール間・グループ間で linkId が衝突しないよう、必ず短いサフィックスを付与して一意化する
    const uniqueId = (base) => {
      let id;
      do {
        id = `${slug(base)}-${Math.random().toString(36).slice(2, 6)}`;
      } while (used.has(id));
      used.add(id);
      return id;
    };

    groups.forEach((g, gi) => {
      if (!g.selected) return;
      if (g.split) {
        // 各箇所を別イベントとして個別の linkId にする
        g.occ.forEach((o, oi) => {
          plan[o.idx] = uniqueId(g.names[oi] || `link-${gi + 1}-${oi + 1}`);
        });
      } else {
        // まとめて1イベント（同じ linkId を共有）
        const id = uniqueId(g.name || `link-${gi + 1}`);
        g.occ.forEach((o) => {
          plan[o.idx] = id;
        });
      }
    });
    const result = buildHtml(html, baseUrl, campaignId, plan);
    onApply(result.html, result.links);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>リンクを計測リンクに変換</h2>
          <button className="icon-button" onClick={onClose} title="閉じる"><X size={18} /></button>
        </div>

        <div className="modal-body">
          {groups.length === 0 ? (
            <p className="empty">変換できるリンク（http/https のリンク・直書きURL）が本文にありません。</p>
          ) : (
            <>
              <p className="guide-intro">
                変換するURLを選び、ダッシュボードに表示する<strong>計測名</strong>を付けてください。
                同じURLが本文内に複数ある場合は、<strong>1つの計測にまとめる</strong>か
                <strong>箇所ごとに別々に計測する</strong>かを選べます（別メールへの変換は自動で別計測になります）。
              </p>
              <label className="lc-selectall">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                すべて選択
              </label>

              <div className="link-convert-list">
                {groups.map((g) => (
                  <div className={`link-convert-item${g.selected ? '' : ' is-off'}`} key={g.url}>
                    <label className="lc-head">
                      <input
                        type="checkbox"
                        checked={g.selected}
                        onChange={(event) => patchGroup(g.url, { selected: event.target.checked })}
                      />
                      <span className="lc-url">{g.url}</span>
                      <span className="lc-count">{g.occ.length}箇所</span>
                    </label>

                    {g.selected && (
                      <div className="lc-config">
                        {g.occ.length > 1 && (
                          <div className="lc-split-choice">
                            <label className="lc-split">
                              <input
                                type="checkbox"
                                checked={g.split}
                                onChange={(event) => patchGroup(g.url, { split: event.target.checked })}
                              />
                              この{g.occ.length}箇所を別々に計測する
                            </label>
                            <p className="lc-split-hint">
                              {g.split
                                ? `オン：${g.occ.length}箇所をそれぞれ別の計測リンクにします（どの位置のクリックか区別できます）。`
                                : `オフ：${g.occ.length}箇所を同じ計測リンクにまとめます（合計クリック数として集計されます）。`}
                            </p>
                          </div>
                        )}

                        {!g.split ? (
                          <label className="lc-name">
                            <span>計測名</span>
                            <input
                              value={g.name}
                              onChange={(event) => patchGroup(g.url, { name: event.target.value })}
                              placeholder="例: キャンペーンサイト"
                            />
                          </label>
                        ) : (
                          <div className="lc-split-names">
                            {g.occ.map((o, oi) => (
                              <label className="lc-name" key={oi}>
                                <span>{oi + 1}箇所目{o.text ? `「${o.text.slice(0, 16)}」` : ''}</span>
                                <input
                                  value={g.names[oi]}
                                  onChange={(event) => patchSplitName(g.url, oi, event.target.value)}
                                  placeholder={`link-${oi + 1}`}
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <span className="modal-note">{selectedCount} 件のリンクを変換します</span>
          <div className="form-actions">
            <button className="ghost" onClick={onClose}>キャンセル</button>
            <button className="primary" onClick={apply} disabled={selectedCount === 0}>
              変換して本文に反映
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
