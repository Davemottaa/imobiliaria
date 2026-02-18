const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

const {
  adminAuth,
  listImoveisHandler,
  setImovelStoreForTesting
} = require('../src/server');

function buildFakeQueryChain(data, seenQueryRef) {
  return {
    sort() {
      return this;
    },
    skip(value) {
      seenQueryRef.skip = value;
      return this;
    },
    limit(value) {
      seenQueryRef.limit = value;
      return this;
    },
    select() {
      return this;
    },
    lean: async () => data
  };
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('smoke: /api/imoveis retorna dados paginados', async () => {
  const seen = { query: null, skip: null, limit: null };
  const fakeRows = [
    {
      _id: '507f1f77bcf86cd799439011',
      titulo: 'Casa Teste',
      categoria: 'Venda',
      preco: 1000000,
      valorAluguel: 0,
      localizacao: { cidade: 'Sao Paulo', bairro: 'Centro' }
    }
  ];

  setImovelStoreForTesting({
    countDocuments: async () => 1,
    find(query) {
      seen.query = query;
      return buildFakeQueryChain(fakeRows, seen);
    }
  });
  const req = {
    query: {
      categoria: 'Venda',
      precoMax: '1000000',
      page: '1',
      limit: '10'
    }
  };
  const res = createMockResponse();
  let nextError = null;

  await listImoveisHandler(req, res, (err) => {
    nextError = err;
  });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body.data), true);
  assert.equal(res.body.pagination.page, 1);
  assert.equal(res.body.pagination.limit, 10);
  assert.equal(res.body.pagination.total, 1);
  assert.equal(res.body.pagination.totalPages, 1);
  assert.equal(seen.limit, 10);
  assert.equal(seen.skip, 0);
  assert.deepEqual(seen.query, {
    categoria: 'Venda',
    preco: { $lte: 1000000 }
  });

  setImovelStoreForTesting();
});

test('smoke: /admin exige auth e aceita credencial valida', async () => {
  const unauthorizedReq = { headers: {} };
  const unauthorizedRes = createMockResponse();
  let unauthorizedNextCalled = false;

  adminAuth(unauthorizedReq, unauthorizedRes, () => {
    unauthorizedNextCalled = true;
  });

  assert.equal(unauthorizedRes.statusCode, 401);
  assert.equal(unauthorizedNextCalled, false);

  const authHeader = `Basic ${Buffer.from(
    `${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`,
    'utf8'
  ).toString('base64')}`;
  const authorizedReq = { headers: { authorization: authHeader } };
  const authorizedRes = createMockResponse();
  let authorizedNextCalled = false;

  adminAuth(authorizedReq, authorizedRes, () => {
    authorizedNextCalled = true;
  });
  assert.equal(authorizedRes.statusCode, 200);
  assert.equal(authorizedNextCalled, true);
});
