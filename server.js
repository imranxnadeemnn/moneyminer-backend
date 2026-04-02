const express = require("express")
const cors = require("cors")
const rateLimit = require("express-rate-limit")
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

function mapOffer(row) {
  return {
    offer_id: row.id,
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

async function getOnboardingState(userId) {
  const profileResult = await db.query(
    `select u.user_id, p.full_name, p.email, p.phone, p.referral_code,
            exists(select 1 from kyc k where k.user_id=u.user_id and k.status in ('submitted', 'approved')) as kyc_completed,
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
    `select id, user_id, name, pan, upi, status, created_at
     from kyc
     where user_id=$1
     limit 1`,
    [userId]
  )

  return kycResult.rows[0] || null
}

app.disable("x-powered-by")
app.use(cors())
app.use(express.json())
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

    create table if not exists profiles (
      user_id int primary key references users(user_id) on delete cascade,
      full_name text,
      email text,
      phone text,
      referral_code text,
      created_at timestamp default current_timestamp,
      updated_at timestamp default current_timestamp
    );

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
      created_at timestamp default current_timestamp
    );

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

    create table if not exists withdraws (
      id serial primary key,
      user_id int,
      amount numeric,
      status text,
      provider text,
      provider_ref text,
      provider_status text,
      provider_error text,
      updated_at timestamp default current_timestamp,
      created_at timestamp default current_timestamp
    );

    alter table withdraws add column if not exists provider text;
    alter table withdraws add column if not exists provider_ref text;
    alter table withdraws add column if not exists provider_status text;
    alter table withdraws add column if not exists provider_error text;
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
  const existingIdentity = await db.query(
    `select user_id
     from user_identities
     where identity_type=$1 and identity_value=$2`,
    [identity.channel, identity.target]
  )

  if (existingIdentity.rows[0]) {
    const userId = existingIdentity.rows[0].user_id
    await db.query(
      `update profiles
       set email = case when $2='email' then $1 else email end,
           phone = case when $2='phone' then $1 else phone end,
           updated_at = current_timestamp
       where user_id=$3`,
      [identity.target, identity.channel, userId]
    )
    return userId
  }

  const insertedUser = await db.query(
    "insert into users(phone) values($1) returning user_id",
    [identity.channel === "phone" ? identity.target : null]
  )

  const userId = insertedUser.rows[0].user_id

  await db.query(
    `insert into user_identities(user_id, identity_type, identity_value, is_verified)
     values($1, $2, $3, true)`,
    [userId, identity.channel, identity.target]
  )

  await db.query(
    "insert into wallets(user_id, balance) values($1, 0) on conflict (user_id) do nothing",
    [userId]
  )

  await db.query(
    `insert into profiles(user_id, email, phone)
     values($1, $2, $3)
     on conflict (user_id) do update
     set email = coalesce(excluded.email, profiles.email),
         phone = coalesce(excluded.phone, profiles.phone),
         updated_at = current_timestamp`,
    [
      userId,
      identity.channel === "email" ? identity.target : null,
      identity.channel === "phone" ? identity.target : null
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
     where channel=$1 and target=$2 and consumed_at is null
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
    const trackierUrl = offer.trackier_url || ""
    const redirectUrl = !trackierUrl
      ? ""
      : trackierUrl.includes("sub1=")
        ? trackierUrl
        : trackierUrl.includes("?")
          ? `${trackierUrl}&sub1=${userId}&sub2=${clickRef}`
          : `${trackierUrl}?sub1=${userId}&sub2=${clickRef}`

    await db.query(
      `insert into clicks(user_id, campaign_id, click_ref, redirect_url)
       values($1, $2, $3, $4)`,
      [userId, campaignId, clickRef, redirectUrl]
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

    if (!hasValue(withdrawal.provider_ref)) {
      return sendError(res, 400, "Withdrawal does not have a Razorpay payout reference")
    }

    const payoutResult = await fetchRazorpayPayout(withdrawal.provider_ref)
    if (!payoutResult.success) {
      return sendError(res, 400, `Unable to sync payout: ${payoutResult.reason}`)
    }

    const payout = payoutResult.data || {}

    await db.query(
      `update withdraws
       set status=$1,
           provider_status=$2,
           provider_error=null,
           updated_at=current_timestamp
       where id=$3`,
      [payout.status || withdrawal.status, payout.status || withdrawal.provider_status, withdrawalId]
    )

    await db.query(
      `update wallet_ledger
       set status=$1
       where user_id=$2 and reference_type='withdraw' and reference_id=$3`,
      [payout.status || withdrawal.status, withdrawal.user_id, withdrawal.provider_ref]
    )

    res.json({
      success: true,
      withdrawal_id: withdrawalId,
      provider_ref: withdrawal.provider_ref,
      provider_status: payout.status || withdrawal.provider_status
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

app.get("/admin/offers", checkAdmin, async (req, res) => {
  try {
    const result = await db.query("select * from campaigns order by id desc")
    res.json(result.rows.map(mapOffer))
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

app.post("/trackier/postback", async (req, res) => {
  try {
    const { user_id, campaign_id, payout, event_name, click_ref } = req.body

    if (!hasValue(user_id) || !hasValue(campaign_id) || !hasValue(payout)) {
      return sendError(res, 400, "user_id, campaign_id and payout are required")
    }

    const externalRef = String(click_ref || `${user_id}_${campaign_id}_${event_name || "install"}`).trim()

    const existingPostback = await db.query(
      "select id from postbacks where external_ref=$1",
      [externalRef]
    )

    if (existingPostback.rows[0]) {
      return res.json({ success: true, duplicate: true })
    }

    const existingReward = await db.query(
      "select * from rewards where user_id=$1 and campaign_id=$2",
      [user_id, campaign_id]
    )

    if (existingReward.rows.length > 0) {
      return sendError(res, 409, "Reward already processed")
    }

    await db.query(
      "insert into postbacks (external_ref, payload) values ($1, $2::jsonb)",
      [externalRef, JSON.stringify(req.body)]
    )

    await db.query(
      "insert into rewards (user_id, campaign_id, amount, event_name) values ($1, $2, $3, $4)",
      [user_id, campaign_id, payout, event_name || "install"]
    )

    await db.query(
      "update wallets set balance = balance + $1 where user_id=$2",
      [payout, user_id]
    )

    await db.query(
      `insert into wallet_ledger (user_id, entry_type, amount, reference_type, reference_id, status)
       values ($1, 'credit', $2, 'reward', $3, 'confirmed')`,
      [user_id, payout, externalRef]
    )

    res.json({ success: true })
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
