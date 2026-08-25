import React, { useState, useEffect, useRef } from "react";

export const TONES = {
  good: { label: "良好", ink: "#4c6b45", ring: "#4c6b45", kanji: "良" },
  soon: { label: "点検間近", ink: "#b9791f", ring: "#b9791f", kanji: "注" },
  due: { label: "要点検", ink: "#a5312b", ring: "#a5312b", kanji: "要" },
  none: { label: "未点検", ink: "#7a746a", ring: "#7a746a", kanji: "未" },
};

export const UNIT_LABEL = { volume: "ℓ", count: "個" };

export function formatContentItem(item) {
  if (item.unit === "volume") return `${item.name}（${item.amount}${UNIT_LABEL.volume}）`;
  if (item.unit === "count") return `${item.name}（${item.amount}${UNIT_LABEL.count}）`;
  return item.name;
}

export function fmtDate(s) {
  if (!s) return "―";
  const [y, m, d] = s.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

export function daysUntil(dateStr) {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

export function latestRecord(machine) {
  const records = machine.maintenance_records || machine.records || [];
  if (!records.length) return null;
  return [...records].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

export function getStatus(machine) {
  const latest = latestRecord(machine);
  if (!latest || !latest.next_date) return TONES.none;
  const diff = daysUntil(latest.next_date);
  if (diff < 0) return TONES.due;
  if (diff <= 7) return TONES.soon;
  return TONES.good;
}

export function Hanko({ tone, size = 40 }) {
  const t = TONES[tone] || TONES.none;
  return (
    <span className="hanko" style={{ width: size, height: size }} title={t.label}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r="44" fill="none" stroke={t.ring} strokeWidth="5" />
        <circle cx="50" cy="50" r="37" fill="none" stroke={t.ring} strokeWidth="1.4" />
        <text
          x="50"
          y="63"
          textAnchor="middle"
          fontSize="46"
          fontFamily="'Shippori Mincho', serif"
          fill={t.ring}
        >
          {t.kanji}
        </text>
      </svg>
    </span>
  );
}

export function Overlay({ onClose, children, wide }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"sheet" + (wide ? " sheet-wide" : "")}>{children}</div>
    </div>
  );
}

export function Field({ label, required, children }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <em>必須</em>}
      </span>
      {children}
    </label>
  );
}

export function PhotoUploadField({ label, previewUrl, onFileSelected, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="photo-upload-row">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="photo-preview" />
        ) : (
          <div className="photo-preview photo-preview-empty">写真なし</div>
        )}
        <div className="photo-upload-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => inputRef.current && inputRef.current.click()}>
            {previewUrl ? "写真を変更" : "写真を選択"}
          </button>
          {previewUrl && onRemove && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onRemove}>
              削除
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files && e.target.files[0];
              if (file) onFileSelected(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function EditableSelect({ value, onChange, options, onAddOption, placeholder }) {
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleSelectChange = (e) => {
    if (e.target.value === "__add__") {
      setNewVal("");
      setAdding(true);
    } else {
      onChange(e.target.value);
    }
  };

  const confirmAdd = async () => {
    const v = newVal.trim();
    if (!v) {
      setAdding(false);
      return;
    }
    await onAddOption(v);
    onChange(v);
    setAdding(false);
    setNewVal("");
  };

  if (adding) {
    return (
      <div className="inline-add">
        <input
          ref={inputRef}
          className="input"
          placeholder="新しい項目を入力"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmAdd();
            }
            if (e.key === "Escape") setAdding(false);
          }}
        />
        <button type="button" className="btn btn-sm btn-primary" onClick={confirmAdd}>
          追加
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>
          戻る
        </button>
      </div>
    );
  }

  return (
    <select className="input" value={value} onChange={handleSelectChange}>
      <option value="" disabled>
        {placeholder || "選択してください"}
      </option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__add__">＋ 新しい項目を追加…</option>
    </select>
  );
}

export function ContentPicker({ options, onAddOption, selected, onChange }) {
  const [currentName, setCurrentName] = useState("");
  const [amount, setAmount] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("none");
  const inputRef = useRef(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const currentOption = options.find((o) => o.name === currentName);
  const unit = currentOption ? currentOption.unit : "none";
  const needsAmount = unit !== "none";

  const handleSelectChange = (e) => {
    if (e.target.value === "__add__") {
      setNewName("");
      setNewUnit("none");
      setAdding(true);
      return;
    }
    setCurrentName(e.target.value);
    setAmount("");
  };

  const addSelected = () => {
    if (!currentName) return;
    if (needsAmount && (!amount || Number(amount) <= 0)) return;
    if (selected.some((s) => s.name === currentName)) {
      setCurrentName("");
      setAmount("");
      return;
    }
    onChange([
      ...selected,
      { name: currentName, unit, amount: needsAmount ? Number(amount) : null },
    ]);
    setCurrentName("");
    setAmount("");
  };

  const removeItem = (name) => onChange(selected.filter((s) => s.name !== name));

  const confirmAddOption = async () => {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    await onAddOption({ name, unit: newUnit });
    setAdding(false);
    setNewName("");
    setCurrentName(name);
    setAmount("");
  };

  return (
    <div className="content-picker">
      {adding ? (
        <div className="inline-add inline-add-content">
          <input
            ref={inputRef}
            className="input"
            placeholder="新しい整備内容を入力"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmAddOption();
              }
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <select className="input unit-select" value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
            <option value="none">単位なし</option>
            <option value="volume">ℓ（液量）</option>
            <option value="count">個数</option>
          </select>
          <button type="button" className="btn btn-sm btn-primary" onClick={confirmAddOption}>
            追加
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>
            戻る
          </button>
        </div>
      ) : (
        <div className="picker-row">
          <select className="input" value={currentName} onChange={handleSelectChange}>
            <option value="">項目を選択…</option>
            {options.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
                {o.unit !== "none" ? `（${UNIT_LABEL[o.unit]}入力）` : ""}
              </option>
            ))}
            <option value="__add__">＋ 新しい項目を追加…</option>
          </select>
          {needsAmount && currentName && (
            <input
              type="number"
              min="0"
              step={unit === "volume" ? 0.1 : 1}
              className="input amount-input"
              placeholder={UNIT_LABEL[unit]}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={addSelected}
            disabled={!currentName || (needsAmount && (!amount || Number(amount) <= 0))}
          >
            追加
          </button>
        </div>
      )}
      {selected.length > 0 ? (
        <div className="chip-row">
          {selected.map((item) => (
            <span className="chip" key={item.name}>
              {formatContentItem(item)}
              <button type="button" onClick={() => removeItem(item.name)} aria-label={`${item.name}を削除`}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="picker-hint">選択した項目がここに並びます（複数追加できます）</p>
      )}
    </div>
  );
}

export function MasterListEditor({ title, items, onAdd, onRemove }) {
  const [newVal, setNewVal] = useState("");

  const submit = async () => {
    const v = newVal.trim();
    if (!v) return;
    await onAdd(v);
    setNewVal("");
  };

  return (
    <div className="master-card">
      <h3>{title}</h3>
      <div className="master-list">
        {items.length === 0 && <p className="picker-hint">まだ項目がありません。</p>}
        {items.map((item) => (
          <div className="master-row" key={item.id}>
            <span className="master-row-name">{item.value}</span>
            <button
              type="button"
              className="master-remove"
              onClick={() => onRemove(item.id)}
              aria-label={`${item.value}を削除`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="inline-add">
        <input
          className="input"
          placeholder="新しい項目を入力"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
          追加
        </button>
      </div>
    </div>
  );
}

export function MasterContentEditor({ items, onAdd, onRemove, onChangeUnit }) {
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("none");

  const submit = async () => {
    const v = newName.trim();
    if (!v) return;
    await onAdd(v, newUnit);
    setNewName("");
    setNewUnit("none");
  };

  return (
    <div className="master-card">
      <h3>整備内容</h3>
      <p className="master-desc">
        オイル関係・冷却水は「ℓ」、フィルター類の交換は「個数」を選ぶと、記録時に数量の入力欄が表示されます。
      </p>
      <div className="master-list">
        {items.length === 0 && <p className="picker-hint">まだ項目がありません。</p>}
        {items.map((item) => (
          <div className="master-row" key={item.id}>
            <span className="master-row-name">{item.name}</span>
            <select
              className="input unit-select-sm"
              value={item.unit}
              onChange={(e) => onChangeUnit(item.id, e.target.value)}
            >
              <option value="none">単位なし</option>
              <option value="volume">ℓ（液量）</option>
              <option value="count">個数</option>
            </select>
            <button
              type="button"
              className="master-remove"
              onClick={() => onRemove(item.id)}
              aria-label={`${item.name}を削除`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="inline-add inline-add-content">
        <input
          className="input"
          placeholder="新しい整備内容を入力"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <select className="input unit-select" value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
          <option value="none">単位なし</option>
          <option value="volume">ℓ（液量）</option>
          <option value="count">個数</option>
        </select>
        <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
          追加
        </button>
      </div>
    </div>
  );
}
