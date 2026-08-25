import { supabase } from "./supabaseClient";

/* ---------------------------- Auth ---------------------------- */

export async function signUp({ email, password, displayName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email.split("@")[0] } },
  });
  if (error) throw error;
  // 新規ユーザーには初期マスタデータ（機種・メーカー・実施者・整備内容）を投入しておく
  if (data.user) {
    await supabase.rpc("seed_master_defaults", { uid: data.user.id });
  }
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPasswordForEmail(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

/* ---------------------------- Photos ---------------------------- */

// folder は "machines" または "records" を想定
export async function uploadPhoto(file, folder) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です。");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${user.id}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("machine-photos").upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("machine-photos").getPublicUrl(path);
  return data.publicUrl;
}

/* -------------------------- Machines --------------------------- */

export async function fetchMachines() {
  const { data, error } = await supabase
    .from("machines")
    .select("*, maintenance_records(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addMachine(machine) {
  const { data, error } = await supabase.from("machines").insert(machine).select().single();
  if (error) throw error;
  return data;
}

export async function updateMachineHours(machineId, hours) {
  const { error } = await supabase.from("machines").update({ hours }).eq("id", machineId);
  if (error) throw error;
}

export async function deleteMachine(id) {
  const { error } = await supabase.from("machines").delete().eq("id", id);
  if (error) throw error;
}

/* ----------------------- Maintenance records --------------------- */

export async function addRecord(record) {
  const { data, error } = await supabase.from("maintenance_records").insert(record).select().single();
  if (error) throw error;
  return data;
}

export async function updateRecord(id, payload) {
  const { data, error } = await supabase
    .from("maintenance_records")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* --------------------------- Master data --------------------------- */

export async function fetchMasterOptions() {
  const { data, error } = await supabase.from("master_options").select("*").order("value");
  if (error) throw error;
  return data;
}

export async function addMasterOption(type, value) {
  const { data, error } = await supabase
    .from("master_options")
    .insert({ type, value })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeMasterOption(id) {
  const { error } = await supabase.from("master_options").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchMasterContent() {
  const { data, error } = await supabase.from("master_content").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function addMasterContent(name, unit) {
  const { data, error } = await supabase
    .from("master_content")
    .insert({ name, unit })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeMasterContent(id) {
  const { error } = await supabase.from("master_content").delete().eq("id", id);
  if (error) throw error;
}

export async function updateMasterContentUnit(id, unit) {
  const { error } = await supabase.from("master_content").update({ unit }).eq("id", id);
  if (error) throw error;
}
