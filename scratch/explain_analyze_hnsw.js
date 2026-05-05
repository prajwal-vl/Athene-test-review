const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres:hVr1F7MyA4ktP3P7@db.vklqtyphfmdgqramwvfm.supabase.co:6543/postgres",
});

async function run() {
  try {
    console.log("🚀 Running EXPLAIN ANALYZE to verify HNSW index usage...");
    
    // Generate a dummy 1536-dim vector string
    const vector = "[" + Array(1536).fill(0.1).join(",") + "]";
    
    const res = await pool.query(`
      EXPLAIN ANALYZE
      SELECT *
      FROM document_embeddings
      ORDER BY embedding <=> '${vector}'
      LIMIT 5;
    `);

    const plan = res.rows.map(r => r['QUERY PLAN']).join('\n');
    console.log("\n📊 QUERY PLAN:\n", plan);

    if (plan.includes("Index Scan") && plan.includes("document_embeddings_hnsw_idx")) {
      console.log("\n✅ SUCCESS: HNSW Index is being used correctly!");
    } else {
      console.log("\n❌ FAIL: Sequential Scan detected. Performance requirement not met.");
    }

  } catch (err) {
    console.error("\n❌ Error executing EXPLAIN ANALYZE:", err.message);
    console.log("\n💡 Possible causes:");
    console.log("1. Network restriction in this environment (ENOTFOUND).");
    console.log("2. Table 'document_embeddings' does not exist.");
    console.log("3. pgvector extension not enabled.");
  } finally {
    await pool.end();
  }
}

run();
