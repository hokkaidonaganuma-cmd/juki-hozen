-- 保全台帳からの自動取り込み・装備なし項目（追加分）
alter table public.tokken_machines add column if not exists na_rows jsonb not null default '[]'::jsonb;
alter table public.tokken_machines add column if not exists kishu text;
alter table public.tokken_machines add column if not exists hours numeric;
alter table public.tokken_machines add column if not exists next_legal_date date;
create unique index if not exists tokken_machines_ledger_uidx on public.tokken_machines(user_id, ledger_machine_id) where ledger_machine_id is not null;
