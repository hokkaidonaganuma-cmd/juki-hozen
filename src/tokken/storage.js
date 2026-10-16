// データ保存アダプター
//  - createLocalStore(): ブラウザ保存（デモ・単体利用）
//  - createSupabaseStore(supabase): 保全台帳の Supabase に保存（supabase/tokken.sql を先に実行）
// どちらも同じインターフェースを返すので、画面側は差し替えるだけで動きます。

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function safeGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* 保存不可の環境では無視 */ }
}

export function createLocalStore(prefix = 'tokken') {
  const K = { m: `${prefix}:machines`, r: `${prefix}:records`, s: `${prefix}:settings` };
  const mem = { m: safeGet(K.m, null), r: safeGet(K.r, []), s: safeGet(K.s, {}) };
  const persist = () => { safeSet(K.m, mem.m); safeSet(K.r, mem.r); safeSet(K.s, mem.s); };
  return {
    kind: 'local',
    async listMachines() { return mem.m || []; },
    async isFirstRun() { return mem.m === null; },
    async saveMachine(m) {
      mem.m = mem.m || [];
      const row = { ...m, id: m.id || uid(), updated_at: new Date().toISOString() };
      const i = mem.m.findIndex((x) => x.id === row.id);
      if (i >= 0) mem.m[i] = row; else mem.m.push(row);
      persist(); return row;
    },
    async deleteMachine(id) { mem.m = (mem.m || []).filter((x) => x.id !== id); mem.r = mem.r.filter((r) => r.machine_id !== id); persist(); },
    async listRecords(machineId) { return mem.r.filter((r) => !machineId || r.machine_id === machineId).sort((a, b) => (b.inspected_on || '').localeCompare(a.inspected_on || '')); },
    async saveRecord(r) {
      const row = { ...r, id: r.id || uid(), updated_at: new Date().toISOString() };
      const i = mem.r.findIndex((x) => x.id === row.id);
      if (i >= 0) mem.r[i] = row; else mem.r.push(row);
      persist(); return row;
    },
    async deleteRecord(id) { mem.r = mem.r.filter((x) => x.id !== id); persist(); },
    async getSettings() { return mem.s || {}; },
    async saveSettings(s) { mem.s = s; persist(); return s; },
  };
}

export function createSupabaseStore(supabase) {
  const must = ({ data, error }) => { if (error) throw error; return data; };
  return {
    kind: 'supabase',
    async isFirstRun() { return false; },
    async listMachines() { return must(await supabase.from('tokken_machines').select('*').order('name')); },
    async saveMachine(m) {
      const { id, updated_at, ...rest } = m; // eslint-disable-line no-unused-vars
      const q = id ? supabase.from('tokken_machines').update(rest).eq('id', id) : supabase.from('tokken_machines').insert(rest);
      return must(await q.select().single());
    },
    async deleteMachine(id) { must(await supabase.from('tokken_machines').delete().eq('id', id)); },
    async listRecords(machineId) {
      let q = supabase.from('tokken_records').select('*').order('inspected_on', { ascending: false });
      if (machineId) q = q.eq('machine_id', machineId);
      return must(await q);
    },
    async saveRecord(r) {
      const { id, updated_at, ...rest } = r; // eslint-disable-line no-unused-vars
      const q = id ? supabase.from('tokken_records').update(rest).eq('id', id) : supabase.from('tokken_records').insert(rest);
      return must(await q.select().single());
    },
    async deleteRecord(id) { must(await supabase.from('tokken_records').delete().eq('id', id)); },
    async getSettings() {
      const rows = must(await supabase.from('tokken_settings').select('data').limit(1));
      return rows?.[0]?.data || {};
    },
    async saveSettings(s) {
      const { data: { user } } = await supabase.auth.getUser();
      must(await supabase.from('tokken_settings').upsert({ user_id: user.id, data: s }));
      return s;
    },
  };
}
