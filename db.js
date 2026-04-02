const { Pool } = require("pg")

function normalizeConnectionString(value) {
  if (!value) return ""

  let connectionString = value.trim()

  const exportMatch = connectionString.match(
    /^export\s+[A-Z0-9_]+\s*=\s*(.+)$/i
  )

  if (exportMatch) {
    connectionString = exportMatch[1].trim()
  }

  if (
    (connectionString.startsWith("'") && connectionString.endsWith("'")) ||
    (connectionString.startsWith("\"") && connectionString.endsWith("\""))
  ) {
    connectionString = connectionString.slice(1, -1).trim()
  }

  return connectionString
}

const connectionString = normalizeConnectionString(process.env.DATABASE_URL)

if (!connectionString) {
  throw new Error("DATABASE_URL is missing.")
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
})

pool.on("error", (err) => {
  console.error("Postgres pool error:", err.message)
})

module.exports = pool
