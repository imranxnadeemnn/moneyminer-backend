create table if not exists users (
  user_id bigserial primary key,
  phone text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists wallets (
  wallet_id bigserial primary key,
  user_id bigint not null unique references users(user_id) on delete cascade,
  balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  campaign_id bigserial primary key,
  title text not null,
  payout numeric(12, 2) not null default 0,
  icon_url text,
  description text,
  trackier_url text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists rewards (
  reward_id bigserial primary key,
  user_id bigint not null references users(user_id) on delete cascade,
  campaign_id bigint not null references campaigns(campaign_id) on delete cascade,
  amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, campaign_id)
);

create table if not exists withdraws (
  withdraw_id bigserial primary key,
  user_id bigint not null references users(user_id) on delete cascade,
  amount numeric(12, 2) not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists kyc (
  kyc_id bigserial primary key,
  user_id bigint not null references users(user_id) on delete cascade,
  name text not null,
  pan text not null,
  upi text not null,
  created_at timestamptz not null default now()
);

create table if not exists admins (
  admin_id bigserial primary key,
  username text unique not null,
  password text not null,
  created_at timestamptz not null default now()
);

insert into admins (username, password)
values ('admin', 'admin123')
on conflict (username) do nothing;
