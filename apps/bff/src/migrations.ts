import { promises as fs } from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { Client } from "pg"
import { env, requireEnv } from "./config"

const MIGRATION_LOCK_KEY_1 = 418003
const MIGRATION_LOCK_KEY_2 = 92741
const TRACKING_TABLE = "formpilot_schema_migrations"

interface MigrationFile {
  name: string
  fullPath: string
  checksum: string
  sql: string
}

function resolveSslConfig(): boolean | { rejectUnauthorized: boolean } {
  if (!env.migrationDbSsl) return false
  return {
    rejectUnauthorized: env.migrationDbSslRejectUnauthorized
  }
}

async function resolveMigrationsDir(): Promise<string> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const configured = env.migrationsDir || "infra/supabase/migrations"

  const candidates = [
    path.resolve(process.cwd(), configured),
    path.resolve(process.cwd(), "../../infra/supabase/migrations"),
    path.resolve(currentDir, "../../../infra/supabase/migrations")
  ]

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isDirectory()) {
        return candidate
      }
    } catch {
      // continue
    }
  }

  throw new Error(`未找到迁移目录: ${configured}`)
}

async function loadMigrationFiles(migrationsDir: string): Promise<MigrationFile[]> {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true })
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const files: MigrationFile[] = []
  for (const name of sqlFiles) {
    const fullPath = path.join(migrationsDir, name)
    const sql = await fs.readFile(fullPath, "utf8")
    const checksum = crypto.createHash("sha256").update(sql, "utf8").digest("hex")
    files.push({
      name,
      fullPath,
      checksum,
      sql
    })
  }

  return files
}

async function ensureTrackingTable(client: Client): Promise<void> {
  await client.query(`
    create table if not exists ${TRACKING_TABLE} (
      filename text primary key,
      checksum text not null,
      executed_at timestamptz not null default now()
    )
  `)
}

async function getAppliedChecksum(client: Client, filename: string): Promise<string | null> {
  const result = await client.query<{ checksum: string }>(
    `select checksum from ${TRACKING_TABLE} where filename = $1 limit 1`,
    [filename]
  )

  if (!result.rows.length) return null
  return result.rows[0].checksum
}

async function applySingleMigration(client: Client, file: MigrationFile): Promise<void> {
  await client.query("begin")
  try {
    await client.query(file.sql)
    await client.query(`insert into ${TRACKING_TABLE} (filename, checksum) values ($1, $2)`, [
      file.name,
      file.checksum
    ])
    await client.query("commit")
  } catch (error) {
    await client.query("rollback")
    throw error
  }
}

export async function runStartupMigrations(): Promise<void> {
  if (!env.autoRunMigrations) {
    console.log("[migrations] AUTO_RUN_MIGRATIONS=false, skip startup migrations")
    return
  }

  const migrationsDir = await resolveMigrationsDir()
  const migrationFiles = await loadMigrationFiles(migrationsDir)

  if (!migrationFiles.length) {
    console.log(`[migrations] no sql files found in ${migrationsDir}`)
    return
  }

  const dbUrl = requireEnv(env.supabaseDbUrl, "SUPABASE_DB_URL")
  const client = new Client({
    connectionString: dbUrl,
    ssl: resolveSslConfig()
  })

  await client.connect()

  try {
    await client.query("select pg_advisory_lock($1, $2)", [MIGRATION_LOCK_KEY_1, MIGRATION_LOCK_KEY_2])
    await ensureTrackingTable(client)

    let appliedCount = 0
    for (const file of migrationFiles) {
      const appliedChecksum = await getAppliedChecksum(client, file.name)

      if (appliedChecksum) {
        if (appliedChecksum !== file.checksum) {
          throw new Error(
            `[migrations] checksum mismatch for ${file.name}. applied=${appliedChecksum}, current=${file.checksum}`
          )
        }
        console.log(`[migrations] skip ${file.name} (already applied)`)
        continue
      }

      console.log(`[migrations] apply ${file.name} (${file.fullPath})`)
      await applySingleMigration(client, file)
      appliedCount += 1
      console.log(`[migrations] applied ${file.name}`)
    }

    console.log(`[migrations] completed. applied=${appliedCount}, total=${migrationFiles.length}`)
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1, $2)", [MIGRATION_LOCK_KEY_1, MIGRATION_LOCK_KEY_2])
    } catch {
      // ignore unlock errors
    }
    await client.end()
  }
}
