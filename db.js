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

function isPoolerConnectionString(value) {
  try {
    return new URL(value).hostname.includes(".pooler.supabase.com")
  } catch {
    return false
  }
}

function getConnectionCandidates() {
  return [
    {
      source: "DB_URL",
      value: normalizeConnectionString(process.env.DB_URL)
    },
    {
      source: "DATABASE_URL",
      value: normalizeConnectionString(process.env.DATABASE_URL)
    }
  ].filter((candidate) => candidate.value)
}

function pickConnectionString(candidates) {
  if (candidates.length === 0) {
    return { source: null, value: "" }
  }

  const preferred =
    candidates.find((candidate) => !isPoolerConnectionString(candidate.value)) ||
    candidates[0]

  return preferred
}

const connectionCandidates = getConnectionCandidates()
const primaryConnection = pickConnectionString(connectionCandidates)
const fallbackConnection = connectionCandidates.find(
  (candidate) => candidate.value !== primaryConnection.value
)
const { source: connectionSource, value: connectionString } = primaryConnection

if (!connectionString) {
  throw new Error(
    "Database connection string is missing. Set DB_URL or DATABASE_URL."
  )
}

function createPool(value) {
  return new Pool({
    connectionString: value,
    ssl: {
      rejectUnauthorized: false
    }
  })
}

const pool = createPool(connectionString)
const fallbackPool = fallbackConnection
  ? createPool(fallbackConnection.value)
  : null

function isNetworkUnreachableError(err) {
  return err && (
    err.code === "ENETUNREACH" ||
    err.code === "EHOSTUNREACH" ||
    err.code === "ECONNREFUSED"
  )
}

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
      `Check Render DB_URL or DATABASE_URL. Using ${connectionSource}. Current host=${host} port=${port} user=${user}. ` +
      "For Supabase pooler connections, copy the exact connection string from Supabase Dashboard > Connect. " +
      "The username usually includes your project ref, for example postgres.<project-ref>."
    )
  }

  if (isNetworkUnreachableError(err)) {
    return new Error(
      "Supabase direct database connection is unreachable from Render. " +
      `Using ${connectionSource} failed with ${err.code}. ` +
      "Render does not support IPv6 direct connections to Supabase. " +
      "Use a Supabase pooler connection instead, or enable Supabase's IPv4 add-on."
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
      if (fallbackPool && isNetworkUnreachableError(err)) {
        console.warn(
          `Primary database connection via ${connectionSource} failed with ${err.code}. ` +
          `Retrying with ${fallbackConnection.source}.`
        )

        try {
          return await fallbackPool.query(...args)
        } catch (fallbackErr) {
          throw formatDbError(fallbackErr)
        }
      }

      throw formatDbError(err)
    }
  }
}
