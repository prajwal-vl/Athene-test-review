const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres:hVr1F7MyA4ktP3P7@db.vklqtyphfmdgqramwvfm.supabase.co:6543/postgres",
});

async function run() {
  try {
    console.log("🔍 Checking RLS status and policies for 'document_embeddings'...");
    
    // Check if RLS is enabled
    const rlsStatus = await pool.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace 
      WHERE relname = 'document_embeddings';
    `);
    
    console.log("RLS Enabled:", rlsStatus.rows[0]?.relrowsecurity ? "✅ Yes" : "❌ No");

    // List policies
    const policies = await pool.query(`
      SELECT * FROM pg_policies WHERE tablename = 'document_embeddings';
    `);
    
    console.log("\n📜 Existing Policies:");
    policies.rows.forEach(p => {
      console.log(`- ${p.policyname}: ${p.qual}`);
    });

    if (!rlsStatus.rows[0]?.relrowsecurity || policies.rows.length === 0) {
      console.log("\n⚠️ WARNING: RLS is NOT fully configured. The 'withRLS' wrapper will have no effect without DB-level policies.");
      console.log("Run the following SQL in your Supabase Editor to fix this:\n");
      console.log(`
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_embeddings_isolation ON document_embeddings
USING (
  (current_setting('app.user_role') = 'admin') OR
  (
    (metadata->>'org_id')::text = current_setting('app.org_id') AND
    (
      (current_setting('app.user_role') = 'bi_analyst' AND visibility = 'bi_accessible') OR
      (metadata->>'user_id')::text = current_setting('app.user_id')
    )
  )
);
      `);
    }

  } catch (err) {
    console.error("❌ Error checking RLS:", err.message);
  } finally {
    await pool.end();
  }
}

run();
