# Mordus Platform

Monorepo com a aplicação web em `apps/web`, a API Fastify em `apps/server` e os pacotes compartilhados em `packages/`.

## Desenvolvimento

Requer Node.js 24 e pnpm 11. Instale dependências e configure o servidor:

```sh
pnpm install
Copy-Item apps/server/.env.example apps/server/.env
pnpm db:start
pnpm db:migrate
pnpm dev
```

A aplicação web fica em `http://localhost:3001`, a API em `http://localhost:3000` e a verificação de saúde em `/health`. A página Sobre está em `/about`.

## Configuração da API

As variáveis ficam em `apps/server/.env`:

- `HOST` e `PORT` definem endereço e porta do servidor.
- `DATABASE_URL` define a conexão PostgreSQL. A API aplica as migrações pendentes ao iniciar.
- `ADMIN_TOKEN` protege as rotas administrativas.
- `COLLECT_RATE_LIMIT` define o limite por IP por minuto para ingestão.
- `LOG_LEVEL` define o nível dos logs e `LOG_DIR` o diretório dos arquivos de log, relativo à raiz do workspace.
- `CORS_ORIGIN` define a origem web autorizada em `GET /`. A ingest?o valida as origens cadastradas em cada cole??o.

`DATABASE_URL` pode apontar para um banco novo ou para um banco existente com o schema da API. O Compose local fornece um banco Mordus separado.

## Banco de dados

O schema e as migrações ficam em `packages/db`. Use `pnpm db:generate` após alterar o schema, `pnpm db:migrate` para aplicar migrações e `pnpm db:studio` para abrir o Drizzle Studio. `pnpm db:push` está disponível para desenvolvimento.

## Comandos

- `pnpm dev`, `pnpm dev:web`, `pnpm dev:server` iniciam os aplicativos.
- `pnpm build` e `pnpm check-types` verificam build e tipos.
- `pnpm test` executa os testes.
- `pnpm check` executa lint e formatação.
- `pnpm docker:build`, `pnpm docker:up`, `pnpm docker:logs`, `pnpm docker:down` gerenciam o Compose.

## Estrutura

```text
apps/web      Frontend React e TanStack Router
apps/server   API Fastify
packages/db   Schema, migrações e acesso PostgreSQL
packages/env  Validação de variáveis de ambiente
packages/ui   Componentes e estilos compartilhados
```
