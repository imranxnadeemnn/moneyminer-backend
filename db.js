// "export DB_URL='postgresql://postgres.dcmokytmtwdpystwijsr:[YOUR-PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres'",


const { Pool } = require("pg")

const pool = new Pool({

    connectionString:
        process.env.DB_URL,

    ssl: {
        rejectUnauthorized: false
    }

})

module.exports = pool



