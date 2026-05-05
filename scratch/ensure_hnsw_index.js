const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres:hVr1F7MyA4ktP3P7@db.vklqtyphfmdgqramwvfm.supabase.co:6543/postgres",
});

async function run() {
  console.log("Checking for HNSW index...");
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS document_embeddings_hnsw_idx
      ON document_embeddings
      USING hnsw (embedding vector_cosine_ops);
    `);
    console.log("✅ HNSW index ensured successfully.");
  } catch (err) {
    console.error("❌ Error ensuring index:", err.message);
  } finally {
    await pool.end();
  }
}

run();
