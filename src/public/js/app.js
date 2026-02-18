const cardsVendaEl = document.getElementById('cards-venda');
const cardsAluguelEl = document.getElementById('cards-aluguel');
const btnScroll = document.getElementById('btn-scroll');
const btnChat = document.getElementById('btn-chat');
const chatText = document.getElementById('chat-text');
const chatSend = document.getElementById('chat-send');
const chatStatus = document.getElementById('chat-status');
const chatMessages = document.getElementById('chat-messages');
const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const modalClose = document.getElementById('modal-close');
const imageModal = document.getElementById('image-modal');
const imageModalImg = document.getElementById('image-modal-img');
const imageModalCaption = document.getElementById('image-modal-caption');
const imageModalClose = document.getElementById('image-modal-close');
const imagePrev = document.getElementById('image-prev');
const imageNext = document.getElementById('image-next');

let activeGalleryImages = [];
let activeGalleryTitle = '';
let currentImageIndex = 0;
let currentPropertyImages = [];
let currentPropertyImageIndex = 0;

const filters = {
  cidade: document.getElementById('f-cidade'),
  bairro: document.getElementById('f-bairro'),
  categoria: document.getElementById('f-categoria'),
  precoMax: document.getElementById('f-preco-max')
};

btnScroll?.addEventListener('click', () => {
  document.getElementById('vitrine')?.scrollIntoView({ behavior: 'smooth' });
});

btnChat?.addEventListener('click', () => {
  document.getElementById('vitrine')?.scrollIntoView({ behavior: 'smooth' });
});

navToggle?.addEventListener('click', () => {
  navMenu?.classList.toggle('open');
});

modalClose?.addEventListener('click', () => {
  modal.classList.add('hidden');
});

modal?.addEventListener('click', (event) => {
  if (event.target === modal) modal.classList.add('hidden');
});

async function loadImoveis() {
  const params = new URLSearchParams();
  if (filters.cidade.value) params.append('cidade', sanitizeInput(filters.cidade.value));
  if (filters.bairro.value) params.append('bairro', sanitizeInput(filters.bairro.value));
  if (filters.categoria.value) params.append('categoria', sanitizeInput(filters.categoria.value));
  if (filters.precoMax.value) params.append('precoMax', sanitizeInput(filters.precoMax.value));

  const response = await fetch(`/api/imoveis?${params.toString()}`);
  const data = await response.json();
  const imoveis = Array.isArray(data) ? data : data?.data || [];
  renderImoveis(imoveis);
}

function openModal(imovel) {
  const fotos = imovel.fotos && imovel.fotos.length ? imovel.fotos : [];
  activeGalleryImages = fotos;
  activeGalleryTitle = imovel.titulo || 'Imovel';
  currentPropertyImages = fotos;
  currentPropertyImageIndex = 0;

  const mediaSection = fotos.length
    ? `
      <div class="property-media">
        <button id="property-prev" class="property-photo-nav prev" type="button" aria-label="Foto anterior">&#10094;</button>
        <button id="property-photo-trigger" class="property-photo-trigger" type="button" aria-label="Ampliar foto">
          <img id="property-photo-img" src="" alt="${escapeAttr(imovel.titulo)}" />
        </button>
        <button id="property-next" class="property-photo-nav next" type="button" aria-label="Proxima foto">&#10095;</button>
        <div id="property-photo-counter" class="property-photo-counter"></div>
      </div>
    `
    : `<div class="property-empty">Sem fotos cadastradas.</div>`;

  const priceSection =
    imovel.categoria === 'Aluguel'
      ? `
          <li><strong>Aluguel:</strong> R$ ${imovel.valorAluguel?.toLocaleString('pt-BR') || 0}</li>
          <li><strong>Condominio:</strong> R$ ${imovel.condominio?.toLocaleString('pt-BR') || 0}</li>
          <li><strong>IPTU:</strong> R$ ${imovel.iptu?.toLocaleString('pt-BR') || 0}</li>
        `
      : `<li><strong>Preco de venda:</strong> R$ ${imovel.preco.toLocaleString('pt-BR')}</li>`;

  modalContent.innerHTML = `
    <article class="modal-layout">
      <div class="modal-main">
        ${mediaSection}
        <div class="modal-bottom">
          <section class="modal-details-left">
            <h3 class="modal-title">${escapeHTML(imovel.titulo)}</h3>
            <div class="modal-location">${escapeHTML(imovel.localizacao.bairro)} - ${escapeHTML(imovel.localizacao.cidade)}</div>
            <p class="modal-description">${escapeHTML(imovel.descricao || '')}</p>
            <ul class="modal-details-list">
              ${priceSection}
              <li><strong>Area:</strong> ${imovel.areaM2} m2</li>
              <li><strong>Quartos:</strong> ${imovel.quartos}</li>
              <li><strong>Suites:</strong> ${imovel.suites}</li>
              <li><strong>Vagas:</strong> ${imovel.vagas}</li>
              <li><strong>Mobilado:</strong> ${imovel.mobilado ? 'Sim' : 'Nao'}</li>
              <li><strong>Aceita pet:</strong> ${imovel.aceitaPet ? 'Sim' : 'Nao'}</li>
              <li><strong>Categoria:</strong> ${imovel.categoria}</li>
            </ul>
          </section>
          <aside class="modal-contact-right">
            <h4>Fale com um corretor</h4>
            <p>Preencha os dados para abrir o WhatsApp com este imovel.</p>
            <form id="modal-contact-form" class="modal-contact-form">
              <label for="contact-name">Nome</label>
              <input id="contact-name" name="name" type="text" placeholder="Seu nome" required />
              <label for="contact-email">Email</label>
              <input id="contact-email" name="email" type="email" placeholder="voce@email.com" required />
              <label for="contact-phone">Telefone</label>
              <input id="contact-phone" name="phone" type="tel" placeholder="(11) 99999-9999" required />
              <button type="submit" class="btn">Chamar no WhatsApp</button>
            </form>
          </aside>
        </div>
      </div>
    </article>
  `;

  if (fotos.length) {
    modalContent.querySelector('#property-prev')?.addEventListener('click', () => {
      currentPropertyImageIndex -= 1;
      updatePropertyModalImage();
    });
    modalContent.querySelector('#property-next')?.addEventListener('click', () => {
      currentPropertyImageIndex += 1;
      updatePropertyModalImage();
    });
    modalContent.querySelector('#property-photo-trigger')?.addEventListener('click', () => {
      openImageModal(currentPropertyImageIndex);
    });
    updatePropertyModalImage();
  }
  modalContent.querySelector('#modal-contact-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = sanitizeInput(form.elements.name.value.trim());
    const email = sanitizeInput(form.elements.email.value.trim());
    const phone = sanitizeInput(form.elements.phone.value.trim());
    if (!name || !email || !phone) return;

    const wppHref = document.getElementById('whatsapp-float')?.getAttribute('href') || 'https://wa.me/5500000000000';
    const waBase = wppHref.split('?')[0];
    const info = [
      'Ola, tenho interesse neste imovel:',
      imovel.titulo,
      `${imovel.localizacao?.bairro || ''} - ${imovel.localizacao?.cidade || ''}`,
      '',
      `Nome: ${name}`,
      `Email: ${email}`,
      `Telefone: ${phone}`
    ].join('\n');
    const targetUrl = `${waBase}?text=${encodeURIComponent(info)}`;
    window.open(targetUrl, '_blank', 'noopener');
  });

  modal.classList.remove('hidden');
}

function updatePropertyModalImage() {
  if (!currentPropertyImages.length) return;
  const total = currentPropertyImages.length;
  if (currentPropertyImageIndex < 0) currentPropertyImageIndex = total - 1;
  if (currentPropertyImageIndex >= total) currentPropertyImageIndex = 0;

  const imgEl = modalContent.querySelector('#property-photo-img');
  const counterEl = modalContent.querySelector('#property-photo-counter');
  if (imgEl) imgEl.src = currentPropertyImages[currentPropertyImageIndex];
  if (counterEl) counterEl.textContent = `${currentPropertyImageIndex + 1} / ${total}`;
}

function openImageModal(index) {
  if (!activeGalleryImages.length) return;
  currentImageIndex = index;
  updateImageModal();
  imageModal.classList.remove('hidden');
  imageModal.setAttribute('aria-hidden', 'false');
}

function closeImageModal() {
  imageModal.classList.add('hidden');
  imageModal.setAttribute('aria-hidden', 'true');
}

function updateImageModal() {
  const total = activeGalleryImages.length;
  if (!total) return;

  if (currentImageIndex < 0) currentImageIndex = total - 1;
  if (currentImageIndex >= total) currentImageIndex = 0;

  const src = activeGalleryImages[currentImageIndex];
  imageModalImg.src = src;
  imageModalImg.alt = `${activeGalleryTitle} - foto ${currentImageIndex + 1}`;
  imageModalCaption.textContent = `${activeGalleryTitle} | ${currentImageIndex + 1} de ${total}`;
}

function goToPreviousImage() {
  currentImageIndex -= 1;
  updateImageModal();
}

function goToNextImage() {
  currentImageIndex += 1;
  updateImageModal();
}

let aiQueryCount = 0;

async function sendChat() {
  const text = sanitizeInput(chatText.value.trim()).slice(0, 1000);
  if (!text) return;

  appendMessage(text, 'user');
  chatStatus.textContent = 'Filtrando imoveis automaticamente...';

  const payload = { message: text, strictTipo: aiQueryCount > 0 };
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  chatStatus.textContent = '';
  appendMessage(
    data.answer ||
      'Filtro realizado automaticamente com base no solicitado. A lista de imoveis compativeis esta abaixo.',
    'bot'
  );
  if (Array.isArray(data.imoveis)) {
    appendImoveisList(data.imoveis);
    renderImoveis(
      data.imoveis.map((item) => ({
        titulo: item.titulo,
        descricao: '',
        preco: item.preco || 0,
        valorAluguel: item.valorAluguel || 0,
        condominio: item.condominio || 0,
        iptu: item.iptu || 0,
        localizacao: {
          cidade: item.local?.split(' - ')[1] || '',
          bairro: item.local?.split(' - ')[0] || ''
        },
        areaM2: item.areaM2 || 0,
        quartos: item.quartos || 0,
        suites: item.suites || 0,
        vagas: item.vagas || 0,
        fotos: item.fotos || [],
        mobilado: item.mobilado || false,
        aceitaPet: item.aceitaPet || false,
        categoria: item.categoria || 'Venda'
      }))
    );
  }
  aiQueryCount += 1;
  chatText.value = '';
}

chatSend?.addEventListener('click', sendChat);
chatText?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') sendChat();
});

imageModalClose?.addEventListener('click', closeImageModal);
imagePrev?.addEventListener('click', goToPreviousImage);
imageNext?.addEventListener('click', goToNextImage);
imageModal?.addEventListener('click', (event) => {
  if (event.target === imageModal) closeImageModal();
});

document.addEventListener('keydown', (event) => {
  if (imageModal?.classList.contains('hidden')) return;
  if (event.key === 'Escape') closeImageModal();
  if (event.key === 'ArrowLeft') goToPreviousImage();
  if (event.key === 'ArrowRight') goToNextImage();
});


document.getElementById('f-aplicar')?.addEventListener('click', loadImoveis);

loadImoveis();

function renderImoveis(data) {
  cardsVendaEl.innerHTML = '';
  cardsAluguelEl.innerHTML = '';
  if (!data.length) {
    cardsVendaEl.innerHTML = '<p>Nenhum imovel encontrado.</p>';
    cardsAluguelEl.innerHTML = '<p>Nenhum imovel encontrado.</p>';
    return;
  }

  const vendas = data.filter((imovel) => imovel.categoria === 'Venda');
  const alugueis = data.filter((imovel) => imovel.categoria === 'Aluguel');

  function renderCard(imovel, container) {
    const cover = imovel.fotos && imovel.fotos.length ? imovel.fotos[0] : '';
    const card = document.createElement('div');
    card.className = 'card';
    const isAluguel = imovel.categoria === 'Aluguel';
    const priceText = isAluguel
      ? `Aluguel: R$ ${imovel.valorAluguel?.toLocaleString('pt-BR') || 0}`
      : `Venda: R$ ${imovel.preco.toLocaleString('pt-BR')}`;
    card.innerHTML = `
      <div class="card-image">
        ${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(imovel.titulo)}" />` : `<div class="card-placeholder">Sem foto</div>`}
      </div>
      <h4>${escapeHTML(imovel.titulo)}</h4>
      <p>${escapeHTML(imovel.localizacao.bairro)} - ${escapeHTML(imovel.localizacao.cidade)}</p>
      <p>${priceText}</p>
      <div class="badge">${imovel.categoria}</div>
    `;
    card.addEventListener('click', () => openModal(imovel));
    container.appendChild(card);
  }

  vendas.forEach((imovel) => renderCard(imovel, cardsVendaEl));
  alugueis.forEach((imovel) => renderCard(imovel, cardsAluguelEl));
}

function sanitizeInput(value) {
  return value.replace(/[<>]/g, '');
}

function appendMessage(text, type) {
  if (!chatMessages) return;
  const bubble = document.createElement('div');
  bubble.className = `ai-bubble ${type}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendImoveisList(imoveis) {
  if (!chatMessages) return;
  if (!imoveis.length) return;
  const lines = imoveis.map((item) => {
    const [bairro, cidade] = (item.local || '').split(' - ');
    const valor =
      item.categoria === 'Aluguel'
        ? item.valorAluguel || 0
        : item.preco || 0;
    const label = item.categoria === 'Aluguel' ? 'Aluguel' : 'Venda';
    return `${cidade || ''} - ${label}: R$ ${Number(valor).toLocaleString('pt-BR')}`;
  });
  const bubble = document.createElement('div');
  bubble.className = 'ai-bubble bot';
  bubble.textContent = lines.join('\\n');
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, '&#96;');
}

// Canvas animation
const canvas = document.getElementById('hero-canvas');
const ctx = canvas.getContext('2d');
let width = 0;
let height = 0;
const dots = Array.from({ length: 800 }).map(() => ({
  x: Math.random() * 1,
  y: Math.random() * 1,
  vx: (Math.random() - 0.5) * 0.001,
  vy: (Math.random() - 0.5) * 0.001,
  r: Math.random() * 2 + 0.5
}));

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,175, 0, 0.55)';
  dots.forEach((d) => {
    d.x += d.vx;
    d.y += d.vy;
    if (d.x < 0 || d.x > 1) d.vx *= -1;
    if (d.y < 0 || d.y > 1) d.vy *= -1;
    ctx.beginPath();
    ctx.arc(d.x * width, d.y * height, d.r, 0, Math.PI * 2);
    ctx.fill();
  });
  requestAnimationFrame(draw);
}

window.addEventListener('resize', resize);
resize();
draw();
