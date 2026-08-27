-- ============================================================
-- 重機保全台帳 -- Supabase スキーマ
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください
-- ============================================================

-- 拡張機能（UUID生成用。Supabaseはデフォルトで有効な場合が多い）
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles: 表示名など、auth.users に持たせられない追加情報
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  app_title text,
  logo_url text,
  header_image_url text,
  background_image_url text,
  created_at timestamptz not null default now()
);

-- 既にテーブルを作成済みの場合でも安全に追加できるように（再実行OK）
alter table profiles add column if not exists app_title text;
alter table profiles add column if not exists logo_url text;
alter table profiles add column if not exists header_image_url text;
alter table profiles add column if not exists background_image_url text;

alter table profiles enable row level security;

create policy "profiles: 本人のみ参照" on profiles
  for select using (auth.uid() = id);

create policy "profiles: 本人のみ更新" on profiles
  for update using (auth.uid() = id);

create policy "profiles: 本人のみ作成" on profiles
  for insert with check (auth.uid() = id);

-- 表示設定（会社ロゴ・ヘッダー画像・背景画像）。既存プロジェクトでも安全に再実行可能
alter table profiles add column if not exists logo_url text;
alter table profiles add column if not exists header_image_url text;
alter table profiles add column if not exists background_url text;

-- サインアップ時に自動で profiles 行を作るトリガー
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- machines: 機械台帳（管理番号ごとの機械情報）
-- ------------------------------------------------------------
create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kanri_no text not null,
  kishu text not null default '',
  maker text not null default '',
  katashiki text not null default '',
  chassis_no text not null default '',
  basho text not null default '',
  cycle_days int not null default 90,
  hours numeric not null default 0,
  photo_url text,
  created_at timestamptz not null default now(),
  unique (owner_id, kanri_no)
);

-- 既にテーブルを作成済みの場合でも安全に追加できるように（再実行OK）
alter table machines add column if not exists chassis_no text not null default '';
alter table machines add column if not exists photo_url text;

alter table machines enable row level security;

create policy "machines: 所有者のみ全操作" on machines
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists machines_owner_idx on machines(owner_id);

-- ------------------------------------------------------------
-- maintenance_records: 整備履歴
-- ------------------------------------------------------------
create table if not exists maintenance_records (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  worker text not null default '',
  hours numeric not null default 0,
  next_date date,
  legal_date date,
  content jsonb not null default '[]'::jsonb, -- [{name, unit, amount}]
  photo_url text,
  created_at timestamptz not null default now()
);

alter table maintenance_records add column if not exists photo_url text;

alter table maintenance_records enable row level security;

create policy "records: 所有者のみ全操作" on maintenance_records
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists records_machine_idx on maintenance_records(machine_id);
create index if not exists records_owner_idx on maintenance_records(owner_id);

-- ------------------------------------------------------------
-- master_options: 機種・メーカー・実施者の選択肢
-- ------------------------------------------------------------
create table if not exists master_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('kishu', 'maker', 'worker', 'quick_maker')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, type, value)
);

-- 既存プロジェクトで先にテーブルが作られていた場合、type の制約を緩めて quick_maker を許可する
alter table master_options drop constraint if exists master_options_type_check;
alter table master_options add constraint master_options_type_check
  check (type in ('kishu', 'maker', 'worker', 'quick_maker'));

alter table master_options enable row level security;

create policy "master_options: 所有者のみ全操作" on master_options
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ------------------------------------------------------------
-- master_content: 整備内容の選択肢（単位付き）
-- ------------------------------------------------------------
create table if not exists master_content (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  unit text not null default 'none' check (unit in ('none', 'volume', 'count')),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table master_content enable row level security;

create policy "master_content: 所有者のみ全操作" on master_content
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ------------------------------------------------------------
-- 初回サインアップ時にマスタデータの初期値を投入する関数（任意で呼び出し）
-- アプリ側から、初回ログイン検知時に一度だけ呼び出す想定
-- ------------------------------------------------------------
create or replace function public.seed_master_defaults(uid uuid)
returns void as $$
begin
  insert into master_options (owner_id, type, value) values
    (uid, 'kishu', '油圧ショベル'), (uid, 'kishu', 'ホイールローダー'), (uid, 'kishu', 'ブルドーザー'),
    (uid, 'kishu', 'クレーン'), (uid, 'kishu', 'ダンプトラック'), (uid, 'kishu', '振動ローラー'), (uid, 'kishu', 'フォークリフト'),
    (uid, 'maker', 'ヤンマー'), (uid, 'maker', '日立'), (uid, 'maker', 'コマツ'), (uid, 'maker', 'CAT'),
    (uid, 'worker', '田中'), (uid, 'worker', '鈴木'), (uid, 'worker', '佐藤'), (uid, 'worker', '高橋'),
    (uid, 'quick_maker', 'ヤンマー'), (uid, 'quick_maker', '日立'), (uid, 'quick_maker', 'CAT'),
    (uid, 'quick_maker', 'コマツ'), (uid, 'quick_maker', '諸岡'), (uid, 'quick_maker', 'その他')
  on conflict do nothing;

  insert into master_content (owner_id, name, unit) values
    (uid, 'エンジンオイル交換', 'volume'), (uid, '油圧オイル交換', 'volume'), (uid, '冷却水補充', 'volume'),
    (uid, '油圧フィルター交換', 'count'), (uid, 'エアフィルター交換', 'count'), (uid, '燃料フィルター交換', 'count'),
    (uid, 'グリスアップ', 'none'), (uid, 'バッテリー点検', 'none'), (uid, '履帯・タイヤ点検', 'none'),
    (uid, 'ベルト点検', 'none'), (uid, 'ブレーキ点検', 'none')
  on conflict do nothing;
end;
$$ language plpgsql security definer;

-- 既存ユーザー（このアップデート以前にサインアップ済みのアカウント）にも
-- クイック検索ボタンの初期値を一度だけ補充する
insert into master_options (owner_id, type, value)
select u.id, t.type, t.value
from auth.users u
cross join (
  values
    ('quick_maker', 'ヤンマー'), ('quick_maker', '日立'), ('quick_maker', 'CAT'),
    ('quick_maker', 'コマツ'), ('quick_maker', '諸岡'), ('quick_maker', 'その他')
) as t(type, value)
on conflict do nothing;

-- ------------------------------------------------------------
-- Storage: 機械・整備記録の写真を保存するバケット
-- パスは "<ユーザーID>/machines/xxxx.jpg" や "<ユーザーID>/records/xxxx.jpg" の形で保存する想定
-- バケット名は "machine-photos" 固定です（アプリのコードもこの名前を直接参照しています）
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('machine-photos', 'machine-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "machine-photos: 誰でも閲覧可能" on storage.objects;
create policy "machine-photos: 誰でも閲覧可能" on storage.objects
  for select using (bucket_id = 'machine-photos');

drop policy if exists "machine-photos: 本人フォルダのみアップロード可能" on storage.objects;
create policy "machine-photos: 本人フォルダのみアップロード可能" on storage.objects
  for insert with check (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "machine-photos: 本人フォルダのみ更新可能" on storage.objects;
create policy "machine-photos: 本人フォルダのみ更新可能" on storage.objects
  for update using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "machine-photos: 本人フォルダのみ削除可能" on storage.objects;
create policy "machine-photos: 本人フォルダのみ削除可能" on storage.objects
  for delete using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
