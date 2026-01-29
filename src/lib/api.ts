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

export async function sendChatMessage(
  messages: { role: string; content: string }[],
  conversationId: string
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
    body: JSON.stringify({ messages, conversationId }),
  });
}

export async function executeQuery(query: string): Promise<any[]> {
  const { data, error } = await supabase.rpc("execute_safe_query", {
    query_text: query,
  });

  if (error) throw error;
  return (data as any[]) || [];
}
