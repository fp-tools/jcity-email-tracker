import { useEffect, useRef, useState } from 'react';
import { Bold, Code, Eye, Highlighter, Image as ImageIcon, Italic, Link as LinkIcon, Underline } from 'lucide-react';

const FONT_SIZES = [
  { label: '小', value: '2' },
  { label: '標準', value: '3' },
  { label: '大', value: '5' },
  { label: '特大', value: '6' }
];

const URL_RE = /^https?:\/\/[^\s]+$/i;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

export default function HtmlEditor({ value, onChange, placeholder = '本文を入力…' }) {
  const ref = useRef(null);
  const savedRange = useRef(null);
  const focused = useRef(false);
  const [mode, setMode] = useState('rich'); // 'rich' | 'html'

  // 外部value -> DOM。フォーカス中（入力中）は触らない＝カーソル・入力を壊さない
  useEffect(() => {
    if (mode !== 'rich') return;
    const el = ref.current;
    if (el && !focused.current && el.innerHTML !== (value || '')) {
      el.innerHTML = value || '';
    }
  }, [value, mode]);

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0);
    }
  }

  function restoreSelection() {
    ref.current?.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  function exec(command, arg) {
    restoreSelection();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(command, false, arg);
    emit();
    saveSelection();
  }

  const selectedText = () => (savedRange.current?.toString() || '').trim();

  // ボタン系: フォーカスを奪わない（選択範囲を保持）
  function btn(command, arg) {
    return {
      onMouseDown: (event) => {
        event.preventDefault();
        exec(command, arg);
      }
    };
  }

  function applyLink(event) {
    event.preventDefault();
    saveSelection();
    const sel = selectedText();
    if (sel && URL_RE.test(sel)) {
      // 本文で選択したURL文字列をそのままリンク化
      exec('createLink', sel);
    } else if (sel) {
      // 選択したテキストを、指定URLのリンクに変換
      const url = window.prompt('リンク先URL', 'https://');
      if (url) exec('createLink', url);
    } else {
      // 選択なし: URLを入力してリンクを挿入
      const url = window.prompt('リンク先URL', 'https://');
      if (url) exec('insertHTML', `<a href="${escAttr(url)}">${esc(url)}</a>`);
    }
  }

  function applyImage(event) {
    event.preventDefault();
    saveSelection();
    const sel = selectedText();
    // 本文で選択したURL文字列を画像化、なければURL入力
    const src = sel && URL_RE.test(sel) ? sel : window.prompt('画像URL', 'https://');
    if (!src) return;
    exec('insertHTML', `<img src="${escAttr(src)}" alt="" style="max-width:100%;height:auto;" />`);
  }

  return (
    <div className="html-editor">
      <div className="html-editor-toolbar">
        {mode === 'rich' ? (
          <>
            <button type="button" className="ed-btn" title="太字" {...btn('bold')}><Bold size={16} /></button>
            <button type="button" className="ed-btn" title="斜体" {...btn('italic')}><Italic size={16} /></button>
            <button type="button" className="ed-btn" title="下線" {...btn('underline')}><Underline size={16} /></button>

            <span className="ed-sep" />

            <span className="ed-color" title="文字色">
              A
              <input
                type="color"
                onMouseDown={saveSelection}
                onChange={(event) => exec('foreColor', event.target.value)}
              />
            </span>
            <span className="ed-color highlight" title="ハイライト">
              <Highlighter size={15} />
              <input
                type="color"
                defaultValue="#fff59d"
                onMouseDown={saveSelection}
                onChange={(event) => exec('hiliteColor', event.target.value)}
              />
            </span>

            <span className="ed-sep" />

            <select
              className="ed-select"
              title="フォントサイズ"
              defaultValue=""
              onMouseDown={saveSelection}
              onChange={(event) => {
                if (event.target.value) exec('fontSize', event.target.value);
                event.target.value = '';
              }}
            >
              <option value="" disabled>サイズ</option>
              {FONT_SIZES.map((size) => (
                <option key={size.value} value={size.value}>{size.label}</option>
              ))}
            </select>

            <span className="ed-sep" />

            <button type="button" className="ed-btn" title="リンク挿入 / 選択範囲をリンク化" onMouseDown={applyLink}><LinkIcon size={16} /></button>
            <button type="button" className="ed-btn" title="画像挿入 / 選択したURLを画像化" onMouseDown={applyImage}><ImageIcon size={16} /></button>
          </>
        ) : (
          <span className="ed-mode-label">HTMLソースを直接編集</span>
        )}

        <button
          type="button"
          className="ed-btn ed-mode-toggle"
          title={mode === 'rich' ? 'HTMLソースを編集' : 'エディタに戻る'}
          onClick={() => setMode((current) => (current === 'rich' ? 'html' : 'rich'))}
        >
          {mode === 'rich' ? <><Code size={16} /> HTML編集</> : <><Eye size={16} /> エディタ</>}
        </button>
      </div>

      {mode === 'rich' ? (
        <div
          ref={ref}
          className="html-editor-area"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={emit}
          onFocus={() => { focused.current = true; }}
          onBlur={() => { focused.current = false; saveSelection(); emit(); }}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
        />
      ) : (
        <textarea
          className="html-editor-source"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="<table>...</table> など、HTMLタグを直接編集できます"
          rows="12"
        />
      )}
    </div>
  );
}
