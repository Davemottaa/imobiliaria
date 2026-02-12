const form = document.getElementById('imovel-form');
const statusEl = document.getElementById('status');
const clearBtn = document.getElementById('clear-form');
const addFotoBtn = document.getElementById('add-foto');
const fotoUrlInput = document.getElementById('foto-url');
const fotoFileInput = document.getElementById('foto-file');
const fotosList = document.getElementById('fotos-list');
const fotosHidden = document.getElementById('fotos-hidden');
const submitBtn = form?.querySelector('button[type="submit"]');
const categoriaSelect = document.querySelector('select[name="categoria"]');
const precoVendaInput = document.getElementById('preco-venda');
const valorAluguelInput = document.getElementById('valor-aluguel');
const condominioInput = document.getElementById('valor-condominio');
const iptuInput = document.getElementById('valor-iptu');
const vendaFields = document.querySelectorAll('.venda-only');
const aluguelFields = document.querySelectorAll('.aluguel-only');
const adminMode = document.getElementById('admin-mode');
const deletePanel = document.getElementById('delete-panel');
const deleteList = document.getElementById('delete-list');
const reloadListBtn = document.getElementById('reload-list');
const deleteStatusEl = document.getElementById('delete-status');
const confirmModal = document.getElementById('confirm-modal');
const confirmText = document.getElementById('confirm-text');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const confirmDeleteBtn = document.getElementById('confirm-delete');

const fotos = [];
let selectedFiles = [];
let pendingDeleteId = null;
let currentObjectUrls = [];

const MAX_UPLOAD_FILES = 8;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPE_PREFIX = 'image/';

function cleanupObjectUrls() {
  currentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  currentObjectUrls = [];
}

function renderFotos() {
  cleanupObjectUrls();
  fotosList.innerHTML = '';

  if (!fotos.length && !selectedFiles.length) {
    fotosList.innerHTML = '<p class="hint">Nenhuma foto adicionada.</p>';
  }

  fotos.forEach((url, index) => {
    const card = createPhotoCard({
      previewSrc: url,
      label: truncateText(url, 40),
      meta: 'URL',
      removeText: 'Remover URL'
    });
    card.querySelector('button').addEventListener('click', () => {
      fotos.splice(index, 1);
      clearFieldError('fotos');
      renderFotos();
    });
    fotosList.appendChild(card);
  });

  selectedFiles.forEach((file, index) => {
    const fileUrl = URL.createObjectURL(file);
    currentObjectUrls.push(fileUrl);
    const card = createPhotoCard({
      previewSrc: fileUrl,
      label: truncateText(file.name, 40),
      meta: `${formatFileSize(file.size)} | arquivo local`,
      removeText: 'Remover arquivo'
    });
    card.querySelector('button').addEventListener('click', () => {
      selectedFiles.splice(index, 1);
      syncFileInput();
      clearFieldError('fotos');
      renderFotos();
    });
    fotosList.appendChild(card);
  });

  fotosHidden.value = fotos.join(',');
}

function syncFileInput() {
  const dt = new DataTransfer();
  selectedFiles.forEach((file) => dt.items.add(file));
  fotoFileInput.files = dt.files;
}

function toggleCamposCategoria() {
  const categoria = categoriaSelect.value;
  const isVenda = categoria === 'Venda';
  precoVendaInput.required = isVenda;
  valorAluguelInput.required = !isVenda;
  condominioInput.required = false;
  iptuInput.required = false;

  vendaFields.forEach((el) => el.classList.toggle('hidden', !isVenda));
  aluguelFields.forEach((el) => el.classList.toggle('hidden', isVenda));

  if (isVenda) {
    valorAluguelInput.value = '';
    condominioInput.value = '';
    iptuInput.value = '';
  } else {
    precoVendaInput.value = '';
  }
}

function toggleMode() {
  const isAdd = adminMode.value === 'add';
  form.classList.toggle('hidden', !isAdd);
  deletePanel.classList.toggle('hidden', isAdd);
  if (deleteStatusEl) deleteStatusEl.textContent = '';
  if (!isAdd) loadDeleteList();
}

async function loadDeleteList() {
  deleteList.innerHTML = '<p class="hint">Carregando...</p>';
  const response = await fetch('/admin/api/imoveis');
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    deleteList.innerHTML = '<p class="hint">Erro ao carregar lista.</p>';
    return;
  }

  if (!data.length) {
    deleteList.innerHTML = '<p class="hint">Nenhum imovel cadastrado.</p>';
    return;
  }

  deleteList.innerHTML = '';
  data.forEach((imovel) => {
    const item = document.createElement('div');
    item.className = 'delete-item';
    const price =
      imovel.categoria === 'Aluguel'
        ? `Aluguel: R$ ${Number(imovel.valorAluguel || 0).toLocaleString('pt-BR')}`
        : `Venda: R$ ${Number(imovel.preco || 0).toLocaleString('pt-BR')}`;

    item.innerHTML = `
      <div>
        <strong>${imovel.titulo}</strong>
        <div class="hint">${imovel.localizacao?.bairro || ''} - ${imovel.localizacao?.cidade || ''} | ${price}</div>
      </div>
      <button type="button" data-id="${imovel._id}">Excluir</button>
    `;
    item.querySelector('button').addEventListener('click', () => openDeleteConfirm(imovel));
    deleteList.appendChild(item);
  });
}

function openDeleteConfirm(imovel) {
  pendingDeleteId = imovel?._id || null;
  const titulo = imovel?.titulo || 'este imovel';
  const bairro = imovel?.localizacao?.bairro || '';
  const cidade = imovel?.localizacao?.cidade || '';
  confirmText.textContent = `Voce vai excluir "${titulo}" (${bairro} - ${cidade}). Esta acao e permanente.`;
  confirmModal.classList.remove('hidden');
  confirmModal.setAttribute('aria-hidden', 'false');
}

function closeDeleteConfirm() {
  pendingDeleteId = null;
  confirmModal.classList.add('hidden');
  confirmModal.setAttribute('aria-hidden', 'true');
}

function createPhotoCard({ previewSrc, label, meta, removeText }) {
  const card = document.createElement('article');
  card.className = 'photo-card';

  const thumb = document.createElement('div');
  thumb.className = 'photo-thumb';

  const img = document.createElement('img');
  const safePreviewSrc = normalizePreviewSrc(previewSrc);
  if (safePreviewSrc) {
    img.src = safePreviewSrc;
  } else {
    img.removeAttribute('src');
  }
  img.alt = label;
  img.loading = 'lazy';
  thumb.appendChild(img);

  const details = document.createElement('div');
  details.className = 'photo-details';

  const title = document.createElement('strong');
  title.textContent = label;
  details.appendChild(title);

  const info = document.createElement('small');
  info.textContent = meta;
  details.appendChild(info);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'photo-remove';
  removeBtn.textContent = removeText;

  card.appendChild(thumb);
  card.appendChild(details);
  card.appendChild(removeBtn);
  return card;
}

function truncateText(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function isValidImageUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

function normalizePreviewSrc(value) {
  const src = String(value || '').trim();
  if (!src) return '';
  if (src.startsWith('blob:')) return src;
  return isValidImageUrl(src) ? src : '';
}

function buildFileFingerprint(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

addFotoBtn.addEventListener('click', () => {
  const url = fotoUrlInput.value.trim();
  if (!url) return;
  if (!isValidImageUrl(url)) {
    applyFieldErrors({ fotos: 'URL invalida. Use http:// ou https://.' });
    setStatus('error', 'URL de foto invalida.');
    return;
  }
  if (fotos.includes(url)) {
    applyFieldErrors({ fotos: 'Esta URL ja foi adicionada.' });
    setStatus('error', 'URL de foto duplicada.');
    return;
  }
  fotos.push(url);
  clearFieldError('fotos');
  setStatus('', '');
  fotoUrlInput.value = '';
  renderFotos();
});

fotoFileInput.addEventListener('change', () => {
  const newFiles = Array.from(fotoFileInput.files || []);
  if (!newFiles.length) return;

  const seen = new Set(selectedFiles.map((file) => buildFileFingerprint(file)));
  const validFiles = [];
  const errors = [];

  newFiles.forEach((file) => {
    const fingerprint = buildFileFingerprint(file);
    if (seen.has(fingerprint)) {
      errors.push(`"${file.name}" ja foi selecionado.`);
      return;
    }
    if (!file.type.startsWith(ALLOWED_FILE_TYPE_PREFIX)) {
      errors.push(`"${file.name}" nao e uma imagem valida.`);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push(`"${file.name}" excede 5 MB.`);
      return;
    }
    seen.add(fingerprint);
    validFiles.push(file);
  });

  const availableSlots = MAX_UPLOAD_FILES - selectedFiles.length;
  if (availableSlots <= 0) {
    errors.push(`Limite de ${MAX_UPLOAD_FILES} arquivos locais atingido.`);
  } else if (validFiles.length > availableSlots) {
    errors.push(`Apenas ${availableSlots} arquivo(s) pode(m) ser adicionado(s) agora.`);
    validFiles.splice(availableSlots);
  }

  if (validFiles.length) {
    selectedFiles = [...selectedFiles, ...validFiles];
    clearFieldError('fotos');
    setStatus('', '');
  }

  if (errors.length) {
    applyFieldErrors({ fotos: errors[0] });
    setStatus('error', errors[0]);
  }

  renderFotos();
  syncFileInput();
});

categoriaSelect.addEventListener('change', toggleCamposCategoria);
toggleCamposCategoria();
adminMode.addEventListener('change', toggleMode);
reloadListBtn.addEventListener('click', loadDeleteList);
toggleMode();
renderFotos();

clearBtn.addEventListener('click', () => {
  form.reset();
  fotos.length = 0;
  selectedFiles = [];
  cleanupObjectUrls();
  syncFileInput();
  renderFotos();
  clearFieldErrors();
  setStatus('', '');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFieldErrors();
  setStatus('', '');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    sanitizePayload(payload);

    const validationErrors = validatePayload(payload);
    if (Object.keys(validationErrors).length > 0) {
      applyFieldErrors(validationErrors);
      setStatus('error', getFirstValidationMessage(validationErrors));
      return;
    }

    setStatus('', 'Salvando...');

    const response = await fetch('/admin', {
      method: 'POST',
      body: formData
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const serverFieldErrors = normalizeServerFieldErrors(data.fields || {});
      applyFieldErrors(serverFieldErrors);
      setStatus('error', data.error || getFirstValidationMessage(serverFieldErrors) || 'Erro ao salvar.');
      return;
    }

    setStatus('success', `Imovel salvo com id ${data.id}.`);
    form.reset();
    fotos.length = 0;
    selectedFiles = [];
    cleanupObjectUrls();
    syncFileInput();
    renderFotos();
    clearFieldErrors();
  } catch (err) {
    setStatus('error', 'Falha ao enviar. Tente novamente.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

confirmCancelBtn?.addEventListener('click', closeDeleteConfirm);
confirmModal?.addEventListener('click', (event) => {
  if (event.target === confirmModal) closeDeleteConfirm();
});

confirmDeleteBtn?.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  if (deleteStatusEl) deleteStatusEl.textContent = 'Excluindo...';
  const del = await fetch(`/admin/api/imoveis/${pendingDeleteId}`, { method: 'DELETE' });
  const data = await del.json().catch(() => ({}));
  if (!del.ok) {
    if (deleteStatusEl) deleteStatusEl.textContent = data.error || 'Erro ao excluir.';
    return;
  }
  if (deleteStatusEl) deleteStatusEl.textContent = 'Imovel excluido com sucesso.';
  closeDeleteConfirm();
  loadDeleteList();
});

function setStatus(type, message) {
  statusEl.classList.remove('status-error', 'status-success');
  if (type === 'error') statusEl.classList.add('status-error');
  if (type === 'success') statusEl.classList.add('status-success');
  statusEl.textContent = message;
}

function validatePayload(payload) {
  const errors = {};

  const titulo = (payload.titulo || '').trim();
  if (!titulo) errors.titulo = 'Informe o titulo do imovel.';
  else if (titulo.length < 3) errors.titulo = 'Titulo deve ter pelo menos 3 caracteres.';

  const descricao = (payload.descricao || '').trim();
  if (!descricao) errors.descricao = 'Informe uma descricao do imovel.';
  else if (descricao.length < 10) errors.descricao = 'Descricao deve ter pelo menos 10 caracteres.';

  const cidade = (payload.cidade || '').trim();
  if (!cidade) errors.cidade = 'Informe a cidade.';
  else if (cidade.length < 2) errors.cidade = 'Cidade deve ter pelo menos 2 caracteres.';

  const bairro = (payload.bairro || '').trim();
  if (!bairro) errors.bairro = 'Informe o bairro.';
  else if (bairro.length < 2) errors.bairro = 'Bairro deve ter pelo menos 2 caracteres.';

  if (payload.categoria === 'Venda') {
    if (!payload.preco) errors.preco = 'Informe o preco de venda.';
    else if (Number(payload.preco) <= 0) errors.preco = 'Preco de venda deve ser maior que zero.';
  }

  if (payload.categoria === 'Aluguel') {
    if (!payload.valorAluguel) errors.valorAluguel = 'Informe o valor do aluguel.';
    else if (Number(payload.valorAluguel) <= 0) errors.valorAluguel = 'Valor do aluguel deve ser maior que zero.';
  }

  if (!payload.areaM2) errors.areaM2 = 'Informe a area do imovel.';
  else if (Number(payload.areaM2) <= 0) errors.areaM2 = 'Area deve ser maior que zero.';

  if (payload.quartos === '') errors.quartos = 'Informe a quantidade de quartos.';
  else if (!Number.isInteger(Number(payload.quartos)) || Number(payload.quartos) < 0) {
    errors.quartos = 'Quartos deve ser um numero inteiro maior ou igual a zero.';
  }

  if (payload.suites !== '' && (!Number.isInteger(Number(payload.suites)) || Number(payload.suites) < 0)) {
    errors.suites = 'Suites deve ser um numero inteiro maior ou igual a zero.';
  }

  if (payload.vagas !== '' && (!Number.isInteger(Number(payload.vagas)) || Number(payload.vagas) < 0)) {
    errors.vagas = 'Vagas deve ser um numero inteiro maior ou igual a zero.';
  }

  if (selectedFiles.length > MAX_UPLOAD_FILES) {
    errors.fotos = `Voce pode enviar no maximo ${MAX_UPLOAD_FILES} arquivos locais.`;
  }
  if (selectedFiles.some((file) => !file.type.startsWith(ALLOWED_FILE_TYPE_PREFIX))) {
    errors.fotos = 'Todos os arquivos devem ser imagens.';
  }
  if (selectedFiles.some((file) => file.size > MAX_FILE_SIZE_BYTES)) {
    errors.fotos = 'Uma ou mais imagens excedem o limite de 5 MB.';
  }
  if (fotos.some((url) => !isValidImageUrl(url))) {
    errors.fotos = 'Uma ou mais URLs de foto estao invalidas.';
  }

  return errors;
}

function getFieldElement(fieldName) {
  return form.querySelector(`[name="${fieldName}"]`) || form.querySelector(`#${fieldName}`);
}

function getOrCreateFieldErrorEl(fieldName) {
  const fieldEl = getFieldElement(fieldName);
  if (!fieldEl) return null;
  const wrapper = fieldEl.closest('.field') || fieldEl.parentElement;
  if (!wrapper) return null;

  let errorEl = wrapper.querySelector(`.field-error[data-error-for="${fieldName}"]`);
  if (!errorEl) {
    errorEl = document.createElement('small');
    errorEl.className = 'field-error';
    errorEl.dataset.errorFor = fieldName;
    wrapper.appendChild(errorEl);
  }
  return errorEl;
}

function clearFieldErrors() {
  form.querySelectorAll('.field.has-error').forEach((field) => field.classList.remove('has-error'));
  form.querySelectorAll('.field-error').forEach((error) => {
    error.textContent = '';
    error.classList.remove('visible');
  });
}

function clearFieldError(fieldName) {
  const fieldEl = getFieldElement(fieldName);
  const wrapper = fieldEl?.closest('.field');
  if (wrapper) wrapper.classList.remove('has-error');
  const errorEl = form.querySelector(`.field-error[data-error-for="${fieldName}"]`);
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }
}

function applyFieldErrors(errors) {
  const entries = Object.entries(errors || {});
  if (!entries.length) return;

  let firstField = null;
  entries.forEach(([fieldName, message]) => {
    const fieldEl = getFieldElement(fieldName);
    const wrapper = fieldEl?.closest('.field');
    if (wrapper) wrapper.classList.add('has-error');

    const errorEl = getOrCreateFieldErrorEl(fieldName);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }

    if (!firstField && fieldEl && fieldEl.type !== 'hidden') firstField = fieldEl;
  });

  if (firstField) {
    firstField.focus();
    return;
  }
  if (errors.fotos) fotoUrlInput?.focus();
}

function normalizeServerFieldErrors(serverFields) {
  const mapped = {};
  Object.entries(serverFields).forEach(([name, message]) => {
    if (!message) return;
    mapped[name] = message;
  });
  return mapped;
}

function getFirstValidationMessage(errors) {
  const first = Object.values(errors || {}).find((value) => Boolean(value));
  return first || 'Revise os campos destacados e tente novamente.';
}

function sanitizePayload(payload) {
  const keys = [
    'titulo',
    'descricao',
    'cidade',
    'bairro',
    'categoria',
    'mobilado',
    'aceitaPet',
    'fotos'
  ];
  keys.forEach((key) => {
    if (payload[key]) payload[key] = sanitizeInput(String(payload[key]));
  });
}

function sanitizeInput(value) {
  return value.replace(/[<>]/g, '');
}

function handleFieldInteraction(target) {
  if (!target) return;
  const fieldName = target.name;
  if (fieldName) {
    clearFieldError(fieldName);
  }
  if (fieldName === 'fotosFiles' || target.id === 'foto-url') {
    clearFieldError('fotos');
  }
}

form?.addEventListener('input', (event) => handleFieldInteraction(event.target));
form?.addEventListener('change', (event) => handleFieldInteraction(event.target));
