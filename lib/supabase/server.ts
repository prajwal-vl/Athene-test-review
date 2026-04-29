import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isTest = process.env.NODE_ENV === 'test';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  if (isTest) {
    console.warn("Supabase env vars missing; using placeholders for testing");
  } else {
    throw new Error(
      "Missing Supabase environment variables: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
}

export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceRoleKey || 'placeholder-key',
  {
    auth: { persistSession: false }
  }
);

// Aliases for backward compatibility — different modules import different names
export const supabaseServer = supabaseAdmin;
export const supabase = supabaseAdmin;
