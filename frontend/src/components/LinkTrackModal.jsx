import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

// /click/<campaignId>/<emailId>/<linkId>?...url=ENCODED を解析（既存の計測リンク判定）
function trackingInfo(href = '') {
  const m = href.match(/\/click\/([^/]+)\/[^/]+\/([^/?#]+)\?(?:[^#]*&)?url=([^&#]+)/);
  if (!m) return null;
  let url = m[3];
  try {
    url = decodeURIComponent(m[3]);
  } catch {
    /* デコード不能ならそのまま */
  }
  let linkId = m[2];
  try {
    linkId = decodeURIComponent(m[2]);
  } catch {
    /* そのまま */
  }
  return { campaignId: m[1], linkId, url };
}

// 計測リンクに入れる「元URL」。既存の計測リンクは中のURL（変数含む）に復元（二重ラップ防止）
const effectiveUrl = (href) => {
  const info = trackingInfo(href);
  return info ? info.url : href;
};

function isTrackable(href, campaignId) {
  const info = trackingInfo(href);
  // 既存の計測リンク（このメール/他メール問わず）は再変換対象として表示する
  if (info) return true;
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
// destPlan: 出現順index -> 遷移先URL（編集後）。http(s)以外（jcity変数等）は素のまま入れる
// 戻り値: { html, links:[{ linkId, url, trackingUrl, label }] }
function buildHtml(html, base, campaignId, plan, labelByLinkId = {}, destPlan = []) {
  const cleanBase = (base || '').replace(/\/$/, '');
  let doc;
  try {
    doc = new DOMParser().parseFromString(html || '', 'text/html');
  } catch {
    return { html: html || '', links: [] };
  }
  // http(s)の実URLはエンコード、jcity変数などはそのまま（受信者ごとに置換させるため）
  const encodeDest = (dest) => (/^https?:\/\//i.test(dest) ? encodeURIComponent(dest) : dest);
  const makeUrl = (linkId, dest) =>
    `${cleanBase}/click/${campaignId}/{{EMAIL_ID}}/${encodeURIComponent(linkId)}?url=${encodeDest(dest)}`;

  const links = [];
  const seen = new Set();
  const pushLink = (linkId, dest, trackingUrl) => {
    if (seen.has(linkId)) return;
    seen.add(linkId);
    links.push({ linkId, url: dest, trackingUrl, label: labelByLinkId[linkId] || linkId });
  };

  let i = -1;
  for (const t of collectTargets(doc.body, campaignId)) {
    if (t.type === 'anchor') {
      i += 1;
      const linkId = plan[i];
      if (!linkId) continue;
      const dest = destPlan[i] || t.url;
      const trackingUrl = makeUrl(linkId, dest);
      t.node.setAttribute('href', trackingUrl);
      pushLink(linkId, dest, trackingUrl);
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
          const dest = destPlan[i] || mt.url;
          const trackingUrl = makeUrl(linkId, dest);
          const a = doc.createElement('a');
          a.setAttribute('href', trackingUrl);
          a.textContent = mt.url;
          frag.appendChild(a);
          pushLink(linkId, dest, trackingUrl);
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
        dest: url,
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

    const destPlan = occurrences.map(() => null);
    const labelByLinkId = {};
    groups.forEach((g, gi) => {
      if (!g.selected) return;
      const dest = (g.dest || g.url || '').trim() || g.url;
      if (g.split) {
        // 各箇所を別イベントとして個別の linkId にする
        g.occ.forEach((o, oi) => {
          const label = (g.names[oi] || '').trim() || `link-${gi + 1}-${oi + 1}`;
          const id = uniqueId(g.names[oi] || `link-${gi + 1}-${oi + 1}`);
          plan[o.idx] = id;
          destPlan[o.idx] = dest;
          labelByLinkId[id] = label;
        });
      } else {
        // まとめて1イベント（同じ linkId を共有）
        const label = (g.name || '').trim() || `link-${gi + 1}`;
        const id = uniqueId(g.name || `link-${gi + 1}`);
        g.occ.forEach((o) => {
          plan[o.idx] = id;
          destPlan[o.idx] = dest;
        });
        labelByLinkId[id] = label;
      }
    });
    const result = buildHtml(html, baseUrl, campaignId, plan, labelByLinkId, destPlan);
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
                変換するURLを選び、レポートに表示する<strong>イベント名</strong>（例: 「○○用」）を付けてください。
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
                        <label className="lc-name">
                          <span>遷移先URL（受信者別に出し分ける場合はjcityの変数を入力）</span>
                          <input
                            value={g.dest}
                            onChange={(event) => patchGroup(g.url, { dest: event.target.value })}
                            placeholder="https://example.com/ または *URL* 等のjcity変数"
                          />
                        </label>
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
                            <span>イベント名</span>
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
