const express = require("express")
const cors = require("cors")
const db = require("./db")

const app = express()

app.use(cors())
app.use(express.json())

let adminToken = null

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
            created_at timestamp default current_timestamp
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
            username text,
            password text
        );
    `)

    console.log("Tables created successfully")
    console.log("DB initialized")
}


// ================= ROOT =================
app.get("/", (req, res) => {
    res.send("Server running")
})


// ================= OTP LOGIN =================
app.post("/verify-otp", async (req, res) => {
    try {
        const phone = req.body.phone

        const r = await db.query(
            "select * from users where phone=$1",
            [phone]
        )

        let user = r.rows[0]

        if (!user) {
            const ins = await db.query(
                "insert into users(phone) values($1) returning *",
                [phone]
            )

            user = ins.rows[0]

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
        res.status(500).json({ error: err.message })
    }
})


// ================= CAMPAIGNS =================
app.get("/campaigns", async (req, res) => {
    try {
        console.log("📥 /campaigns called")

        const result = await db.query("SELECT * FROM campaigns")

        console.log("✅ DB result:", result.rows)

        res.json(result.rows)

    } catch (err) {
        console.error("❌ ERROR in /campaigns:", err.message)
        res.status(500).json({ error: err.message })
    }
})


// ================= ADMIN LOGIN =================
app.post("/admin/login", async (req, res) => {
    try {
        const { username, password } = req.body

        const r = await db.query(
            "select * from admins where username=$1 and password=$2",
            [username, password]
        )

        if (r.rows.length === 0)
            return res.json({ success: false })

        adminToken = "admin123"

        res.json({
            success: true,
            token: adminToken
        })

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// ================= ADMIN AUTH =================
function checkAdmin(req, res, next) {
    const token = req.headers["x-admin-token"]

    if (token !== adminToken)
        return res.json({ success: false })

    next()
}


// ================= CREATE CAMPAIGN =================
app.post("/admin/campaign", checkAdmin, async (req, res) => {
    try {
        const {
            title,
            payout,
            icon_url,
            description,
            trackier_url
        } = req.body

        const r = await db.query(
            `insert into campaigns
            (title, payout, icon_url, description, trackier_url, status)
            values ($1,$2,$3,$4,$5,'active')
            returning *`,
            [title, payout, icon_url, description, trackier_url]
        )

        res.json(r.rows[0])

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// ================= TRACKIER POSTBACK =================
app.post("/trackier/postback", async (req, res) => {
    try {
        const { user_id, campaign_id, payout } = req.body

        if (!user_id || !campaign_id)
            return res.send("invalid")

        const existing = await db.query(
            `select * from rewards where user_id=$1 and campaign_id=$2`,
            [user_id, campaign_id]
        )

        if (existing.rows.length > 0)
            return res.send("duplicate")

        await db.query(
            `insert into rewards (user_id,campaign_id,amount)
             values ($1,$2,$3)`,
            [user_id, campaign_id, payout]
        )

        await db.query(
            `update wallets
             set balance = balance + $1
             where user_id=$2`,
            [payout, user_id]
        )

        res.send("ok")

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// ================= WALLET =================
app.get("/wallet/:id", async (req, res) => {
    try {
        const r = await db.query(
            "select * from wallets where user_id=$1",
            [req.params.id]
        )

        res.json(r.rows[0])

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// ================= REWARD HISTORY =================
app.get("/history/rewards/:id", async (req, res) => {
    try {
        const r = await db.query(
            "select * from rewards where user_id=$1",
            [req.params.id]
        )

        res.json(r.rows)

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// ================= WITHDRAW =================
app.post("/withdraw", async (req, res) => {
    try {
        const { user_id, amount } = req.body

        await db.query(
            `insert into withdraws (user_id,amount,status)
             values ($1,$2,'pending')`,
            [user_id, amount]
        )

        res.json({ success: true })

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// ================= KYC =================
app.post("/kyc", async (req, res) => {
    try {
        const { user_id, name, pan, upi } = req.body

        await db.query(
            `insert into kyc (user_id,name,pan,upi)
             values ($1,$2,$3,$4)`,
            [user_id, name, pan, upi]
        )

        res.json({ success: true })

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})


// ================= PORT =================
const PORT = process.env.PORT || 3000

async function startServer() {
    try {
        await initDB()

        app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
            console.log("Bifrost running on " + PORT)
        })
    } catch (err) {
        console.error("Failed to start server:", err.message)
        process.exit(1)
    }
}

startServer()
