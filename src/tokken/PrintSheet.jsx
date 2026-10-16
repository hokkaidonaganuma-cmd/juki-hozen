import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getTemplate, flattenRows, MARKS } from './templates.js';

const fmtDate = (s) => {
  if (!s) return '　　年　　月　　日';
  const [y, m, d] = s.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
};

// ---- ページ割り付け（A4縦・2段組み） ----
// 一度画面外で実寸を測ってから、項目（部位のまとまり）単位で段・ページに割り付ける
function buildUnits(tpl) {
  const units = []; let cur = null; let group = null;
  for (const r of flattenRows(tpl)) {
    if (r.section !== cur) { cur = r.section; units.push({ head: true, title: `${r.sno}. ${r.section}` }); }
    if (r.first) { group = { rows: [] }; units.push(group); }
    group.rows.push(r);
  }
  return units;
}

function paginate(units, hs, { cap1, capN, secH, bottomH }) {
  const cols = []; let col = []; let used = 0; let lastSec = null;
  const capOf = (i) => (i < 2 ? cap1 : capN);
  const flush = () => { cols.push(col); col = []; used = 0; };
  units.forEach((u, i) => {
    const need = u.head && units[i + 1] && !units[i + 1].head ? hs[i] + hs[i + 1] : hs[i]; // 見出しは次の項目と一緒に
    if (used + need > capOf(cols.length) && col.length) {
      flush();
      if (!u.head && lastSec) { col.push({ head: true, title: `${lastSec}（続き）` }); used += secH; }
    }
    col.push(u); used += hs[i];
    col.used = used;
    if (u.head) lastSec = u.title;
  });
  if (col.length) flush();
  if (cols.length % 2) cols.push(Object.assign([], { used: 0 }));
  const pages = [];
  for (let i = 0; i < cols.length; i += 2) pages.push([cols[i], cols[i + 1]]);
  const li = pages.length - 1;
  const lastUsed = Math.max(pages[li][0].used || 0, pages[li][1].used || 0);
  return { pages, bottomOnOwnPage: lastUsed + bottomH > (li === 0 ? cap1 : capN) };
}

function ColTable({ lines, results, measure }) {
  return (
    <table className="ps-items">
      <colgroup><col style={{ width: '34%' }} /><col style={{ width: '34%' }} /><col style={{ width: '7%' }} /><col /></colgroup>
      <thead><tr><th>検査項目</th><th>検査部位</th><th>結果</th><th>備考・措置</th></tr></thead>
      {lines.map((u, i) => (
        <tbody key={i} data-u={measure ? i : undefined}>
          {u.head ? (
            <tr className="ps-sec"><td colSpan={4}>{u.title}</td></tr>
          ) : u.rows.map((l, j) => (
            <tr key={j}>
              {l.part ? <>
                {j === 0 && <td rowSpan={u.rows.length}>{l.item}</td>}
                <td>{l.part}</td>
              </> : <td colSpan={2}>{l.item}</td>}
              <td className="ps-mark">{results?.[l.key]?.mark || ''}</td>
              <td className="ps-note">{results?.[l.key]?.note || ''}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

export default function PrintSheet({ record }) {
  const tpl = getTemplate(record.template_id);
  const units = useMemo(() => (tpl ? buildUnits(tpl) : []), [tpl]);
  const measureRef = useRef(null);
  const [layout, setLayout] = useState(null);
  useLayoutEffect(() => {
    const root = measureRef.current; if (!root) return;
    const q = (sel) => root.querySelector(sel).getBoundingClientRect().height;
    const mm = q('.ps-mm') / 100;
    const hs = units.map((_, i) => q(`tbody[data-u="${i}"]`));
    const theadH = q('.ps-items thead');
    const fixed = 297 * mm - 16 * mm - q('.ps-legend') - 2 * mm - 7 * mm - theadH; // 余白・凡例・ページ番号・表見出し
    const cap1 = fixed - q('.ps-first');
    const capN = fixed - q('.ps-cont') - 2 * mm;
    const secH = hs[units.findIndex((u) => u.head)];
    setLayout(paginate(units, hs, { cap1, capN, secH, bottomH: q('.ps-bottom') + 2.5 * mm }));
  }, [units, record]);
  if (!tpl) return <p>テンプレートが見つかりません</p>;
  const m = record.machine_snapshot || {};
  const meas = tpl.measurements || [];
  const spec = tpl.specFields.map(([f, u]) => `${f.replace(/（.*?）/, '')}：${m.spec?.[f] ?? ''}${m.spec?.[f] && u ? u : ''}`).join('　');

  const headTable = (
      <table className="ps-head">
        <tbody>
          <tr>
            <th>事業者名</th><td colSpan={3}>{record.owner_name}</td>
            <th>検査年月日</th><td>{fmtDate(record.inspected_on)}</td>
          </tr>
          <tr>
            <th>機械の名称</th><td>{tpl.short}</td>
            <th>管理番号</th><td>{m.name}</td>
            <th>次回検査期限</th><td>{fmtDate(record.next_due)}</td>
          </tr>
          <tr>
            <th>製造者</th><td>{m.maker}</td>
            <th>型式</th><td>{m.model}</td>
            <th>製造番号</th><td>{m.serial}</td>
          </tr>
          <tr>
            <th>製造年月</th><td>{m.made_on}</td>
            <th>能力</th><td colSpan={3}>{spec}</td>
          </tr>
          <tr>
            <th>稼働時間計</th><td>{record.hour_meter ? `${record.hour_meter} h` : ''}</td>
            <th>登録番号等</th><td>{m.plate}</td>
            <th>使用場所</th><td>{m.location}</td>
          </tr>
          <tr>
            <th>検査区分</th><td>{record.kind}</td>
            <th>検査者</th><td>{record.inspector_name}</td>
            <th>資格</th><td>{record.inspector_qual}</td>
          </tr>
          {record.kind === '検査業者' && (
            <tr><th>検査業者名</th><td colSpan={3}>{record.vendor_name}</td><th>登録番号</th><td>{record.vendor_reg_no}</td></tr>
          )}
        </tbody>
      </table>
  );
  const bottom = (
      <div className="ps-bottom">
        {meas.length > 0 && (
          <table className="ps-meas">
            <thead><tr><th>測定項目</th><th>基準値</th><th>測定値</th></tr></thead>
            <tbody>
              {meas.map(([name, unit]) => (
                <tr key={name}>
                  <td>{name}{unit && <span className="ps-unit">（{unit}）</span>}</td>
                  <td>{record.measurements?.[name]?.std || ''}</td>
                  <td>{record.measurements?.[name]?.val || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="ps-right">
          <table className="ps-repair">
            <tbody>
              <tr><th>補修等の内容</th></tr>
              <tr><td className="ps-repair-body">{record.repairs}</td></tr>
            </tbody>
          </table>
          <table className="ps-sign">
            <tbody>
              <tr><th>総合判定</th><th>検査者 印</th><th>確認者 印</th></tr>
              <tr><td className="ps-judge">{record.judgment}</td><td /><td /></tr>
            </tbody>
          </table>
        </div>
      </div>

  );
  const legend = (
      <div className="ps-legend">
        記号：{MARKS.map((x) => `${x.v} ${x.label}`).join('　')}
        <span className="ps-keep">※ 本記録は3年間保存すること（労働安全衛生規則）</span>
      </div>
  );
  const title = (
      <div className="ps-title">
        <h1>特定自主検査記録表</h1>
        <div className="ps-sub">{tpl.name}　<span>（{tpl.basis}）</span></div>
      </div>
  );
  if (!layout) {
    return (
      <div className="ps-page ps-measure" ref={measureRef} aria-hidden="true">
        <div className="ps-mm" style={{ height: '100mm' }} />
        <div className="ps-first">{title}{headTable}</div>
        <div className="ps-cont">続き</div>
        <div className="ps-cols"><ColTable lines={units} results={record.results} measure /><div /></div>
        {bottom}{legend}
      </div>
    );
  }
  const { pages, bottomOnOwnPage } = layout;
  const total = pages.length + (bottomOnOwnPage ? 1 : 0);
  const pageNo = (i) => <div className="ps-pageno">{m.name}　{fmtDate(record.inspected_on)}　{i + 1} / {total}</div>;

  return (
    <div className="ps-doc">
      {pages.map(([l, r], i) => (
        <div className="ps-page" key={i}>
          {i === 0 ? <>{title}{headTable}</> : <div className="ps-cont">特定自主検査記録表（{tpl.short}）続き</div>}
          <div className="ps-cols">
            <ColTable lines={l} results={record.results} />
            {r.length > 0 ? <ColTable lines={r} results={record.results} /> : <div />}
          </div>
          {i === pages.length - 1 && !bottomOnOwnPage && bottom}
          {legend}
          {pageNo(i)}
        </div>
      ))}
      {bottomOnOwnPage && (
        <div className="ps-page">
          <div className="ps-cont">特定自主検査記録表（{tpl.short}）続き</div>
          {bottom}{legend}{pageNo(pages.length)}
        </div>
      )}
    </div>
  );
}
