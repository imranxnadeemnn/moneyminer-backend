const express = require("express")
const cors = require("cors")
const rateLimit = require("express-rate-limit")
const db = require("./db")

const app = express()
const PORT = process.env.PORT || 3000

let adminToken = null

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    error: message
  })
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

    create table if not exists wallets (
      id serial primary key,
      user_id int,
      balance numeric default 0
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

    create table if not exists rewards (
      id serial primary key,
      user_id int,
      campaign_id int,
      amount numeric,
      created_at timestamp default current_timestamp,
      unique (user_id, campaign_id)
    );

    create table if not exists withdraws (
      id serial primary key,
      user_id int,
      amount numeric,
      status text,
      created_at timestamp default current_timestamp
    );

    create table if not exists kyc (
      id serial primary key,
      user_id int,
      name text,
      pan text,
      upi text
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

    insert into admins (username, password)
    values ('admin', 'admin123')
    on conflict (username) do nothing;
  `)

  console.log("Tables created successfully")
  console.log("DB initialized")
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

app.post("/verify-otp", async (req, res) => {
  try {
    const { phone } = req.body

    if (!phone) {
      return sendError(res, 400, "Phone is required")
    }

    const result = await db.query(
      "select * from users where phone=$1",
      [phone]
    )

    let user = result.rows[0]

    if (!user) {
      const insertedUser = await db.query(
        "insert into users(phone) values($1) returning *",
        [phone]
      )

      user = insertedUser.rows[0]

      await db.query(
        "insert into wallets(user_id, balance) values($1, 0)",
        [user.user_id]
      )
    }

    res.json({
      success: true,
      user_id: user.user_id
    })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.get("/campaigns", async (req, res) => {
  try {
    const result = await db.query(
      "select * from campaigns where status=$1 order by id desc",
      ["active"]
    )

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body

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

app.post("/admin/campaign", checkAdmin, async (req, res) => {
  try {
    const {
      title,
      payout,
      icon_url,
      description,
      trackier_url
    } = req.body

    const result = await db.query(
      `insert into campaigns
      (title, payout, icon_url, description, trackier_url, status)
      values ($1,$2,$3,$4,$5,'active')
      returning *`,
      [title, payout, icon_url, description, trackier_url]
    )

    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/trackier/postback", async (req, res) => {
  try {
    const { user_id, campaign_id, payout } = req.body

    if (!user_id || !campaign_id) {
      return sendError(res, 400, "user_id and campaign_id are required")
    }

    const existing = await db.query(
      "select * from rewards where user_id=$1 and campaign_id=$2",
      [user_id, campaign_id]
    )

    if (existing.rows.length > 0) {
      return sendError(res, 409, "Reward already processed")
    }

    await db.query(
      "insert into rewards (user_id, campaign_id, amount) values ($1, $2, $3)",
      [user_id, campaign_id, payout]
    )

    await db.query(
      "update wallets set balance = balance + $1 where user_id=$2",
      [payout, user_id]
    )

    res.json({ success: true })
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

    if (Number(wallet.balance) < withdrawalAmount) {
      return sendError(res, 400, "Insufficient balance")
    }

    await db.query(
      "update wallets set balance = balance - $1 where user_id=$2",
      [withdrawalAmount, user_id]
    )

    await db.query(
      `insert into withdraws (user_id, amount, status)
      values ($1, $2, 'pending')`,
      [user_id, withdrawalAmount]
    )

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err.message)
  }
})

app.post("/kyc", async (req, res) => {
  try {
    const { user_id, name, pan, upi } = req.body

    await db.query(
      "insert into kyc (user_id, name, pan, upi) values ($1, $2, $3, $4)",
      [user_id, name, pan, upi]
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
      console.log(`Bifrost running on ${PORT}`)
    })
  } catch (err) {
    console.error("Failed to start server:", err.message)
    process.exit(1)
  }
}

startServer()
