import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

// 変換した計測リンクを一覧表示し、URL毎に個別コピーできるパネル
export default function ConvertedLinks({ links }) {
  const [copied, setCopied] = useState('');

  if (!links?.length) return null;

  async function copy(text, key) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1400);
  }

  const copyAll = () => copy(links.map((l) => l.trackingUrl).join('\n'), '__all__');

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>変換した計測リンク（{links.length}件）</h2>
        <button className="ghost" onClick={copyAll}>
          {copied === '__all__' ? <><Check size={16} /> コピーしました</> : <><Copy size={16} /> すべてコピー</>}
        </button>
      </div>
      <p className="panel-note">
        本文には反映済みです。下は個別コピー用です（<code>{'{{EMAIL_ID}}'}</code> はjcityが配信時に各受信者IDへ置換します）。
      </p>
      <div className="converted-links">
        {links.map((link, index) => (
          <div className="converted-link" key={`${link.linkId}-${index}`}>
            <div className="converted-link-head">
              <strong>{link.linkId}</strong>
              <span className="cl-dest" title={link.url}>→ {link.url}</span>
              <button
                className="icon-button"
                onClick={() => copy(link.trackingUrl, `${link.linkId}-${index}`)}
                title="この計測リンクをコピー"
              >
                {copied === `${link.linkId}-${index}` ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <pre>{link.trackingUrl}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}
