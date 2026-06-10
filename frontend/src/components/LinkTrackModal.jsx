import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

const isTrackable = (href, campaignId) =>
  /^https?:\/\//i.test(href) && !href.includes(`/click/${campaignId}/`);

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
            targets.push({ type: 'anchor', node: child, url: href, text: (child.textContent || '').trim() });
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
          const url = trimTrailing(m[0]);
          if (url && isTrackable(url, campaignId)) {
            matches.push({ url, index: m.index, length: url.length });
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
function buildHtml(html, base, campaignId, plan) {
  const cleanBase = (base || '').replace(/\/$/, '');
  let doc;
  try {
    doc = new DOMParser().parseFromString(html || '', 'text/html');
  } catch {
    return html || '';
  }
  const makeUrl = (linkId, originalUrl) =>
    `${cleanBase}/click/${campaignId}/{{EMAIL_ID}}/${encodeURIComponent(linkId)}?url=${encodeURIComponent(originalUrl)}`;

  let i = -1;
  for (const t of collectTargets(doc.body, campaignId)) {
    if (t.type === 'anchor') {
      i += 1;
      const linkId = plan[i];
      if (!linkId) continue;
      t.node.setAttribute('href', makeUrl(linkId, t.url));
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
          const a = doc.createElement('a');
          a.setAttribute('href', makeUrl(linkId, mt.url));
          a.textContent = mt.url;
          frag.appendChild(a);
          replaced = true;
        }
        cursor = mt.index + mt.length;
      }
      if (cursor < text.length) frag.appendChild(doc.createTextNode(text.slice(cursor)));
      if (replaced && t.node.parentNode) t.node.parentNode.replaceChild(frag, t.node);
    }
  }
  return doc.body.innerHTML;
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
    groups.forEach((g, gi) => {
      if (!g.selected) return;
      g.occ.forEach((o, oi) => {
        const raw = g.split ? g.names[oi] : g.name;
        const id = (raw || '').trim() || `link-${gi + 1}${g.split ? `-${oi + 1}` : ''}`;
        plan[o.idx] = id;
      });
    });
    onApply(buildHtml(html, baseUrl, campaignId, plan));
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
                同じURLが複数ある場合は「別々に計測」も選べます。
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
                          <label className="lc-split">
                            <input
                              type="checkbox"
                              checked={g.split}
                              onChange={(event) => patchGroup(g.url, { split: event.target.checked })}
                            />
                            この{g.occ.length}箇所を別々に計測する
                          </label>
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
