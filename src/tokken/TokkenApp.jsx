import { useEffect, useMemo, useState, useCallback } from 'react';
import { TEMPLATES, getTemplate, flattenRows, MARKS, NG_MARKS } from './templates.js';
import PrintSheet from './PrintSheet.jsx';
import OverlayWorkspace from './overlay/OverlayWorkspace.jsx';
import { autoHeader, emptyValues, rowResult, lockedRows, formatPerf } from './overlay/formModel.js';
import KENNI from './overlay/forms/kenni.json';
import './tokken.css';

// ---------- 日付ユーティリティ ----------
const today = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const addMonths = (s, n) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d));
  if (dt.getUTCDate() !== d) dt.setUTCDate(0); // 月末補正
  return dt.toISOString().slice(0, 10);
};
const daysUntil = (s) => (s ? Math.round((new Date(s) - new Date(today())) / 86400000) : null);
const jp = (s) => (s ? s.replaceAll('-', '/') : '―');

const SAMPLE_MACHINES = [
  { template_id: 'wheel_loader', form_id: 'SR-GL', name: 'WL-01', maker: 'コマツ', model: 'WA100-8', serial: 'H12345', made_on: '2019-10', plate: '', location: '北広島市内 除雪現場', spec: { 機体質量: '5.4', バケット容量: '1.0', 定格出力: '53' }, last_inspected_on: '2025-11-05' },
  { template_id: 'excavator_crawler', name: 'BH-01', maker: 'コベルコ', model: 'SK135SR-7', serial: 'YY07-12345', made_on: '2020-04', plate: '', location: '本社ヤード', spec: { 機体質量: '13.9', バケット容量: '0.5', 定格出力: '72' }, last_inspected_on: '2025-10-20' },
  { template_id: 'forklift', name: 'FL-01', maker: 'トヨタL&F', model: '8FD25', serial: '8FD25-12345', made_on: '2017-06', plate: '', location: '倉庫', spec: { 最大荷重: '2.5', 最大揚高: '3000', '動力（エンジン/バッテリー）': 'ディーゼル' } },
];

export const kenniForm = (id) => KENNI.find((f) => f.id === id);
const cycleOf = (m) => kenniForm(m.form_id)?.cycleMonths || getTemplate(m.template_id)?.cycleMonths || 12;

// 保全台帳の機種名 → 記録表の機種・建荷協用紙（キーワードで判定）
export function guessKind(kishu = '') {
  const k = kishu.replace(/\s/g, '');
  const has = (...w) => w.some((x) => k.includes(x));
  if (has('クレーン機能', 'クレーン付', 'クレーン仕様')) return { template_id: 'excavator_crane', form_id: 'SR-ECC' };
  if (has('ホイールローダ', 'タイヤショベル', 'ホイールショベル', 'スキッドステア', 'トラクターショベル(ホイール', 'トラクター・ショベル(ホイール', 'ショベルローダ')) return { template_id: 'wheel_loader', form_id: 'SR-GL' };
  if (has('ホイール') && has('ショベル', 'バックホ', 'ユンボ')) return { template_id: 'excavator_wheel', form_id: 'SR-EHW' };
  if (has('油圧ショベル', 'バックホ', 'ユンボ', 'パワーショベル', 'ショベル')) return { template_id: 'excavator_crawler', form_id: '' };
  if (has('ブルドーザ', 'ブル・ドーザ', 'ドーザ', 'クローラローダ', 'ドーザショベル')) return { template_id: 'bulldozer', form_id: 'SR-GB' };
  if (has('振動ローラ', 'コンバインドローラ', 'ハンドガイド')) return { template_id: 'vibratory_roller', form_id: 'SR-RV' };
  if (has('クローラダンプ', 'キャリア', '不整地')) return { template_id: 'carrier', form_id: 'SR-GR' };
  if (has('グレーダ')) return { template_id: 'motor_grader', form_id: '' };
  if (has('フォークリフト', 'フォーク')) return { template_id: 'forklift', form_id: '' };
  if (has('高所作業')) return { template_id: 'aerial', form_id: '' };
  if (has('ブレーカ')) return { template_id: 'breaker', form_id: '' };
  if (has('圧砕', '解体', 'つかみ')) return { template_id: 'crusher', form_id: '' };
  return null; // 特定自主検査の対象外（ダンプ・トラック等）
}

// 保全台帳の機械を記録表の機械に反映（新規は自動登録、既存は台帳の情報で更新）
let syncing = null; // 同時実行で二重登録しないように
function syncLedger(...a) {
  if (!syncing) syncing = syncLedgerInner(...a).finally(() => { syncing = null; });
  return syncing;
}
async function syncLedgerInner(store, ledgerMachines, current) {
  const byLedger = new Map(current.filter((m) => m.ledger_machine_id).map((m) => [m.ledger_machine_id, m]));
  const skipped = [];
  for (const lm of ledgerMachines) {
    const base = {
      ledger_machine_id: lm.id, name: lm.kanri_no || '', maker: lm.maker || '', model: lm.katashiki || '',
      serial: lm.chassis_no || '', location: lm.basho || '', next_legal_date: lm.next_legal_date || null,
      hours: lm.hours ?? null, shaken: lm.shaken_date || '', kishu: lm.kishu || '',
    };
    const cur = byLedger.get(lm.id);
    if (cur) {
      const changed = Object.entries(base).some(([k, v]) => String(cur[k] ?? '') !== String(v ?? ''));
      if (changed) await store.saveMachine({ ...cur, ...base });
      continue;
    }
    const kind = guessKind(lm.kishu);
    if (!kind) { skipped.push(lm); continue; }
    await store.saveMachine({ ...base, ...kind, spec: {}, na_rows: [] });
  }
  return skipped;
}

function dueOf(machine, records) {
  const tpl = { cycleMonths: cycleOf(machine) };
  const last = records.find((r) => r.machine_id === machine.id && r.inspected_on);
  if (last) return { last: last.inspected_on, due: last.next_due || addMonths(last.inspected_on, tpl?.cycleMonths || 12) };
  if (machine.last_inspected_on) return { last: machine.last_inspected_on, due: addMonths(machine.last_inspected_on, tpl?.cycleMonths || 12) };
  if (machine.next_legal_date) return { last: null, due: machine.next_legal_date };
  return { last: null, due: null };
}

function DueBadge({ due }) {
  const d = daysUntil(due);
  if (d === null) return <span className="tk-badge gray">未検査</span>;
  if (d < 0) return <span className="tk-badge red">期限切れ {-d}日</span>;
  if (d <= 30) return <span className="tk-badge amber">あと{d}日</span>;
  return <span className="tk-badge green">期限 {jp(due)}</span>;
}

// ---------- 機械台帳 編集 ----------
function NaRowsPicker({ formId, value, onChange }) {
  const form = kenniForm(formId);
  if (!form) return null;
  const rows = form.pages.flatMap((p) => p.rows || []);
  const set = new Set(value || []);
  const toggle = (id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); onChange([...n]); };
  let sec = null;
  return (
    <details className="tk-card ov-na" open={set.size > 0}>
      <summary>装備されていない項目（{set.size}件）― 型式に付いていない装置は「―」で消して印刷し、チェックできなくします</summary>
      <div className="ov-na-list">
        {rows.map((r) => {
          const head = r.section !== sec ? (sec = r.section, <b key={`s${r.id}`} className="ov-na-sec">{r.section}</b>) : null;
          return [head, (
            <label key={r.id} className={`ov-na-item ${set.has(r.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={set.has(r.id)} onChange={() => toggle(r.id)} />
              <span>{r.no} {r.place?.label}</span>
            </label>)];
        })}
      </div>
    </details>
  );
}

function MachineForm({ initial, onSave, onCancel, onDelete, machines = [] }) {
  const [m, setM] = useState(initial || { template_id: TEMPLATES[0].id, name: '', spec: {} });
  const tpl = getTemplate(m.template_id);
  const set = (k) => (e) => setM({ ...m, [k]: e.target.value });
  const setSpec = (k) => (e) => setM({ ...m, spec: { ...m.spec, [k]: e.target.value } });
  const groups = [...new Set(TEMPLATES.map((t) => t.group))];
  return (
    <div className="tk-card">
      <h2>{initial?.id ? '機械を編集' : '機械を登録'}</h2>
      <label className="tk-field wide">
        <span>記録表の用紙</span>
        <select value={m.form_id || ''} onChange={(e) => {
          const f = kenniForm(e.target.value);
          setM({ ...m, form_id: e.target.value, template_id: f && getTemplate(f.templateId) ? f.templateId : m.template_id, na_rows: [] });
        }}>
          <option value="">自社様式（白紙に印刷）</option>
          <optgroup label="建荷協の用紙に重ね印刷">
            {KENNI.map((f) => <option key={f.id} value={f.id}>{f.name}（{f.id}）</option>)}
          </optgroup>
        </select>
        <small>{m.form_id ? '購入した建荷協の記録表に、記入内容だけを印刷します。最後に様式SR-ZC-03-Aが付きます。' : '告示の検査項目に沿った自社様式をA4で印刷します。'}</small>
      </label>
      <label className="tk-field wide">
        <span>機種（検査周期・能力欄）</span>
        <select value={m.template_id} onChange={set('template_id')}>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {TEMPLATES.filter((t) => t.group === g).map((t) => <option key={t.id} value={t.id}>{t.short} ― {t.name}</option>)}
            </optgroup>
          ))}
        </select>
        <small>{tpl.basis}／検査周期 {cycleOf(m) / 12}年以内ごと</small>
      </label>
      <div className="tk-grid">
        <label className="tk-field"><span>管理番号・呼称 *</span><input value={m.name || ''} onChange={set('name')} placeholder="例：WL-01" /></label>
        <label className="tk-field"><span>製造者</span><input value={m.maker || ''} onChange={set('maker')} /></label>
        <label className="tk-field"><span>型式</span><input value={m.model || ''} onChange={set('model')} onBlur={() => {
          // 同じ型式・同じ用紙の機械があれば「装備されていない項目」を引き継ぐ
          if (m.na_rows?.length || !m.model || !m.form_id) return;
          const same = machines.find((x) => x.id !== m.id && x.model === m.model && x.form_id === m.form_id && x.na_rows?.length);
          if (same) setM((cur) => ({ ...cur, na_rows: same.na_rows }));
        }} /></label>
        <label className="tk-field"><span>製造番号</span><input value={m.serial || ''} onChange={set('serial')} /></label>
        <label className="tk-field"><span>製造年月</span><input type="month" value={m.made_on || ''} onChange={set('made_on')} /></label>
        <label className="tk-field"><span>登録番号・ナンバー</span><input value={m.plate || ''} onChange={set('plate')} /></label>
        <label className="tk-field"><span>使用場所</span><input value={m.location || ''} onChange={set('location')} /></label>
        <label className="tk-field"><span>車検有効期間（なければ空欄）</span><input value={m.shaken || ''} onChange={set('shaken')} /></label>
        <label className="tk-field"><span>前回検査日（移行用）</span><input type="date" value={m.last_inspected_on || ''} onChange={set('last_inspected_on')} /></label>
        {tpl.specFields.map(([f, u]) => (
          <label key={f} className="tk-field"><span>{f}{u && `（${u}）`}</span><input value={m.spec?.[f] || ''} onChange={setSpec(f)} /></label>
        ))}
      </div>
      {m.form_id && <NaRowsPicker formId={m.form_id} value={m.na_rows} onChange={(v) => setM({ ...m, na_rows: v })} />}
      {m.form_id && <p className="tk-muted">性能欄：{formatPerf(m, kenniForm(m.form_id)?.perf) || '（能力の欄に入力すると印字されます）'}</p>}
      <div className="tk-actions">
        {initial?.id && <DeleteButton onDelete={onDelete} />}
        <span className="tk-spacer" />
        <button className="tk-btn" onClick={onCancel}>キャンセル</button>
        <button className="tk-btn primary" disabled={!m.name} onClick={() => onSave(m)}>保存</button>
      </div>
    </div>
  );
}
function DeleteButton({ onDelete }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return <button className="tk-btn danger" onClick={() => (armed ? onDelete() : setArmed(true))}>{armed ? 'もう一度押すと削除' : '削除'}</button>;
}

// ---------- 設定（自動入力の既定値） ----------
function SettingsForm({ initial, onSave, onCancel }) {
  const [s, setS] = useState({ kind: '事業内検査', ...initial });
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  return (
    <div className="tk-card">
      <h2>自動入力の既定値</h2>
      <p className="tk-muted">新しい記録表を作るとき、ここの内容が自動で入ります。</p>
      <div className="tk-grid">
        <label className="tk-field"><span>事業者名</span><input value={s.owner_name || ''} onChange={set('owner_name')} /></label>
        <label className="tk-field"><span>検査区分</span>
          <select value={s.kind} onChange={set('kind')}><option>事業内検査</option><option>検査業者</option></select></label>
        <label className="tk-field"><span>検査者氏名</span><input value={s.inspector_name || ''} onChange={set('inspector_name')} /></label>
        <label className="tk-field"><span>検査者の資格</span><input value={s.inspector_qual || ''} onChange={set('inspector_qual')} placeholder="例：事業内検査者（車両系建設機械）" /></label>
        <label className="tk-field"><span>検査業者名</span><input value={s.vendor_name || ''} onChange={set('vendor_name')} /></label>
        <label className="tk-field"><span>検査業者 登録番号</span><input value={s.vendor_reg_no || ''} onChange={set('vendor_reg_no')} /></label>
      </div>
      <h3 style={{ marginTop: 16 }}>建荷協用紙の表題部</h3>
      <div className="tk-grid">
        <label className="tk-field"><span>使用者（事業者）住所</span><input value={s.owner_addr || ''} onChange={set('owner_addr')} /></label>
        <label className="tk-field"><span>機械管理者氏名</span><input value={s.manager || ''} onChange={set('manager')} /></label>
        <label className="tk-field"><span>検査業者 住所（検査業者のとき）</span><input value={s.vendor_addr || ''} onChange={set('vendor_addr')} /></label>
        <label className="tk-field"><span>移動式クレーン資格 交付者</span><input value={s.crane_issuer || ''} onChange={set('crane_issuer')} /></label>
        <label className="tk-field"><span>移動式クレーン資格 番号</span><input value={s.crane_no || ''} onChange={set('crane_no')} /></label>
      </div>
      <div className="tk-actions"><span className="tk-spacer" />
        <button className="tk-btn" onClick={onCancel}>キャンセル</button>
        <button className="tk-btn primary" onClick={() => onSave(s)}>保存</button>
      </div>
    </div>
  );
}

// ---------- 記録表 入力 ----------
function RecordEditor({ initial, prev, onSave, onCancel, onPrint, onDelete }) {
  const [r, setR] = useState(initial);
  const tpl = getTemplate(r.template_id);
  const rows = useMemo(() => flattenRows(tpl), [tpl]);
  const set = (k) => (e) => setR({ ...r, [k]: e.target.value });
  const setResult = (key, patch) => setR((cur) => ({ ...cur, results: { ...cur.results, [key]: { ...cur.results?.[key], ...patch } } }));
  const setMeas = (name, patch) => setR((cur) => ({ ...cur, measurements: { ...cur.measurements, [name]: { ...cur.measurements?.[name], ...patch } } }));

  const filled = rows.filter((x) => r.results?.[x.key]?.mark).length;
  const ngRows = rows.filter((x) => NG_MARKS.includes(r.results?.[x.key]?.mark));

  const fillBlank = () => setR((cur) => {
    const res = { ...cur.results };
    rows.forEach((x) => { if (!res[x.key]?.mark) res[x.key] = { ...res[x.key], mark: 'レ' }; });
    return { ...cur, results: res };
  });
  const copyPrev = () => prev && setR((cur) => ({ ...cur, results: { ...prev.results }, measurements: { ...prev.measurements } }));
  const buildRepairs = () => {
    const lines = rows
      .filter((x) => { const v = r.results?.[x.key]; return v?.mark && v.mark !== 'レ' && v.mark !== '／'; })
      .map((x) => {
        const v = r.results[x.key];
        const label = MARKS.find((mm) => mm.v === v.mark)?.label || v.mark;
        return `・${x.item}${x.part ? `（${x.part}）` : ''}：${label}${v.note ? ` ― ${v.note}` : ''}`;
      });
    setR({ ...r, repairs: lines.join('\n') || '特になし' });
  };
  const onDate = (e) => setR({ ...r, inspected_on: e.target.value, next_due: addMonths(e.target.value, tpl.cycleMonths) });

  let curSec = null;
  return (
    <div className="tk-editor">
      <div className="tk-card">
        <h2>{tpl.short} 記録表 <small className="tk-muted">{r.machine_snapshot?.name}／{tpl.basis}</small></h2>
        <div className="tk-grid">
          <label className="tk-field"><span>検査年月日</span><input type="date" value={r.inspected_on || ''} onChange={onDate} /></label>
          <label className="tk-field"><span>次回検査期限（自動）</span><input type="date" value={r.next_due || ''} onChange={set('next_due')} /></label>
          <label className="tk-field"><span>稼働時間計（h）</span><input inputMode="decimal" value={r.hour_meter || ''} onChange={set('hour_meter')} /></label>
          <label className="tk-field"><span>事業者名</span><input value={r.owner_name || ''} onChange={set('owner_name')} /></label>
          <label className="tk-field"><span>検査区分</span>
            <select value={r.kind || '事業内検査'} onChange={set('kind')}><option>事業内検査</option><option>検査業者</option></select></label>
          <label className="tk-field"><span>検査者氏名</span><input value={r.inspector_name || ''} onChange={set('inspector_name')} /></label>
          <label className="tk-field"><span>資格</span><input value={r.inspector_qual || ''} onChange={set('inspector_qual')} /></label>
          {r.kind === '検査業者' && <>
            <label className="tk-field"><span>検査業者名</span><input value={r.vendor_name || ''} onChange={set('vendor_name')} /></label>
            <label className="tk-field"><span>登録番号</span><input value={r.vendor_reg_no || ''} onChange={set('vendor_reg_no')} /></label>
          </>}
        </div>
        <p className="tk-muted">機械情報（{r.machine_snapshot?.maker} {r.machine_snapshot?.model}／製造番号 {r.machine_snapshot?.serial || '―'}）は台帳から自動転記されています。</p>
      </div>

      <div className="tk-toolbar">
        <span className="tk-progress">記入 {filled}/{rows.length}{ngRows.length > 0 && <b className="tk-ng">　要整備 {ngRows.length}</b>}</span>
        <button className="tk-btn" onClick={fillBlank}>未記入をすべて「レ」</button>
        <button className="tk-btn" onClick={copyPrev} disabled={!prev}>前回の結果を引継ぐ</button>
      </div>

      <div className="tk-card tk-rows">
        {rows.map((x) => {
          const head = x.section !== curSec ? (curSec = x.section, <h3 key={`h-${x.key}`}>{x.sno}. {x.section}</h3>) : null;
          const v = r.results?.[x.key] || {};
          return [head,
            <div key={x.key} className={`tk-row ${NG_MARKS.includes(v.mark) ? 'ng' : ''}`}>
              <div className="tk-row-label">
                {x.first ? <b>{x.item}</b> : <b className="tk-dim">〃</b>}
                {x.part && <span>{x.part}</span>}
              </div>
              <div className="tk-marks" role="group" aria-label={`${x.item} ${x.part} の結果`}>
                {MARKS.map((mk) => (
                  <button key={mk.v} title={mk.label} className={`tk-mark ${v.mark === mk.v ? 'on' : ''} ${NG_MARKS.includes(mk.v) ? 'bad' : ''}`}
                    onClick={() => setResult(x.key, { mark: v.mark === mk.v ? '' : mk.v })}>{mk.v}</button>
                ))}
              </div>
              <input className="tk-note" placeholder="備考・措置" value={v.note || ''} onChange={(e) => setResult(x.key, { note: e.target.value })} />
            </div>];
        })}
      </div>

      {tpl.measurements?.length > 0 && (
        <div className="tk-card">
          <h3>測定記録</h3>
          <p className="tk-muted">基準値はメーカーの整備基準値を記入（次回以降は前回の基準値が自動で入ります）。</p>
          <div className="tk-meas">
            {tpl.measurements.map(([name, unit]) => (
              <div key={name} className="tk-meas-row">
                <span>{name}{unit && <small>（{unit}）</small>}</span>
                <input placeholder="基準値" value={r.measurements?.[name]?.std || ''} onChange={(e) => setMeas(name, { std: e.target.value })} />
                <input placeholder="測定値" value={r.measurements?.[name]?.val || ''} onChange={(e) => setMeas(name, { val: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tk-card">
        <div className="tk-flex"><h3>補修等の内容</h3><button className="tk-btn small" onClick={buildRepairs}>記号・備考から自動作成</button></div>
        <textarea rows={4} value={r.repairs || ''} onChange={set('repairs')} />
        <label className="tk-field"><span>総合判定</span>
          <select value={r.judgment || ''} onChange={set('judgment')}>
            <option value="">（未判定）</option><option>合格</option><option>要整備</option>
          </select>
        </label>
        {ngRows.length > 0 && r.judgment === '合格' && <p className="tk-warn">「×」「○」の項目があります。補修完了後に合格としてください。</p>}
      </div>

      <div className="tk-actions sticky">
        {r.id && <DeleteButton onDelete={onDelete} />}
        <span className="tk-spacer" />
        <button className="tk-btn" onClick={onCancel}>戻る</button>
        <button className="tk-btn" onClick={async () => onPrint(await onSave(r, true))}>保存して印刷</button>
        <button className="tk-btn primary" onClick={() => onSave(r)}>保存</button>
      </div>
    </div>
  );
}

// ---------- 建荷協用紙（重ね印刷）の記録 ----------
function OverlayRecord({ initial, settings, onSaveSettings, onSave, onCancel, onDelete, initialTab, canPrint }) {
  const [r, setR] = useState(initial);
  const [formEdit, setFormEdit] = useState(null);
  const base = kenniForm(r.form_id);
  const form = formEdit || settings.formOverrides?.[r.form_id] || base;
  if (!base) return <div className="tk-card">様式 {r.form_id} が見つかりません。</div>;
  const values = r.overlay || emptyValues();
  const setValues = (ov) => setR((cur) => ({ ...cur, overlay: ov }));
  const onDate = (e) => {
    const d = e.target.value; const next_due = addMonths(d, form.cycleMonths || 12);
    const h = autoHeader(r.machine_snapshot, settings, { inspected_on: d, next_due, hour_meter: r.hour_meter }, form);
    const pick = ['insp_y', 'insp_m', 'insp_d', 'issue_y', 'issue_m', 'issue_d', 'next_y', 'next_m'];
    setR({ ...r, inspected_on: d, next_due, overlay: { ...values, header: { ...values.header, ...Object.fromEntries(pick.map((k) => [k, h[k]])) } } });
  };
  const onHours = (e) => setR({ ...r, hour_meter: e.target.value, overlay: { ...values, header: { ...values.header, hours: e.target.value } } });
  const judge = () => {
    const rows = form.pages.flatMap((p) => p.rows || []);
    const res = rows.map((x) => rowResult(values.rows?.[x.id]));
    if (res.some((x) => x === 'ng')) return '要整備';
    return res.every(Boolean) ? '合格' : '';
  };
  const save = (stay) => onSave({ ...r, judgment: judge() }, stay);
  const dateText = (r.inspected_on || '').replaceAll('-', '/');
  return (
    <div className="tk-editor">
      <div className="tk-card no-print">
        <h2>{r.machine_snapshot?.name} <small className="tk-muted">{base.name}（{base.id}）＋SR-ZC-03-A</small></h2>
        <div className="tk-grid">
          <label className="tk-field"><span>検査年月日</span><input type="date" value={r.inspected_on || ''} onChange={onDate} /></label>
          <label className="tk-field"><span>次回検査期限（自動）</span><input type="date" value={r.next_due || ''} readOnly /></label>
          <label className="tk-field"><span>稼働時間（h）</span><input inputMode="decimal" value={r.hour_meter || ''} onChange={onHours} /></label>
        </div>
      </div>
      <OverlayWorkspace form={form} values={values} onValuesChange={setValues} dateText={dateText} canPrint={canPrint}
        onFormChange={setFormEdit}
        calib={settings.calib} onCalib={(c) => onSaveSettings({ ...settings, calib: c })} initialTab={initialTab} />
      <div className="tk-actions sticky no-print">
        {r.id && <DeleteButton onDelete={onDelete} />}
        {formEdit && <button className="tk-btn small primary" onClick={() => { onSaveSettings({ ...settings, formOverrides: { ...settings.formOverrides, [r.form_id]: formEdit } }); setFormEdit(null); }}>位置合わせを保存</button>}
        {settings.formOverrides?.[r.form_id] && !formEdit && (
          <button className="tk-btn small" onClick={() => { const o = { ...settings.formOverrides }; delete o[r.form_id]; onSaveSettings({ ...settings, formOverrides: o }); }}>位置合わせを初期値に戻す</button>
        )}
        <span className="tk-spacer" />
        <button className="tk-btn" onClick={onCancel}>戻る</button>
        <button className="tk-btn primary" onClick={() => save(false)}>保存</button>
      </div>
    </div>
  );
}

// ---------- メイン ----------
export default function TokkenApp({ store, canPrint = true, ledgerMachines = null }) {
  const [machines, setMachines] = useState([]);
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState({});
  const [view, setView] = useState({ name: 'list' });
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [skipped, setSkipped] = useState([]);

  const reload = useCallback(async () => {
    try {
      if (await store.isFirstRun()) {
        for (const m of SAMPLE_MACHINES) await store.saveMachine(m);
        await store.saveSettings({ owner_name: '株式会社Assist', kind: '事業内検査', inspector_name: '', inspector_qual: '' });
      }
      let m = await store.listMachines();
      if (ledgerMachines) {
        const sk = await syncLedger(store, ledgerMachines, m);
        setSkipped(sk);
        m = await store.listMachines();
      }
      const [r, s] = await Promise.all([store.listRecords(), store.getSettings()]);
      setMachines(m); setRecords(r); setSettings(s);
    } catch (e) { setErr(e.message || String(e)); }
  }, [store, ledgerMachines]);
  useEffect(() => { reload(); }, [reload]);

  const wrap = (fn) => async (...a) => { try { const out = await fn(...a); await reload(); return out; } catch (e) { setErr(e.message || String(e)); } };

  const newRecord = (machine) => {
    const tpl = { cycleMonths: cycleOf(machine) };
    const prev = records.find((r) => r.machine_id === machine.id);
    const d = today();
    if (machine.form_id) {
      const next_due = addMonths(d, tpl.cycleMonths);
      const form = settings.formOverrides?.[machine.form_id] || kenniForm(machine.form_id);
      const header = autoHeader(machine, settings, { inspected_on: d, next_due, hour_meter: machine.hours ? String(machine.hours) : '' }, form);
      // 手で直した表題部（機械管理者など）は前回から引き継ぐ
      ['manager', 'user_addr', 'site', 'crane_issuer', 'crane_no'].forEach((k) => { if (prev?.overlay?.header?.[k]) header[k] = prev.overlay.header[k]; });
      return {
        machine_id: machine.id, template_id: machine.template_id, form_id: machine.form_id,
        inspected_on: d, next_due, hour_meter: machine.hours ? String(machine.hours) : '', judgment: '', owner_name: settings.owner_name || '', kind: settings.kind || '事業内検査',
        overlay: { ...emptyValues(), header, opts: prev?.overlay?.opts, rows: lockedRows(form, machine.na_rows) },
        machine_snapshot: { name: machine.name, maker: machine.maker, model: machine.model, serial: machine.serial, made_on: machine.made_on, location: machine.location, spec: machine.spec, shaken: machine.shaken },
      };
    }
    const meas = {};
    Object.entries(prev?.measurements || {}).forEach(([k, v]) => { if (v?.std) meas[k] = { std: v.std }; });
    return {
      machine_id: machine.id, template_id: machine.template_id,
      inspected_on: d, next_due: addMonths(d, tpl.cycleMonths),
      owner_name: settings.owner_name || '', kind: settings.kind || '事業内検査',
      inspector_name: settings.inspector_name || '', inspector_qual: settings.inspector_qual || '',
      vendor_name: settings.vendor_name || '', vendor_reg_no: settings.vendor_reg_no || '',
      hour_meter: '', results: {}, measurements: meas, repairs: '', judgment: '',
      machine_snapshot: { name: machine.name, maker: machine.maker, model: machine.model, serial: machine.serial, made_on: machine.made_on, plate: machine.plate, location: machine.location, spec: machine.spec },
    };
  };

  const sorted = useMemo(() => machines
    .map((m) => ({ m, ...dueOf(m, records) }))
    .filter(({ m }) => !q || `${m.name} ${m.maker} ${m.model} ${getTemplate(m.template_id)?.short}`.includes(q))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')), [machines, records, q]);

  if (view.name === 'print') {
    return (
      <div className="tk-print-wrap">
        <div className="tk-print-bar no-print">
          <button className="tk-btn" onClick={() => setView(view.back)}>← 戻る</button>
          {canPrint ? <>
            <span className="tk-muted">A4縦。印刷画面で「PDFに保存」を選ぶとPDFになります。</span>
            <button className="tk-btn primary" onClick={() => window.print()}>印刷／PDF保存</button>
          </> : <span className="tk-muted">プレビュー表示です。印刷・PDF保存はダウンロード版HTMLか保全台帳アプリから行えます。</span>}
        </div>
        <PrintSheet key={view.record.id} record={view.record} />
      </div>
    );
  }

  return (
    <div className="tk-app">
      <header className="tk-header no-print">
        <button className="tk-title" onClick={() => setView({ name: 'list' })}>特定自主検査 記録表</button>
        <span className="tk-spacer" />
        <button className="tk-btn small" onClick={() => setView({ name: 'settings' })}>既定値</button>
      </header>
      {err && <div className="tk-error" onClick={() => setErr('')}>エラー：{err}（タップで閉じる）</div>}

      {view.name === 'list' && (
        <main>
          <div className="tk-flex">
            <input className="tk-search" placeholder="管理番号・型式で検索" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="tk-btn primary" onClick={() => setView({ name: 'machine' })}>＋ 機械を登録</button>
          </div>
          {ledgerMachines && <p className="tk-muted small">保全台帳の機械を自動で取り込んでいます（機種名から記録表の用紙を判定）。用紙や装備されていない項目は、機械名をタップして直せます。</p>}
          {sorted.length === 0 && <p className="tk-muted">機械が登録されていません。</p>}
          {skipped.length > 0 && (
            <details className="tk-muted small">
              <summary>特定自主検査の対象外として取り込まなかった機械 {skipped.length}台</summary>
              {skipped.map((m) => `${m.kanri_no}（${m.kishu || '機種未設定'}）`).join('、')}
              <div>対象の機械なら「＋ 機械を登録」から登録してください。</div>
            </details>
          )}
          <ul className="tk-list">
            {sorted.map(({ m, last, due }) => {
              const tpl = getTemplate(m.template_id);
              const n = records.filter((r) => r.machine_id === m.id).length;
              return (
                <li key={m.id} className="tk-item">
                  <div className="tk-item-main" onClick={() => setView({ name: 'machine', machine: m })}>
                    <div className="tk-item-top"><b>{m.name}</b><DueBadge due={due} /></div>
                    <div>{tpl?.short}　{m.maker} {m.model}{m.form_id && <span className="tk-badge" style={{ marginLeft: 8 }}>建荷協用紙 {m.form_id}</span>}</div>
                    <div className="tk-muted">前回 {jp(last)}／記録 {n}件</div>
                  </div>
                  <div className="tk-item-btns">
                    <button className="tk-btn primary" onClick={() => setView({ name: 'edit', record: newRecord(m) })}>検査を記入</button>
                    <button className="tk-btn" disabled={!n} onClick={() => setView({ name: 'records', machine: m })}>記録一覧</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="tk-muted small">検査項目は厚生労働省「特定自主検査基準」（令和8年1月1日適用）の別表に基づきます。</p>
        </main>
      )}

      {view.name === 'machine' && (
        <MachineForm initial={view.machine} machines={machines}
          onCancel={() => setView({ name: 'list' })}
          onDelete={wrap(async () => { await store.deleteMachine(view.machine.id); setView({ name: 'list' }); })}
          onSave={wrap(async (m) => { await store.saveMachine(m); setView({ name: 'list' }); })} />
      )}

      {view.name === 'settings' && (
        <SettingsForm initial={settings} onCancel={() => setView({ name: 'list' })}
          onSave={wrap(async (s) => { await store.saveSettings(s); setView({ name: 'list' }); })} />
      )}

      {view.name === 'records' && (
        <main>
          <h2>{view.machine.name} の記録</h2>
          <ul className="tk-list">
            {records.filter((r) => r.machine_id === view.machine.id).map((r) => (
              <li key={r.id} className="tk-item">
                <div className="tk-item-main" onClick={() => setView({ name: 'edit', record: r })}>
                  <div className="tk-item-top"><b>{jp(r.inspected_on)}</b><span className={`tk-badge ${r.judgment === '合格' ? 'green' : r.judgment ? 'red' : 'gray'}`}>{r.judgment || '未判定'}</span></div>
                  <div className="tk-muted">検査者 {r.inspector_name || '―'}／次回 {jp(r.next_due)}</div>
                </div>
                <div className="tk-item-btns">
                  <button className="tk-btn" onClick={() => setView({ name: 'edit', record: r })}>編集</button>
                  <button className="tk-btn primary" onClick={() => setView(r.form_id ? { name: 'edit', record: r, tab: 'print' } : { name: 'print', record: r, back: { name: 'records', machine: view.machine } })}>印刷</button>
                </div>
              </li>
            ))}
          </ul>
          <button className="tk-btn" onClick={() => setView({ name: 'list' })}>← 一覧へ</button>
        </main>
      )}

      {view.name === 'edit' && view.record.form_id && (
        <OverlayRecord key={view.record.id || 'new'} initial={view.record} settings={settings} canPrint={canPrint} initialTab={view.tab || 'entry'}
          onSaveSettings={wrap(async (s2) => { await store.saveSettings(s2); })}
          onCancel={() => setView({ name: 'list' })}
          onDelete={wrap(async () => { await store.deleteRecord(view.record.id); setView({ name: 'list' }); })}
          onSave={wrap(async (rec, stay) => { const saved = await store.saveRecord(rec); if (!stay) setView({ name: 'list' }); return saved; })} />
      )}

      {view.name === 'edit' && !view.record.form_id && (
        <RecordEditor key={view.record.id || 'new'} initial={view.record}
          prev={records.find((r) => r.machine_id === view.record.machine_id && r.id !== view.record.id)}
          onCancel={() => setView({ name: 'list' })}
          onDelete={wrap(async () => { await store.deleteRecord(view.record.id); setView({ name: 'list' }); })}
          onPrint={(saved) => saved && setView({ name: 'print', record: saved, back: { name: 'edit', record: saved } })}
          onSave={wrap(async (rec, stay) => { const saved = await store.saveRecord(rec); if (!stay) setView({ name: 'list' }); return saved; })} />
      )}
    </div>
  );
}
