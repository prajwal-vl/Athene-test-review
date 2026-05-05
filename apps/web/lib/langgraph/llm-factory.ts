import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";

export type ModelComplexity = "simple" | "medium" | "complex";
export type Provider = "anthropic" | "openai" | "gemini" | "azure_openai" | "custom";

const defaults: Record<ModelComplexity, { provider: Provider; model: string }> = {
  simple: { provider: "openai", model: "gpt-4o-mini" },
  medium: { provider: "openai", model: "gpt-4o" },
  complex: { provider: "openai", model: "gpt-4o" },
};

async function getOrgKey(orgId: string, provider: Provider) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("org_api_keys")
    .select("encrypted_key, custom_endpoint")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const decrypted = await supabase.rpc("decrypt_key", {
    p_encrypted: data.encrypted_key,
    p_secret: requireEnv("ENCRYPTION_SECRET"),
  });
  if (decrypted.error) throw decrypted.error;
  return { apiKey: decrypted.data as string, endpoint: data.custom_endpoint as string | null };
}

export async function resolveModelClient(orgId: string, complexity: ModelComplexity, preferredProvider?: Provider) {
  const selected = { ...defaults[complexity], provider: preferredProvider || defaults[complexity].provider };
  const orgKey = await getOrgKey(orgId, selected.provider);
  if (selected.provider === "anthropic") {
    return new ChatAnthropic({
      apiKey: orgKey?.apiKey || process.env.ANTHROPIC_API_KEY,
      model: complexity === "complex" ? "claude-3-5-sonnet-latest" : "claude-3-haiku-20240307",
      temperature: 0.1,
    });
  }
  if (selected.provider === "gemini") {
    return new ChatGoogleGenerativeAI({
      apiKey: orgKey?.apiKey || process.env.GEMINI_API_KEY,
      model: complexity === "simple" ? "gemini-2.0-flash" : "gemini-1.5-pro",
      temperature: 0.1,
    });
  }
  return new ChatOpenAI({
    apiKey: orgKey?.apiKey || requireEnv("OPENAI_API_KEY"),
    model: selected.model,
    temperature: 0.1,
    configuration: orgKey?.endpoint ? { baseURL: orgKey.endpoint } : undefined,
  });
}
