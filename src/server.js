require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const { z } = require('zod');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());
app.use(xssClean());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Basic ')
    ? authHeader.split(' ')[1]
    : null;

  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || 'admin';

  if (!token) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Autenticacao necessaria.');
  }

  const decoded = Buffer.from(token, 'base64').toString('utf8');
  const [username, password] = decoded.split(':');

  if (username !== user || password !== pass) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Credenciais invalidas.');
  }

  return next();
}

app.use('/admin', adminAuth, express.static(path.join(__dirname, 'public', 'admin')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

app.get('/', (req, res) => {
  res.type('html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const imovelSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: true, trim: true },
    descricao: { type: String, required: true, trim: true },
    preco: { type: Number, default: 0 },
    valorAluguel: { type: Number, default: 0 },
    condominio: { type: Number, default: 0 },
    iptu: { type: Number, default: 0 },
    localizacao: {
      cidade: { type: String, required: true, trim: true },
      bairro: { type: String, required: true, trim: true }
    },
    areaM2: { type: Number, required: true },
    quartos: { type: Number, required: true },
    suites: { type: Number, default: 0 },
    vagas: { type: Number, default: 0 },
    fotos: { type: [String], default: [] },
    mobilado: { type: Boolean, default: false },
    aceitaPet: { type: Boolean, default: false },
    categoria: { type: String, enum: ['Venda', 'Aluguel'], required: true }
  },
  { timestamps: true }
);

const Imovel = mongoose.model('Imovel', imovelSchema);

const chatCache = new Map();
const CHAT_CACHE_VERSION = 'v4';
const CHAT_CACHE_TTL_MS = 5 * 60 * 1000;

function getChatCache(key) {
  const entry = chatCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CHAT_CACHE_TTL_MS) {
    chatCache.delete(key);
    return null;
  }
  return entry.value;
}

function setChatCache(key, value) {
  chatCache.set(key, { ts: Date.now(), value });
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizePriceToken(unitRaw) {
  if (!unitRaw) return '';
  const unit = normalizeText(unitRaw);
  if (unit === 'mil') return 'mil';
  if (['m', 'mi', 'milhao', 'milhoes'].includes(unit)) return 'm';
  return '';
}

function parseNumericToken(raw) {
  if (!raw) return null;
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (Number.isNaN(value)) return null;
  return value;
}

function parsePriceValue(numberRaw, unitRaw) {
  let value = parseNumericToken(numberRaw);
  if (value === null) return null;
  const unit = normalizePriceToken(unitRaw);
  if (unit === 'mil') value *= 1000;
  if (unit === 'm') value *= 1000000;
  return value;
}

function parsePriceFilter(message) {
  const text = normalizeText(message);
  const hasRoomHint = /\bquartos?\b|\bsuites?\b|\bvagas?\b|\bm2\b/.test(text);

  const rangeMatch = text.match(
    /\b(?:de|entre)\s*r?\$?\s*([\d.,]+)\s*(milhoes?|milhao|mi|mil|m)?\s*(?:a|ate|e)\s*r?\$?\s*([\d.,]+)\s*(milhoes?|milhao|mi|mil|m)?\b/i
  );
  if (rangeMatch) {
    const v1 = parsePriceValue(rangeMatch[1], rangeMatch[2]);
    const v2 = parsePriceValue(rangeMatch[3], rangeMatch[4]);
    if (v1 !== null && v2 !== null) {
      return { min: Math.min(v1, v2), max: Math.max(v1, v2) };
    }
  }

  const maxMatch = text.match(
    /(ate|abaixo de|menos de|no maximo|maximo)\s*r?\$?\s*([\d.,]+)\s*(milhoes?|milhao|mi|mil|m)?\b/i
  );
  if (maxMatch) {
    const value = parsePriceValue(maxMatch[2], maxMatch[3]);
    if (value !== null) return { max: value };
  }

  const minMatch = text.match(
    /(a partir de|acima de|mais de)\s*r?\$?\s*([\d.,]+)\s*(milhoes?|milhao|mi|mil|m)?\b/i
  );
  if (minMatch) {
    const value = parsePriceValue(minMatch[2], minMatch[3]);
    if (value !== null) return { min: value };
  }

  const shorthand = text.match(/\bde\s*r?\$?\s*([\d.,]+)\s*(milhoes?|milhao|mi|mil|m)?\b/i);
  if (shorthand && !hasRoomHint) {
    let value = parsePriceValue(shorthand[1], shorthand[2]);
    if (value === null) return null;
    if (!shorthand[2] && value >= 1 && value <= 20) value *= 1000000;
    if (value > 0) {
      return {
        min: value * 0.85,
        max: value * 1.15
      };
    }
  }

  return null;
}

function detectCategory(message) {
  const text = normalizeText(message);
  if (text.includes('aluguel') || text.includes('locacao') || text.includes('locação')) {
    return 'Aluguel';
  }
  if (text.includes('venda') || text.includes('comprar') || text.includes('compra')) {
    return 'Venda';
  }
  return null;
}

function detectTipoImovel(message) {
  const text = normalizeText(message);
  if (text.includes('casa')) return 'casa';
  if (text.includes('apartamento') || text.includes('apto')) return 'apartamento';
  if (text.includes('cobertura')) return 'cobertura';
  if (text.includes('studio') || text.includes('estudio') || text.includes('estúdio')) return 'studio';
  return null;
}

function applyMessageFilters(imoveis, message, strictTipo = false) {
  const text = normalizeText(message);
  const categoria = detectCategory(message);
  const tipo = detectTipoImovel(message);
  const priceFilter = parsePriceFilter(message);

  let result = [...imoveis];

  if (categoria) {
    result = result.filter((i) => i.categoria === categoria);
  }

  if (tipo && strictTipo) {
    result = result.filter((i) => {
      const haystack = normalizeText(`${i.titulo || ''} ${i.descricao || ''}`);
      return haystack.includes(tipo);
    });
  }

  if (priceFilter) {
    result = result.filter((i) => {
      const valor = i.categoria === 'Aluguel' && i.valorAluguel ? i.valorAluguel : i.preco;
      if (priceFilter.min !== undefined && valor < priceFilter.min) return false;
      if (priceFilter.max !== undefined && valor > priceFilter.max) return false;
      return true;
    });
  }

  // Detect bairro/cidade from message by matching known values
  const bairros = new Set(imoveis.map((i) => i.localizacao?.bairro).filter(Boolean));
  const cidades = new Set(imoveis.map((i) => i.localizacao?.cidade).filter(Boolean));

  for (const bairro of bairros) {
    if (text.includes(normalizeText(bairro))) {
      result = result.filter((i) => i.localizacao?.bairro === bairro);
      break;
    }
  }

  for (const cidade of cidades) {
    if (text.includes(normalizeText(cidade))) {
      result = result.filter((i) => i.localizacao?.cidade === cidade);
      break;
    }
  }

  return result;
}
const chatSchema = z.object({
  message: z.string().min(1).max(1000),
  strictTipo: z.boolean().optional(),
  filters: z
    .object({
      cidade: z.string().optional(),
      bairro: z.string().optional(),
      categoria: z.enum(['Venda', 'Aluguel']).optional(),
      precoMin: z.number().optional(),
      precoMax: z.number().optional(),
      quartosMin: z.number().optional(),
      areaMin: z.number().optional()
    })
    .optional()
});

const adminImovelSchema = z.object({
  titulo: z.string().min(3).max(120),
  descricao: z.string().min(10).max(2000),
  preco: z.coerce.number().nonnegative().optional().default(0),
  valorAluguel: z.coerce.number().nonnegative().optional().default(0),
  condominio: z.coerce.number().nonnegative().optional().default(0),
  iptu: z.coerce.number().nonnegative().optional().default(0),
  cidade: z.string().min(2).max(80),
  bairro: z.string().min(2).max(80),
  areaM2: z.coerce.number().positive(),
  quartos: z.coerce.number().int().nonnegative(),
  suites: z.coerce.number().int().nonnegative().default(0),
  vagas: z.coerce.number().int().nonnegative().default(0),
  mobilado: z.enum(['sim', 'nao']).optional().default('nao'),
  aceitaPet: z.enum(['sim', 'nao']).optional().default('nao'),
  fotos: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : []
    ),
  categoria: z.enum(['Venda', 'Aluguel'])
});

const adminFieldLabel = {
  titulo: 'Titulo',
  descricao: 'Descricao',
  preco: 'Preco de venda',
  valorAluguel: 'Valor do aluguel',
  condominio: 'Condominio',
  iptu: 'IPTU',
  cidade: 'Cidade',
  bairro: 'Bairro',
  areaM2: 'Area (m2)',
  quartos: 'Quartos',
  suites: 'Suites',
  vagas: 'Vagas',
  categoria: 'Categoria',
  mobilado: 'Mobilado',
  aceitaPet: 'Aceita pet',
  fotos: 'Fotos'
};

function getAdminFieldNameFromIssue(issue) {
  const [firstPath] = issue.path || [];
  return firstPath ? String(firstPath) : '';
}

function toFriendlyFieldMessage(issue, fieldName) {
  const label = adminFieldLabel[fieldName] || fieldName || 'Campo';

  if (issue.code === 'too_small' && issue.minimum !== undefined) {
    if (issue.type === 'string') {
      return `${label} deve ter pelo menos ${issue.minimum} caracteres.`;
    }
    if (issue.type === 'number') {
      if (issue.inclusive === false) return `${label} deve ser maior que ${issue.minimum}.`;
      return `${label} deve ser maior ou igual a ${issue.minimum}.`;
    }
  }

  if (issue.code === 'invalid_enum_value') {
    return `${label} possui um valor invalido.`;
  }

  if (issue.code === 'invalid_type') {
    return `${label} esta em formato invalido.`;
  }

  if (issue.code === 'invalid_string') {
    return `${label} esta em formato invalido.`;
  }

  return issue.message || `${label} invalido.`;
}

function zodIssuesToFieldMap(zodError) {
  const fields = {};
  zodError.issues.forEach((issue) => {
    const fieldName = getAdminFieldNameFromIssue(issue);
    if (!fieldName || fields[fieldName]) return;
    fields[fieldName] = toFriendlyFieldMessage(issue, fieldName);
  });
  return fields;
}

const storage = multer.diskStorage({
  destination: path.join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 }
});

function buildQueryFromFilters(filters = {}) {
  const query = {};
  if (filters.cidade) query['localizacao.cidade'] = filters.cidade;
  if (filters.bairro) query['localizacao.bairro'] = filters.bairro;
  if (filters.categoria) query.categoria = filters.categoria;
  if (filters.precoMin || filters.precoMax) {
    query.preco = {};
    if (filters.precoMin) query.preco.$gte = filters.precoMin;
    if (filters.precoMax) query.preco.$lte = filters.precoMax;
  }
  if (filters.quartosMin) query.quartos = { $gte: filters.quartosMin };
  if (filters.areaMin) query.areaM2 = { $gte: filters.areaMin };
  return query;
}

function formatImoveisForContext(imoveis) {
  return imoveis.map((i) => ({
    id: i._id.toString(),
    titulo: i.titulo,
    preco: i.preco,
    valorAluguel: i.valorAluguel,
    condominio: i.condominio,
    iptu: i.iptu,
    local: `${i.localizacao.bairro} - ${i.localizacao.cidade}`,
    areaM2: i.areaM2,
    quartos: i.quartos,
    suites: i.suites,
    vagas: i.vagas,
    fotos: i.fotos,
    mobilado: i.mobilado,
    aceitaPet: i.aceitaPet,
    categoria: i.categoria
  }));
}

app.post('/api/ai/chat', async (req, res, next) => {
  try {
    const parsed = chatSchema.parse(req.body);
    const { message, filters, strictTipo } = parsed;

    const cacheKey = JSON.stringify({ v: CHAT_CACHE_VERSION, message, filters });
    const cached = getChatCache(cacheKey);
    if (cached) return res.json(cached);

    const query = buildQueryFromFilters(filters);
    const imoveis = await Imovel.find(query).limit(10).lean();
    let filteredImoveis = imoveis;
    if (message) {
      filteredImoveis = applyMessageFilters(imoveis, message, Boolean(strictTipo));
    }
    const context = formatImoveisForContext(filteredImoveis);

    const responseText = context.length
      ? `Filtro realizado automaticamente com base no solicitado. A lista de imoveis compativeis esta abaixo (${context.length}).`
      : 'Filtro realizado automaticamente com base no solicitado, mas nao encontrei imoveis compativeis agora. Ajuste os criterios e tente novamente.';

    const payload = {
      answer: responseText,
      count: context.length,
      imoveis: context
    };
    setChatCache(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

app.get('/api/imoveis', async (req, res, next) => {
  try {
    const filters = {
      cidade: req.query.cidade,
      bairro: req.query.bairro,
      categoria: req.query.categoria,
      precoMin: req.query.precoMin ? Number(req.query.precoMin) : undefined,
      precoMax: req.query.precoMax ? Number(req.query.precoMax) : undefined,
      quartosMin: req.query.quartosMin ? Number(req.query.quartosMin) : undefined,
      areaMin: req.query.areaMin ? Number(req.query.areaMin) : undefined
    };

    const query = buildQueryFromFilters(filters);
    const imoveis = await Imovel.find(query).sort({ createdAt: -1 }).lean();
    return res.json(imoveis);
  } catch (err) {
    return next(err);
  }
});

app.get('/admin', adminAuth, (req, res) => {
  res.type('html');
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/admin/api/imoveis', adminAuth, async (req, res, next) => {
  try {
    const imoveis = await Imovel.find({})
      .select('titulo categoria localizacao preco valorAluguel createdAt')
      .sort({ createdAt: -1 })
      .lean();
    return res.json(imoveis);
  } catch (err) {
    return next(err);
  }
});

app.delete('/admin/api/imoveis/:id', adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await Imovel.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Imovel nao encontrado.' });
    return res.json({ message: 'Imovel excluido.' });
  } catch (err) {
    return next(err);
  }
});

app.post('/admin', adminAuth, upload.array('fotosFiles', 8), async (req, res, next) => {
  try {
    const parsed = adminImovelSchema.parse(req.body);
    const fileUrls = (req.files || []).map((file) => `/uploads/${file.filename}`);
    const fotos = [...parsed.fotos, ...fileUrls];

    if (parsed.categoria === 'Venda' && (!parsed.preco || parsed.preco <= 0)) {
      return res.status(400).json({
        error: 'Revise os campos obrigatorios.',
        fields: { preco: 'Informe um preco de venda maior que zero.' }
      });
    }
    if (parsed.categoria === 'Aluguel' && (!parsed.valorAluguel || parsed.valorAluguel <= 0)) {
      return res.status(400).json({
        error: 'Revise os campos obrigatorios.',
        fields: { valorAluguel: 'Informe um valor de aluguel maior que zero.' }
      });
    }

    const imovel = await Imovel.create({
      titulo: parsed.titulo,
      descricao: parsed.descricao,
      preco: parsed.preco,
      valorAluguel: parsed.valorAluguel,
      condominio: parsed.condominio,
      iptu: parsed.iptu,
      localizacao: {
        cidade: parsed.cidade,
        bairro: parsed.bairro
      },
      areaM2: parsed.areaM2,
      quartos: parsed.quartos,
      suites: parsed.suites ?? 0,
      vagas: parsed.vagas ?? 0,
      fotos,
      mobilado: parsed.mobilado === 'sim',
      aceitaPet: parsed.aceitaPet === 'sim',
      categoria: parsed.categoria
    });

    return res.status(201).json({
      message: 'Imovel cadastrado com sucesso.',
      id: imovel._id.toString()
    });
  } catch (err) {
    return next(err);
  }
});

app.use((err, req, res, next) => {
  if (err instanceof z.ZodError) {
    const fields = zodIssuesToFieldMap(err);
    return res.status(400).json({
      error: 'Encontramos alguns dados invalidos. Revise os campos destacados.',
      fields
    });
  }

  const status = err?.statusCode || 400;
  const message = err?.message || 'Erro na requisicao.';
  res.status(status).json({ error: message });
});

async function start() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI nao configurada.');
  }

  await mongoose.connect(mongoUri);
  await seedIfEmpty();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`API rodando em http://localhost:${port}`);
  });
}

async function seedIfEmpty() {
  const count = await Imovel.countDocuments();
  if (count > 0) return;

  await Imovel.insertMany([
    {
      titulo: 'Cobertura Panoramica no Centro',
      descricao: 'Cobertura com vista 360, acabamento premium e area gourmet integrada.',
      preco: 1450000,
      localizacao: { cidade: 'Sao Paulo', bairro: 'Centro' },
      areaM2: 210,
      quartos: 3,
      suites: 2,
      vagas: 2,
      fotos: [],
      valorAluguel: 0,
      condominio: 0,
      iptu: 0,
      mobilado: true,
      aceitaPet: false,
      categoria: 'Venda'
    },
    {
      titulo: 'Casa Contemporanea no Jardim Europa',
      descricao: 'Projeto assinado, amplas aberturas e piscina com deck.',
      preco: 3200000,
      localizacao: { cidade: 'Sao Paulo', bairro: 'Jardim Europa' },
      areaM2: 420,
      quartos: 4,
      suites: 4,
      vagas: 4,
      fotos: [],
      valorAluguel: 0,
      condominio: 0,
      iptu: 0,
      mobilado: true,
      aceitaPet: true,
      categoria: 'Venda'
    },
    {
      titulo: 'Apartamento Garden no Itaim',
      descricao: 'Garden com paisagismo, pe direito duplo e automacao residencial.',
      preco: 18000,
      localizacao: { cidade: 'Sao Paulo', bairro: 'Itaim Bibi' },
      areaM2: 180,
      quartos: 2,
      suites: 2,
      vagas: 2,
      fotos: [],
      valorAluguel: 18000,
      condominio: 2200,
      iptu: 650,
      mobilado: false,
      aceitaPet: true,
      categoria: 'Aluguel'
    }
  ]);

  console.log('Seed inicial de imoveis criado.');
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
