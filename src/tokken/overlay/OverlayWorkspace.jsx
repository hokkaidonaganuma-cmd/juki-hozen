import { useEffect, useMemo, useRef, useState } from 'react';
import OverlaySheet from './OverlaySheet.jsx';
import { HEADER_KEYS, BOX_KEYS, REPAIR_MARKS, rowResult, buildRequests } from './formModel.js';
import './overlay.css';

const CYCLE = { '': 'ok', ok: 'ng', ng: 'na', na: '' };
const STATE_LABEL = { ok: 'レ', ng: '○', na: '―', '': '' };

// ---------------- 記入 ----------------
const uniqBy = (arr, k) => { const seen = new Set(); return arr.filter((x) => (seen.has(x[k]) ? false : seen.add(x[k]))); };

function Entry({ form, values, onChange, dateText }) {
  const v = values;
  const set = (patch) => onChange({ ...v, ...patch });
  const setRow = (id, patch) => set({ rows: { ...v.rows, [id]: { ...v.rows?.[id], ...patch } } });
  const setHead = (k, val) => set({ header: { ...v.header, [k]: val } });
  const allRows = form.pages.flatMap((p) => p.rows || []);
  const allHead = uniqBy(form.pages.flatMap((p) => p.header || []), 'key');
  const headerFields = allHead.filter((f) => f.group !== '測定値' && f.key !== 'see_zc');
  const measFields = allHead.filter((f) => f.group === '測定値');
  const lineFields = form.pages.flatMap((p) => [...(p.lines || []), ...(p.boxes || [])]);
  const table = form.pages.map((p) => p.table).find(Boolean);
  const tableRows = v.table?.[table?.key] || [];
  const done = allRows.filter((r) => (r.contents || []).every((_, i) => v.rows?.[r.id]?.contents?.[i]) && rowResult(v.rows?.[r.id])).length;
  const ngRows = allRows.filter((r) => rowResult(v.rows?.[r.id]) === 'ng');

  const fillAll = () => {
    const rows = { ...v.rows };
    allRows.forEach((r) => {
      const cur = rows[r.id] || {};
      if (cur.locked) return;
      const contents = { ...cur.contents };
      (r.contents || []).forEach((_, i) => { if (!contents[i]) contents[i] = 'ok'; });
      if (!(r.contents || []).length) contents[0] = contents[0] || 'ok';
      rows[r.id] = { ...cur, contents };
    });
    set({ rows });
  };
  const build = () => {
    const { requests, measures } = buildRequests(form, v, dateText);
    const any = requests || measures.length;
    set({ boxes: { ...v.boxes, requests }, table: { ...v.table, ...(table ? { [table.key]: measures } : {}) },
      header: { ...v.header, see_zc: any ? '別紙 様式SR-ZC-03に記載' : '' } });
  };
  const setCell = (i, k, val) => {
    const rows = tableRows.slice(); while (rows.length <= i) rows.push({});
    rows[i] = { ...rows[i], [k]: val }; set({ table: { ...v.table, [table.key]: rows } });
  };

  let sec = null;
  return (
    <div className="ov-entry">
      <section className="tk-card">
        <h3>表題部</h3>
        <p className="tk-muted">機械台帳と既定値から自動入力済み。検査者氏名・責任者名は印刷後に自署します。</p>
        <div className="tk-grid">
          {headerFields.map((f) => (
            <label key={f.key} className="tk-field"><span>{f.label}</span>
              <input id={`h-${f.key}`} value={v.header?.[f.key] || ''} onChange={(e) => setHead(f.key, e.target.value)} /></label>
          ))}
        </div>
      </section>

      {measFields.length > 0 && (
        <section className="tk-card">
          <h3>測定値</h3>
          <div className="tk-grid">
            {measFields.map((f) => (
              <label key={f.key} className="tk-field"><span>{f.label}</span>
                <input id={`h-${f.key}`} inputMode="decimal" value={v.header?.[f.key] || ''} onChange={(e) => setHead(f.key, e.target.value)} /></label>
            ))}
          </div>
        </section>
      )}

      <div className="tk-toolbar">
        <span className="tk-progress">記入 {done}/{allRows.length}{ngRows.length > 0 && <b className="tk-ng">　不良 {ngRows.length}</b>}</span>
        <button className="tk-btn" onClick={fillAll}>未記入をすべて「良」</button>
        <label className="ov-check"><input type="checkbox" checked={v.opts?.contentMarks !== false}
          onChange={(e) => set({ opts: { ...v.opts, contentMarks: e.target.checked } })} /> 検査内容の各項目にもレを印字</label>
      </div>
      <p className="tk-muted">検査内容をタップ：レ（良）→ ○（不良）→ ―（対象外）→ 空欄。1つでも○があればその行は「不良」になります。</p>

      <section className="tk-card">
        {allRows.map((r) => {
          const rv = v.rows?.[r.id] || {};
          const res = rowResult(rv);
          const conts = r.contents?.length ? r.contents : [{ label: '（検査）' }];
          const head = r.section !== sec ? (sec = r.section, <h3 key={`s-${r.id}`} className="ov-sec">{r.section}</h3>) : null;
          return [head,
            <div key={r.id} className={`ov-row ${res}`}>
              <div className="ov-row-head">
                <span className="ov-no">{r.no}</span><b>{r.place?.label}</b>
                <span className={`ov-res ${res}`}>{rv.locked ? '装備なし（―）' : res === 'ok' ? '良' : res === 'ng' ? '不良' : res === 'na' ? '対象外' : ''}</span>
              </div>
              <div className="ov-chips">
                {conts.map((c, i) => {
                  const st = rv.contents?.[i] || '';
                  return (
                    <button key={i} className={`ov-chip ${st}`} disabled={rv.locked} onClick={() => setRow(r.id, { contents: { ...rv.contents, [i]: CYCLE[st] } })}>
                      <i>{STATE_LABEL[st]}</i>{c.label}
                    </button>
                  );
                })}
              </div>
              {res === 'ng' && (
                <div className="ov-ng-wrap">
                  {(r.methods || []).length > 0 && (
                    <div className="ov-chips methods">
                      <span className="tk-muted">判定に用いた方法（○で囲む）</span>
                      {r.methods.map((m, i) => (
                        <button key={i} className={`ov-chip small ${rv.methods?.[i] ? 'ng' : ''}`}
                          onClick={() => setRow(r.id, { methods: { ...rv.methods, [i]: !rv.methods?.[i] } })}>{m.label}</button>
                      ))}
                    </div>
                  )}
                  <div className="ov-ng">
                    <select value={rv.repair || ''} onChange={(e) => setRow(r.id, { repair: e.target.value })}>
                      <option value="">補修なし（事業者へ要請）</option>
                      {REPAIR_MARKS.map((m) => <option key={m.v} value={m.v}>{m.v} {m.label}</option>)}
                    </select>
                    <input placeholder="不具合の状況（例：ホース亀裂）" value={rv.note || ''} onChange={(e) => setRow(r.id, { note: e.target.value })} />
                    {rv.repair && <input placeholder="補修実施内容（例：ホース交換）" value={rv.fix || ''} onChange={(e) => setRow(r.id, { fix: e.target.value })} />}
                  </div>
                </div>
              )}
            </div>];
        })}
      </section>

      <section className="tk-card">
        <div className="tk-flex"><h3>事業者への要請等・補修等の措置内容（様式SR-ZC-03）</h3><button className="tk-btn small" onClick={build}>不良項目から自動作成</button></div>
        {lineFields.map((f) => (
          <label key={f.key} className="tk-field"><span>{f.label}（1行＝用紙の1行）</span>
            <textarea rows={4} value={v.boxes?.[f.key] || ''} onChange={(e) => set({ boxes: { ...v.boxes, [f.key]: e.target.value } })} /></label>
        ))}
        {table && (
          <div className="ov-table">
            <div className="ov-trow head">{table.cols.map((c) => <span key={c.k}>{c.label}</span>)}</div>
            {[...tableRows, {}].slice(0, table.ys.length).map((row, i) => (
              <div key={i} className="ov-trow">
                {table.cols.map((c) => <input key={c.k} aria-label={c.label} value={row[c.k] || ''} onChange={(e) => setCell(i, c.k, e.target.value)} />)}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------- 位置合わせ ----------------
function getEl(form, id) {
  const [t, pi, a, b] = id.split(':');
  const pg = form.pages[+pi];
  if (t === 'h') return pg.header.find((f) => f.key === a);
  if (t === 'b') return pg.boxes.find((f) => f.key === a);
  const r = pg.rows.find((x) => x.id === a);
  if (b === 'place') return r.place;
  if (b[0] === 'c' && /^\d+$/.test(b.slice(1))) return r.contents[+b.slice(1)];
  if (b[0] === 'm' && /^\d+$/.test(b.slice(1))) return r.methods[+b.slice(1)];
  return r[b];
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const r1 = (n) => Math.round(n * 10) / 10;

function Editor({ form, onChange, values, bgBase }) {
  const [sel, setSel] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [json, setJson] = useState('');
  const drag = useRef(null);
  const wrap = useRef(null);

  const mutate = (fn) => { const f = clone(form); fn(f); onChange(f); };
  const pxPerMm = () => { const pg = wrap.current?.querySelector('.ov-page'); return pg ? pg.getBoundingClientRect().width / form.paper.w : 3.78; };

  const onPick = (e, id) => {
    e.stopPropagation(); e.preventDefault();
    setSel(id);
    const el = getEl(form, id);
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, k: pxPerMm() };
  };
  useEffect(() => {
    const move = (e) => {
      const d = drag.current; if (!d) return;
      const dx = (e.clientX - d.sx) / d.k; const dy = (e.clientY - d.sy) / d.k;
      if (Math.abs(dx) + Math.abs(dy) < 0.3) return;
      mutate((f) => { const el = getEl(f, d.id); el.x = r1(d.ox + dx); el.y = r1(d.oy + dy); });
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  });
  useEffect(() => {
    const key = (e) => {
      if (!sel || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      const step = e.shiftKey ? 1 : 0.2;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      mutate((f) => { const el = getEl(f, sel); el.x = r1(el.x + d[0]); el.y = r1(el.y + d[1]); });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const el = sel ? getEl(form, sel) : null;
  const setNum = (k) => (e) => mutate((f) => { getEl(f, sel)[k] = Number(e.target.value); });

  // 選択した行以降の全要素を縦にずらす（行ピッチの微調整）
  const shiftFrom = (dy) => mutate((f) => {
    const [, pi, rid] = sel.split(':');
    const rows = f.pages[+pi].rows; const start = rows.findIndex((r) => r.id === rid);
    rows.slice(start).forEach((r, k) => {
      const d = dy * (k + 1);
      [r.place, ...(r.contents || []), ...(r.methods || []), r.good, r.bad, r.repair].forEach((b) => { if (b) b.y = r1(b.y + d); });
    });
  });

  const loadBg = (pi) => (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => mutate((f) => { f.pages[pi].bg = rd.result; });
    rd.readAsDataURL(file);
  };

  return (
    <div className="ov-editor">
      <div className="ov-panel tk-card">
        <div className="tk-flex">
          <label className="tk-field"><span>表示倍率</span>
            <input type="range" min="0.6" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(+e.target.value)} /></label>
          {form.pages.map((_, pi) => (
            <label key={pi} className="tk-btn small ov-file">{pi + 1}枚目のスキャン画像<input type="file" accept="image/*" onChange={loadBg(pi)} /></label>
          ))}
        </div>
        {el ? (
          <div className="ov-sel">
            <b>{el.label || sel}</b>
            {['x', 'y', 'w', 'h', 'size'].filter((k) => k in el).map((k) => (
              <label key={k} className="ov-num">{k}<input type="number" step="0.1" value={el[k]} onChange={setNum(k)} /></label>
            ))}
            {sel.startsWith('r:') && <>
              <button className="tk-btn small" onClick={() => shiftFrom(0.1)}>この行以降 ピッチ +0.1</button>
              <button className="tk-btn small" onClick={() => shiftFrom(-0.1)}>−0.1</button>
            </>}
            <span className="tk-muted">ドラッグで移動、矢印キーで0.2mm（Shiftで1mm）</span>
          </div>
        ) : <p className="tk-muted">青い枠をクリックして選び、スキャン画像の位置に合わせます。</p>}
      </div>
      <div className="ov-canvas" ref={wrap} style={{ '--ov-zoom': zoom }}>
        <OverlaySheet form={form} values={values} editing selected={sel} onPick={onPick} bgBase={bgBase} />
      </div>
      <details className="tk-card">
        <summary>様式データ（JSON）の書き出し・読み込み</summary>
        <div className="tk-flex">
          <button className="tk-btn small" onClick={() => setJson(JSON.stringify({ ...form, pages: form.pages.map((p) => ({ ...p, bg: undefined })) }, null, 1))}>書き出す</button>
          <button className="tk-btn small" onClick={() => { try { const f = JSON.parse(json); f.pages.forEach((p, i) => { p.bg = p.bg || form.pages[i]?.bg; }); onChange(f); } catch (err) { setJson(`読み込めません：${err.message}\n\n${json}`); } }}>読み込む</button>
        </div>
        <textarea rows={8} value={json} onChange={(e) => setJson(e.target.value)} />
      </details>
    </div>
  );
}

// ---------------- 印刷 ----------------
function PrintView({ form, values, calib, onCalib, canPrint, bgBase }) {
  const [mode, setMode] = useState('overlay');
  const c = { dx: 0, dy: 0, sx: 100, sy: 100, ...calib };
  const set = (k) => (e) => onCalib({ ...c, [k]: Number(e.target.value) });
  return (
    <div className={`ov-print mode-${mode}`} style={{ '--ov-dx': `${c.dx}mm`, '--ov-dy': `${c.dy}mm`, '--ov-sx': c.sx / 100, '--ov-sy': c.sy / 100 }}>
      <style>{`@page { size: ${form.paper.w}mm ${form.paper.h}mm; margin: 0; }`}</style>
      <div className="tk-card no-print">
        <div className="tk-flex">
          <label className="tk-field"><span>印刷のしかた</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="overlay">購入した用紙に重ね印刷（記入内容だけ）</option>
              <option value="test">位置合わせテスト（白紙に記入内容＋枠線）</option>
            </select></label>
          {canPrint && <button className="tk-btn primary" onClick={() => window.print()}>印刷</button>}
        </div>
        <details>
          <summary>プリンターのズレ補正</summary>
          <p className="tk-muted">テスト印刷を用紙に重ねて透かし、ズレた分を入力します（右・下がプラス）。プリンターごとに一度合わせれば保存されます。印刷時は「実際のサイズ（100%）」「余白なし」を選んでください。</p>
          <div className="tk-flex">
            <label className="ov-num">左右 mm<input type="number" step="0.1" value={c.dx} onChange={set('dx')} /></label>
            <label className="ov-num">上下 mm<input type="number" step="0.1" value={c.dy} onChange={set('dy')} /></label>
            <label className="ov-num">横倍率 %<input type="number" step="0.1" value={c.sx} onChange={set('sx')} /></label>
            <label className="ov-num">縦倍率 %<input type="number" step="0.1" value={c.sy} onChange={set('sy')} /></label>
          </div>
        </details>
      </div>
      <div className="ov-canvas print-target">
        <OverlaySheet form={form} values={values} showBg bgBase={bgBase} />
      </div>
    </div>
  );
}

export default function OverlayWorkspace({ form, onFormChange, values, onValuesChange, calib, onCalib, canPrint = true, initialTab = 'entry', dateText = '', bgBase = 'forms/' }) {
  const [tab, setTab] = useState(initialTab);
  const tabs = useMemo(() => [['entry', '記入'], ['print', '印刷'], ['edit', '位置合わせ']], []);
  return (
    <div className="ov-ws">
      <div className="ov-tabs no-print" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`ov-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'entry' && <Entry form={form} values={values} onChange={onValuesChange} dateText={dateText} />}
      {tab === 'edit' && <Editor form={form} onChange={onFormChange} values={values} bgBase={bgBase} />}
      {tab === 'print' && <PrintView form={form} values={values} calib={calib} onCalib={onCalib} canPrint={canPrint} bgBase={bgBase} />}
    </div>
  );
}

export { HEADER_KEYS, BOX_KEYS };
