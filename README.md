# Imobiliaria Digital

Aplicacao full-stack com vitrine publica de imoveis e painel administrativo protegido em `/admin`.

## Requisitos

- Node.js 18
- MongoDB Atlas (ou MongoDB compatível)

## Setup

1. Instale dependencias:
   ```bash
   npm install
   ```
2. Crie seu arquivo de ambiente:
   ```bash
   cp .env.example .env
   ```
3. Preencha as variaveis em `.env`.

## Variaveis de ambiente

Veja `/.env.example`. Principais:

- `MONGODB_URI`: conexao do banco.
- `PORT`: porta do servidor.
- `CORS_ORIGIN`: origem permitida no CORS (uma ou mais, separadas por virgula).
- `ADMIN_USER` e `ADMIN_PASS`: acesso ao `/admin`.
- `LOG_IMOVEIS_FILTERS`: logs de diagnostico do endpoint de listagem.
- `SEED_ON_START`: popula dados iniciais em ambientes nao-producao.

## Scripts

- `npm run dev`: sobe com nodemon.
- `npm start`: sobe em modo normal.
- `npm run lint`: validacao de sintaxe dos arquivos JS.
- `npm test`: smoke tests de API (`/api/imoveis` e autenticacao `/admin`).

## API (resumo)

### `GET /api/imoveis`

Filtros aceitos:

- `cidade`
- `bairro`
- `categoria` (`Venda` ou `Aluguel`)
- `precoMin`
- `precoMax`
- `quartosMin`
- `areaMin`

Paginacao:

- `page` (padrao `1`)
- `limit` (padrao `20`, maximo `100`)

Resposta:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 1
  }
}
```

### `GET /admin`

Rota protegida por Basic Auth usando `ADMIN_USER` e `ADMIN_PASS`.

## Publicacao (checklist minimo)

1. Garantir que `.env` nao esteja versionado.
2. Usar senha forte no admin e HTTPS no ambiente final.
3. Desativar logs de diagnostico (`LOG_IMOVEIS_FILTERS=false`) em producao.
4. Rodar `npm run lint` e `npm test` antes do deploy.
5. Definir `NODE_ENV=production` (seed inicial nao roda em producao).

## Publicar no GitHub

1. Verifique se o repositório local esta limpo e sem segredos:
   ```bash
   git status
   ```
2. Garanta que dependencias locais nao serao versionadas:
   ```bash
   git rm -r --cached node_modules
   ```
3. Faça o commit final:
   ```bash
   git add .
   git commit -m "chore: prepara projeto para publicacao"
   ```
4. Se ainda nao houver repositório remoto:
   ```bash
   git remote add origin https://github.com/<seu-usuario>/<seu-repo>.git
   ```
5. Publique a branch principal:
   ```bash
   git push -u origin main
   ```

Se `.env` com credenciais reais ja foi publicado antes, troque todas as senhas/chaves e reescreva o historico antes de compartilhar com cliente.
