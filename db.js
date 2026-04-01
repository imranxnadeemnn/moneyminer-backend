const { Pool } = require("pg")

function normalizeConnectionString(value) {
  if (!value) return ""

  let connectionString = value.trim()

  // Render/Supabase env vars are sometimes pasted as shell commands.
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

const connectionString = normalizeConnectionString(
  process.env.DB_URL || process.env.DATABASE_URL
)

if (!connectionString) {
  throw new Error(
    "Database connection string is missing. Set DB_URL or DATABASE_URL."
  )
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

