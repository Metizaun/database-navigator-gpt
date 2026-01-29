import { supabase } from "@/integrations/supabase/client";
import { Message, Conversation, LLMSettings, DatabaseMetadata } from "@/types/database";

export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createConversation(title?: string): Promise<Conversation> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: title || "Nova Conversa" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createMessage(
  conversationId: string,
  role: string,
  content: string
): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role, content })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getLLMSettings(): Promise<LLMSettings | null> {
  const { data, error } = await supabase
    .from("llm_settings")
    .select("*")
    .eq("is_active", true)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function saveLLMSettings(settings: {
  provider: string;
  model: string;
  api_key: string;
}): Promise<LLMSettings> {
  // Deactivate existing settings
  await supabase.from("llm_settings").update({ is_active: false }).eq("is_active", true);

  // Create new settings
  const { data, error } = await supabase
    .from("llm_settings")
    .insert({ ...settings, is_active: true })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMetadata(): Promise<DatabaseMetadata[]> {
  const { data, error } = await supabase
    .from("database_metadata_cache")
    .select("*")
    .order("schema_name, table_name, column_name");

  if (error) throw error;
  return data || [];
}

export async function refreshMetadata(): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/fetch-metadata`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to refresh metadata");
  }
}

export async function fetchExternalMetadata(): Promise<DatabaseMetadata[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/external-db-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ action: "fetch-metadata" }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to fetch external metadata");
  }

  if (result.hint) {
    throw new Error(result.message + " " + result.hint);
  }

  return (result.data || []).map((item: any, index: number) => ({
    id: `external-${index}`,
    schema_name: item.schema_name,
    table_name: item.table_name,
    column_name: item.column_name,
    data_type: item.data_type,
    is_nullable: item.is_nullable,
    column_default: item.column_default,
    cached_at: new Date().toISOString(),
  }));
}

export async function cacheExternalMetadata(metadata: DatabaseMetadata[]): Promise<void> {
  // Clear old external metadata cache
  await supabase
    .from("database_metadata_cache")
    .delete()
    .like("id", "external-%");

  // Insert new external metadata with external prefix in schema
  const toInsert = metadata.map((item) => ({
    schema_name: `external.${item.schema_name}`,
    table_name: item.table_name,
    column_name: item.column_name,
    data_type: item.data_type,
    is_nullable: item.is_nullable,
    column_default: item.column_default,
  }));

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("database_metadata_cache")
      .insert(toInsert);
    
    if (error) {
      console.error("Failed to cache external metadata:", error);
    }
  }
}

export async function executeExternalQuery(query: string): Promise<any[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/external-db-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ action: "execute-query", query }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to execute query");
  }

  return result.data || [];
}

export async function sendChatMessage(
  messages: { role: string; content: string }[],
  conversationId: string,
  databaseTarget: "internal" | "external" = "internal"
): Promise<Response> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  return fetch(`${supabaseUrl}/functions/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ messages, conversationId, databaseTarget }),
  });
}

export async function executeQuery(query: string): Promise<any[]> {
  const { data, error } = await supabase.rpc("execute_safe_query", {
    query_text: query,
  });

  if (error) throw error;
  return (data as any[]) || [];
}
