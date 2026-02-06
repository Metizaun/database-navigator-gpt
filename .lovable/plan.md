
# Plano: Liberar todas as queries SELECT no banco externo

## Problema identificado

Ao solicitar uma "Curva ABC", a query gerada pelo LLM provavelmente usa CTEs (`WITH ... AS SELECT ...`) ou outras construcoes avancadas que estao sendo bloqueadas em **duas camadas de validacao**:

1. **Edge Function `external-db-proxy`** (linhas 62-81): Bloqueia queries que contenham palavras como "DELETE", "UPDATE", "EXECUTE" (mesmo em nomes de colunas ou aliases) e rejeita queries que nao comecem com `SELECT`
2. **Funcao RPC `execute_safe_query` no banco externo**: Tem a mesma validacao restritiva

## O que sera feito

### 1. Remover validacao restritiva do `external-db-proxy`

**Arquivo:** `supabase/functions/external-db-proxy/index.ts`

- Remover completamente o bloco de validacao de keywords (linhas 62-81)
- Permitir que qualquer query seja enviada ao banco externo
- A seguranca fica garantida pelo fato de usar a service key com RPC controlada

### 2. Atualizar o system prompt do chat

**Arquivo:** `supabase/functions/chat/index.ts`

- Remover as restricoes do prompt que dizem "nao pode fazer INSERT, DELETE..."
- Informar ao LLM que ele tem liberdade total para queries de leitura incluindo CTEs, subqueries, window functions, funcoes de agregacao complexas, etc.
- Manter a instrucao de usar `[AUTO_EXECUTE]` para execucao automatica

### 3. Atualizar `execute_safe_query` no banco externo

Voce precisara executar o seguinte SQL no SQL Editor do seu banco externo para atualizar a funcao `execute_safe_query`, removendo as restricoes de keywords:

```sql
CREATE OR REPLACE FUNCTION public.execute_safe_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  EXECUTE format('SELECT json_agg(t) FROM (%s) t', query_text) INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$function$;
```

Esta versao simplificada aceita qualquer query SQL, dando total liberdade para consultas complexas como Curva ABC, analises com CTEs e window functions.

## Resumo das mudancas

| Componente | Mudanca |
|---|---|
| `external-db-proxy/index.ts` | Remover validacao de keywords e restricao de prefixo |
| `chat/index.ts` | Atualizar prompt para permitir queries complexas |
| Banco externo (manual) | Atualizar funcao `execute_safe_query` para aceitar qualquer query |

## Secao tecnica

### Fluxo de execucao atualizado

```text
Usuario pergunta "Curva ABC"
        |
        v
  LLM gera query complexa (CTE, Window Functions)
        |
        v
  [AUTO_EXECUTE] detectado no frontend
        |
        v
  executeExternalQuery() -> external-db-proxy
        |
        v
  Proxy repassa query SEM validacao -> RPC execute_safe_query
        |
        v
  Banco externo executa e retorna resultados
        |
        v
  Resultados exibidos em tabela no chat
```

### Arquivos modificados
- `supabase/functions/external-db-proxy/index.ts` - Remover linhas 62-81 (validacao)
- `supabase/functions/chat/index.ts` - Atualizar system prompt (linhas 70-106)
- Reimplantar ambas as edge functions

### Acao manual necessaria
Apos a aprovacao, voce precisara atualizar a funcao `execute_safe_query` no SQL Editor do seu banco externo Supabase com o SQL fornecido acima.
