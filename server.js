const express = require("express")
const cors = require("cors")
const fs = require("fs")
const path = require("path")
const db = require("./db")

const app = express()

app.use(cors())
app.use(express.json())

let adminToken = null

async function initializeDatabase() {
    const schemaPath = path.join(__dirname, "schema.sql")

    if (!fs.existsSync(schemaPath)) {
        console.warn("schema.sql not found, skipping database initialization")
        return
    }

    const schemaSql = fs.readFileSync(schemaPath, "utf8")
    await db.query(schemaSql)
    console.log("Database schema initialized")
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
        await initializeDatabase()

        app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
            console.log("Bifrost running on " + PORT)
        })
    } catch (err) {
        console.error("Failed to start server:", err.message)
        process.exit(1)
    }
}

startServer()
