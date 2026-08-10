const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    candidate_name TEXT NOT NULL,
    target_role TEXT NOT NULL,
    company TEXT NOT NULL,
    job_link TEXT,
    job_text TEXT NOT NULL,
    resume_text TEXT NOT NULL,
    status TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_documents_application_id ON documents(application_id)",
];

let initialized = false;

export async function ensureDatabase(database: D1Database) {
  if (initialized) return;
  await database.batch(schemaStatements.map((statement) => database.prepare(statement)));
  await database.prepare("PRAGMA optimize").run();
  initialized = true;
}
