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

function formatDbError(err) {
  if (
    err &&
    typeof err.message === "string" &&
    err.message.includes("Tenant or user not found")
  ) {
    const safeUrl = new URL(connectionString)
    const host = safeUrl.hostname
    const port = safeUrl.port || "5432"
    const user = decodeURIComponent(safeUrl.username || "")

    return new Error(
      "Supabase connection failed: tenant/user not found. " +
      `Check Render DB_URL or DATABASE_URL. Current host=${host} port=${port} user=${user}. ` +
      "For Supabase pooler connections, copy the exact connection string from Supabase Dashboard > Connect. " +
      "The username usually includes your project ref, for example postgres.<project-ref>."
    )
  }

  return err
}

pool.on("error", (err) => {
  console.error("Postgres pool error:", formatDbError(err).message)
})

module.exports = {
  ...pool,
  query: async (...args) => {
    try {
      return await pool.query(...args)
    } catch (err) {
      throw formatDbError(err)
    }
  }
}
