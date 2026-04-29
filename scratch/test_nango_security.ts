import { config } from 'dotenv';
config({ path: '.env.local' });
import { listConnections, getConnectionToken } from '../lib/nango/client';

async function test() {
  const orgId = 'test-org-123';
  console.log(`Testing listConnections for orgId: ${orgId}...`);
  
  try {
    const connections = await listConnections(orgId);
    console.log(`Found ${connections.length} connections.`);
    
    if (connections.length > 0) {
      const firstConn = connections[0];
      console.log(`Attempting to get token for ${firstConn.connection_id}...`);
      
      // Test with CORRECT orgId
      const token = await getConnectionToken(firstConn.connection_id, firstConn.provider_config_key, orgId);
      console.log('Successfully retrieved token with correct orgId.');
      
      // Test with INCORRECT orgId
      try {
        await getConnectionToken(firstConn.connection_id, firstConn.provider_config_key, 'wrong-org');
        console.error('FAIL: Retrieved token with incorrect orgId!');
      } catch (e: any) {
        console.log('PASS: Successfully blocked access with incorrect orgId:', e.message);
      }
    } else {
      console.log('No connections found for test-org. This is expected if Supabase mapping is empty.');
    }
  } catch (err: any) {
    console.error('Error during test:', err.message);
  }
}

test();
