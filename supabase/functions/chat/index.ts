import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, conversationId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get LLM settings
    const { data: settings, error: settingsError } = await supabase
      .from("llm_settings")
      .select("*")
      .eq("is_active", true)
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: "Configure suas credenciais de LLM na aba Admin primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get database metadata for context (internal)
    const { data: metadata } = await supabase
      .from("database_metadata_cache")
      .select("*")
      .order("schema_name, table_name, column_name");

    // Try to get external metadata if configured
    let externalMetadata: any[] = [];
    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const externalKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY");
    
    if (externalUrl && externalKey) {
      try {
        const externalSupabase = createClient(externalUrl, externalKey);
        const { data: extData } = await externalSupabase.rpc("get_database_metadata");
        if (extData) externalMetadata = extData;
      } catch (e) {
        console.log("Could not fetch external metadata:", e);
      }
    }

    let metadataContext = "";
    if (metadata && metadata.length > 0) {
      metadataContext += `\n\nEstrutura do banco de dados interno:\n${formatMetadata(metadata)}`;
    }
    if (externalMetadata.length > 0) {
      metadataContext += `\n\nEstrutura do banco de dados EXTERNO (use este para consultas):\n${formatMetadata(externalMetadata)}`;
    }

    const hasExternalDb = externalMetadata.length > 0;
    const systemPrompt = `Você é um assistente especializado em análise de banco de dados PostgreSQL.
    
Suas capacidades:
- Criar queries SELECT complexas com JOINs, agregações, filtros
- Criar VIEWs para análises recorrentes
- Analisar estrutura de tabelas e schemas
- Sugerir otimizações e melhores práticas

RESTRIÇÕES IMPORTANTES:
- Você NÃO pode fazer INSERT, DELETE, UPDATE, DROP, ou TRUNCATE
- Apenas SELECT e CREATE VIEW são permitidos
- Sempre valide as queries antes de sugerir

${hasExternalDb ? "IMPORTANTE: O usuário possui um BANCO DE DADOS EXTERNO configurado. Priorize usar a estrutura do banco externo nas suas análises e queries." : ""}

Quando o usuário pedir para executar uma query:
1. Escreva a query em um bloco de código SQL
2. Explique o que a query faz
3. Use a tag especial [EXECUTE_QUERY] antes do bloco SQL se o usuário quiser executar
4. ${hasExternalDb ? "Use [EXECUTE_EXTERNAL] para queries no banco externo" : ""}

${metadataContext}`;

    let response;
    
    if (settings.provider === "openai") {
      response = await callOpenAI(settings.api_key, settings.model, systemPrompt, messages);
    } else {
      response = await callGemini(settings.api_key, settings.model, systemPrompt, messages);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatMetadata(metadata: any[]): string {
  const grouped: Record<string, Record<string, string[]>> = {};
  
  for (const row of metadata) {
    if (!grouped[row.schema_name]) {
      grouped[row.schema_name] = {};
    }
    if (!grouped[row.schema_name][row.table_name]) {
      grouped[row.schema_name][row.table_name] = [];
    }
    grouped[row.schema_name][row.table_name].push(
      `${row.column_name} (${row.data_type}${row.is_nullable ? ", nullable" : ""})`
    );
  }

  let result = "";
  for (const [schema, tables] of Object.entries(grouped)) {
    result += `\nSchema: ${schema}\n`;
    for (const [table, columns] of Object.entries(tables)) {
      result += `  Tabela: ${table}\n`;
      result += `    Colunas: ${columns.join(", ")}\n`;
    }
  }
  return result;
}

async function callOpenAI(apiKey: string, model: string, systemPrompt: string, messages: any[]) {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    }),
  });
}

async function callGemini(apiKey: string, model: string, systemPrompt: string, messages: any[]) {
  const geminiModel = model.replace("gemini-", "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
  
  const contents = messages.map((msg: any) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
    }),
  });

  // Convert Gemini streaming format to OpenAI-compatible SSE
  const reader = response.body?.getReader();
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      if (!reader) {
        controller.close();
        return;
      }
      
      const decoder = new TextDecoder();
      let buffer = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Parse JSON chunks from Gemini
        try {
          const lines = buffer.split("\n");
          for (const line of lines) {
            if (line.trim().startsWith("{") || line.trim().startsWith("[")) {
              try {
                const data = JSON.parse(line.trim().replace(/^\[|\]$/g, ""));
                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                  const text = data.candidates[0].content.parts[0].text;
                  const sseData = JSON.stringify({
                    choices: [{ delta: { content: text } }]
                  });
                  controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                }
              } catch {}
            }
          }
          buffer = lines[lines.length - 1];
        } catch {}
      }
      
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream);
}
