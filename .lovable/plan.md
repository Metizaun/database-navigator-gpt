
# Agente Analista de Banco de Dados

## Visão Geral
Um assistente de chat inteligente que analisa e consulta seu banco de dados Supabase, com interface estilo ChatGPT em dark mode. O agente conhece toda a estrutura do seu banco e pode fazer consultas complexas, criar views e analisar dados.

---

## Funcionalidades Principais

### 1. Chat Interface (Estilo ChatGPT Dark Mode)
- Design escuro com cor de destaque verde (#10A37F)
- Mensagens do usuário em caixas arredondadas à direita
- Respostas do agente limpas à esquerda, com suporte a markdown
- Input fixo na parte inferior com campo de texto expansível
- Animações suaves de entrada das mensagens
- Renderização de código com syntax highlighting

### 2. Agente de Análise de Banco de Dados
- **Consultas SELECT**: Queries complexas com JOINs, agregações, filtros
- **Criação de Views**: Permite criar views para análises recorrentes
- **Análise de Schema**: Lista schemas, tabelas, colunas, tipos de dados
- **Insights**: Sugestões de otimização e análise de performance
- **Bloqueios**: INSERT e DELETE são bloqueados pelo sistema

### 3. Cache de Metadados
- Carregamento automático da estrutura do banco ao iniciar
- Lista de todas as tabelas e colunas disponíveis
- O agente "conhece" seu banco para fazer sugestões inteligentes
- Refresh manual dos metadados quando necessário

### 4. Histórico de Conversas
- Conversas salvas no banco de dados
- Lista de conversas anteriores na sidebar
- Possibilidade de continuar conversas antigas
- Opção de criar nova conversa

### 5. Aba Admin - Configurações de LLM
- **Seleção de Provedor**: Toggle entre OpenAI e Google Gemini
- **Modelos Disponíveis**:
  - OpenAI: GPT-4o, GPT-4o-mini, GPT-4 Turbo
  - Google: Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash
- **Campo de API Key**: Input seguro para inserir sua chave
- Validação de chave antes de salvar
- Indicador visual de conexão ativa

---

## Layout da Interface

### Tela Principal
```
┌─────────────────────────────────────────────────┐
│  🗄️ DB Analyst        [Histórico] [Admin]       │
├─────────────────────────────────────────────────┤
│                                                 │
│  ○ Olá! Sou seu analista de banco de dados.    │
│    Posso ajudar você com consultas, criar      │
│    views e analisar sua estrutura de dados.    │
│                                                 │
│                    ┌─────────────────────────┐  │
│                    │ Quais tabelas existem?  │  │
│                    └─────────────────────────┘  │
│                                                 │
│  ○ Encontrei 12 tabelas no seu banco:          │
│    • users (5 colunas)                         │
│    • orders (8 colunas)                        │
│    • products (6 colunas)                      │
│    ...                                         │
│                                                 │
├─────────────────────────────────────────────────┤
│  [                Digite sua mensagem...     →] │
└─────────────────────────────────────────────────┘
```

### Tela Admin
```
┌─────────────────────────────────────────────────┐
│  ⚙️ Configurações                    [← Voltar] │
├─────────────────────────────────────────────────┤
│                                                 │
│  Provedor de LLM                                │
│  ┌──────────────────────────────────────────┐   │
│  │  [OpenAI]          [Google Gemini]       │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  Modelo                                         │
│  ┌──────────────────────────────────────────┐   │
│  │  GPT-4o                              ▼   │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  API Key                                        │
│  ┌──────────────────────────────────────────┐   │
│  │  sk-••••••••••••••••••••••••••••••••     │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│         ● Conexão ativa                         │
│                                                 │
│              [ Salvar Configurações ]           │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Fluxo do Usuário

1. **Primeiro Acesso**: Usuário é direcionado para Admin para configurar API key
2. **Configuração**: Escolhe provedor, modelo e insere a chave
3. **Cache Inicial**: Sistema carrega metadados do banco automaticamente
4. **Interação**: Usuário faz perguntas sobre o banco de dados
5. **Histórico**: Conversas são salvas automaticamente para consulta futura

---

## Estrutura Técnica

### Tabelas no Supabase
- `conversations`: Armazena as conversas
- `messages`: Armazena mensagens de cada conversa
- `llm_settings`: Armazena configurações de LLM (chave criptografada)
- `database_metadata_cache`: Cache da estrutura do banco

### Edge Functions
- `chat`: Processa mensagens e chama a LLM escolhida
- `fetch-metadata`: Busca estrutura do banco de dados
- `execute-query`: Executa queries seguras (apenas SELECT e CREATE VIEW)

---

## Segurança
- API keys armazenadas de forma segura nas configurações
- Queries validadas no backend - apenas SELECT e CREATE VIEW permitidos
- INSERT, DELETE, UPDATE, DROP, TRUNCATE são bloqueados
- Logs de todas as queries executadas
