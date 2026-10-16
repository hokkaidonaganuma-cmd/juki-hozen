// 重ね印刷用 様式定義
// 座標はすべて用紙左上からの mm。スキャン画像は表示専用で、印刷時は出力しない（用紙に重ねるため）。
//
// form = {
//   id, name, templateId,               // templateId: 機械台帳の機種（templates.js）との対応
//   paper: { w: 210, h: 297 },          // 用紙サイズ mm（A4縦=210x297、A3横=420x297 など）
//   pages: [{
//     bg: 'data:image/...',             // スキャン画像（任意・画面表示のみ）
//     header: [{ key, label, x, y, w, size, align }],     // 表題部の文字
//     boxes:  [{ key, label, x, y, w, h, size }],          // 複数行の文字（事業者への要請等・補修等の措置内容）
//     rows: [{
//       id, section, no, place: { label, x, y, w, h },     // 検査箇所（不良は○で囲む）
//       contents: [{ label, x, y, w, h }],                  // 検査内容（良=レ、不良=○囲み、対象外=―）
//       methods:  [{ label, x, y, w, h }],                  // 検査方法（使った方法に レ／不良は○）
//       good: { x, y }, bad: { x, y },                      // 検査結果 良・不良 欄（レを記入）
//       repair: { x, y },                                   // 補修内容（記号）
//     }],
//   }],
// }

// 表題部で使える項目（記入要領の表題部に対応）
export const HEADER_KEYS = [
  ['issue_date', '証明書発行日'], ['cert_no', '証明書発行No.'], ['label_no', '標章No.'],
  ['maker', 'メーカー名'], ['model', '型式'], ['serial', '製造番号'], ['perf', '性能'],
  ['site', '検査実施場所'], ['inspected_on', '検査年月日'], ['mgmt_no', '管理No.'],
  ['shaken', '車検有効期間'], ['distance', '走行距離'], ['hours', '稼働時間'],
  ['inspector', '検査者氏名'], ['user_addr', '使用者住所'], ['user_name', '使用者氏名又は名称'],
  ['manager', '機械管理者氏名'], ['vendor_reg', '検査業者登録番号'],
  ['vendor_addr', '検査業者又は事業者の住所'], ['vendor_name', '検査業者又は事業者の名称'], ['vendor_chief', '責任者名'],
  ['att_kind', 'アタッチメント種類'], ['att_maker', 'アタッチメントメーカー'], ['att_model', 'アタッチメント型式'], ['att_serial', 'アタッチメント製造番号'],
  ['chassis_maker', 'シャーシメーカー'], ['chassis_model', 'シャーシ型式'], ['chassis_no', '車台番号'],
];
export const BOX_KEYS = [['requests', '事業者への要請等'], ['measures', '補修等の措置内容']];

// 補修記号（記入要領の順位順）
export const REPAIR_MARKS = [
  { v: '×', label: '交換' }, { v: '⊗', label: '分解交換' }, { v: '△', label: '修理' },
  { v: 'A', label: '調整' }, { v: 'T', label: '締付' }, { v: 'C', label: '清掃' }, { v: 'L', label: '給油水' },
];

// 1行の状態から 検査結果（良/不良）を決める
export function rowResult(rv) {
  if (!rv) return '';
  const vals = Object.values(rv.contents || {});
  if (!vals.length) return '';
  if (vals.every((v) => v === 'na')) return 'na';
  if (vals.some((v) => v === 'ng')) return 'ng';
  if (vals.every((v) => v === 'ok' || v === 'na')) return 'ok';
  return '';
}

export const emptyValues = () => ({ header: {}, rows: {}, boxes: {} });

// 機械台帳・既定値から表題部を自動入力
// record: { inspected_on, hour_meter, next_due }
// 性能欄の書式（様式ごと）
export function formatPerf(machine, rule) {
  const spec = machine?.spec || {};
  if (!rule) return Object.entries(spec).filter(([, v]) => v).map(([k, v]) => `${k.replace(/（.*?）/, '')} ${v}`).join(' ');
  const raw = spec[rule.key]; const n = parseFloat(String(raw ?? '').replace(/[^0-9.]/g, ''));
  if (raw == null || raw === '' || Number.isNaN(n)) return '';
  if (rule.fmt === 'm3') return `${n.toFixed(1)}㎥`;
  if (rule.fmt === 't') return `${n}t`;
  if (rule.fmt === 't2kg') return String(Math.round(n * 1000)); // 用紙に kg 印字あり
  return String(n); // 用紙に単位印字あり
}

export function autoHeader(machine, settings, record, form) {
  const spec = machine?.spec || {};
  const perf = formatPerf(machine, form?.perf);
  const [iy, im, id] = (record?.inspected_on || '').split('-');
  const [ny, nm] = (record?.next_due || '').split('-');
  const gyosha = settings?.kind === '検査業者';
  return {
    maker: machine?.maker || '', model: machine?.model || '', serial: machine?.serial || '', perf,
    mgmt_no: machine?.name || '', site: machine?.location || settings?.site || '',
    insp_y: iy || '', insp_m: im ? String(Number(im)) : '', insp_d: id ? String(Number(id)) : '',
    issue_y: iy || '', issue_m: im ? String(Number(im)) : '', issue_d: id ? String(Number(id)) : '',
    next_y: ny || '', next_m: nm ? String(Number(nm)) : '',
    hours: record?.hour_meter ? String(record.hour_meter) : '',
    distance: '―', shaken: machine?.shaken || '―', cert_no: gyosha ? '' : '―',
    user_name: settings?.owner_name || '', user_addr: settings?.owner_addr || '',
    manager: settings?.manager || '―',
    vendor_reg: gyosha ? (settings?.vendor_reg_no || '') : '―',
    vendor_name: gyosha ? (settings?.vendor_name || '') : (settings?.owner_name || ''),
    vendor_addr: gyosha ? (settings?.vendor_addr || '') : (settings?.owner_addr || ''),
    crane_issuer: settings?.crane_issuer || '', crane_no: settings?.crane_no || '',
    lift: spec['つり上げ荷重'] ? String(parseFloat(spec['つり上げ荷重'])) : '',
  };
}

// 不良項目から「事業者への要請等」と「補修等の措置内容」を作る
export function buildRequests(form, values, dateText) {
  const rows = form.pages.flatMap((p) => p.rows || []);
  const req = []; const mea = [];
  rows.forEach((r) => {
    const rv = values.rows?.[r.id];
    if (rowResult(rv) !== 'ng') return;
    const bad = (r.contents || []).filter((_, i) => rv.contents?.[i] === 'ng').map((c) => c.label).join('・');
    const part = `${r.place?.label || ''}${bad ? `（${bad}）` : ''}${rv.note ? ` ${rv.note}` : ''}`;
    if (rv.repair) mea.push({ no: r.no, part, date: dateText || '', content: `${REPAIR_MARKS.find((m) => m.v === rv.repair)?.label || rv.repair}${rv.fix ? `：${rv.fix}` : ''}` });
    else req.push(`No.${r.no} ${part}：補修を要す`);
  });
  return { requests: req.join('\n'), measures: mea };
}

// 装備されていない行（機械ごとの設定）を「―（対象外）」で固定
export function lockedRows(form, naRows = []) {
  const rows = {};
  form.pages.flatMap((p) => p.rows || []).forEach((r) => {
    if (!naRows.includes(r.id)) return;
    const contents = {};
    (r.contents?.length ? r.contents : [0]).forEach((_, i) => { contents[i] = 'na'; });
    rows[r.id] = { contents, locked: true };
  });
  return rows;
}
