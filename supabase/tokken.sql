-- 特定自主検査記録表 モジュール用テーブル
-- Supabase の SQL Editor で実行してください。

create table if not exists public.tokken_machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ledger_machine_id uuid,            -- 既存の保全台帳の機械IDと紐づける場合に使用（任意）
  template_id text not null,         -- 機種テンプレート（templates.js の id）
  name text not null,                -- 管理番号・呼称（例：BH-01）
  maker text, model text, serial text,
  made_on text,                      -- 製造年月（例：2018-04）
  plate text,                        -- 登録番号・ナンバー等
  location text,
  spec jsonb not null default '{}'::jsonb,       -- 機体質量・バケット容量など機種別の能力
  last_inspected_on date,            -- 台帳から移行する場合の前回検査日
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tokken_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  machine_id uuid not null references public.tokken_machines(id) on delete cascade,
  template_id text not null,
  inspected_on date,
  next_due date,
  hour_meter numeric,
  kind text,                         -- 事業内検査 / 検査業者
  inspector_name text, inspector_qual text,
  vendor_name text, vendor_reg_no text,
  owner_name text,                   -- 事業者名
  results jsonb not null default '{}'::jsonb,       -- {検査部位キー: {mark, note}}
  measurements jsonb not null default '{}'::jsonb,  -- {測定項目: {std, val}}
  repairs text,
  judgment text,                     -- 合格 / 要整備
  machine_snapshot jsonb,            -- 記録時点の機械情報（後から台帳を変えても記録表は変わらない）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tokken_records_machine_idx on public.tokken_records(machine_id, inspected_on desc);

create table if not exists public.tokken_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);

alter table public.tokken_machines enable row level security;
alter table public.tokken_records  enable row level security;
alter table public.tokken_settings enable row level security;

create policy "own machines" on public.tokken_machines for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own records"  on public.tokken_records  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings" on public.tokken_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.tokken_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger tokken_machines_touch before update on public.tokken_machines for each row execute function public.tokken_touch();
create trigger tokken_records_touch  before update on public.tokken_records  for each row execute function public.tokken_touch();

-- 参考：既存の保全台帳テーブル（例：machines）から一括取り込みする場合
-- insert into public.tokken_machines (ledger_machine_id, template_id, name, maker, model, serial)
-- select id, 'excavator_crawler', name, maker, model, serial_no from public.machines where category = '油圧ショベル';

-- ===== 建荷協用紙への重ね印刷（追加） =====
alter table public.tokken_machines add column if not exists form_id text;   -- 例：SR-GL（空欄＝自社様式）
alter table public.tokken_machines add column if not exists shaken text;    -- 車検有効期間
alter table public.tokken_records  add column if not exists form_id text;
alter table public.tokken_records  add column if not exists overlay jsonb;  -- 重ね印刷の記入内容

-- ===== 保全台帳からの自動取り込み・装備なし項目（追加） =====
alter table public.tokken_machines add column if not exists na_rows jsonb not null default '[]'::jsonb;  -- 装備されていない項目
alter table public.tokken_machines add column if not exists kishu text;            -- 保全台帳の機種名
alter table public.tokken_machines add column if not exists hours numeric;         -- 稼働時間（台帳から）
alter table public.tokken_machines add column if not exists next_legal_date date;  -- 次回特定自主検査予定日（台帳から）
create unique index if not exists tokken_machines_ledger_uidx on public.tokken_machines(user_id, ledger_machine_id) where ledger_machine_id is not null;
