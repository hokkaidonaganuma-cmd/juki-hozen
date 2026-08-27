import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as api from "../api";
import {
  Hanko,
  Overlay,
  Field,
  PhotoUploadField,
  EditableSelect,
  ContentPicker,
  MasterListEditor,
  MasterContentEditor,
  TONES,
  fmtDate,
  daysUntil,
  latestRecord,
  getStatus,
  formatContentItem,
} from "./ui";

const todayStr = () => new Date().toISOString().slice(0, 10);
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}
function unique(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ja"));
}

/* ------------------------- Add Machine Modal ------------------------ */
function AddMachineModal({ onClose, onSave, existingNos, kishuOptions, makerOptions, onAddKishu, onAddMaker }) {
  const [form, setForm] = useState({
    kanriNo: "",
    kishu: "",
    maker: "",
    katashiki: "",
    chassisNo: "",
    basho: "",
    cycle: 365,
    hours: 0,
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handlePhotoSelected = (file) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    const no = form.kanriNo.trim();
    if (!no) return setError("管理番号を入力してください。");
    if (existingNos.includes(no)) return setError(`管理番号「${no}」は既に登録されています。`);
    if (!form.kishu) return setError("機種名を選択してください。");
    if (!form.maker) return setError("メーカーを選択してください。");
    setError("");
    setSaving(true);
    try {
      let photo_url = null;
      if (photoFile) photo_url = await api.uploadPhoto(photoFile, "machines");
      await onSave({
        kanri_no: no,
        kishu: form.kishu,
        maker: form.maker,
        katashiki: form.katashiki.trim(),
        chassis_no: form.chassisNo.trim(),
        basho: form.basho.trim(),
        cycle_days: Number(form.cycle) || 365,
        hours: Number(form.hours) || 0,
        photo_url,
      });
    } catch (err) {
      setError(err.message || "登録に失敗しました。");
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="sheet-head">
        <h2>新規機械登録</h2>
        <button className="icon-btn" onClick={onClose} aria-label="閉じる">×</button>
      </div>
      <div className="sheet-body">
        <Field label="管理番号" required>
          <input className="input" autoFocus placeholder="例：K-003" value={form.kanriNo} onChange={set("kanriNo")} />
        </Field>
        <div className="grid-2">
          <Field label="機種名" required>
            <EditableSelect value={form.kishu} onChange={(v) => setForm((f) => ({ ...f, kishu: v }))} options={kishuOptions} onAddOption={onAddKishu} placeholder="機種を選択" />
          </Field>
          <Field label="メーカー" required>
            <EditableSelect value={form.maker} onChange={(v) => setForm((f) => ({ ...f, maker: v }))} options={makerOptions} onAddOption={onAddMaker} placeholder="メーカーを選択" />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="型式">
            <input className="input" placeholder="例：PC128USLC-11" value={form.katashiki} onChange={set("katashiki")} />
          </Field>
          <Field label="車台番号">
            <input className="input" placeholder="例：12345678" value={form.chassisNo} onChange={set("chassisNo")} />
          </Field>
        </div>
        <Field label="配置場所">
          <input className="input" placeholder="例：第一現場" value={form.basho} onChange={set("basho")} />
        </Field>
        <div className="grid-2">
          <Field label="点検周期（日）">
            <input type="number" min="1" className="input" value={form.cycle} onChange={set("cycle")} />
          </Field>
          <Field label="現在の稼働時間（h）">
            <input type="number" min="0" className="input" value={form.hours} onChange={set("hours")} />
          </Field>
        </div>
        <PhotoUploadField label="写真" previewUrl={photoPreview} onFileSelected={handlePhotoSelected} onRemove={() => { setPhotoFile(null); setPhotoPreview(""); }} />
        {error && <p className="error-text">{error}</p>}
      </div>
      <div className="sheet-foot">
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? "登録中…" : "台帳に登録する"}
        </button>
      </div>
    </Overlay>
  );
}

/* ------------------------- Edit Machine Modal ------------------------ */
function EditMachineModal({ machine, onClose, onSave, existingNos, kishuOptions, makerOptions, onAddKishu, onAddMaker }) {
  const [form, setForm] = useState({
    kanriNo: machine.kanri_no,
    kishu: machine.kishu || "",
    maker: machine.maker || "",
    katashiki: machine.katashiki || "",
    chassisNo: machine.chassis_no || "",
    basho: machine.basho || "",
    cycle: machine.cycle_days,
    hours: machine.hours,
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(machine.photo_url || "");
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handlePhotoSelected = (file) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoRemoved(false);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview("");
    setPhotoRemoved(true);
  };

  const submit = async () => {
    const no = form.kanriNo.trim();
    if (!no) return setError("管理番号を入力してください。");
    if (no !== machine.kanri_no && existingNos.includes(no)) return setError(`管理番号「${no}」は既に登録されています。`);
    if (!form.kishu) return setError("機種名を選択してください。");
    if (!form.maker) return setError("メーカーを選択してください。");
    setError("");
    setSaving(true);
    try {
      let photo_url = machine.photo_url || null;
      if (photoFile) photo_url = await api.uploadPhoto(photoFile, "machines");
      else if (photoRemoved) photo_url = null;
      await onSave({
        kanri_no: no,
        kishu: form.kishu,
        maker: form.maker,
        katashiki: form.katashiki.trim(),
        chassis_no: form.chassisNo.trim(),
        basho: form.basho.trim(),
        cycle_days: Number(form.cycle) || 365,
        hours: Number(form.hours) || 0,
        photo_url,
      });
    } catch (err) {
      setError(err.message || "更新に失敗しました。");
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="sheet-head">
        <h2>機械情報の編集</h2>
        <button className="icon-btn" onClick={onClose} aria-label="閉じる">×</button>
      </div>
      <div className="sheet-body">
        <Field label="管理番号" required>
          <input className="input" autoFocus value={form.kanriNo} onChange={set("kanriNo")} />
        </Field>
        <div className="grid-2">
          <Field label="機種名" required>
            <EditableSelect value={form.kishu} onChange={(v) => setForm((f) => ({ ...f, kishu: v }))} options={kishuOptions} onAddOption={onAddKishu} placeholder="機種を選択" />
          </Field>
          <Field label="メーカー" required>
            <EditableSelect value={form.maker} onChange={(v) => setForm((f) => ({ ...f, maker: v }))} options={makerOptions} onAddOption={onAddMaker} placeholder="メーカーを選択" />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="型式">
            <input className="input" placeholder="例：PC128USLC-11" value={form.katashiki} onChange={set("katashiki")} />
          </Field>
          <Field label="車台番号">
            <input className="input" placeholder="例：12345678" value={form.chassisNo} onChange={set("chassisNo")} />
          </Field>
        </div>
        <Field label="配置場所">
          <input className="input" placeholder="例：第一現場" value={form.basho} onChange={set("basho")} />
        </Field>
        <div className="grid-2">
          <Field label="点検周期（日）">
            <input type="number" min="1" className="input" value={form.cycle} onChange={set("cycle")} />
          </Field>
          <Field label="現在の稼働時間（h）">
            <input type="number" min="0" className="input" value={form.hours} onChange={set("hours")} />
          </Field>
        </div>
        <PhotoUploadField label="写真" previewUrl={photoPreview} onFileSelected={handlePhotoSelected} onRemove={handleRemovePhoto} />
        {error && <p className="error-text">{error}</p>}
      </div>
      <div className="sheet-foot">
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? "更新中…" : "更新する"}
        </button>
      </div>
    </Overlay>
  );
}

/* ------------------------- Add Record Modal ------------------------- */
function AddRecordModal({ machine, onClose, onSave, contentOptions, onAddContentOption, workerOptions, onAddWorker }) {
  const [form, setForm] = useState({
    date: todayStr(),
    worker: "",
    hours: machine.hours || 0,
    nextDate: addDays(todayStr(), machine.cycle_days),
    legalDate: addDays(todayStr(), 365),
  });
  const [contentItems, setContentItems] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handlePhotoSelected = (file) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const setDateAndDefaults = (e) => {
    const date = e.target.value;
    setForm((f) => ({ ...f, date, nextDate: addDays(date, machine.cycle_days), legalDate: addDays(date, 365) }));
  };

  const submit = async () => {
    if (!form.date) return setError("整備日を入力してください。");
    if (!form.worker) return setError("実施者を選択してください。");
    if (contentItems.length === 0) return setError("整備内容を1つ以上選択してください。");
    setError("");
    setSaving(true);
    try {
      let photo_url = null;
      if (photoFile) photo_url = await api.uploadPhoto(photoFile, "records");
      await onSave({
        machine_id: machine.id,
        date: form.date,
        worker: form.worker,
        hours: Number(form.hours) || 0,
        content: contentItems,
        next_date: form.nextDate || null,
        legal_date: form.legalDate || null,
        photo_url,
      });
    } catch (err) {
      setError(err.message || "登録に失敗しました。");
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose} wide>
      <div className="sheet-head">
        <div>
          <p className="tag-mini">{machine.kanri_no}</p>
          <h2>整備記録の追加</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="閉じる">×</button>
      </div>
      <div className="sheet-body">
        <div className="grid-2">
          <Field label="整備日" required>
            <input type="date" className="input" value={form.date} onChange={setDateAndDefaults} />
          </Field>
          <Field label="実施者" required>
            <EditableSelect value={form.worker} onChange={(v) => setForm((f) => ({ ...f, worker: v }))} options={workerOptions} onAddOption={onAddWorker} placeholder="実施者を選択" />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="稼働時間（h）">
            <input type="number" min="0" className="input" value={form.hours} onChange={set("hours")} />
          </Field>
          <Field label="次回点検予定日">
            <input type="date" className="input" value={form.nextDate} onChange={set("nextDate")} />
          </Field>
        </div>
        <Field label="次回特定自主検査予定日">
          <input type="date" className="input" value={form.legalDate} onChange={set("legalDate")} />
        </Field>
        <Field label="整備内容" required>
          <ContentPicker options={contentOptions} onAddOption={onAddContentOption} selected={contentItems} onChange={setContentItems} />
        </Field>
        <PhotoUploadField label="写真" previewUrl={photoPreview} onFileSelected={handlePhotoSelected} onRemove={() => { setPhotoFile(null); setPhotoPreview(""); }} />
        {error && <p className="error-text">{error}</p>}
      </div>
      <div className="sheet-foot">
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? "登録中…" : "記録を追加する"}
        </button>
      </div>
    </Overlay>
  );
}

/* ------------------------- Edit Record Modal ------------------------- */
function EditRecordModal({ machine, record, onClose, onSave, contentOptions, onAddContentOption, workerOptions, onAddWorker }) {
  const [form, setForm] = useState({
    date: record.date,
    worker: record.worker,
    hours: record.hours,
    nextDate: record.next_date || "",
    legalDate: record.legal_date || "",
  });
  const [contentItems, setContentItems] = useState(record.content || []);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(record.photo_url || "");
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handlePhotoSelected = (file) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoRemoved(false);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview("");
    setPhotoRemoved(true);
  };

  const submit = async () => {
    if (!form.date) return setError("整備日を入力してください。");
    if (!form.worker) return setError("実施者を選択してください。");
    if (contentItems.length === 0) return setError("整備内容を1つ以上選択してください。");
    setError("");
    setSaving(true);
    try {
      let photo_url = record.photo_url || null;
      if (photoFile) photo_url = await api.uploadPhoto(photoFile, "records");
      else if (photoRemoved) photo_url = null;
      await onSave({
        date: form.date,
        worker: form.worker,
        hours: Number(form.hours) || 0,
        content: contentItems,
        next_date: form.nextDate || null,
        legal_date: form.legalDate || null,
        photo_url,
      });
    } catch (err) {
      setError(err.message || "更新に失敗しました。");
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose} wide>
      <div className="sheet-head">
        <div>
          <p className="tag-mini">{machine.kanri_no}</p>
          <h2>整備記録の編集</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="閉じる">×</button>
      </div>
      <div className="sheet-body">
        <div className="grid-2">
          <Field label="整備日" required>
            <input type="date" className="input" value={form.date} onChange={set("date")} />
          </Field>
          <Field label="実施者" required>
            <EditableSelect value={form.worker} onChange={(v) => setForm((f) => ({ ...f, worker: v }))} options={workerOptions} onAddOption={onAddWorker} placeholder="実施者を選択" />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="稼働時間（h）">
            <input type="number" min="0" className="input" value={form.hours} onChange={set("hours")} />
          </Field>
          <Field label="次回点検予定日">
            <input type="date" className="input" value={form.nextDate} onChange={set("nextDate")} />
          </Field>
        </div>
        <Field label="次回特定自主検査予定日">
          <input type="date" className="input" value={form.legalDate} onChange={set("legalDate")} />
        </Field>
        <Field label="整備内容" required>
          <ContentPicker options={contentOptions} onAddOption={onAddContentOption} selected={contentItems} onChange={setContentItems} />
        </Field>
        <PhotoUploadField label="写真" previewUrl={photoPreview} onFileSelected={handlePhotoSelected} onRemove={handleRemovePhoto} />
        {error && <p className="error-text">{error}</p>}
      </div>
      <div className="sheet-foot">
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? "更新中…" : "更新する"}
        </button>
      </div>
    </Overlay>
  );
}

/* ------------------------------ Detail ------------------------------ */
function MachineDetail({ machine, onBack, onAddRecord, onEditRecord, onEditMachine }) {
  const status = getStatus(machine);
  const toneKey = Object.keys(TONES).find((k) => TONES[k] === status);
  const latest = latestRecord(machine);
  const records = machine.maintenance_records || [];
  const sortedRecords = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="detail">
      <div className="detail-top-row">
        <button className="back-link" onClick={onBack}>← 一覧に戻る</button>
        <button className="btn btn-ghost btn-sm" onClick={onEditMachine}>機械情報を編集</button>
      </div>

      <div className="detail-card">
        <div className="detail-card-top">
          {machine.photo_url ? (
            <img src={machine.photo_url} alt="" className="detail-photo" />
          ) : (
            <div className="detail-photo detail-photo-empty">写真なし</div>
          )}
          <div className="detail-card-top-info">
            <p className="tag-mini">管理番号</p>
            <h2 className="detail-no">{machine.kanri_no}</h2>
          </div>
          <Hanko tone={toneKey} size={64} />
        </div>

        <div className="detail-grid">
          <div><p className="dt">機種</p><p className="dd">{machine.kishu || "―"}</p></div>
          <div><p className="dt">メーカー</p><p className="dd">{machine.maker || "―"}</p></div>
          <div><p className="dt">型式</p><p className="dd">{machine.katashiki || "―"}</p></div>
          <div><p className="dt">車台番号</p><p className="dd">{machine.chassis_no || "―"}</p></div>
          <div><p className="dt">配置場所</p><p className="dd">{machine.basho || "―"}</p></div>
          <div><p className="dt">点検周期</p><p className="dd">{machine.cycle_days}日ごと</p></div>
          <div><p className="dt">現在の状態</p><p className="dd" style={{ color: status.ink }}>{status.label}</p></div>
          <div><p className="dt">最終整備日</p><p className="dd">{latest ? fmtDate(latest.date) : "未整備"}</p></div>
          <div>
            <p className="dt">次回特定自主検査予定</p>
            <p className="dd" style={{ color: latest && latest.legal_date && daysUntil(latest.legal_date) < 0 ? TONES.due.ink : undefined }}>
              {latest && latest.legal_date ? fmtDate(latest.legal_date) : "―"}
            </p>
          </div>
        </div>
      </div>

      <div className="history-head">
        <h3>整備履歴</h3>
        <button className="btn btn-primary btn-sm" onClick={onAddRecord}>＋ 整備記録を追加</button>
      </div>

      {sortedRecords.length === 0 ? (
        <div className="empty-panel">
          <p>まだ整備記録がありません。</p>
          <p className="empty-sub">最初の記録を追加すると、ここに履歴が並びます。</p>
        </div>
      ) : (
        <div className="record-list">
          {sortedRecords.map((r) => {
            const overdue = r.next_date && daysUntil(r.next_date) < 0;
            const legalOverdue = r.legal_date && daysUntil(r.legal_date) < 0;
            return (
              <div className="record-row" key={r.id}>
                <div className="record-row-head">
                  <div className="record-date">{fmtDate(r.date)}</div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditRecord(r)}>
                    編集
                  </button>
                </div>
                <div className="record-main">
                  {r.photo_url && (
                    <a href={r.photo_url} target="_blank" rel="noreferrer" className="record-photo-link">
                      <img src={r.photo_url} alt="整備写真" className="record-photo-thumb" />
                    </a>
                  )}
                  <div className="chip-row chip-row-static">
                    {(r.content || []).map((c, i) => (
                      <span className="chip chip-static" key={i}>{formatContentItem(c)}</span>
                    ))}
                  </div>
                  <p className="record-meta">
                    実施者：{r.worker}　稼働時間：{r.hours}h
                    {r.next_date && (
                      <>　次回点検：{fmtDate(r.next_date)}{overdue && <span className="overdue-flag">期限超過</span>}</>
                    )}
                  </p>
                  {r.legal_date && (
                    <p className="record-meta">
                      次回特定自主検査：{fmtDate(r.legal_date)}
                      {legalOverdue && <span className="overdue-flag">期限超過</span>}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- List -------------------------------- */
function MachineRow({ machine, onOpen }) {
  const status = getStatus(machine);
  const toneKey = Object.keys(TONES).find((k) => TONES[k] === status);
  const latest = latestRecord(machine);
  return (
    <button className="row" onClick={() => onOpen(machine.id)}>
      <span className="row-id-group">
        <span className="row-photo-thumb">
          {machine.photo_url ? <img src={machine.photo_url} alt="" /> : <span className="row-photo-placeholder">機</span>}
        </span>
        <span className="row-tab">{machine.kanri_no}</span>
      </span>
      <span className="row-main">
        <span className="row-title">{machine.kishu || "（機種未登録）"}</span>
        <span className="row-sub">{[machine.maker, machine.katashiki].filter(Boolean).join(" ／ ") || "―"}</span>
        <span className="row-last">最終整備：{latest ? fmtDate(latest.date) : "未整備"}</span>
      </span>
      <span className="row-place">{machine.basho || "―"}</span>
      <span className="row-status">
        <Hanko tone={toneKey} size={34} />
        <span className="row-status-label" style={{ color: status.ink }}>{status.label}</span>
      </span>
    </button>
  );
}

/* ------------------------- Machine search (any status) --------------------- */
function SearchResultRow({ machine, onSelect }) {
  const status = getStatus(machine);
  const toneKey = Object.keys(TONES).find((k) => TONES[k] === status);
  return (
    <button type="button" className="machine-search-result" onClick={() => onSelect(machine.id)}>
      <span className="row-id-group">
        <span className="row-photo-thumb">
          {machine.photo_url ? <img src={machine.photo_url} alt="" /> : <span className="row-photo-placeholder">機</span>}
        </span>
        <span className="row-tab">{machine.kanri_no}</span>
      </span>
      <span className="row-main">
        <span className="row-title">{machine.kishu || "（機種未登録）"}</span>
        <span className="row-sub">{[machine.maker, machine.katashiki].filter(Boolean).join(" ／ ") || "―"}</span>
      </span>
      <Hanko tone={toneKey} size={26} />
    </button>
  );
}

function MachineSearch({ machines, quickMakerOptions, onSelect }) {
  const [query, setQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return machines
      .filter((m) => [m.kanri_no, m.kishu, m.maker, m.katashiki].join(" ").toLowerCase().includes(q))
      .slice(0, 8);
  }, [machines, query]);

  const namedMakers = useMemo(
    () => quickMakerOptions.map((o) => o.value).filter((v) => v !== "その他"),
    [quickMakerOptions]
  );

  const quickResults = useMemo(() => {
    if (!quickFilter) return [];
    if (quickFilter === "その他") return machines.filter((m) => !namedMakers.includes(m.maker));
    return machines.filter((m) => m.maker === quickFilter);
  }, [machines, quickFilter, namedMakers]);

  const handleSelect = (id) => {
    onSelect(id);
    setQuery("");
    setQuickFilter(null);
  };

  return (
    <div className="machine-search">
      <p className="machine-search-label">メンテナンス履歴を見る機械を検索</p>
      <input
        className="input"
        placeholder="管理番号・機種・メーカー・型式で検索"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setQuickFilter(null);
        }}
      />
      {query.trim() && (
        <div className="machine-search-results">
          {results.length === 0 ? (
            <p className="picker-hint">該当する機械が見つかりません。</p>
          ) : (
            results.map((m) => <SearchResultRow key={m.id} machine={m} onSelect={handleSelect} />)
          )}
        </div>
      )}

      {quickMakerOptions.length > 0 && (
        <>
          <div className="quick-maker-row">
            {quickMakerOptions.map((o) => (
              <button
                type="button"
                key={o.id}
                className={"quick-maker-btn" + (quickFilter === o.value ? " active" : "")}
                onClick={() => {
                  setQuery("");
                  setQuickFilter((v) => (v === o.value ? null : o.value));
                }}
              >
                {o.value}
              </button>
            ))}
          </div>
          {quickFilter && (
            <div className="machine-search-results">
              <p className="machine-search-results-title">
                {quickFilter}の自社機械（{quickResults.length}台）
              </p>
              {quickResults.length === 0 ? (
                <p className="picker-hint">該当する機械がありません。</p>
              ) : (
                quickResults.map((m) => <SearchResultRow key={m.id} machine={m} onSelect={handleSelect} />)
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* --------------------------- Alert row (click to expand) ------------------- */
function AlertRow({ machine, onOpenDetail }) {
  const [expanded, setExpanded] = useState(false);
  const status = getStatus(machine);
  const toneKey = Object.keys(TONES).find((k) => TONES[k] === status);
  const latest = latestRecord(machine);
  const diff = latest && latest.legal_date ? daysUntil(latest.legal_date) : null;
  const reason =
    diff === null ? "" : diff < 0 ? `期限を${Math.abs(diff)}日超過しています` : `あと${diff}日です`;

  return (
    <div className="alert-row">
      <div className="alert-row-main" role="button" tabIndex={0} onClick={() => onOpenDetail(machine.id)}>
        <span className="row-id-group">
          <span className="row-photo-thumb">
            {machine.photo_url ? <img src={machine.photo_url} alt="" /> : <span className="row-photo-placeholder">機</span>}
          </span>
          <span className="row-tab">{machine.kanri_no}</span>
        </span>
        <span className="row-main">
          <span className="row-title">{machine.kishu || "（機種未登録）"}</span>
          <span className="row-sub">{[machine.maker, machine.katashiki].filter(Boolean).join(" ／ ") || "―"}</span>
        </span>
        <span className="row-place">{machine.basho || "―"}</span>
      </div>
      <button
        type="button"
        className="alert-row-status"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
      >
        <Hanko tone={toneKey} size={30} />
        <span className="row-status-label" style={{ color: status.ink }}>{status.label}</span>
        <span className="alert-row-caret">{expanded ? "点検内容を閉じる ▲" : "点検内容を見る ▼"}</span>
      </button>
      {expanded && (
        <div className="alert-row-detail">
          <p className="alert-row-reason">
            次回特定自主検査予定日：{latest && latest.legal_date ? fmtDate(latest.legal_date) : "未設定"}
            {reason && <span className="overdue-flag">{reason}</span>}
          </p>
          {latest && latest.content && latest.content.length > 0 ? (
            <div className="chip-row chip-row-static">
              {latest.content.map((c, i) => (
                <span className="chip chip-static" key={i}>{formatContentItem(c)}</span>
              ))}
            </div>
          ) : (
            <p className="picker-hint">直近の整備内容の記録がありません。</p>
          )}
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onOpenDetail(machine.id)}>
            詳細を見る
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Machine delete manager ----------------------- */
function MachineDeleteManager({ machines, onDelete }) {
  return (
    <div className="master-card">
      <h3>登録済み機械の削除</h3>
      <p className="master-desc">
        削除すると、その機械の整備記録もすべて削除されます。元に戻せませんのでご注意ください。
      </p>
      <div className="master-list">
        {machines.length === 0 && <p className="picker-hint">登録されている機械がありません。</p>}
        {machines.map((m) => (
          <div className="master-row" key={m.id}>
            <span className="master-row-name">
              {m.kanri_no}
              <span className="account-id">
                {" "}
                （{m.kishu || "機種未登録"} ／ {m.maker || "―"}）
              </span>
            </span>
            <button
              type="button"
              className="master-remove"
              onClick={() => {
                if (
                  window.confirm(
                    `管理番号「${m.kanri_no}」を削除しますか？\nこの機械の整備記録もすべて削除され、元に戻せません。`
                  )
                ) {
                  onDelete(m.id);
                }
              }}
              aria-label={`${m.kanri_no}を削除`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- Branding settings -------------------------- */
function BrandingSettings({ profile, onUpdate }) {
  const [titleValue, setTitleValue] = useState((profile && profile.app_title) || "");
  const [titleSaving, setTitleSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState((profile && profile.logo_url) || "");
  const [headerPreview, setHeaderPreview] = useState((profile && profile.header_image_url) || "");
  const [bgPreview, setBgPreview] = useState((profile && profile.background_image_url) || "");
  const [error, setError] = useState("");

  const saveTitle = async () => {
    setError("");
    setTitleSaving(true);
    try {
      await onUpdate({ app_title: titleValue.trim() || null });
    } catch (err) {
      setError(err.message || "更新に失敗しました。");
    } finally {
      setTitleSaving(false);
    }
  };

  const handleUpload = async (file, field, setPreview) => {
    setError("");
    try {
      const url = await api.uploadPhoto(file, "branding");
      setPreview(url);
      await onUpdate({ [field]: url });
    } catch (err) {
      setError(err.message || "アップロードに失敗しました。");
    }
  };

  const handleRemove = async (field, setPreview) => {
    setPreview("");
    try {
      await onUpdate({ [field]: null });
    } catch (err) {
      setError(err.message || "更新に失敗しました。");
    }
  };

  return (
    <div className="master-card">
      <h3>表示設定</h3>
      <p className="master-desc">
        台帳の名称・会社ロゴ・ヘッダー画像・背景画像を変更すると、台帳全体の見た目をカスタマイズできます。
      </p>
      <Field label="台帳の名称">
        <div className="inline-add">
          <input
            className="input"
            placeholder="重機保全台帳"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveTitle();
              }
            }}
          />
          <button type="button" className="btn btn-sm btn-primary" onClick={saveTitle} disabled={titleSaving}>
            {titleSaving ? "保存中…" : "保存"}
          </button>
        </div>
      </Field>
      <PhotoUploadField
        label="会社ロゴ（ヘッダーの印マークの代わりに表示）"
        previewUrl={logoPreview}
        onFileSelected={(f) => handleUpload(f, "logo_url", setLogoPreview)}
        onRemove={() => handleRemove("logo_url", setLogoPreview)}
      />
      <PhotoUploadField
        label="ヘッダー背景画像"
        previewUrl={headerPreview}
        onFileSelected={(f) => handleUpload(f, "header_image_url", setHeaderPreview)}
        onRemove={() => handleRemove("header_image_url", setHeaderPreview)}
      />
      <PhotoUploadField
        label="アプリ全体の背景画像"
        previewUrl={bgPreview}
        onFileSelected={(f) => handleUpload(f, "background_image_url", setBgPreview)}
        onRemove={() => handleRemove("background_image_url", setBgPreview)}
      />
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/* ------------------------------ Master page --------------------------- */
function MasterPage({
  onBack,
  kishu,
  maker,
  worker,
  content,
  quickMaker,
  onAddOpt,
  onRemoveOpt,
  onAddContent,
  onRemoveContent,
  onChangeContentUnit,
  machines,
  onDeleteMachine,
  profile,
  onUpdateProfile,
}) {
  return (
    <div className="detail">
      <button className="back-link" onClick={onBack}>← 一覧に戻る</button>
      <div>
        <h2 className="master-title">マスタ編集</h2>
        <p className="master-page-desc">機種・メーカー・実施者・整備内容の選択肢を管理します。削除しても、すでに登録済みの記録には影響しません。</p>
      </div>
      <div className="master-grid">
        <MasterListEditor title="機種" items={kishu} onAdd={(v) => onAddOpt("kishu", v)} onRemove={onRemoveOpt} />
        <MasterListEditor title="メーカー" items={maker} onAdd={(v) => onAddOpt("maker", v)} onRemove={onRemoveOpt} />
        <MasterListEditor title="実施者" items={worker} onAdd={(v) => onAddOpt("worker", v)} onRemove={onRemoveOpt} />
        <MasterContentEditor items={content} onAdd={onAddContent} onRemove={onRemoveContent} onChangeUnit={onChangeContentUnit} />
        <MasterListEditor
          title="検索ボタン（メーカー別）"
          items={quickMaker}
          onAdd={(v) => onAddOpt("quick_maker", v)}
          onRemove={onRemoveOpt}
        />
        <MachineDeleteManager machines={machines} onDelete={onDeleteMachine} />
        <BrandingSettings profile={profile} onUpdate={onUpdateProfile} />
      </div>
    </div>
  );
}

/* -------------------------------- Ledger app --------------------------------- */
export default function Ledger({ profile, onProfileChange, onSignOut }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [machines, setMachines] = useState([]);
  const [masterOptions, setMasterOptions] = useState([]); // [{id, type, value}]
  const [masterContent, setMasterContent] = useState([]); // [{id, name, unit}]

  const [selectedId, setSelectedId] = useState(null);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [showEditMachine, setShowEditMachine] = useState(false);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [page, setPage] = useState("list");

  const [filterKanriNo, setFilterKanriNo] = useState("");
  const [filterKishu, setFilterKishu] = useState("");
  const [filterMaker, setFilterMaker] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [ms, opts, contents] = await Promise.all([
        api.fetchMachines(),
        api.fetchMasterOptions(),
        api.fetchMasterContent(),
      ]);
      setMachines(ms);
      setMasterOptions(opts);
      setMasterContent(contents);
    } catch (err) {
      setLoadError(err.message || "データの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const kishuOptions = useMemo(() => masterOptions.filter((o) => o.type === "kishu"), [masterOptions]);
  const makerOptions = useMemo(() => masterOptions.filter((o) => o.type === "maker"), [masterOptions]);
  const workerOptions = useMemo(() => masterOptions.filter((o) => o.type === "worker"), [masterOptions]);
  const quickMakerOptions = useMemo(() => masterOptions.filter((o) => o.type === "quick_maker"), [masterOptions]);

  const addOption = async (type, value) => {
    const row = await api.addMasterOption(type, value);
    setMasterOptions((prev) => [...prev, row]);
  };
  const removeOption = async (id) => {
    await api.removeMasterOption(id);
    setMasterOptions((prev) => prev.filter((o) => o.id !== id));
  };
  const addContentOption = async ({ name, unit }) => {
    const row = await api.addMasterContent(name, unit);
    setMasterContent((prev) => [...prev, row]);
  };
  const removeContentOption = async (id) => {
    await api.removeMasterContent(id);
    setMasterContent((prev) => prev.filter((o) => o.id !== id));
  };
  const changeContentUnit = async (id, unit) => {
    await api.updateMasterContentUnit(id, unit);
    setMasterContent((prev) => prev.map((o) => (o.id === id ? { ...o, unit } : o)));
  };

  const uniqueKanriNos = useMemo(() => machines.map((m) => m.kanri_no).sort((a, b) => a.localeCompare(b, "ja")), [machines]);
  const uniqueKishus = useMemo(() => unique(machines.map((m) => m.kishu)), [machines]);
  const uniqueMakers = useMemo(() => unique(machines.map((m) => m.maker)), [machines]);

  const filtered = useMemo(
    () =>
      machines.filter(
        (m) =>
          (!filterKanriNo || m.kanri_no === filterKanriNo) &&
          (!filterKishu || m.kishu === filterKishu) &&
          (!filterMaker || m.maker === filterMaker)
      ),
    [machines, filterKanriNo, filterKishu, filterMaker]
  );
  const hasFilter = filterKanriNo || filterKishu || filterMaker;
  const clearFilters = () => { setFilterKanriNo(""); setFilterKishu(""); setFilterMaker(""); };

  const alertGroups = useMemo(() => {
    const due = [];
    const soon = [];
    filtered.forEach((m) => {
      const s = getStatus(m);
      if (s === TONES.due) due.push(m);
      else if (s === TONES.soon) soon.push(m);
    });
    const groups = [];
    if (due.length) groups.push({ key: "due", label: "要点検", list: due });
    if (soon.length) groups.push({ key: "soon", label: "点検間近", list: soon });
    return groups;
  }, [filtered]);

  const selected = machines.find((m) => m.id === selectedId) || null;
  const existingNos = machines.map((m) => m.kanri_no);

  const summary = useMemo(() => {
    const c = { good: 0, soon: 0, due: 0, none: 0 };
    machines.forEach((m) => {
      const s = getStatus(m);
      const key = Object.keys(TONES).find((k) => TONES[k] === s);
      c[key]++;
    });
    return c;
  }, [machines]);

  const handleAddMachine = async (payload) => {
    const row = await api.addMachine(payload);
    setMachines((prev) => [{ ...row, maintenance_records: [] }, ...prev]);
    setShowAddMachine(false);
    setSelectedId(row.id);
  };

  const handleAddRecord = async (payload) => {
    const row = await api.addRecord(payload);
    setMachines((prev) =>
      prev.map((m) =>
        m.id === selected.id
          ? {
              ...m,
              hours: Math.max(m.hours, row.hours),
              maintenance_records: [...(m.maintenance_records || []), row],
            }
          : m
      )
    );
    if (row.hours > selected.hours) await api.updateMachineHours(selected.id, row.hours);
    setShowAddRecord(false);
  };

  const handleUpdateRecord = async (payload) => {
    const updated = await api.updateRecord(editingRecord.id, payload);
    setMachines((prev) =>
      prev.map((m) =>
        m.id === selected.id
          ? {
              ...m,
              hours: Math.max(m.hours, updated.hours),
              maintenance_records: (m.maintenance_records || []).map((r) =>
                r.id === updated.id ? updated : r
              ),
            }
          : m
      )
    );
    if (updated.hours > selected.hours) await api.updateMachineHours(selected.id, updated.hours);
    setEditingRecord(null);
  };

  const handleDeleteMachine = async (id) => {
    await api.deleteMachine(id);
    setMachines((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdateMachine = async (payload) => {
    const updated = await api.updateMachine(selected.id, payload);
    setMachines((prev) =>
      prev.map((m) => (m.id === updated.id ? { ...updated, maintenance_records: m.maintenance_records || [] } : m))
    );
    setShowEditMachine(false);
  };

  const handleUpdateProfile = async (updates) => {
    const updated = await api.updateProfile(profile.id, updates);
    if (onProfileChange) onProfileChange(updated);
  };

  if (loading) {
    return (
      <div className="ledger-loading">
        <div className="seal-mark">検</div>
        <p>読み込み中…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ledger-loading">
        <p className="error-text">{loadError}</p>
        <button className="btn btn-primary btn-sm" onClick={loadAll}>再読み込み</button>
      </div>
    );
  }

  const headerStyle =
    profile && profile.header_image_url
      ? {
          backgroundImage: `linear-gradient(rgba(22,38,63,0.55), rgba(22,38,63,0.55)), url(${profile.header_image_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : undefined;

  return (
    <>
      <header className="header" style={headerStyle}>
        <div className="header-row">
          {profile && profile.logo_url ? (
            <img src={profile.logo_url} alt="ロゴ" className="seal-mark seal-logo" />
          ) : (
            <div className="seal-mark">検</div>
          )}
          <div className="header-titles">
            <h1>{(profile && profile.app_title) || "重機保全台帳"}</h1>
          </div>
          <div className="header-actions">
            <span className="user-tag">{profile ? profile.display_name : ""} さん</span>
            <button
              className="master-nav-btn"
              onClick={() => { setSelectedId(null); setPage(page === "master" ? "list" : "master"); }}
            >
              {page === "master" ? "← 一覧へ" : "⚙ マスタ編集"}
            </button>
            <button className="master-nav-btn logout-btn" onClick={onSignOut}>ログアウト</button>
          </div>
        </div>
      </header>

      {page === "master" ? (
        <div className="content content-top">
          <MasterPage
            onBack={() => setPage("list")}
            kishu={kishuOptions}
            maker={makerOptions}
            worker={workerOptions}
            content={masterContent}
            quickMaker={quickMakerOptions}
            onAddOpt={addOption}
            onRemoveOpt={removeOption}
            onAddContent={addContentOption}
            onRemoveContent={removeContentOption}
            onChangeContentUnit={changeContentUnit}
            machines={machines}
            onDeleteMachine={handleDeleteMachine}
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
          />
        </div>
      ) : (
        <>
          <div className="summary-strip">
            <span className="summary-chip"><span className="summary-dot" style={{ background: TONES.good.ink }} />良好 {summary.good}</span>
            <span className="summary-chip"><span className="summary-dot" style={{ background: TONES.soon.ink }} />点検間近 {summary.soon}</span>
            <span className="summary-chip"><span className="summary-dot" style={{ background: TONES.due.ink }} />要点検 {summary.due}</span>
            <span className="summary-chip"><span className="summary-dot" style={{ background: TONES.none.ink }} />未点検 {summary.none}</span>
          </div>

          <div className="toolbar">
            <div className="toolbar-card machine-search-card">
              <MachineSearch machines={machines} quickMakerOptions={quickMakerOptions} onSelect={setSelectedId} />
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-card">
              <div className="filter-group">
                <select className="input" value={filterKanriNo} onChange={(e) => setFilterKanriNo(e.target.value)}>
                  <option value="">管理番号：すべて</option>
                  {uniqueKanriNos.map((no) => <option key={no} value={no}>{no}</option>)}
                </select>
                <select className="input" value={filterKishu} onChange={(e) => setFilterKishu(e.target.value)}>
                  <option value="">機種：すべて</option>
                  {uniqueKishus.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <select className="input" value={filterMaker} onChange={(e) => setFilterMaker(e.target.value)}>
                  <option value="">メーカー：すべて</option>
                  {uniqueMakers.map((mk) => <option key={mk} value={mk}>{mk}</option>)}
                </select>
                {hasFilter && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>絞り込み解除</button>}
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddMachine(true)}>＋ 新規機械登録</button>
            </div>
          </div>

          <div className="content">
            {selected ? (
              <MachineDetail
                machine={selected}
                onBack={() => setSelectedId(null)}
                onAddRecord={() => setShowAddRecord(true)}
                onEditRecord={(r) => setEditingRecord(r)}
                onEditMachine={() => setShowEditMachine(true)}
              />
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="seal-mark" style={{ margin: "0 auto", color: "var(--indigo-800)", borderColor: "var(--washi-line)" }}>印</div>
                <h3>{machines.length === 0 ? "台帳はまだ空です" : "該当する機械が見つかりません"}</h3>
                <p>{machines.length === 0 ? "「＋ 新規機械登録」から管理番号を入力して、最初の一台を登録しましょう。" : "絞り込み条件を変えてお試しください。"}</p>
              </div>
            ) : alertGroups.length === 0 ? (
              <div className="empty-state">
                <div className="seal-mark" style={{ margin: "0 auto", color: "var(--indigo-800)", borderColor: "var(--washi-line)" }}>良</div>
                <h3>現在、点検が必要な機械はありません</h3>
                <p>要点検・点検間近の機械があれば、ここに表示されます。</p>
              </div>
            ) : (
              <div className="grouped-list">
                {alertGroups.map((g) => (
                  <div className="maker-group" key={g.key}>
                    <div className="group-header">
                      <span className="group-header-title">{g.label}</span>
                      <span className="group-header-count">{g.list.length}台</span>
                    </div>
                    <div className="alert-list">
                      {g.list.map((m) => <AlertRow key={m.id} machine={m} onOpenDetail={setSelectedId} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showAddMachine && (
        <AddMachineModal
          existingNos={existingNos}
          onClose={() => setShowAddMachine(false)}
          onSave={handleAddMachine}
          kishuOptions={kishuOptions.map((o) => o.value)}
          makerOptions={makerOptions.map((o) => o.value)}
          onAddKishu={(v) => addOption("kishu", v)}
          onAddMaker={(v) => addOption("maker", v)}
        />
      )}
      {showAddRecord && selected && (
        <AddRecordModal
          machine={selected}
          onClose={() => setShowAddRecord(false)}
          onSave={handleAddRecord}
          contentOptions={masterContent}
          onAddContentOption={addContentOption}
          workerOptions={workerOptions.map((o) => o.value)}
          onAddWorker={(v) => addOption("worker", v)}
        />
      )}
      {showEditMachine && selected && (
        <EditMachineModal
          machine={selected}
          existingNos={machines.filter((m) => m.id !== selected.id).map((m) => m.kanri_no)}
          onClose={() => setShowEditMachine(false)}
          onSave={handleUpdateMachine}
          kishuOptions={kishuOptions.map((o) => o.value)}
          makerOptions={makerOptions.map((o) => o.value)}
          onAddKishu={(v) => addOption("kishu", v)}
          onAddMaker={(v) => addOption("maker", v)}
        />
      )}
      {editingRecord && selected && (
        <EditRecordModal
          machine={selected}
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={handleUpdateRecord}
          contentOptions={masterContent}
          onAddContentOption={addContentOption}
          workerOptions={workerOptions.map((o) => o.value)}
          onAddWorker={(v) => addOption("worker", v)}
        />
      )}
    </>
  );
}
