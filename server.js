const express = require("express")
const cors = require("cors")
const rateLimit = require("express-rate-limit")
const path = require("path")
const db = require("./db")

const app = express()
const PORT = process.env.PORT || 3000
const DEMO_OTP = "1234"
const RAZORPAY_KEY_ID = String(process.env.RAZORPAY_KEY_ID || "").trim()
const RAZORPAY_KEY_SECRET = String(process.env.RAZORPAY_KEY_SECRET || "").trim()
const RAZORPAY_BASE_URL = String(process.env.RAZORPAY_BASE_URL || "https://api.razorpay.com").trim()
const RAZORPAY_SOURCE_ACCOUNT_NUMBER = String(process.env.RAZORPAY_SOURCE_ACCOUNT_NUMBER || "").trim()
const RAZORPAY_BANK_PAYOUT_MODE = String(process.env.RAZORPAY_BANK_PAYOUT_MODE || "IMPS").trim().toUpperCase()

let adminToken = null

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    error: message
  })
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ""
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim())
}

function normalizeIdentity(channel, target) {
  const normalizedChannel = String(channel || "").trim().toLowerCase()
  const normalizedTarget = String(target || "").trim().toLowerCase()

  if (!hasValue(normalizedChannel) || !hasValue(normalizedTarget)) {
    return null
  }

  if (!["phone", "email"].includes(normalizedChannel)) {
    return null
  }

  if (normalizedChannel === "email" && !isEmail(normalizedTarget)) {
    return null
  }

  return {
    channel: normalizedChannel,
    target: normalizedTarget
  }
}

function rewardTypeFromLegacyValue(value) {
  const normalized = String(value || "").trim().toLowerCase()

  if (normalized === "event" || normalized === "multi_event") {
    return normalized
  }

  return "install"
}

function numberOrZero(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function parseBooleanish(value, defaultValue = false) {
  if (typeof value === "boolean") {
    return value
  }

  if (!hasValue(value)) {
    return defaultValue
  }

  const normalized = String(value).trim().toLowerCase()
  return ["true", "1", "yes", "active"].includes(normalized)
}

function mapOffer(row) {
  const offerId = Number(row.id ?? row.campaign_id ?? 0)

  return {
    offer_id: offerId,
    title: row.title,
    short_description: row.short_description || row.description || "",
    long_description: row.long_description || row.description || "",
    payout: Number(row.payout || 0),
    reward_amount: Number(row.reward_amount || row.payout || 0),
    reward_type: rewardTypeFromLegacyValue(row.reward_type),
    category: row.category || "Featured",
    icon_url: row.icon_url || "",
    banner_url: row.banner_url || "",
    trackier_url: row.trackier_url || "",
    terms: row.terms || "",
    cta_text: row.cta_text || "Install & Earn",
    event_name: row.event_name || "install",
    status: row.status || "active",
    is_featured: Boolean(row.is_featured),
    featured_rank: Number(row.featured_rank || 999)
  }
}

function mapPaymentMethod(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    user_id: row.user_id,
    provider: row.provider || "razorpay",
    method_type: row.method_type,
    payout_mode: row.payout_mode || row.method_type || "upi",
    upi_id: row.upi_id || "",
    account_name: row.account_name || "",
    account_number: row.account_number || "",
    ifsc: row.ifsc || "",
    contact_email: row.contact_email || "",
    contact_phone: row.contact_phone || "",
    razorpay_contact_id: row.razorpay_contact_id || "",
    razorpay_fund_account_id: row.razorpay_fund_account_id || "",
    status: row.status || "active",
    created_at: row.created_at
  }
}

function buildTrackierRedirectUrl(baseUrl, params) {
  if (!hasValue(baseUrl)) {
    return ""
  }

  const url = new URL(baseUrl)

  Object.entries(params).forEach(([key, value]) => {
    if (hasValue(value) && !url.searchParams.has(key)) {
      url.searchParams.set(key, String(value))
    }
  })

  return url.toString()
}

function normalizeTrackierPostbackPayload(payload) {
  const source = payload || {}
  const normalizedStatus = String(
    source.status || source.conversion_status || source.event_status || "approved"
  ).trim().toLowerCase()

  return {
    user_id: Number(source.user_id || source.sub1 || source.af_sub1 || 0),
    click_ref: String(source.click_ref || source.sub2 || source.af_sub2 || "").trim(),
    campaign_id: Number(source.campaign_id || source.offer_id || source.sub3 || source.af_sub3 || 0),
    trackier_click_id: String(source.click_id || source.clickid || source.tid || "").trim(),
    txn_id: String(source.txn_id || source.transaction_id || "").trim(),
    event_name: String(
      source.event_name || source.goal_value || source.goal || source.event || "install"
    ).trim(),
    payout: numberOrZero(source.payout || source.amount || source.revenue || 0),
    revenue: numberOrZero(source.revenue || source.sale_amount || 0),
    sale_amount: numberOrZero(source.sale_amount || source.sale || 0),
    status: normalizedStatus,
    raw_payload: source
  }
}

function razorpayConfigured() {
  return hasValue(RAZORPAY_KEY_ID) && hasValue(RAZORPAY_KEY_SECRET)
}

async function razorpayRequest(method, path, payload, extraHeaders = {}) {
  if (!razorpayConfigured()) {
    return {
      success: false,
      reason: "missing_credentials"
    }
  }

  const headers = {
    Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
    ...extraHeaders
  }

  if (payload !== undefined) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(`${RAZORPAY_BASE_URL}${path}`, {
    method,
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : undefined
  })

  const text = await response.text()
  let data = {}

  if (text) {
    try {
      data = JSON.parse(text)
    } catch (err) {
      data = { raw: text }
    }
  }

  if (!response.ok) {
    const message = data?.error?.description || data?.error?.reason || data?.error?.message || "Razorpay request failed"
    return {
      success: false,
      reason: message,
      payload: data
    }
  }

  return {
    success: true,
    data
  }
}

async function syncPaymentMethodToRazorpay(paymentMethod, userProfile) {
  if (!paymentMethod) {
    return {
      success: false,
      reason: "payment_method_missing"
    }
  }

  if (paymentMethod.provider !== "razorpay") {
    return {
      success: false,
      reason: "unsupported_provider"
    }
  }

  if (!razorpayConfigured()) {
    return {
      success: false,
      reason: "missing_credentials"
    }
  }

  const contactPayload = {
    name: paymentMethod.account_name || userProfile?.full_name || `Rakivo User ${paymentMethod.user_id}`,
    email: paymentMethod.contact_email || userProfile?.email || undefined,
    contact: paymentMethod.contact_phone || userProfile?.phone || undefined,
    type: "employee",
    reference_id: `rakivo_user_${paymentMethod.user_id}`,
    notes: {
      user_id: String(paymentMethod.user_id),
      provider: "rakivo"
    }
  }

  const contactResult = await razorpayRequest("POST", "/v1/contacts", contactPayload)
  if (!contactResult.success) {
    return contactResult
  }

  const contactId = contactResult.data.id
  const fundAccountPayload = paymentMethod.payout_mode === "bank_account"
    ? {
        contact_id: contactId,
        account_type: "bank_account",
        bank_account: {
          name: paymentMethod.account_name,
          ifsc: paymentMethod.ifsc,
          account_number: paymentMethod.account_number
        }
      }
    : {
        contact_id: contactId,
        account_type: "vpa",
        vpa: {
          address: paymentMethod.upi_id
        }
      }

  const fundAccountResult = await razorpayRequest("POST", "/v1/fund_accounts", fundAccountPayload)
  if (!fundAccountResult.success) {
    return fundAccountResult
  }

  const fundAccountId = fundAccountResult.data.id

  await db.query(
    `update payment_methods
     set razorpay_contact_id=$1,
         razorpay_fund_account_id=$2
     where id=$3`,
    [contactId, fundAccountId, paymentMethod.id]
  )

  const updatedPaymentMethod = await getActivePaymentMethod(paymentMethod.user_id)

  return {
    success: true,
    data: updatedPaymentMethod
  }
}

function razorpayPayoutMode(paymentMethod) {
  return paymentMethod.payout_mode === "bank_account" ? RAZORPAY_BANK_PAYOUT_MODE : "UPI"
}

function razorpayPurposeForWithdrawal() {
  return "payout"
}

async function createRazorpayPayout({ withdrawalId, userId, amount, paymentMethod }) {
  if (!razorpayConfigured()) {
    return {
      success: false,
      reason: "missing_credentials"
    }
  }

  if (!hasValue(RAZORPAY_SOURCE_ACCOUNT_NUMBER)) {
    return {
      success: false,
      reason: "missing_source_account"
    }
  }

  if (!hasValue(paymentMethod?.razorpay_fund_account_id)) {
    return {
      success: false,
      reason: "fund_account_not_synced"
    }
  }

  const payoutPayload = {
    account_number: RAZORPAY_SOURCE_ACCOUNT_NUMBER,
    fund_account_id: paymentMethod.razorpay_fund_account_id,
    amount: Math.round(Number(amount) * 100),
    currency: "INR",
    mode: razorpayPayoutMode(paymentMethod),
    purpose: razorpayPurposeForWithdrawal(),
    queue_if_low_balance: true,
    reference_id: `rakivo_withdraw_${withdrawalId}`,
    narration: "Rakivo payout",
    notes: {
      user_id: String(userId),
      withdrawal_id: String(withdrawalId)
    }
  }

  return razorpayRequest(
    "POST",
    "/v1/payouts",
    payoutPayload,
    {
      "X-Payout-Idempotency": `rakivo-withdraw-${withdrawalId}`
    }
  )
}

async function fetchRazorpayPayout(providerRef) {
  if (!hasValue(providerRef)) {
    return {
      success: false,
      reason: "missing_provider_ref"
    }
  }

  return razorpayRequest("GET", `/v1/payouts/${providerRef}`)
}

function isFailedPayoutStatus(status) {
  return ["failed", "rejected", "cancelled", "reversed"].includes(String(status || "").trim().toLowerCase())
}

async function refundFailedWithdrawalIfNeeded(withdrawal, providerStatus) {
  if (!withdrawal || withdrawal.refund_processed || !isFailedPayoutStatus(providerStatus)) {
    return
  }

  await db.query(
    "update wallets set balance = balance + $1 where user_id=$2",
    [Number(withdrawal.amount || 0), withdrawal.user_id]
  )

  await db.query(
    `insert into wallet_ledger (user_id, entry_type, amount, reference_type, reference_id, status)
     values ($1, 'credit', $2, 'withdraw_refund', $3, 'confirmed')`,
    [withdrawal.user_id, Number(withdrawal.amount || 0), withdrawal.provider_ref || `withdraw_${withdrawal.id}`]
  )

  await db.query(
    `update withdraws
     set refund_processed=true,
         updated_at=current_timestamp
     where id=$1`,
    [withdrawal.id]
  )
}

async function syncWithdrawalWithProvider(withdrawal) {
  if (!withdrawal) {
    return {
      success: false,
      reason: "withdrawal_missing"
    }
  }

  if (!hasValue(withdrawal.provider_ref)) {
    return {
      success: false,
      reason: "missing_provider_ref"
    }
  }

  const payoutResult = await fetchRazorpayPayout(withdrawal.provider_ref)
  if (!payoutResult.success) {
    return payoutResult
  }

  const payout = payoutResult.data || {}
  const providerStatus = payout.status || withdrawal.provider_status || withdrawal.status

  await db.query(
    `update withdraws
     set status=$1,
         provider_status=$2,
         provider_error=null,
         updated_at=current_timestamp
     where id=$3`,
    [providerStatus, providerStatus, withdrawal.id]
  )

  await db.query(
    `update wallet_ledger
     set status=$1
     where user_id=$2 and reference_type='withdraw' and reference_id=$3`,
    [providerStatus, withdrawal.user_id, withdrawal.provider_ref]
  )

  await refundFailedWithdrawalIfNeeded(withdrawal, providerStatus)

  return {
    success: true,
    provider_status: providerStatus,
    provider_ref: withdrawal.provider_ref
  }
}

async function getOnboardingState(userId) {
  const profileResult = await db.query(
    `select u.user_id, p.full_name, p.email, p.phone, p.referral_code,
            exists(select 1 from kyc k where k.user_id=u.user_id) as kyc_completed,
            exists(
              select 1
              from payment_methods pm
              where pm.user_id=u.user_id
                and pm.status='active'
                and (
                  coalesce(pm.provider, 'razorpay') <> 'razorpay'
                  or coalesce(pm.razorpay_fund_account_id, '') <> ''
                )
            ) as payout_completed
     from users u
     left join profiles p on p.user_id = u.user_id
     where u.user_id=$1`,
    [userId]
  )

  const row = profileResult.rows[0]

  if (!row) {
    return null
  }

  const profileCompleted = hasValue(row.full_name) && (hasValue(row.email) || hasValue(row.phone))

  return {
    user_id: row.user_id,
    full_name: row.full_name || "",
    email: row.email || "",
    phone: row.phone || "",
    referral_code: row.referral_code || "",
    profile_completed: profileCompleted,
    kyc_completed: Boolean(row.kyc_completed),
    payout_completed: Boolean(row.payout_completed)
  }
}

async function getActivePaymentMethod(userId) {
  const paymentResult = await db.query(
    `select id, user_id, provider, method_type, payout_mode, upi_id, account_name,
            account_number, ifsc, contact_email, contact_phone,
            razorpay_contact_id, razorpay_fund_account_id, status, created_at
     from payment_methods
     where user_id=$1 and status='active'
     order by created_at desc
     limit 1`,
    [userId]
  )

  return mapPaymentMethod(paymentResult.rows[0] || null)
}

async function getKycRecord(userId) {
  const kycResult = await db.query(
    `select *
     from kyc
     where user_id=$1
     limit 1`,
    [userId]
  )

  const row = kycResult.rows[0] || null
  if (!row) {
    return null
  }

  return {
    ...row,
    status: row.status || "submitted"
  }
}

function generateReferralCode(userId) {
  const prefix = `RK${String(userId).padStart(4, "0")}`
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}${suffix}`
}

app.disable("x-powered-by")
app.use(cors())
app.use(express.json())
app.use("/admin-ui", express.static(path.join(__dirname, "admin")))
app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`)
  next()
})
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => sendError(res, 429, "Too many requests")
}))

async function initDB() {
  await db.query(`
    create table if not exists users (
      user_id serial primary key,
      phone text unique
    );

    create table if not exists user_identities (
      id serial primary key,
      user_id int not null references users(user_id) on delete cascade,
      identity_type text not null,
      identity_value text not null,
      is_verified boolean not null default true,
      unique (identity_type, identity_value)
    );

    create table if not exists otp_requests (
      id serial primary key,
      channel text not null,
      target text not null,
      otp_code text not null,
      expires_at timestamp not null,
      consumed_at timestamp null,
      created_at timestamp default current_timestamp
    );

    alter table otp_requests add column if not exists channel text;
    alter table otp_requests add column if not exists target text;
    alter table otp_requests add column if not exists otp_code text;
    alter table otp_requests add column if not exists expires_at timestamp;
    alter table otp_requests add column if not exists consumed_at timestamp;
    alter table otp_requests add column if not exists created_at timestamp default current_timestamp;

    do $otp_legacy$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'otp_requests'
          and column_name = 'phone'
      ) then
        execute 'update otp_requests set target = phone where target is null and phone is not null';
      end if;

      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'otp_requests'
          and column_name = 'otp'
      ) then
        execute 'update otp_requests set otp_code = otp where otp_code is null and otp is not null';
      end if;
    end
    $otp_legacy$;

    update otp_requests
    set channel = 'phone'
    where channel is null or channel = '';

    update otp_requests
    set expires_at = current_timestamp + interval '10 minutes'
    where expires_at is null;

    create table if not exists profiles (
      user_id int primary key references users(user_id) on delete cascade,
      full_name text,
      email text,
      phone text,
      referral_code text,
      referred_by_user_id int references users(user_id) on delete set null,
      referred_by_code text,
      created_at timestamp default current_timestamp,
      updated_at timestamp default current_timestamp
    );

    alter table profiles add column if not exists referred_by_user_id int references users(user_id) on delete set null;
    alter table profiles add column if not exists referred_by_code text;

    create table if not exists payment_methods (
      id serial primary key,
      user_id int not null references users(user_id) on delete cascade,
      provider text default 'razorpay',
      method_type text not null,
      payout_mode text default 'upi',
      upi_id text,
      account_name text,
      account_number text,
      ifsc text,
      contact_email text,
      contact_phone text,
      razorpay_contact_id text,
      razorpay_fund_account_id text,
      status text default 'active',
      created_at timestamp default current_timestamp
    );

    alter table payment_methods add column if not exists provider text default 'razorpay';
    alter table payment_methods add column if not exists payout_mode text default 'upi';
    alter table payment_methods add column if not exists account_number text;
    alter table payment_methods add column if not exists ifsc text;
    alter table payment_methods add column if not exists contact_email text;
    alter table payment_methods add column if not exists contact_phone text;
    alter table payment_methods add column if not exists razorpay_contact_id text;
    alter table payment_methods add column if not exists razorpay_fund_account_id text;

    create table if not exists wallets (
      id serial primary key,
      user_id int unique,
      balance numeric default 0
    );

    create table if not exists wallet_ledger (
      id serial primary key,
      user_id int not null references users(user_id) on delete cascade,
      entry_type text not null,
      amount numeric not null,
      reference_type text,
      reference_id text,
      status text default 'confirmed',
      created_at timestamp default current_timestamp
    );

    create table if not exists campaigns (
      id serial primary key,
      title text,
      payout numeric,
      icon_url text,
      description text,
      trackier_url text,
      status text default 'active'
    );

    alter table campaigns add column if not exists id integer;

    do $campaigns_legacy$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'campaigns'
          and column_name = 'campaign_id'
      ) then
        execute 'update campaigns set id = campaign_id where id is null';
      end if;
    end
    $campaigns_legacy$;

    create sequence if not exists campaigns_id_seq;
    alter table campaigns alter column id set default nextval('campaigns_id_seq');
    update campaigns
    set id = nextval('campaigns_id_seq')
    where id is null;
    select setval(
      'campaigns_id_seq',
      coalesce((select max(id) from campaigns), 0) + 1,
      false
    );
    create unique index if not exists idx_campaigns_id_unique on campaigns(id);

    alter table campaigns add column if not exists short_description text;
    alter table campaigns add column if not exists long_description text;
    alter table campaigns add column if not exists banner_url text;
    alter table campaigns add column if not exists category text default 'Featured';
    alter table campaigns add column if not exists reward_type text default 'install';
    alter table campaigns add column if not exists reward_amount numeric default 0;
    alter table campaigns add column if not exists cta_text text default 'Install & Earn';
    alter table campaigns add column if not exists terms text default '';
    alter table campaigns add column if not exists event_name text default 'install';
    alter table campaigns add column if not exists is_featured boolean default true;
    alter table campaigns add column if not exists featured_rank int default 999;

    update campaigns
    set reward_amount = coalesce(reward_amount, payout, 0)
    where reward_amount is null or reward_amount = 0;

    create table if not exists clicks (
      id serial primary key,
      user_id int not null references users(user_id) on delete cascade,
      campaign_id int not null references campaigns(id) on delete cascade,
      click_ref text unique,
      redirect_url text,
      trackier_url text,
      trackier_click_id text,
      created_at timestamp default current_timestamp
    );

    alter table clicks add column if not exists trackier_url text;
    alter table clicks add column if not exists trackier_click_id text;

    create table if not exists rewards (
      id serial primary key,
      user_id int,
      campaign_id int,
      amount numeric,
      event_name text default 'install',
      created_at timestamp default current_timestamp,
      unique (user_id, campaign_id)
    );

    create table if not exists postbacks (
      id serial primary key,
      external_ref text unique,
      payload jsonb,
      created_at timestamp default current_timestamp
    );

    create table if not exists attribution_events (
      id serial primary key,
      external_ref text unique,
      user_id int references users(user_id) on delete set null,
      campaign_id int references campaigns(id) on delete set null,
      click_ref text,
      trackier_click_id text,
      txn_id text,
      event_name text,
      status text default 'approved',
      payout numeric default 0,
      revenue numeric default 0,
      sale_amount numeric default 0,
      payload jsonb,
      created_at timestamp default current_timestamp
    );

    create index if not exists idx_clicks_click_ref on clicks(click_ref);
    create index if not exists idx_clicks_trackier_click_id on clicks(trackier_click_id);
    create index if not exists idx_attribution_events_user on attribution_events(user_id);
    create index if not exists idx_attribution_events_campaign on attribution_events(campaign_id);

    create table if not exists withdraws (
      id serial primary key,
      user_id int,
      amount numeric,
      status text,
      provider text,
      provider_ref text,
      provider_status text,
      provider_error text,
      refund_processed boolean default false,
      updated_at timestamp default current_timestamp,
      created_at timestamp default current_timestamp
    );

    alter table withdraws add column if not exists provider text;
    alter table withdraws add column if not exists provider_ref text;
    alter table withdraws add column if not exists provider_status text;
    alter table withdraws add column if not exists provider_error text;
    alter table withdraws add column if not exists refund_processed boolean default false;
    alter table withdraws add column if not exists updated_at timestamp default current_timestamp;

    create table if not exists kyc (
      id serial primary key,
      user_id int unique,
      name text,
      pan text,
      upi text,
      status text default 'submitted',
      created_at timestamp default current_timestamp
    );

    alter table kyc add column if not exists status text default 'submitted';
    alter table kyc add column if not exists created_at timestamp default current_timestamp;

    update kyc
    set status = 'submitted'
    where status is null or trim(coalesce(status::text, '')) = '';

    create table if not exists admins (
      id serial primary key,
      username text unique,
      password text
    );

    create index if not exists idx_users_phone on users(phone);
    create index if not exists idx_rewards_user_id on rewards(user_id);
    create index if not exists idx_wallets_user_id on wallets(user_id);
    create index if not exists idx_campaigns_status on campaigns(status);
    create index if not exists idx_identities_lookup on user_identities(identity_type, identity_value);
    create index if not exists idx_clicks_user_id on clicks(user_id);
    create index if not exists idx_otp_lookup on otp_requests(channel, target, created_at desc);
    create unique index if not exists idx_campaigns_title_unique on campaigns(title);
    create unique index if not exists idx_admins_username_unique on admins(username);

    insert into admins (username, password)
    values ('admin', 'admin123')
    on conflict (username) do nothing;

    insert into campaigns (
      title,
      payout,
      reward_amount,
      icon_url,
      banner_url,
      description,
      short_description,
      long_description,
      trackier_url,
      status,
      category,
      reward_type,
      cta_text,
      terms,
      event_name,
      is_featured,
      featured_rank
    )
    values (
      'Test Game',
      20,
      20,
      '',
      '',
      'Install the app and complete the first app open event to unlock your reward.',
      'Install and open the app to earn cashback.',
      'Install through Rakivo and complete the first app open event within 24 hours.',
      '',
      'active',
      'Featured',
      'install',
      'Install & Earn',
      'Reward is credited after advertiser postback validation.',
      'install',
      true,
      1
    )
    on conflict (title) do nothing;
  `)

  console.log("DB initialized")
}

async function ensureUserForIdentity(identity) {
  let userId = null

  const existingIdentity = await db.query(
    `select user_id
     from user_identities
     where identity_type=$1 and identity_value=$2`,
    [identity.channel, identity.target]
  )

  if (existingIdentity.rows[0]) {
    userId = Number(existingIdentity.rows[0].user_id)
  }

  if (!userId && identity.channel === "phone") {
    const existingPhoneUser = await db.query(
      "select user_id from users where phone=$1 limit 1",
      [identity.target]
    )
    userId = Number(existingPhoneUser.rows[0]?.user_id || 0)
  }

  if (!userId && identity.channel === "email") {
    const existingEmailUser = await db.query(
      "select user_id from profiles where lower(email)=lower($1) limit 1",
      [identity.target]
    )
    userId = Number(existingEmailUser.rows[0]?.user_id || 0)
  }

  if (!userId) {
    const insertedUser = await db.query(
      `insert into users(phone)
       values($1)
       on conflict (phone) do update set phone=excluded.phone
       returning user_id`,
      [identity.channel === "phone" ? identity.target : null]
    )

    userId = Number(insertedUser.rows[0]?.user_id || 0)
  }

  if (!userId) {
    throw new Error("Unable to resolve user for identity")
  }

  await db.query(
    `insert into user_identities(user_id, identity_type, identity_value, is_verified)
     values($1, $2, $3, true)
     on conflict (identity_type, identity_value) do nothing`,
    [userId, identity.channel, identity.target]
  )

  await db.query(
    "insert into wallets(user_id, balance) values($1, 0) on conflict (user_id) do nothing",
    [userId]
  )

  await db.query(
    `insert into profiles(user_id, email, phone, referral_code)
     values($1, $2, $3, $4)
     on conflict (user_id) do update
     set email = coalesce(excluded.email, profiles.email),
         phone = coalesce(excluded.phone, profiles.phone),
         referral_code = coalesce(profiles.referral_code, excluded.referral_code),
         updated_at = current_timestamp`,
    [
      userId,
      identity.channel === "email" ? identity.target : null,
      identity.channel === "phone" ? identity.target : null,
      generateReferralCode(userId)
    ]
  )

  return userId
}

async function buildAuthResponse(userId) {
  const profile = await getOnboardingState(userId)

  return {
    success: true,
    user_id: userId,
    profile_completed: Boolean(profile?.profile_completed),
    kyc_completed: Boolean(profile?.kyc_completed),
    payout_completed: Boolean(profile?.payout_completed)
  }
}

async function processOtpVerification(identity, otp) {
  const challengeResult = await db.query(
    `select *
     from otp_requests
     where channel=$1
       and target=$2
       and nullif(trim(coalesce(consumed_at::text, '')), '') is null
     order by created_at desc
     limit 1`,
    [identity.channel, identity.target]
  )

  const challenge = challengeResult.rows[0]

  if (!challenge) {
    return { error: { status: 404, message: "OTP request not found" } }
  }

  if (otp !== challenge.otp_code) {
    return { error: { status: 401, message: "Invalid OTP" } }
  }

  if (new Date(challenge.expires_at) < new Date()) {
    return { error: { status: 410, message: "OTP expired" } }
  }

  await db.query(
    "update otp_requests set consumed_at=current_timestamp where id=$1",
    [challenge.id]
  )

  const userId = await ensureUserForIdentity(identity)
  const authResponse = await buildAuthResponse(userId)
  return { data: authResponse }
}

app.get("/", (req, res) => {
  res.send("Server running")
})

app.get("/admin", (req, res) => {
  res.redirect("/admin-ui/")
})

app.get("/health", async (req, res) => {
  try {
    await db.query("select 1")
    res.json({ status: "ok" })
  } catch (err) {
    sendError(res, 500, err.message)
  }
})

app.post("/auth/request-otp", async (req, res) => {
  try {
    const identity = normalizeIdentity(req.body?.channel, req.body?.target)

    if (!identity) {
      return sendError(res, 400, "Valid channel and target are required")
    }

    const result = await db.query(
      `insert into otp_requests(channel, target, otp_code, expires_at)
       values($1, $2, $3, current_timestamp + interval '10 minutes')
       returning id, expires_at`,
      [identity.channel, identity.target, DEMO_OTP]
    )

    res.json({
      success: true,
      challenge_id: result.rows[0].id,
      expires_at: result.rows[0].expires_at,
      demo_otp: DEMO_OTP
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/auth/verify-otp", async (req, res) => {
  try {
    const identity = normalizeIdentity(req.body?.channel, req.body?.target)
    const otp = String(req.body?.otp || "").trim()

    if (!identity || !hasValue(otp)) {
      return sendError(res, 400, "Valid channel, target and otp are required")
    }

    const result = await processOtpVerification(identity, otp)
    if (result.error) {
      return sendError(res, result.error.status, result.error.message)
    }

    res.json(result.data)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/verify-otp", async (req, res) => {
  try {
    const phone = String(req.body?.phone || "").trim()
    const otp = String(req.body?.otp || DEMO_OTP).trim()

    if (!hasValue(phone)) {
      return sendError(res, 400, "Phone is required")
    }

    await db.query(
      `insert into otp_requests(channel, target, otp_code, expires_at)
       values('phone', $1, $2, current_timestamp + interval '10 minutes')`,
      [phone, DEMO_OTP]
    )

    const result = await processOtpVerification(
      { channel: "phone", target: phone },
      otp
    )
    if (result.error) {
      return sendError(res, result.error.status, result.error.message)
    }

    return res.json(result.data)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/offers", async (req, res) => {
  try {
    const result = await db.query(
      `select *
       from campaigns
       where status=$1
       order by is_featured desc, featured_rank asc, id desc`,
      ["active"]
    )

    res.json(result.rows.map(mapOffer))
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/offers/featured", async (req, res) => {
  try {
    const result = await db.query(
      `select *
       from campaigns
       where status='active' and is_featured=true
       order by featured_rank asc, id desc
       limit 10`
    )

    res.json(result.rows.map(mapOffer))
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/offers/categories", async (req, res) => {
  try {
    const result = await db.query(
      `select distinct category
       from campaigns
       where status='active' and category is not null and category <> ''
       order by category asc`
    )

    res.json(result.rows.map((row) => row.category))
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/offers/:id", async (req, res) => {
  try {
    const result = await db.query(
      "select * from campaigns where id=$1 and status='active'",
      [req.params.id]
    )

    if (!result.rows[0]) {
      return sendError(res, 404, "Offer not found")
    }

    res.json(mapOffer(result.rows[0]))
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/offers/:id/click", async (req, res) => {
  try {
    const userId = Number(req.body?.user_id)
    const campaignId = Number(req.params.id)

    if (!userId || !campaignId) {
      return sendError(res, 400, "Valid user_id and offer id are required")
    }

    const offerResult = await db.query(
      "select * from campaigns where id=$1 and status='active'",
      [campaignId]
    )

    const offer = offerResult.rows[0]

    if (!offer) {
      return sendError(res, 404, "Offer not found")
    }

    const clickRef = `clk_${userId}_${campaignId}_${Date.now()}`
    const trackierUrl = buildTrackierRedirectUrl(offer.trackier_url || "", {
      sub1: userId,
      sub2: clickRef,
      sub3: campaignId
    })
    const redirectUrl = trackierUrl

    await db.query(
      `insert into clicks(user_id, campaign_id, click_ref, redirect_url, trackier_url)
       values($1, $2, $3, $4, $5)`,
      [userId, campaignId, clickRef, redirectUrl, trackierUrl]
    )

    res.json({
      success: true,
      click_ref: clickRef,
      redirect_url: redirectUrl
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/campaigns", async (req, res) => {
  try {
    const result = await db.query(
      "select * from campaigns where status=$1",
      ["active"]
    )

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/me", async (req, res) => {
  try {
    const userId = Number(req.query.user_id)

    if (!userId) {
      return sendError(res, 400, "Valid user_id is required")
    }

    const onboarding = await getOnboardingState(userId)

    if (!onboarding) {
      return sendError(res, 404, "User not found")
    }

    res.json({
      success: true,
      user: onboarding
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/me/onboarding", async (req, res) => {
  try {
    const userId = Number(req.query.user_id)

    if (!userId) {
      return sendError(res, 400, "Valid user_id is required")
    }

    const onboarding = await getOnboardingState(userId)

    if (!onboarding) {
      return sendError(res, 404, "User not found")
    }

    const paymentMethod = await getActivePaymentMethod(userId)
    const kycRecord = await getKycRecord(userId)

    res.json({
      success: true,
      onboarding,
      payment_method: paymentMethod,
      kyc: kycRecord
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.put("/me/profile", async (req, res) => {
  try {
    const userId = Number(req.body?.user_id)
    const fullName = String(req.body?.full_name || "").trim()
    const email = String(req.body?.email || "").trim().toLowerCase()
    const phone = String(req.body?.phone || "").trim().toLowerCase()

    if (!userId) {
      return sendError(res, 400, "Valid user_id is required")
    }

    if (!hasValue(fullName) || (!hasValue(email) && !hasValue(phone))) {
      return sendError(res, 400, "full_name plus phone or email is required")
    }

    await db.query(
      `insert into profiles(user_id, full_name, email, phone)
       values($1, $2, $3, $4)
       on conflict (user_id) do update
       set full_name = excluded.full_name,
           email = excluded.email,
           phone = excluded.phone,
           updated_at = current_timestamp`,
      [userId, fullName, hasValue(email) ? email : null, hasValue(phone) ? phone : null]
    )

    if (hasValue(email)) {
      await db.query(
        `insert into user_identities(user_id, identity_type, identity_value, is_verified)
         values($1, 'email', $2, true)
         on conflict (identity_type, identity_value) do nothing`,
        [userId, email]
      )
    }

    if (hasValue(phone)) {
      await db.query(
        `insert into user_identities(user_id, identity_type, identity_value, is_verified)
         values($1, 'phone', $2, true)
         on conflict (identity_type, identity_value) do nothing`,
        [userId, phone]
      )
      await db.query("update users set phone=$1 where user_id=$2", [phone, userId])
    }

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/me/payment-method", async (req, res) => {
  try {
    const userId = Number(req.body?.user_id)
    const provider = String(req.body?.provider || "razorpay").trim().toLowerCase()
    const payoutMode = String(req.body?.payout_mode || req.body?.method_type || "upi").trim().toLowerCase()
    const upiId = String(req.body?.upi_id || "").trim()
    const accountName = String(req.body?.account_name || "").trim()
    const accountNumber = String(req.body?.account_number || "").trim()
    const ifsc = String(req.body?.ifsc || "").trim().toUpperCase()
    const contactEmail = String(req.body?.contact_email || "").trim().toLowerCase()
    const contactPhone = String(req.body?.contact_phone || "").trim()

    if (!userId) {
      return sendError(res, 400, "Valid user_id is required")
    }

    if (provider !== "razorpay") {
      return sendError(res, 400, "Only razorpay payout provider is supported")
    }

    if (!["upi", "bank_account"].includes(payoutMode)) {
      return sendError(res, 400, "Valid payout_mode is required")
    }

    if (!hasValue(accountName)) {
      return sendError(res, 400, "account_name is required")
    }

    if (payoutMode === "upi" && !hasValue(upiId)) {
      return sendError(res, 400, "upi_id is required for Razorpay UPI payouts")
    }

    if (payoutMode === "bank_account" && (!hasValue(accountNumber) || !hasValue(ifsc))) {
      return sendError(res, 400, "account_number and ifsc are required for Razorpay bank payouts")
    }

    await db.query(
      "update payment_methods set status='inactive' where user_id=$1 and status='active'",
      [userId]
    )

    const result = await db.query(
      `insert into payment_methods(
          user_id, provider, method_type, payout_mode, upi_id, account_name,
          account_number, ifsc, contact_email, contact_phone, status
       )
       values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
       returning *`,
      [
        userId,
        provider,
        payoutMode,
        payoutMode,
        hasValue(upiId) ? upiId : null,
        accountName,
        hasValue(accountNumber) ? accountNumber : null,
        hasValue(ifsc) ? ifsc : null,
        hasValue(contactEmail) ? contactEmail : null,
        hasValue(contactPhone) ? contactPhone : null
      ]
    )

    const onboarding = await getOnboardingState(userId)
    const syncedPaymentMethod = mapPaymentMethod(result.rows[0])
    const razorpaySync = await syncPaymentMethodToRazorpay(syncedPaymentMethod, onboarding)

    res.json({
      success: true,
      payment_method: razorpaySync.success ? razorpaySync.data : syncedPaymentMethod,
      razorpay_sync_status: razorpaySync.success ? "synced" : razorpaySync.reason
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/me/payment-method", async (req, res) => {
  try {
    const userId = Number(req.query.user_id)

    if (!userId) {
      return sendError(res, 400, "Valid user_id is required")
    }

    const paymentMethod = await getActivePaymentMethod(userId)

    res.json({
      success: true,
      payment_method: paymentMethod
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/wallet/:id", async (req, res) => {
  try {
    const result = await db.query(
      "select * from wallets where user_id=$1",
      [req.params.id]
    )

    res.json(result.rows[0] || null)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/wallet-ledger/:id", async (req, res) => {
  try {
    const result = await db.query(
      "select * from wallet_ledger where user_id=$1 order by created_at desc",
      [req.params.id]
    )

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/history/rewards/:id", async (req, res) => {
  try {
    const result = await db.query(
      "select * from rewards where user_id=$1 order by created_at desc",
      [req.params.id]
    )

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/withdraw", async (req, res) => {
  try {
    const { user_id, amount } = req.body
    const withdrawalAmount = Number(amount)

    if (!user_id || !withdrawalAmount || withdrawalAmount <= 0) {
      return sendError(res, 400, "Valid user_id and amount are required")
    }

    const walletResult = await db.query(
      "select * from wallets where user_id=$1",
      [user_id]
    )

    const wallet = walletResult.rows[0]

    if (!wallet) {
      return sendError(res, 404, "Wallet not found")
    }

    const kycRecord = await getKycRecord(Number(user_id))
    if (!kycRecord || !["submitted", "approved"].includes(String(kycRecord.status || "").toLowerCase())) {
      return sendError(res, 400, "Complete KYC before withdrawal")
    }

    const paymentMethod = await getActivePaymentMethod(Number(user_id))
    if (!paymentMethod) {
      return sendError(res, 400, "Add an active payout method before withdrawal")
    }

    if (!hasValue(paymentMethod.razorpay_fund_account_id)) {
      return sendError(res, 400, "Payout method is not synced with Razorpay yet")
    }

    if (Number(wallet.balance) < withdrawalAmount) {
      return sendError(res, 400, "Insufficient balance")
    }

    const withdrawalInsert = await db.query(
      `insert into withdraws (user_id, amount, status, provider, provider_status, updated_at)
       values ($1, $2, 'initiated', 'razorpay', 'initiated', current_timestamp)
       returning *`,
      [user_id, withdrawalAmount]
    )
    const withdrawal = withdrawalInsert.rows[0]

    const payoutResult = await createRazorpayPayout({
      withdrawalId: withdrawal.id,
      userId: Number(user_id),
      amount: withdrawalAmount,
      paymentMethod
    })

    if (!payoutResult.success) {
      await db.query(
        `update withdraws
         set status='failed',
             provider='razorpay',
             provider_status='failed',
             provider_error=$1,
             updated_at=current_timestamp
         where id=$2`,
        [payoutResult.reason, withdrawal.id]
      )
      return sendError(res, 400, `Withdrawal could not be created: ${payoutResult.reason}`)
    }

    const payout = payoutResult.data || {}

    await db.query(
      "update wallets set balance = balance - $1 where user_id=$2",
      [withdrawalAmount, user_id]
    )

    await db.query(
      `insert into wallet_ledger (user_id, entry_type, amount, reference_type, reference_id, status)
       values ($1, 'debit', $2, 'withdraw', $3, $4)`,
      [user_id, -withdrawalAmount, payout.id || `wd_${withdrawal.id}`, payout.status || "pending"]
    )

    await db.query(
      `update withdraws
       set status=$1,
           provider='razorpay',
           provider_ref=$2,
           provider_status=$3,
           provider_error=null,
           updated_at=current_timestamp
       where id=$4`,
      [
        payout.status || "pending",
        payout.id || null,
        payout.status || "pending",
        withdrawal.id
      ]
    )

    res.json({
      success: true,
      withdrawal_id: withdrawal.id,
      provider: "razorpay",
      provider_ref: payout.id || null,
      provider_status: payout.status || "pending"
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/withdrawals/:id", async (req, res) => {
  try {
    const userId = Number(req.params.id)

    if (!userId) {
      return sendError(res, 400, "Valid user_id is required")
    }

    const result = await db.query(
      `select id, user_id, amount, status, provider, provider_ref, provider_status, provider_error, updated_at, created_at
       from withdraws
       where user_id=$1
       order by created_at desc`,
      [userId]
    )

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/withdrawals/:withdrawalId/sync", async (req, res) => {
  try {
    const withdrawalId = Number(req.params.withdrawalId)

    if (!withdrawalId) {
      return sendError(res, 400, "Valid withdrawal id is required")
    }

    const withdrawalResult = await db.query(
      `select *
       from withdraws
       where id=$1`,
      [withdrawalId]
    )

    const withdrawal = withdrawalResult.rows[0]
    if (!withdrawal) {
      return sendError(res, 404, "Withdrawal not found")
    }

    const syncResult = await syncWithdrawalWithProvider(withdrawal)
    if (!syncResult.success) {
      return sendError(res, 400, `Unable to sync payout: ${syncResult.reason}`)
    }

    res.json({
      success: true,
      withdrawal_id: withdrawalId,
      provider_ref: syncResult.provider_ref,
      provider_status: syncResult.provider_status
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/kyc", async (req, res) => {
  try {
    const { user_id, name, pan, upi } = req.body

    if (!hasValue(user_id) || !hasValue(name) || !hasValue(pan) || !hasValue(upi)) {
      return sendError(res, 400, "user_id, name, pan and upi are required")
    }

    await db.query(
      `insert into kyc (user_id, name, pan, upi, status)
       values ($1, $2, $3, $4, 'submitted')
       on conflict (user_id) do update
       set name=excluded.name,
           pan=excluded.pan,
           upi=excluded.upi,
           status='submitted'`,
      [user_id, name, pan, upi]
    )

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/kyc/:id", async (req, res) => {
  try {
    const userId = Number(req.params.id)

    if (!userId) {
      return sendError(res, 400, "Valid user_id is required")
    }

    const kycRecord = await getKycRecord(userId)

    res.json({
      success: true,
      kyc: kycRecord
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body

    if (!hasValue(username) || !hasValue(password)) {
      return sendError(res, 400, "Username and password are required")
    }

    const result = await db.query(
      "select * from admins where username=$1 and password=$2",
      [username, password]
    )

    if (result.rows.length === 0) {
      return sendError(res, 401, "Invalid username or password")
    }

    adminToken = "admin123"

    res.json({
      success: true,
      token: adminToken
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

function checkAdmin(req, res, next) {
  const token = req.headers["x-admin-token"]

  if (token !== adminToken) {
    return sendError(res, 401, "Unauthorized")
  }

  next()
}

app.get("/admin/overview", checkAdmin, async (req, res) => {
  try {
    const [
      usersResult,
      offersResult,
      rewardsResult,
      withdrawalsResult
    ] = await Promise.all([
      db.query("select count(*)::int as count from users"),
      db.query(
        `select
            count(*)::int as total_offers,
            count(*) filter (where status='active')::int as active_offers,
            count(*) filter (where status <> 'active')::int as paused_offers
         from campaigns`
      ),
      db.query(
        `select
            count(*)::int as total_rewards,
            coalesce(sum(amount), 0)::numeric as reward_amount
         from rewards`
      ),
      db.query(
        `select
            count(*)::int as total_withdrawals,
            count(*) filter (where status in ('pending', 'processing', 'queued', 'initiated'))::int as pending_withdrawals,
            coalesce(sum(amount), 0)::numeric as withdrawal_amount
         from withdraws`
      )
    ])

    res.json({
      success: true,
      metrics: {
        users: usersResult.rows[0].count,
        total_offers: offersResult.rows[0].total_offers,
        active_offers: offersResult.rows[0].active_offers,
        paused_offers: offersResult.rows[0].paused_offers,
        total_rewards: rewardsResult.rows[0].total_rewards,
        reward_amount: Number(rewardsResult.rows[0].reward_amount || 0),
        total_withdrawals: withdrawalsResult.rows[0].total_withdrawals,
        pending_withdrawals: withdrawalsResult.rows[0].pending_withdrawals,
        withdrawal_amount: Number(withdrawalsResult.rows[0].withdrawal_amount || 0)
      }
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/admin/offers", checkAdmin, async (req, res) => {
  try {
    const result = await db.query("select * from campaigns order by id desc")
    res.json(result.rows.map(mapOffer))
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.put("/admin/offers/:id", checkAdmin, async (req, res) => {
  try {
    const offerId = Number(req.params.id)

    if (!offerId) {
      return sendError(res, 400, "Valid offer id is required")
    }

    const {
      title,
      payout,
      icon_url,
      banner_url,
      description,
      short_description,
      long_description,
      trackier_url,
      category,
      reward_type,
      cta_text,
      terms,
      event_name,
      is_featured,
      featured_rank,
      status
    } = req.body

    const existing = await db.query("select * from campaigns where id=$1", [offerId])
    if (!existing.rows[0]) {
      return sendError(res, 404, "Offer not found")
    }

    const current = existing.rows[0]
    const nextPayout = hasValue(payout) ? Number(payout) : Number(current.payout || 0)
    const result = await db.query(
      `update campaigns
       set title=$1,
           payout=$2,
           reward_amount=$3,
           icon_url=$4,
           banner_url=$5,
           description=$6,
           short_description=$7,
           long_description=$8,
           trackier_url=$9,
           category=$10,
           reward_type=$11,
           cta_text=$12,
           terms=$13,
           event_name=$14,
           is_featured=$15,
           featured_rank=$16,
           status=$17
       where id=$18
       returning *`,
      [
        hasValue(title) ? title : current.title,
        nextPayout,
        nextPayout,
        hasValue(icon_url) ? icon_url : current.icon_url,
        hasValue(banner_url) ? banner_url : current.banner_url,
        hasValue(description) ? description : current.description,
        hasValue(short_description) ? short_description : current.short_description,
        hasValue(long_description) ? long_description : current.long_description,
        hasValue(trackier_url) ? trackier_url : current.trackier_url,
        hasValue(category) ? category : current.category,
        hasValue(reward_type) ? rewardTypeFromLegacyValue(reward_type) : rewardTypeFromLegacyValue(current.reward_type),
        hasValue(cta_text) ? cta_text : current.cta_text,
        hasValue(terms) ? terms : current.terms,
        hasValue(event_name) ? event_name : current.event_name,
        is_featured === undefined ? current.is_featured : Boolean(is_featured),
        hasValue(featured_rank) ? Number(featured_rank) : Number(current.featured_rank || 999),
        hasValue(status) ? status : current.status,
        offerId
      ]
    )

    res.json({
      success: true,
      offer: mapOffer(result.rows[0])
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/admin/withdrawals", checkAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `select w.id, w.user_id, w.amount, w.status, w.provider, w.provider_ref,
              w.provider_status, w.provider_error, w.updated_at, w.created_at,
              p.full_name, p.email, p.phone
       from withdraws w
       left join profiles p on p.user_id = w.user_id
       order by w.created_at desc
       limit 100`
    )

    res.json({
      success: true,
      withdrawals: result.rows
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/admin/trackier/events", checkAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `select ae.id, ae.user_id, ae.campaign_id, ae.click_ref, ae.trackier_click_id,
              ae.txn_id, ae.event_name, ae.status, ae.payout, ae.revenue, ae.sale_amount,
              ae.created_at, c.title
       from attribution_events ae
       left join campaigns c on c.id = ae.campaign_id
       order by ae.created_at desc
       limit 100`
    )

    res.json({
      success: true,
      events: result.rows
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/me/referral/apply", async (req, res) => {
  try {
    const userId = Number(req.body?.user_id)
    const referralCode = String(req.body?.referral_code || "").trim().toUpperCase()

    if (!userId || !hasValue(referralCode)) {
      return sendError(res, 400, "Valid user_id and referral_code are required")
    }

    const userProfile = await db.query(
      "select user_id, referral_code, referred_by_user_id from profiles where user_id=$1",
      [userId]
    )

    const profile = userProfile.rows[0]
    if (!profile) {
      return sendError(res, 404, "User profile not found")
    }

    if (hasValue(profile.referred_by_user_id)) {
      return sendError(res, 409, "Referral already applied")
    }

    if (String(profile.referral_code || "").toUpperCase() === referralCode) {
      return sendError(res, 400, "You cannot apply your own referral code")
    }

    const referrerResult = await db.query(
      "select user_id from profiles where upper(referral_code)=$1 limit 1",
      [referralCode]
    )

    const referrer = referrerResult.rows[0]
    if (!referrer) {
      return sendError(res, 404, "Referral code not found")
    }

    await db.query(
      `update profiles
       set referred_by_user_id=$1,
           referred_by_code=$2,
           updated_at=current_timestamp
       where user_id=$3`,
      [referrer.user_id, referralCode, userId]
    )

    res.json({
      success: true,
      referred_by_user_id: referrer.user_id,
      referral_code: referralCode
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/admin/reports/offers", checkAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `select c.id as offer_id,
              c.title,
              c.status,
              c.category,
              c.payout,
              count(distinct cl.id)::int as clicks,
              count(distinct ae.id)::int as events,
              count(distinct ae.id) filter (where ae.status in ('approved', 'confirmed', 'success', 'paid'))::int as approved_events,
              coalesce(sum(ae.payout), 0)::numeric as tracked_payout,
              coalesce(sum(ae.revenue), 0)::numeric as tracked_revenue,
              coalesce(sum(ae.sale_amount), 0)::numeric as tracked_sales
       from campaigns c
       left join clicks cl on cl.campaign_id = c.id
       left join attribution_events ae on ae.campaign_id = c.id
       group by c.id, c.title, c.status, c.category, c.payout
       order by clicks desc, approved_events desc, c.id desc`
    )

    const reports = result.rows.map((row) => {
      const clicks = Number(row.clicks || 0)
      const approvedEvents = Number(row.approved_events || 0)
      return {
        offer_id: row.offer_id,
        title: row.title,
        status: row.status,
        category: row.category,
        payout: Number(row.payout || 0),
        clicks,
        events: Number(row.events || 0),
        approved_events: approvedEvents,
        tracked_payout: Number(row.tracked_payout || 0),
        tracked_revenue: Number(row.tracked_revenue || 0),
        tracked_sales: Number(row.tracked_sales || 0),
        click_to_approval_cvr: clicks > 0 ? Number(((approvedEvents / clicks) * 100).toFixed(2)) : 0
      }
    })

    res.json({
      success: true,
      reports
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/admin/reports/cohorts", checkAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `select date_trunc('day', p.created_at)::date as cohort_day,
              count(distinct p.user_id)::int as signups,
              count(distinct ae.user_id)::int as converted_users,
              coalesce(sum(ae.payout), 0)::numeric as payout_total
       from profiles p
       left join attribution_events ae
         on ae.user_id = p.user_id
        and ae.status in ('approved', 'confirmed', 'success', 'paid')
       group by cohort_day
       order by cohort_day desc
       limit 30`
    )

    const cohorts = result.rows.map((row) => {
      const signups = Number(row.signups || 0)
      const convertedUsers = Number(row.converted_users || 0)
      return {
        cohort_day: row.cohort_day,
        signups,
        converted_users: convertedUsers,
        activation_rate: signups > 0 ? Number(((convertedUsers / signups) * 100).toFixed(2)) : 0,
        payout_total: Number(row.payout_total || 0)
      }
    })

    res.json({
      success: true,
      cohorts
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/admin/reports/referrals", checkAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `select ref.user_id as referrer_user_id,
              ref.full_name as referrer_name,
              ref.referral_code,
              count(child.user_id)::int as referred_users,
              count(ae.id)::int as referred_events,
              coalesce(sum(ae.payout), 0)::numeric as referred_payout
       from profiles ref
       left join profiles child on child.referred_by_user_id = ref.user_id
       left join attribution_events ae
         on ae.user_id = child.user_id
        and ae.status in ('approved', 'confirmed', 'success', 'paid')
       where ref.referral_code is not null
       group by ref.user_id, ref.full_name, ref.referral_code
       having count(child.user_id) > 0
       order by referred_users desc, referred_payout desc
       limit 100`
    )

    res.json({
      success: true,
      referrals: result.rows.map((row) => ({
        referrer_user_id: row.referrer_user_id,
        referrer_name: row.referrer_name,
        referral_code: row.referral_code,
        referred_users: Number(row.referred_users || 0),
        referred_events: Number(row.referred_events || 0),
        referred_payout: Number(row.referred_payout || 0)
      }))
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/admin/reports/events", checkAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `select event_name,
              status,
              count(*)::int as total_events,
              count(distinct user_id)::int as users,
              coalesce(sum(payout), 0)::numeric as payout_total,
              coalesce(sum(revenue), 0)::numeric as revenue_total
       from attribution_events
       group by event_name, status
       order by total_events desc, event_name asc`
    )

    res.json({
      success: true,
      events: result.rows.map((row) => ({
        event_name: row.event_name,
        status: row.status,
        total_events: Number(row.total_events || 0),
        users: Number(row.users || 0),
        payout_total: Number(row.payout_total || 0),
        revenue_total: Number(row.revenue_total || 0)
      }))
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/admin/fraud/signals", checkAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `select cl.user_id,
              p.full_name,
              p.email,
              p.phone,
              count(*)::int as clicks_24h,
              count(distinct cl.campaign_id)::int as unique_offers_24h,
              count(distinct ae.id)::int as events_24h
       from clicks cl
       left join profiles p on p.user_id = cl.user_id
       left join attribution_events ae
         on ae.user_id = cl.user_id
        and ae.campaign_id = cl.campaign_id
        and ae.created_at >= current_timestamp - interval '24 hours'
       where cl.created_at >= current_timestamp - interval '24 hours'
       group by cl.user_id, p.full_name, p.email, p.phone
       having count(*) >= 5
       order by clicks_24h desc, events_24h asc`
    )

    const signals = result.rows.map((row) => {
      const clicks = Number(row.clicks_24h || 0)
      const events = Number(row.events_24h || 0)
      const conversionRate = clicks > 0 ? Number(((events / clicks) * 100).toFixed(2)) : 0
      let signal = "healthy"

      if (clicks >= 15 && events === 0) {
        signal = "high_click_no_conversion"
      } else if (clicks >= 10 && conversionRate < 5) {
        signal = "low_conversion_ratio"
      } else if (Number(row.unique_offers_24h || 0) >= 8 && events === 0) {
        signal = "broad_click_scouting"
      }

      return {
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        clicks_24h: clicks,
        unique_offers_24h: Number(row.unique_offers_24h || 0),
        events_24h: events,
        conversion_rate: conversionRate,
        signal
      }
    }).filter((row) => row.signal !== "healthy")

    res.json({
      success: true,
      signals
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/admin/withdrawals/sync-pending", checkAdmin, async (req, res) => {
  try {
    const withdrawalsResult = await db.query(
      `select *
       from withdraws
       where provider='razorpay'
         and provider_ref is not null
         and status in ('pending', 'processing', 'queued', 'initiated')
       order by created_at desc
       limit 50`
    )

    const results = []
    for (const withdrawal of withdrawalsResult.rows) {
      const syncResult = await syncWithdrawalWithProvider(withdrawal)
      results.push({
        withdrawal_id: withdrawal.id,
        provider_ref: withdrawal.provider_ref,
        success: syncResult.success,
        provider_status: syncResult.provider_status || null,
        reason: syncResult.reason || null
      })
    }

    res.json({
      success: true,
      synced: results.length,
      results
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/admin/campaign", checkAdmin, async (req, res) => {
  try {
    const {
      title,
      payout,
      icon_url,
      banner_url,
      description,
      short_description,
      long_description,
      trackier_url,
      category,
      reward_type,
      cta_text,
      terms,
      event_name,
      is_featured,
      featured_rank
    } = req.body

    if (!hasValue(title) || !hasValue(payout)) {
      return sendError(res, 400, "Title and payout are required")
    }

    const result = await db.query(
      `insert into campaigns
      (title, payout, reward_amount, icon_url, banner_url, description, short_description, long_description, trackier_url, status, category, reward_type, cta_text, terms, event_name, is_featured, featured_rank)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$13,$14,$15,$16)
      returning *`,
      [
        title,
        payout,
        payout,
        icon_url || "",
        banner_url || "",
        description || "",
        short_description || description || "",
        long_description || description || "",
        trackier_url || "",
        category || "Featured",
        rewardTypeFromLegacyValue(reward_type),
        cta_text || "Install & Earn",
        terms || "",
        event_name || "install",
        Boolean(is_featured),
        Number(featured_rank || 999)
      ]
    )

    res.json(mapOffer(result.rows[0]))
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

async function processTrackierPostback(payload) {
  const normalized = normalizeTrackierPostbackPayload(payload)

  if (!normalized.user_id && !hasValue(normalized.click_ref) && !hasValue(normalized.trackier_click_id)) {
    return {
      error: {
        status: 400,
        message: "Trackier postback requires sub1, sub2, click_id or equivalent identifiers"
      }
    }
  }

  let click = null
  if (hasValue(normalized.click_ref)) {
    const clickResult = await db.query(
      `select *
       from clicks
       where click_ref=$1
       limit 1`,
      [normalized.click_ref]
    )
    click = clickResult.rows[0] || null
  }

  const userId = normalized.user_id || Number(click?.user_id || 0)
  const campaignId = normalized.campaign_id || Number(click?.campaign_id || 0)

  if (!userId || !campaignId) {
    return {
      error: {
        status: 400,
        message: "Trackier postback could not be matched to a user and campaign"
      }
    }
  }

  const externalRef = hasValue(normalized.txn_id)
    ? normalized.txn_id
    : hasValue(normalized.trackier_click_id)
      ? `${normalized.trackier_click_id}:${normalized.event_name}`
      : `${normalized.click_ref}:${normalized.event_name}`

  const existingPostback = await db.query(
    "select id from postbacks where external_ref=$1",
    [externalRef]
  )

  if (existingPostback.rows[0]) {
    return {
      data: { success: true, duplicate: true, external_ref: externalRef }
    }
  }

  await db.query(
    "insert into postbacks (external_ref, payload) values ($1, $2::jsonb)",
    [externalRef, JSON.stringify(normalized.raw_payload)]
  )

  await db.query(
    `insert into attribution_events
      (external_ref, user_id, campaign_id, click_ref, trackier_click_id, txn_id, event_name, status, payout, revenue, sale_amount, payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
    [
      externalRef,
      userId,
      campaignId,
      normalized.click_ref || null,
      normalized.trackier_click_id || null,
      normalized.txn_id || null,
      normalized.event_name || "install",
      normalized.status || "approved",
      normalized.payout,
      normalized.revenue,
      normalized.sale_amount,
      JSON.stringify(normalized.raw_payload)
    ]
  )

  if (click && hasValue(normalized.trackier_click_id)) {
    await db.query(
      `update clicks
       set trackier_click_id=coalesce(trackier_click_id, $1)
       where id=$2`,
      [normalized.trackier_click_id, click.id]
    )
  }

  const shouldCreditReward = ["approved", "confirmed", "success", "paid"].includes(normalized.status)
  if (!shouldCreditReward || normalized.payout <= 0) {
    return {
      data: {
        success: true,
        credited: false,
        external_ref: externalRef
      }
    }
  }

  const existingReward = await db.query(
    "select * from rewards where user_id=$1 and campaign_id=$2",
    [userId, campaignId]
  )

  if (existingReward.rows.length > 0) {
    return {
      data: {
        success: true,
        duplicate_reward: true,
        external_ref: externalRef
      }
    }
  }

  await db.query(
    "insert into rewards (user_id, campaign_id, amount, event_name) values ($1, $2, $3, $4)",
    [userId, campaignId, normalized.payout, normalized.event_name || "install"]
  )

  await db.query(
    "update wallets set balance = balance + $1 where user_id=$2",
    [normalized.payout, userId]
  )

  await db.query(
    `insert into wallet_ledger (user_id, entry_type, amount, reference_type, reference_id, status)
     values ($1, 'credit', $2, 'trackier_postback', $3, 'confirmed')`,
    [userId, normalized.payout, externalRef]
  )

  return {
    data: {
      success: true,
      credited: true,
      external_ref: externalRef
    }
  }
}

app.get("/trackier/postback", async (req, res) => {
  try {
    const result = await processTrackierPostback(req.query)
    if (result.error) {
      return sendError(res, result.error.status, result.error.message)
    }

    res.json(result.data)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/trackier/postback", async (req, res) => {
  try {
    const result = await processTrackierPostback(req.body)
    if (result.error) {
      return sendError(res, result.error.status, result.error.message)
    }

    res.json(result.data)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

async function startServer() {
  try {
    await initDB()

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (err) {
    console.error("Failed to start server:", err)
    process.exit(1)
  }
}

startServer()
