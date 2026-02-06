

# Plano: Corrigir erro de sintaxe por ponto e virgula nas queries

## Problema

O LLM gera queries SQL que terminam com `;` (ponto e virgula). Quando essa query e passada para a funcao `execute_safe_query`, ela e encapsulada assim:

```text
SELECT json_agg(t) FROM (SELECT ... ORDER BY x DESC;) t
                                                    ^
                                          ponto e virgula invalido aqui
```

Isso causa o erro `syntax error at or near ";"` porque o PostgreSQL nao aceita `;` dentro de subqueries.

## O que sera feito

### 1. Sanitizar a query no proxy (camada principal de protecao)

**Arquivo:** `supabase/functions/external-db-proxy/index.ts`

Antes de enviar a query para o RPC, remover o ponto e virgula final e fazer um `trim()`:

```typescript
// Sanitize: remove trailing semicolons and whitespace
const sanitizedQuery = query.trim().replace(/;+\s*$/, "");
```

Isso garante que **qualquer** query que chegue ao banco ja estara limpa, independente do que o LLM gerar.

### 2. Sanitizar tambem no frontend (dupla protecao)

**Arquivo:** `src/components/chat/ChatMessage.tsx`

No `useEffect` de auto-execucao e na funcao `handleExecute`, limpar a query antes de enviar:

```typescript
const sanitizedQuery = query.trim().replace(/;+\s*$/, "");
```

### 3. Atualizar o system prompt do LLM

**Arquivo:** `supabase/functions/chat/index.ts`

Adicionar instrucao explicita para o LLM **nunca** colocar `;` no final das queries SQL. Isso reduz a chance do problema ocorrer na origem:

```text
IMPORTANTE: NUNCA coloque ponto e virgula (;) no final das queries SQL.
O sistema encapsula suas queries automaticamente.
```

## Resumo das mudancas

| Componente | Mudanca |
|---|---|
| `external-db-proxy/index.ts` | Adicionar sanitizacao: remover `;` e espaços finais antes do RPC |
| `ChatMessage.tsx` | Limpar query antes de enviar para execucao |
| `chat/index.ts` | Instruir LLM a nao usar `;` nas queries |

## Secao tecnica

### Detalhes da sanitizacao

A regex `/ ;+\s*$/` remove:
- Um ou mais `;` no final da string
- Qualquer espaco em branco apos o `;`

Exemplos:
- `SELECT * FROM tabela;` -> `SELECT * FROM tabela`
- `SELECT * FROM tabela ;  ` -> `SELECT * FROM tabela`
- `WITH cte AS (...) SELECT ...;` -> `WITH cte AS (...) SELECT ...`

### Arquivos modificados
- `supabase/functions/external-db-proxy/index.ts` (linha 63 - adicionar sanitizacao antes do RPC)
- `src/components/chat/ChatMessage.tsx` (linhas 42 e 85 - sanitizar antes de executar)
- `supabase/functions/chat/index.ts` (linha ~87 - adicionar instrucao no prompt)
- Reimplantar edge functions `external-db-proxy` e `chat`

### Fluxo atualizado

```text
LLM gera: "SELECT ... ORDER BY x DESC;"
        |
        v
  Frontend limpa ";" -> "SELECT ... ORDER BY x DESC"
        |
        v
  external-db-proxy limpa ";" (dupla seguranca)
        |
        v
  execute_safe_query recebe query limpa
        |
        v
  Executa: SELECT json_agg(t) FROM (SELECT ... ORDER BY x DESC) t
        |
        v
  Resultado retornado com sucesso
```
