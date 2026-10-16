import { rowResult } from './formModel.js';

const mm = (v) => `${v}mm`;
const INK = '#0b2a8a'; // 画面上の記入色（印刷時は黒）

function Mark({ x, y, children, size = 3.6, sel }) {
  return (
    <div className={`ov-el ov-mark ${sel ? 'sel' : ''}`} style={{ left: mm(x - size / 2), top: mm(y - size / 2), width: mm(size), height: mm(size), fontSize: mm(size * 0.95) }}>
      {children}
    </div>
  );
}
function Circle({ b, sel }) {
  return <div className={`ov-el ov-circle ${sel ? 'sel' : ''}`} style={{ left: mm(b.x - 0.6), top: mm(b.y - 0.4), width: mm(b.w + 1.2), height: mm(b.h + 0.8) }} />;
}
function Strike({ b }) {
  return <div className="ov-el ov-strike" style={{ left: mm(b.x), top: mm(b.y + b.h / 2), width: mm(b.w) }} />;
}
function Ghost({ b, label, sel, onPick }) {
  // 位置合わせ編集用：枠と名前を表示
  return (
    <div className={`ov-ghost ${sel ? 'sel' : ''}`} onPointerDown={onPick}
      style={{ left: mm(b.x), top: mm(b.y), width: mm(b.w || 4), height: mm(b.h || 4) }} title={label} />
  );
}

// 検査内容のレの位置：枠の中央（form.markAt で 'left' / 'right' も可）
const markPoint = (b, at) => ({ x: at === 'left' ? b.x + 1.8 : at === 'right' ? b.x + b.w - 1.8 : b.x + b.w / 2, y: b.y + b.h / 2 });

export default function OverlaySheet({ form, values, showBg = true, editing, selected, onPick, bgBase = 'forms/' }) {
  const { w, h } = form.paper;
  const v = values || {};
  const isSel = (id) => selected === id;
  return (
    <div className="ov-doc">
      {form.pages.map((pg, pi) => (
        <div key={pi} className="ov-page" style={{ width: mm(w), height: mm(h) }}>
          {showBg && (pg.bg || pg.img) && <img className="ov-bg" src={pg.bg || window.__TOKKEN_BG?.[pg.img] || `${bgBase}${pg.img}.jpg`} alt="" style={{ width: mm(w), height: mm(h) }} />}
          <div className="ov-layer">
            {[[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]].map(([cx, cy]) => (
              <div key={`${cx}-${cy}`} className="ov-cross" style={{ left: mm(cx - 4), top: mm(cy - 4) }} />
            ))}
            {(pg.header || []).map((f) => (
              <div key={f.key} className={`ov-el ov-text ${isSel(`h:${pi}:${f.key}`) ? 'sel' : ''}`}
                style={{ left: mm(f.x), top: mm(form.yCenter ? f.y - (f.size || 9) * 0.2 : f.y), width: mm(f.w || 40), fontSize: `${f.size || 9}pt`, textAlign: f.align || 'left' }}
                onPointerDown={editing ? (e) => onPick(e, `h:${pi}:${f.key}`) : undefined}>
                {v.header?.[f.key] || (editing ? `［${f.label}］` : '')}
              </div>
            ))}
            {(pg.boxes || []).map((f) => (
              <div key={f.key} className={`ov-el ov-box ${isSel(`b:${pi}:${f.key}`) ? 'sel' : ''}`}
                style={{ left: mm(f.x), top: mm(f.y), width: mm(f.w), height: mm(f.h), fontSize: `${f.size || 8}pt` }}
                onPointerDown={editing ? (e) => onPick(e, `b:${pi}:${f.key}`) : undefined}>
                {v.boxes?.[f.key] || (editing ? `［${f.label}］` : '')}
              </div>
            ))}
            {(pg.lines || []).map((f) => {
              const ls = (v.boxes?.[f.key] || '').split('\n');
              return f.ys.map((y, i) => (ls[i] || (editing && i === 0)) ? (
                <div key={`${f.key}-${i}`} className="ov-el ov-text" style={{ left: mm(f.x), top: mm(y - (f.size || 9) * 0.2), width: mm(f.w), fontSize: `${f.size || 9}pt` }}>
                  {ls[i] || `［${f.label}］`}
                </div>) : null);
            })}
            {pg.table && (v.table?.[pg.table.key] || (editing ? [{}] : [])).slice(0, pg.table.ys.length).map((row, i) =>
              pg.table.cols.map((c) => (row[c.k] || editing) ? (
                <div key={`${i}-${c.k}`} className="ov-el ov-text" style={{ left: mm(c.x), top: mm(pg.table.ys[i] - (pg.table.size || 8.5) * 0.2), width: mm(c.w), fontSize: `${pg.table.size || 8.5}pt`, textAlign: c.align || 'left' }}>
                  {row[c.k] || (editing ? `［${c.label}］` : '')}
                </div>) : null))}
            {(pg.rows || []).map((r) => {
              const rv = v.rows?.[r.id] || {};
              const res = rowResult(rv);
              const els = [];
              const id = (part) => `r:${pi}:${r.id}:${part}`;
              if (editing) {
                if (r.place) els.push(<Ghost key="p" b={r.place} label={`${r.no} ${r.place.label}`} sel={isSel(id('place'))} onPick={(e) => onPick(e, id('place'))} />);
                r.contents?.forEach((c, i) => els.push(<Ghost key={`c${i}`} b={c} label={c.label} sel={isSel(id(`c${i}`))} onPick={(e) => onPick(e, id(`c${i}`))} />));
                r.methods?.forEach((c, i) => els.push(<Ghost key={`m${i}`} b={c} label={c.label} sel={isSel(id(`m${i}`))} onPick={(e) => onPick(e, id(`m${i}`))} />));
                ['good', 'bad', 'repair'].forEach((k) => r[k] && els.push(
                  <Ghost key={k} b={{ x: r[k].x - 2, y: r[k].y - 2, w: 4, h: 4 }} label={k} sel={isSel(id(k))} onPick={(e) => onPick(e, id(k))} />));
              }
              // 検査内容
              r.contents?.forEach((c, i) => {
                const s = rv.contents?.[i];
                if (s === 'ok' && v.opts?.contentMarks !== false) { const p = { x: c.x + 1.2, y: c.y + c.h / 2 }; els.push(<Mark key={`co${i}`} {...p} size={2.8}>レ</Mark>); }
                if (s === 'ng') els.push(<Circle key={`cn${i}`} b={c} />);
                if (s === 'na') els.push(<Strike key={`cs${i}`} b={c} />);
              });
              // 検査箇所：不良は○、対象外は―
              if (r.place && res === 'ng') els.push(<Circle key="pn" b={r.place} />);
              if (r.place && res === 'na') els.push(<Strike key="ps" b={r.place} />);
              // 検査方法
              r.methods?.forEach((c, i) => {
                if (!rv.methods?.[i] || res === 'na') return;
                if (res === 'ng') els.push(<Circle key={`mn${i}`} b={c} />);
                else { const p = markPoint(c, form.markAt); els.push(<Mark key={`mo${i}`} {...p}>レ</Mark>); }
              });
              // 検査結果・補修
              if (res === 'ok' && r.good) els.push(<Mark key="g" {...r.good}>レ</Mark>);
              if (res === 'ng' && r.bad) els.push(<Mark key="b" {...r.bad}>レ</Mark>);
              if (res === 'na') ['good', 'bad', 'repair'].forEach((k) => r[k] && els.push(<Mark key={`na${k}`} {...r[k]}>―</Mark>));
              if (res !== 'na' && rv.repair && r.repair) els.push(<Mark key="rp" {...r.repair}>{rv.repair}</Mark>);
              return els;
            })}
          </div>
        </div>
      ))}
      <style>{`.ov-el{color:${INK}}`}</style>
    </div>
  );
}
