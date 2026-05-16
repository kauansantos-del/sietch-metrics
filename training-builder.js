// =====================================================================
//  training-builder.js — Wizard completo de criação de treinamento
//
//  Implementa o fluxo descrito em task-criacao-treinamento.md:
//   Etapa 1: Informações básicas
//   Etapa 2: Builder de módulos (5 tipos)
//   Etapa 3: Configurações
//   Etapa 4: Revisão + publicação
//
//  Vídeo: provider (YouTube/Vimeo/Upload) com oEmbed real
//  (task-embed-video.md §4)
// =====================================================================

(function () {
  'use strict';

  // ─── Catálogo de categorias / tracks ─────────────────────────────────

  const CATEGORIES = [
    { value: 'COMPLIANCE',     label: 'Compliance' },
    { value: 'CYBER_SECURITY', label: 'Cyber Security' },
    { value: 'PENTEST',        label: 'Pentest' },
    { value: 'DEV_FRONTEND',   label: 'Dev Frontend' },
    { value: 'DEV_BACKEND',    label: 'Dev Backend' },
    { value: 'LIDERANCA',      label: 'Liderança' },
    { value: 'SOFT_SKILLS',    label: 'Soft Skills' },
    { value: 'OUTROS',         label: 'Outros' },
  ];

  const MODULE_TYPES = [
    { value: 'VIDEO',   label: 'Vídeo',                icon: '▶', desc: 'Embed do YouTube/Vimeo ou upload' },
    { value: 'ARTICLE', label: 'Artigo',               icon: '◎', desc: 'Texto markdown com anexos' },
    { value: 'QUIZ',    label: 'Quiz',                 icon: '?', desc: 'Verificação de conhecimentos (≥ 3 questões)' },
    { value: 'TASK',    label: 'Tarefa prática',       icon: '⌘', desc: 'Submissão de texto, link ou arquivo' },
    { value: 'POLICY',  label: 'Política',             icon: '§', desc: 'Aceite formal auditável' },
  ];

  // ─── Estado global do wizard + persistência ──────────────────────────

  let state = null;
  const STORAGE_KEY = 'sietch_builder_draft_v1';

  function serializeState() {
    if (!state) return null;
    // Não serializa erros nem flags efêmeras
    return JSON.stringify({
      mode: state.mode,
      trainingId: state.trainingId,
      step: state.step,
      meta: state.meta,
      modules: state.modules,
      settings: state.settings,
      _toolbarOpen: state._toolbarOpen,
      _savedAt: Date.now(),
    });
  }
  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      // Validade: 7 dias
      if (parsed._savedAt && Date.now() - parsed._savedAt > 7 * 24 * 3600 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch { return null; }
  }
  function clearSavedState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
  let _saveTimer = null;
  function saveStateDebounced() {
    if (!state) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      try {
        const s = serializeState();
        if (s) localStorage.setItem(STORAGE_KEY, s);
      } catch (e) {
        // Quota cheia, etc — ignora silenciosamente
      }
    }, 400);
  }

  function newDraftState() {
    return {
      mode: 'create', // 'create' | 'edit'
      trainingId: null,
      step: 1,
      meta: {
        title: '',
        description: '',
        category: '',
        tags: [],
        coverUrl: '',
        policyRef: '',
        language: 'pt-BR',
      },
      modules: [],            // { tempId, type, title, description, durationMin, isRequired, payload, savedId?, expanded? }
      settings: {
        isMandatory: false,
        deadlineDays: 30,
        passingScore: 70,
        maxAttempts: 0,
        visibility: 'ALL',
        hasCertificate: false,
        recurrence: { kind: 'never' },
      },
      validation: null,       // resposta do POST /trainings/:id/validate
      saving: false,
      errors: {},             // { fieldKey: 'mensagem', _general: 'banner top' }
    };
  }

  // ─── Erros: helpers ──────────────────────────────────────────────────

  function hasErr(key) { return !!state.errors?.[key]; }
  function errMsg(key) { return state.errors?.[key] || ''; }
  function fieldCls(key, opts) {
    // Estado verde/vermelho/neutro por contador (min/max) ou erro do state
    if (opts && opts.value != null && opts.min != null) {
      const len = String(opts.value || '').length;
      if (len > 0 && len >= opts.min && (opts.max == null || len <= opts.max)) {
        return 'sb-field sb-field--valid';
      }
    }
    return hasErr(key) ? 'sb-field sb-field--has-error' : 'sb-field';
  }
  function renderErr(key) {
    // Mantido só pra campos sem contador (ex: select de categoria)
    return hasErr(key) ? `<div class="sb-field__error">${esc(errMsg(key))}</div>` : '';
  }
  function counterState(len, min, max) {
    if (max != null && len > max) return 'over';
    if (len === 0) return 'empty';
    if (len < min) return 'short';
    return 'valid';
  }
  function renderCounter(value, min, max, errKey) {
    const len = String(value || '').length;
    const st = counterState(len, min, max);
    const total = max != null ? `/${max}` : '';
    const hint = min > 0 && len < min ? ` · mín ${min}` : '';
    return `
      <div class="sb-counter sb-counter--${st}"
        data-counter-for="${errKey || ''}" data-min="${min}" data-max="${max != null ? max : ''}">
        <span class="sb-counter__num">${len}${total}</span><span class="sb-counter__hint">${hint}</span>
      </div>
    `;
  }
  function renderBanner() {
    if (!state.errors?._general) return '';
    return `<div class="sb-banner-error">${esc(state.errors._general)}</div>`;
  }
  function clearErr(key) {
    if (!state.errors) return;
    if (state.errors[key]) { delete state.errors[key]; }
  }
  function clearAllErrs() { state.errors = {}; }
  function setErrs(errs) { state.errors = errs || {}; }
  function hasAnyErrs(errs) { return errs && Object.keys(errs).length > 0; }
  function scrollFirstError() {
    requestAnimationFrame(() => {
      // Prioriza o primeiro campo com erro inline. Evita scrollar pro topo.
      const el = document.querySelector('.sb-field--has-error');
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Tenta focar o input dentro
        const input = el.querySelector('input, textarea, select');
        if (input) try { input.focus({ preventScroll: true }); } catch {}
      }
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function $(sel, root) { return (root || document).querySelector(sel); }

  function withId(id, html) { return html.replace('__ID__', id); }

  // ─── Stepper visual ──────────────────────────────────────────────────

  function renderStepper() {
    const steps = [
      { n: 1, label: 'Informações básicas' },
      { n: 2, label: 'Módulos' },
      { n: 3, label: 'Configurações' },
      { n: 4, label: 'Revisão' },
    ];

    return `
      <div class="sb-stepper">
        ${steps.map((s, i) => `
          ${i > 0 ? '<div class="sb-stepper__sep"></div>' : ''}
          <button type="button"
                  class="sb-stepper__step ${state.step === s.n ? 'is-active' : ''} ${state.step > s.n ? 'is-done' : ''}"
                  onclick="SietchBuilder.goTo(${s.n})">
            <span class="sb-stepper__num">${state.step > s.n
              ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
              : s.n}</span>
            <span>${s.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  // ─── Etapa 1: Informações básicas ────────────────────────────────────

  function renderStep1() {
    const m = state.meta;
    return `
      <div class="sb-form">
        ${renderBanner()}

        <div class="${fieldCls('title', { value: m.title, min: 3, max: 80 })}" data-field-key="title">
          <label class="sb-label">Título <span class="sb-req">*</span></label>
          <input id="sb-title" type="text" maxlength="80"
            value="${esc(m.title)}"
            data-validate-min="3" data-validate-max="80"
            oninput="SietchBuilder.bindMeta('title', this.value, this, 3, 80)"
            placeholder="Ex: Fundamentos de Cyber Security">
          ${renderCounter(m.title, 3, 80, 'title')}
        </div>

        <div class="${fieldCls('description', { value: m.description, min: 20, max: 500 })}" data-field-key="description">
          <label class="sb-label">Descrição <span class="sb-req">*</span></label>
          <textarea id="sb-desc" maxlength="500"
            data-validate-min="20" data-validate-max="500"
            oninput="SietchBuilder.bindMeta('description', this.value, this, 20, 500)"
            placeholder="O que o colaborador vai aprender? Em quais situações vai aplicar?"
            style="min-height:100px;">${esc(m.description)}</textarea>
          ${renderCounter(m.description, 20, 500, 'description')}
        </div>

        <div class="sb-grid-2">
          <div class="${fieldCls('category')}">
            <label class="sb-label">Categoria <span class="sb-req">*</span></label>
            <select id="sb-category" onchange="SietchBuilder.bindMeta('category', this.value, this)">
              <option value="">Selecionar…</option>
              ${CATEGORIES.map(c => `
                <option value="${c.value}" ${m.category === c.value ? 'selected' : ''}>${c.label}</option>
              `).join('')}
            </select>
            ${renderErr('category')}
          </div>
          <div class="sb-field">
            <label class="sb-label">Idioma</label>
            <select id="sb-language" onchange="SietchBuilder.bindMeta('language', this.value, this)">
              <option value="pt-BR" ${m.language === 'pt-BR' ? 'selected' : ''}>Português (BR)</option>
              <option value="en-US" ${m.language === 'en-US' ? 'selected' : ''}>English (US)</option>
              <option value="es-ES" ${m.language === 'es-ES' ? 'selected' : ''}>Español</option>
            </select>
          </div>
        </div>

        <div class="sb-field">
          <label class="sb-label">Tags <span class="sb-help-inline">— pressione Enter pra adicionar</span></label>
          <div id="sb-tags-list" class="sb-tags">
            ${(m.tags || []).map(t => `
              <span class="sb-tag">${esc(t)}<button type="button" onclick="SietchBuilder.removeTag('${esc(t)}')" aria-label="Remover tag">×</button></span>
            `).join('')}
          </div>
          <input id="sb-tag-input" type="text" maxlength="30"
            placeholder="Ex: phishing, 2FA, owasp"
            onkeydown="if(event.key==='Enter'){event.preventDefault();SietchBuilder.addTag(this.value);this.value='';}">
          <div class="sb-help">Máx 8 tags · 2–30 caracteres cada</div>
        </div>

        <div class="sb-grid-2">
          <div class="${fieldCls('coverUrl')}">
            <label class="sb-label">Capa (URL)</label>
            <input id="sb-cover" type="url" value="${esc(m.coverUrl)}"
              oninput="SietchBuilder.bindMeta('coverUrl', this.value, this)"
              placeholder="https://..." >
            ${renderErr('coverUrl')}
            <div class="sb-help">Recomendado 1200×630, jpg/png/webp</div>
          </div>
          <div class="sb-field">
            <label class="sb-label">Política vinculada</label>
            <input id="sb-policy-ref" type="text" maxlength="20" value="${esc(m.policyRef)}"
              oninput="SietchBuilder.bindMeta('policyRef', this.value, this)"
              placeholder="Ex: DOC-005">
            <div class="sb-help">Código da política (opcional)</div>
          </div>
        </div>
      </div>
    `;
  }

  // bindMeta: atualiza state, contador e estado de validade ao vivo (sem re-render)
  window.SietchBuilder = window.SietchBuilder || {};
  window.SietchBuilder.bindMeta = function (key, value, evtTarget, min, max) {
    state.meta[key] = value;
    const el = evtTarget || (event && event.target);
    const wrap = el && el.closest ? el.closest('.sb-field') : null;
    if (!wrap) return;

    // Atualiza estado visual do campo (border + contador)
    updateFieldVisual(wrap, value, min, max);

    // Limpa erro do state se existir (já que o usuário está corrigindo)
    if (hasErr(key)) {
      delete state.errors[key];
      const errEl = wrap.querySelector('.sb-field__error');
      if (errEl) errEl.remove();
    }
  };

  function updateFieldVisual(wrap, value, min, max) {
    const len = String(value || '').length;
    wrap.classList.remove('sb-field--has-error', 'sb-field--valid');
    if (min != null) {
      const isValid = len >= min && (max == null || len <= max);
      const isOver  = max != null && len > max;
      if (isValid) wrap.classList.add('sb-field--valid');
      else if (isOver) wrap.classList.add('sb-field--has-error');
    }
    const counter = wrap.querySelector('.sb-counter');
    if (counter && min != null) {
      const st = counterState(len, min, max);
      counter.classList.remove('sb-counter--empty', 'sb-counter--short', 'sb-counter--valid', 'sb-counter--over');
      counter.classList.add(`sb-counter--${st}`);
      const num = counter.querySelector('.sb-counter__num');
      if (num) num.textContent = `${len}${max != null ? '/' + max : ''}`;
      const hint = counter.querySelector('.sb-counter__hint');
      if (hint) hint.textContent = (min > 0 && len < min) ? ` · mín ${min}` : '';
    }
  }

  function readStep1() {
    // Sincroniza o que ainda não foi capturado via bindMeta (fallback)
    const t = $('#sb-title');     if (t) state.meta.title       = t.value.trim();
    const d = $('#sb-desc');      if (d) state.meta.description = d.value.trim();
    const c = $('#sb-category');  if (c) state.meta.category    = c.value;
    const l = $('#sb-language');  if (l) state.meta.language    = l.value;
    const cv = $('#sb-cover');    if (cv) state.meta.coverUrl    = cv.value.trim();
    const p  = $('#sb-policy-ref'); if (p) state.meta.policyRef   = p.value.trim();
  }

  function validateStep1() {
    const m = state.meta;
    const errs = {};
    const title = (m.title || '').trim();
    const desc  = (m.description || '').trim();

    if (!title)             errs.title = 'Título obrigatório';
    else if (title.length < 3)  errs.title = 'Mínimo 3 caracteres';
    else if (title.length > 80) errs.title = 'Máximo 80 caracteres';

    if (!desc)              errs.description = 'Descrição obrigatória';
    else if (desc.length < 20)  errs.description = 'Mínimo 20 caracteres';
    else if (desc.length > 500) errs.description = 'Máximo 500 caracteres';

    if (!m.category)        errs.category = 'Selecione uma categoria';

    if (m.coverUrl && !/^https?:\/\/.+/i.test(m.coverUrl)) {
      errs.coverUrl = 'URL inválida (use http(s)://...)';
    }
    return errs;
  }

  // ─── Tags helpers ────────────────────────────────────────────────────

  window.SietchBuilder = window.SietchBuilder || {};
  window.SietchBuilder.addTag = function (raw) {
    const t = String(raw || '').trim();
    if (!t) return;
    if (t.length < 2 || t.length > 30) return;
    if (state.meta.tags.includes(t)) return;
    if (state.meta.tags.length >= 8) return;
    state.meta.tags.push(t);
    render();
  };
  window.SietchBuilder.removeTag = function (t) {
    state.meta.tags = state.meta.tags.filter(x => x !== t);
    render();
  };

  // ─── Etapa 2: Módulos ────────────────────────────────────────────────

  function renderStep2() {
    return `
      <div class="sb-form">
        ${renderBanner()}
        <div class="sb-section-head">
          <div>
            <div class="sb-section-title">Módulos do treinamento</div>
            <div class="sb-help">Adicione na ordem em que aparecerão pro colaborador. Reordenar com ↑/↓.</div>
          </div>
        </div>

        ${renderModuleToolbar()}

        ${state.modules.length === 0 ? `
          <div class="sb-empty">
            <div class="sb-empty__title">Nenhum módulo ainda</div>
            <div class="sb-empty__desc">Use a barra acima pra adicionar vídeo, artigo, quiz, tarefa ou política.</div>
          </div>
        ` : `
          <div class="sb-modules">
            ${state.modules.map((mod, i) => renderModuleCard(mod, i)).join('')}
          </div>
        `}
      </div>
    `;
  }

  function renderModuleToolbar() {
    const open = state._toolbarOpen === true;
    return `
      <div class="sb-mod-toolbar ${open ? 'is-open' : ''}" role="region" aria-label="Adicionar módulo">
        <button type="button" class="sb-mod-toolbar__toggle"
          aria-expanded="${open ? 'true' : 'false'}"
          onclick="SietchBuilder.toggleToolbar()">
          <span class="sb-mod-toolbar__toggle-icon">+</span>
          <span class="sb-mod-toolbar__toggle-label">Adicionar módulo</span>
          <span class="sb-mod-toolbar__toggle-chev" aria-hidden="true">▾</span>
        </button>
        <div class="sb-mod-toolbar__panel" ${open ? '' : 'hidden'}>
          <div class="sb-mod-toolbar__hint">Escolha o tipo de módulo</div>
          <div class="sb-mod-toolbar__btns">
            ${MODULE_TYPES.map(t => `
              <button type="button" class="sb-mod-toolbar__btn"
                onclick="SietchBuilder.addModule('${t.value}')"
                title="${esc(t.desc)}">
                <span class="sb-mod-toolbar__icon">${t.icon}</span>
                <span class="sb-mod-toolbar__name">${t.label}</span>
                <span class="sb-mod-toolbar__desc">${esc(t.desc)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  window.SietchBuilder.toggleToolbar = function () {
    state._toolbarOpen = !state._toolbarOpen;
    render();
  };

  function moduleHasErrors(tempId) {
    if (!state.errors) return false;
    const prefix = `mod-${tempId}-`;
    return Object.keys(state.errors).some(k => k.startsWith(prefix));
  }
  function moduleErrorList(tempId) {
    if (!state.errors) return [];
    const prefix = `mod-${tempId}-`;
    return Object.keys(state.errors)
      .filter(k => k.startsWith(prefix))
      .map(k => state.errors[k]);
  }

  // (removido: renderAddMenuButton — substituído por renderModuleToolbar sticky)

  function renderModuleCard(mod, idx) {
    const total = state.modules.length;
    const typeMeta = MODULE_TYPES.find(t => t.value === mod.type) || {};
    const isExpanded = mod.expanded;
    const hasErrs = moduleHasErrors(mod.tempId);

    return `
      <div class="sb-mod ${isExpanded ? 'is-open' : ''} ${hasErrs ? 'has-errors' : ''}" data-id="${mod.tempId}">
        <div class="sb-mod__head" onclick="SietchBuilder.toggleModule('${mod.tempId}')">
          <div class="sb-mod__index">${idx + 1}</div>
          <div class="sb-mod__type">
            <span class="sb-mod__icon">${typeMeta.icon || '·'}</span>
            <span class="sb-mod__type-label">${typeMeta.label || mod.type}</span>
          </div>
          <div class="sb-mod__title">${esc(mod.title || `Novo ${typeMeta.label || ''}`)}</div>
          ${hasErrs ? '<div class="sb-mod__err-chip" title="Tem erros">!</div>' : ''}
          <div class="sb-mod__meta">${mod.durationMin || 0} min</div>
          <div class="sb-mod__actions" onclick="event.stopPropagation()">
            <button type="button" class="sb-icon-btn" title="Subir"
              ${idx === 0 ? 'disabled' : ''}
              onclick="SietchBuilder.moveModule('${mod.tempId}', -1)">↑</button>
            <button type="button" class="sb-icon-btn" title="Descer"
              ${idx === total - 1 ? 'disabled' : ''}
              onclick="SietchBuilder.moveModule('${mod.tempId}', 1)">↓</button>
            <button type="button" class="sb-icon-btn sb-icon-btn--danger" title="Remover"
              onclick="SietchBuilder.removeModule('${mod.tempId}')">×</button>
          </div>
          <div class="sb-mod__chev">${isExpanded ? '⌃' : '⌄'}</div>
        </div>
        ${isExpanded ? `<div class="sb-mod__body">${renderModuleEditor(mod)}</div>` : ''}
      </div>
    `;
  }

  function renderModuleEditor(mod) {
    const id = mod.tempId;
    const titleKey = `mod-${id}-title`;
    const durKey   = `mod-${id}-durationMin`;
    // Erros agora ficam INLINE em cada campo, sem banner no topo
    const errBanner = '';

    const common = `
      <div class="sb-grid-2">
        <div class="${fieldCls(titleKey, { value: mod.title, min: 3, max: 80 })}">
          <label class="sb-label">Título do módulo <span class="sb-req">*</span></label>
          <input data-mod-field="title" data-err-key="${titleKey}" type="text" maxlength="80"
            value="${esc(mod.title)}" placeholder="Ex: OWASP Top 10"
            oninput="SietchBuilder.bindModFieldCounted('${id}','title',this.value,'${titleKey}',this,3,80)">
          ${renderCounter(mod.title, 3, 80, titleKey)}
        </div>
        <div class="${fieldCls(durKey)}">
          <label class="sb-label">Duração estimada (min) <span class="sb-req">*</span></label>
          <input data-mod-field="durationMin" data-err-key="${durKey}" type="number" min="0" max="600"
            value="${mod.durationMin || 0}"
            oninput="SietchBuilder.bindModField('${id}','durationMin',parseInt(this.value,10)||0,'${durKey}',this)">
          ${renderErr(durKey)}
        </div>
      </div>
      <div class="sb-field">
        <label class="sb-label">Descrição curta</label>
        <input data-mod-field="description" type="text" maxlength="200" value="${esc(mod.description || '')}"
          oninput="SietchBuilder.bindModField('${id}','description',this.value)"
          placeholder="Aparece abaixo do título">
      </div>
      <label class="sb-checkbox-line">
        <input type="checkbox" data-mod-field="isRequired" ${mod.isRequired !== false ? 'checked' : ''}
          onchange="SietchBuilder.bindModField('${id}','isRequired',this.checked)">
        <span>Obrigatório para concluir o treinamento</span>
      </label>
    `;

    let payloadEditor = '';
    if (mod.type === 'VIDEO')   payloadEditor = renderVideoEditor(mod);
    if (mod.type === 'ARTICLE') payloadEditor = renderArticleEditor(mod);
    if (mod.type === 'QUIZ')    payloadEditor = renderQuizEditor(mod);
    if (mod.type === 'TASK')    payloadEditor = renderTaskEditor(mod);
    if (mod.type === 'POLICY')  payloadEditor = renderPolicyEditor(mod);

    return `
      <div class="sb-mod-editor" data-mod-id="${id}">
        ${errBanner}
        ${common}
        <div class="sb-divider"></div>
        ${payloadEditor}
        <div class="sb-mod-editor__footer">
          <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.persistModule('${id}')">Salvar módulo</button>
        </div>
      </div>
    `;
  }

  window.SietchBuilder.bindModFieldCounted = function (modId, key, value, errKey, evtTarget, min, max) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod[key] = value;
    const el = evtTarget || (event && event.target);
    const wrap = el && el.closest ? el.closest('.sb-field') : null;
    if (wrap) updateFieldVisual(wrap, value, min, max);
    if (errKey && hasErr(errKey)) {
      delete state.errors[errKey];
      if (wrap) {
        const msg = wrap.querySelector('.sb-field__error');
        if (msg) msg.remove();
      }
    }
    // Atualiza o título visível no header do módulo se estiver fechado
    const modCard = document.querySelector(`.sb-mod[data-id="${modId}"] .sb-mod__title`);
    if (modCard && key === 'title') {
      const tm = MODULE_TYPES.find(t => t.value === mod.type) || {};
      modCard.textContent = value || `Novo ${tm.label || ''}`;
    }
  };

  window.SietchBuilder.bindModField = function (modId, key, value, errKey, evtTarget) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod[key] = value;
    if (errKey && hasErr(errKey)) {
      delete state.errors[errKey];
      const el = evtTarget || (event && event.target) || document.querySelector(`[data-err-key="${errKey}"]`);
      const wrap = el && el.closest ? el.closest('.sb-field') : null;
      if (wrap) {
        wrap.classList.remove('sb-field--has-error');
        const msg = wrap.querySelector('.sb-field__error');
        if (msg) msg.remove();
      }
    }
  };

  // ─── Editor: VIDEO ───────────────────────────────────────────────────

  function renderVideoEditor(mod) {
    const p = mod.payload || {};
    const provider = p.provider || 'youtube';
    const src = p.source || {};
    return `
      <div class="sb-field">
        <label class="sb-label">Onde está o vídeo?</label>
        <div class="sb-radio-group">
          ${['youtube', 'vimeo', 'upload'].map(opt => `
            <label class="sb-radio-card ${provider === opt ? 'is-selected' : ''}">
              <input type="radio" name="sb-vid-provider-${mod.tempId}" value="${opt}" ${provider === opt ? 'checked' : ''}
                onchange="SietchBuilder.updateVideoProvider('${mod.tempId}','${opt}')">
              <div>
                <div class="sb-radio-card__title">${opt === 'youtube' ? 'YouTube' : opt === 'vimeo' ? 'Vimeo' : 'Upload'}</div>
                <div class="sb-radio-card__desc">${
                  opt === 'youtube' ? 'Cole o link ou o ID' :
                  opt === 'vimeo'   ? 'Cole o link (suporta unlisted)' :
                                       'Suba .mp4/.mov/.webm até 2GB'
                }</div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>

      ${provider === 'upload' ? `
        <div class="sb-field">
          <label class="sb-label">Arquivo de vídeo</label>
          <input type="file" accept="video/mp4,video/quicktime,video/webm"
            onchange="SietchBuilder.uploadVideoFile('${mod.tempId}', this.files[0])">
          ${src.asset_id ? `
            <div class="sb-help" style="color:var(--accent);margin-top:6px;">
              ✓ Asset salvo: ${esc(src.asset_id).slice(0, 8)}…
            </div>
          ` : ''}
        </div>
      ` : `
        <div class="${fieldCls(`mod-${mod.tempId}-video`)}">
          <label class="sb-label">URL ou ID do vídeo <span class="sb-req">*</span></label>
          <div class="sb-row">
            <input id="sb-vid-input-${mod.tempId}" type="text"
              value="${esc(src.url || src.video_id || '')}"
              placeholder="${provider === 'youtube' ? 'https://youtu.be/... ou ID de 11 chars' : 'https://vimeo.com/123456789'}">
            <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.resolveVideo('${mod.tempId}')">Validar</button>
          </div>
          <div id="sb-vid-result-${mod.tempId}" class="sb-vid-result">
            ${src.video_id ? `
              <div class="sb-vid-preview">
                ${src.thumbnail_url ? `<img src="${esc(src.thumbnail_url)}" alt="">` : ''}
                <div>
                  <div class="sb-vid-preview__title">${esc(src.title || '(sem título)')}</div>
                  <div class="sb-vid-preview__id">ID: ${esc(src.video_id)} ${src.unlisted_hash ? `· hash: ${esc(src.unlisted_hash)}` : ''}</div>
                </div>
              </div>
            ` : ''}
          </div>
          ${renderErr(`mod-${mod.tempId}-video`)}
        </div>
      `}

      <div class="sb-grid-2">
        <div class="sb-field">
          <label class="sb-label">% mínima para concluir</label>
          <input type="number" min="50" max="100" value="${p.min_watch_pct ?? 90}"
            onchange="SietchBuilder.updateVideoPayload('${mod.tempId}', 'min_watch_pct', parseInt(this.value, 10) || 90)">
          <div class="sb-help">Sugerido: 90%. Player calcula por intervalos únicos (não vale pular).</div>
        </div>
        <div class="sb-field">
          <label class="sb-label">Velocidades disponíveis</label>
          <label class="sb-checkbox-line">
            <input type="checkbox" ${p.allow_speed !== false ? 'checked' : ''}
              onchange="SietchBuilder.updateVideoPayload('${mod.tempId}', 'allow_speed', this.checked)">
            <span>Permitir 0.75x / 1x / 1.5x / 2x</span>
          </label>
        </div>
      </div>

      <div class="sb-field">
        <label class="sb-label">Legendas (URL .vtt — opcional)</label>
        <input type="url" value="${esc(p.captions_url || '')}"
          onchange="SietchBuilder.updateVideoPayload('${mod.tempId}', 'captions_url', this.value || null)"
          placeholder="https://.../legendas.vtt">
      </div>

      <div class="sb-field">
        <label class="sb-label">Transcrição (markdown — opcional)</label>
        <textarea style="min-height:80px;"
          onchange="SietchBuilder.updateVideoPayload('${mod.tempId}', 'transcript_md', this.value || null)"
          placeholder="Texto da fala do vídeo">${esc(p.transcript_md || '')}</textarea>
      </div>
    `;
  }

  window.SietchBuilder.updateVideoProvider = function (modId, provider) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), provider, source: {} };
    render();
  };

  window.SietchBuilder.updateVideoPayload = function (modId, key, value) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), [key]: value };
  };

  window.SietchBuilder.resolveVideo = async function (modId) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    const input = $(`#sb-vid-input-${modId}`).value.trim();
    if (!input) { alert('Cole o URL ou ID do vídeo'); return; }
    const provider = mod.payload?.provider || 'youtube';
    const resultEl = $(`#sb-vid-result-${modId}`);
    resultEl.innerHTML = '<div class="sb-help">Validando via oEmbed…</div>';
    try {
      const r = await window.SietchAPI.videoResolve(provider, input);
      if (!r.valid) {
        resultEl.innerHTML = `<div class="sb-error">${r.code === 'PRIVATE_OR_REMOVED' ? 'Vídeo privado, removido ou inacessível.' : 'URL inválida.'}</div>`;
        return;
      }
      mod.payload = {
        ...(mod.payload || {}),
        provider,
        source: {
          video_id: r.video_id,
          url: input,
          unlisted_hash: r.unlisted_hash || null,
          title: r.title,
          thumbnail_url: r.thumbnail_url,
          duration_sec: r.duration_sec,
        },
      };
      if (!mod.title && r.title) mod.title = r.title;
      if (!mod.durationMin && r.duration_sec) mod.durationMin = Math.ceil(r.duration_sec / 60);
      render();
    } catch (e) {
      resultEl.innerHTML = `<div class="sb-error">Erro: ${esc(e.message)}</div>`;
    }
  };

  window.SietchBuilder.uploadVideoFile = async function (modId, file) {
    if (!file) return;
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    if (file.size > 2 * 1024 * 1024 * 1024) { alert('Arquivo > 2GB'); return; }

    try {
      const r = await window.SietchAPI.uploadVideo(file);
      mod.payload = {
        ...(mod.payload || {}),
        provider: 'upload',
        source: {
          asset_id: r.assetId,
          playback_id: r.playbackId,
          url: r.url,
        },
      };
      render();
    } catch (e) {
      alert('Erro no upload: ' + e.message);
    }
  };

  // ─── Editor: ARTICLE ─────────────────────────────────────────────────

  function renderArticleEditor(mod) {
    const p = mod.payload || {};
    const contentKey = `mod-${mod.tempId}-content_md`;
    return `
      <div class="${fieldCls(contentKey)}">
        <label class="sb-label">Conteúdo (Markdown) <span class="sb-req">*</span></label>
        <textarea style="min-height:240px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;"
          data-err-key="${contentKey}"
          oninput="SietchBuilder.updateArticlePayload('${mod.tempId}', 'content_md', this.value, this)"
          placeholder="# Título\n\nTexto do artigo em markdown…">${esc(p.content_md || '')}</textarea>
        ${renderErr(contentKey)}
        <div class="sb-help">Suporta cabeçalhos, listas, links, código, etc. Mínimo 50 caracteres.</div>
      </div>
      <div class="sb-field">
        <label class="sb-label">Link externo (opcional)</label>
        <input type="url" value="${esc(p.external_link || '')}"
          onchange="SietchBuilder.updateArticlePayload('${mod.tempId}', 'external_link', this.value || null)"
          placeholder="https://...">
      </div>
    `;
  }

  window.SietchBuilder.updateArticlePayload = function (modId, key, value, evtTarget) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), [key]: value };
    if (key === 'content_md') {
      const errKey = `mod-${modId}-content_md`;
      if (hasErr(errKey) && value && value.length >= 50) clearFieldError(errKey, evtTarget);
    }
    saveStateDebounced();
  };

  // ─── Editor: QUIZ ────────────────────────────────────────────────────

  function renderQuizEditor(mod) {
    const p = mod.payload || {};
    const questions = p.questions || [];
    return `
      <div class="sb-grid-3">
        <div class="sb-field">
          <label class="sb-label">Nota mínima (%)</label>
          <input type="number" min="0" max="100" value="${p.passing_score ?? 70}"
            onchange="SietchBuilder.updateQuizMeta('${mod.tempId}', 'passing_score', parseInt(this.value, 10) || 70)">
        </div>
        <div class="sb-field">
          <label class="sb-label">Tentativas máx</label>
          <input type="number" min="0" max="20" value="${p.max_attempts ?? 3}"
            onchange="SietchBuilder.updateQuizMeta('${mod.tempId}', 'max_attempts', parseInt(this.value, 10) || 0)">
          <div class="sb-help">0 = ilimitadas</div>
        </div>
        <div class="sb-field">
          <label class="sb-label">Mostrar respostas corretas</label>
          <select onchange="SietchBuilder.updateQuizMeta('${mod.tempId}', 'show_correct_answers', this.value)">
            <option value="after_pass" ${p.show_correct_answers === 'after_pass' ? 'selected' : ''}>Após passar</option>
            <option value="always"     ${p.show_correct_answers === 'always' ? 'selected' : ''}>Sempre</option>
            <option value="never"      ${p.show_correct_answers === 'never' ? 'selected' : ''}>Nunca</option>
          </select>
        </div>
      </div>

      <label class="sb-checkbox-line">
        <input type="checkbox" ${p.shuffle_questions !== false ? 'checked' : ''}
          onchange="SietchBuilder.updateQuizMeta('${mod.tempId}', 'shuffle_questions', this.checked)">
        <span>Embaralhar ordem das questões</span>
      </label>

      <div class="sb-divider"></div>

      <div class="sb-section-head">
        <div>
          <div class="sb-section-title">Questões (${questions.length})</div>
          <div class="sb-help">Mínimo 3 para publicar. Pode ser <em>single</em>, <em>multiple</em> ou <em>true/false</em>.</div>
        </div>
        <button type="button" class="sb-btn sb-btn--primary"
          onclick="SietchBuilder.addQuestion('${mod.tempId}')">+ Adicionar questão</button>
      </div>

      <div class="sb-questions">
        ${questions.map((q, i) => renderQuestion(mod.tempId, q, i)).join('')}
      </div>
    `;
  }

  function renderQuestion(modId, q, idx) {
    const isMulti = q.kind === 'multiple';
    const isTF    = q.kind === 'true_false';
    const correctCount = (q.options || []).filter(o => o.correct).length;
    const kindLabel = isMulti ? 'Múltiplas corretas' : isTF ? 'V/F' : 'Única correta';
    const stmtKey = `mod-${modId}-q-${q.id}-statement`;
    const optsKey = `mod-${modId}-q-${q.id}-opts`;
    const correctKey = `mod-${modId}-q-${q.id}-correct`;
    const hasOptsErr = hasErr(optsKey) || hasErr(correctKey);

    return `
      <div class="sb-question ${moduleHasErrors(modId) && (hasErr(stmtKey) || hasOptsErr) ? 'has-errors' : ''}" data-question-id="${q.id}">
        <div class="sb-question__head">
          <span class="sb-question__num">Q${idx + 1}</span>
          <span class="sb-question__kind-pill">${kindLabel}</span>
          <div class="sb-question__head-controls">
            <select class="sb-question__kind-select"
              onchange="SietchBuilder.updateQuestion('${modId}', '${q.id}', 'kind', this.value)">
              <option value="single"     ${q.kind === 'single' ? 'selected' : ''}>Única correta</option>
              <option value="multiple"   ${isMulti ? 'selected' : ''}>Múltiplas corretas</option>
              <option value="true_false" ${isTF ? 'selected' : ''}>Verdadeiro / Falso</option>
            </select>
            <label class="sb-question__weight" title="Peso da questão">
              <span>Peso</span>
              <input type="number" min="0" max="10" value="${q.weight ?? 1}"
                oninput="SietchBuilder.updateQuestionLive('${modId}', '${q.id}', 'weight', parseInt(this.value, 10) || 0)">
            </label>
            <button type="button" class="sb-icon-btn sb-icon-btn--danger" title="Remover questão"
              onclick="SietchBuilder.removeQuestion('${modId}', '${q.id}')">×</button>
          </div>
        </div>

        <div class="sb-question__body">
          <div class="${fieldCls(stmtKey)}">
            <label class="sb-label sb-label--sm">Enunciado <span class="sb-req">*</span></label>
            <textarea class="sb-question__statement"
              oninput="SietchBuilder.updateQuestionLive('${modId}', '${q.id}', 'statement', this.value, this)"
              placeholder="Ex: Qual a primeira regra do OWASP Top 10 em 2021?">${esc(q.statement || '')}</textarea>
            ${renderErr(stmtKey)}
          </div>

          <div class="sb-question__opts-head">
            <span class="sb-label sb-label--sm">Opções ${isMulti ? `(múltiplas corretas — ${correctCount} marcadas)` : '(marque a correta)'}</span>
            ${!isTF ? `<button type="button" class="sb-add-opt"
              onclick="SietchBuilder.addOption('${modId}', '${q.id}')">+ opção</button>` : ''}
          </div>

          <div class="sb-options ${hasOptsErr ? 'sb-options--error' : ''}">
            ${(q.options || []).map((opt) => {
              const optKey = `mod-${modId}-q-${q.id}-opt-${opt.id}`;
              return `
              <div class="sb-option ${opt.correct ? 'is-correct' : ''} ${hasErr(optKey) ? 'has-error' : ''}">
                <input type="${isMulti ? 'checkbox' : 'radio'}"
                  class="sb-option__mark"
                  name="sb-opt-${q.id}"
                  ${opt.correct ? 'checked' : ''}
                  ${isTF ? 'disabled' : ''}
                  onchange="SietchBuilder.toggleOptionCorrect('${modId}', '${q.id}', '${opt.id}', this.checked, this)">
                <input type="text" class="sb-option__text"
                  value="${esc(opt.text || '')}"
                  placeholder="Texto da opção"
                  data-err-key="${optKey}"
                  oninput="SietchBuilder.updateOptionText('${modId}', '${q.id}', '${opt.id}', this.value, this)">
                ${!isTF ? `<button type="button" class="sb-icon-btn sb-icon-btn--danger" title="Remover opção"
                  onclick="SietchBuilder.removeOption('${modId}', '${q.id}', '${opt.id}')">×</button>` : ''}
              </div>
              `;
            }).join('')}
          </div>
          ${hasErr(optsKey) ? `<div class="sb-field__error">${esc(errMsg(optsKey))}</div>` : ''}
          ${hasErr(correctKey) ? `<div class="sb-field__error">${esc(errMsg(correctKey))}</div>` : ''}

          <div class="sb-field">
            <label class="sb-label sb-label--sm">Explicação <span class="sb-help-inline">— mostrada após responder (opcional)</span></label>
            <input type="text" value="${esc(q.explanation || '')}"
              placeholder="Por que essa é a resposta correta?"
              oninput="SietchBuilder.updateQuestionLive('${modId}', '${q.id}', 'explanation', this.value || null)">
          </div>
        </div>
      </div>
    `;
  }

  // Versão sem re-render: usa pra campos que não mudam estrutura
  window.SietchBuilder.updateQuestionLive = function (modId, qid, key, value, evtTarget) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod?.payload?.questions) return;
    const q = mod.payload.questions.find(x => x.id === qid);
    if (!q) return;
    q[key] = value;
    // Limpa erro inline da questão quando o usuário começa a corrigir
    if (key === 'statement') {
      const errKey = `mod-${modId}-q-${qid}-statement`;
      if (hasErr(errKey)) clearFieldError(errKey, evtTarget);
    }
    saveStateDebounced();
  };

  function clearFieldError(errKey, evtTarget) {
    if (!hasErr(errKey)) return;
    delete state.errors[errKey];
    const el = evtTarget || (event && event.target);
    const wrap = el && el.closest ? el.closest('.sb-field') : null;
    if (wrap) {
      wrap.classList.remove('sb-field--has-error');
      const msg = wrap.querySelector('.sb-field__error');
      if (msg) msg.remove();
    }
  }

  window.SietchBuilder.updateQuizMeta = function (modId, key, value) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), [key]: value };
    saveStateDebounced();
  };

  window.SietchBuilder.addQuestion = function (modId) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    if (!mod.payload) mod.payload = { passing_score: 70, max_attempts: 3, questions: [] };
    if (!mod.payload.questions) mod.payload.questions = [];
    const qid = `q${uid()}`;
    mod.payload.questions.push({
      id: qid,
      kind: 'single',
      statement: '',
      options: [
        { id: 'a', text: '', correct: false },
        { id: 'b', text: '', correct: false },
      ],
      weight: 1,
    });
    render();
  };

  window.SietchBuilder.removeQuestion = function (modId, qid) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod?.payload?.questions) return;
    mod.payload.questions = mod.payload.questions.filter(q => q.id !== qid);
    render();
  };

  window.SietchBuilder.updateQuestion = function (modId, qid, key, value) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod?.payload?.questions) return;
    const q = mod.payload.questions.find(x => x.id === qid);
    if (!q) return;
    q[key] = value;
    if (key === 'kind' && value === 'true_false') {
      q.options = [
        { id: 'a', text: 'Verdadeiro', correct: false },
        { id: 'b', text: 'Falso', correct: false },
      ];
    }
    render();
  };

  window.SietchBuilder.addOption = function (modId, qid) {
    const mod = state.modules.find(m => m.tempId === modId);
    const q = mod?.payload?.questions?.find(x => x.id === qid);
    if (!q) return;
    if (q.options.length >= 10) return;
    const nextId = String.fromCharCode(97 + q.options.length); // a, b, c, ...
    q.options.push({ id: nextId, text: '', correct: false });
    render();
  };

  window.SietchBuilder.removeOption = function (modId, qid, oid) {
    const mod = state.modules.find(m => m.tempId === modId);
    const q = mod?.payload?.questions?.find(x => x.id === qid);
    if (!q) return;
    q.options = q.options.filter(o => o.id !== oid);
    render();
  };

  window.SietchBuilder.toggleOptionCorrect = function (modId, qid, oid, checked, evtTarget) {
    const mod = state.modules.find(m => m.tempId === modId);
    const q = mod?.payload?.questions?.find(x => x.id === qid);
    if (!q) return;
    if (q.kind === 'multiple') {
      const o = q.options.find(o => o.id === oid);
      if (o) o.correct = checked;
    } else {
      q.options.forEach(o => { o.correct = (o.id === oid && checked); });
    }
    // Atualiza visual sem re-render para evitar perder foco/scroll
    const el = evtTarget || (event && event.target);
    const questionEl = el ? el.closest('.sb-question') : null;
    if (questionEl) {
      questionEl.querySelectorAll('.sb-option').forEach(row => {
        const input = row.querySelector('input[type="radio"], input[type="checkbox"]');
        if (!input) return;
        row.classList.toggle('is-correct', input.checked);
      });
      // Atualiza o contador de "X marcadas" no head se for multiple
      if (q.kind === 'multiple') {
        const head = questionEl.querySelector('.sb-question__opts-head .sb-label');
        if (head) {
          const count = q.options.filter(o => o.correct).length;
          head.textContent = `Opções (múltiplas corretas — ${count} marcadas)`;
        }
      }
    }
    saveStateDebounced();
  };

  window.SietchBuilder.updateOptionText = function (modId, qid, oid, text, evtTarget) {
    const mod = state.modules.find(m => m.tempId === modId);
    const q = mod?.payload?.questions?.find(x => x.id === qid);
    const o = q?.options.find(o => o.id === oid);
    if (o) o.text = text;
    const errKey = `mod-${modId}-q-${qid}-opt-${oid}`;
    if (text && text.trim() && hasErr(errKey)) {
      delete state.errors[errKey];
      const el = evtTarget || (event && event.target);
      const optRow = el ? el.closest('.sb-option') : null;
      if (optRow) optRow.classList.remove('has-error');
    }
    saveStateDebounced();
  };

  // ─── Editor: TASK ────────────────────────────────────────────────────

  function renderTaskEditor(mod) {
    const p = mod.payload || {};
    const criteria = p.acceptance_criteria || [];
    const stmtKey = `mod-${mod.tempId}-statement_md`;
    return `
      <div class="${fieldCls(stmtKey)}">
        <label class="sb-label">Enunciado (Markdown) <span class="sb-req">*</span></label>
        <textarea style="min-height:140px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;"
          data-err-key="${stmtKey}"
          oninput="SietchBuilder.updateTaskPayload('${mod.tempId}', 'statement_md', this.value, this)"
          placeholder="## Tarefa\n\nDescreva o que o colaborador deve entregar...">${esc(p.statement_md || '')}</textarea>
        ${renderErr(stmtKey)}
        <div class="sb-help">Mínimo 20 caracteres.</div>
      </div>

      <div class="sb-grid-2">
        <div class="sb-field">
          <label class="sb-label">Tipo de submissão</label>
          <select onchange="SietchBuilder.updateTaskPayload('${mod.tempId}', 'submission_kind', this.value)">
            <option value="text" ${p.submission_kind === 'text' ? 'selected' : ''}>Texto</option>
            <option value="link" ${p.submission_kind === 'link' ? 'selected' : ''}>Link (URL)</option>
            <option value="file" ${p.submission_kind === 'file' ? 'selected' : ''}>Arquivo</option>
            <option value="none" ${p.submission_kind === 'none' ? 'selected' : ''}>Nenhuma (só leitura)</option>
          </select>
        </div>
        <div class="sb-field">
          <label class="sb-label">Quem revisa</label>
          <select onchange="SietchBuilder.updateTaskPayload('${mod.tempId}', 'reviewer_role', this.value)">
            <option value="admin"   ${p.reviewer_role === 'admin' ? 'selected' : ''}>Admin/RH</option>
            <option value="manager" ${p.reviewer_role === 'manager' ? 'selected' : ''}>Gestor direto</option>
            <option value="none"    ${p.reviewer_role === 'none' ? 'selected' : ''}>Auto-aprovar</option>
          </select>
        </div>
      </div>

      <label class="sb-checkbox-line">
        <input type="checkbox" ${p.auto_complete ? 'checked' : ''}
          onchange="SietchBuilder.updateTaskPayload('${mod.tempId}', 'auto_complete', this.checked)">
        <span>Concluir automaticamente ao submeter (sem revisão)</span>
      </label>

      <div class="sb-divider"></div>

      <div class="sb-section-head">
        <div>
          <div class="sb-section-title">Critérios de aceite (${criteria.length})</div>
          <div class="sb-help">Checklist exibido ao aluno e ao revisor.</div>
        </div>
        <button type="button" class="sb-btn sb-btn--primary"
          onclick="SietchBuilder.addCriterion('${mod.tempId}')">+ Critério</button>
      </div>

      <div class="sb-criteria">
        ${criteria.map(c => `
          <div class="sb-criterion">
            <input type="text" value="${esc(c.text)}"
              placeholder="Ex: Identificou a vulnerabilidade"
              onchange="SietchBuilder.updateCriterion('${mod.tempId}', '${c.id}', this.value)">
            <button type="button" class="sb-icon-btn sb-icon-btn--danger"
              onclick="SietchBuilder.removeCriterion('${mod.tempId}', '${c.id}')">×</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  window.SietchBuilder.updateTaskPayload = function (modId, key, value, evtTarget) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), [key]: value };
    if (key === 'statement_md') {
      const errKey = `mod-${modId}-statement_md`;
      if (hasErr(errKey) && value && value.length >= 20) clearFieldError(errKey, evtTarget);
    }
    saveStateDebounced();
  };

  window.SietchBuilder.addCriterion = function (modId) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    if (!mod.payload) mod.payload = { submission_kind: 'text', acceptance_criteria: [] };
    if (!mod.payload.acceptance_criteria) mod.payload.acceptance_criteria = [];
    mod.payload.acceptance_criteria.push({ id: `c${uid()}`, text: '' });
    render();
  };

  window.SietchBuilder.removeCriterion = function (modId, cid) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod?.payload?.acceptance_criteria) return;
    mod.payload.acceptance_criteria = mod.payload.acceptance_criteria.filter(c => c.id !== cid);
    render();
  };

  window.SietchBuilder.updateCriterion = function (modId, cid, text) {
    const mod = state.modules.find(m => m.tempId === modId);
    const c = mod?.payload?.acceptance_criteria?.find(x => x.id === cid);
    if (c) c.text = text;
  };

  // ─── Editor: POLICY ──────────────────────────────────────────────────

  function renderPolicyEditor(mod) {
    const p = mod.payload || {};
    const refKey  = `mod-${mod.tempId}-policy_ref`;
    const verKey  = `mod-${mod.tempId}-policy_version`;
    const contKey = `mod-${mod.tempId}-content_md`;
    const lblKey  = `mod-${mod.tempId}-accept_label`;
    return `
      <div class="sb-grid-3">
        <div class="${fieldCls(refKey)}">
          <label class="sb-label">Código <span class="sb-req">*</span></label>
          <input type="text" maxlength="20" value="${esc(p.policy_ref || '')}"
            data-err-key="${refKey}"
            oninput="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'policy_ref', this.value, this)"
            placeholder="Ex: DOC-001, A-01">
          ${renderErr(refKey)}
        </div>
        <div class="${fieldCls(verKey)}">
          <label class="sb-label">Versão <span class="sb-req">*</span></label>
          <input type="text" maxlength="10" value="${esc(p.policy_version || '')}"
            data-err-key="${verKey}"
            oninput="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'policy_version', this.value, this)"
            placeholder="Ex: 2.1">
          ${renderErr(verKey)}
        </div>
        <div class="sb-field">
          <label class="sb-label">Vigência</label>
          <input type="date" value="${esc(p.effective_date || '')}"
            onchange="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'effective_date', this.value)">
        </div>
      </div>

      <div class="${fieldCls(contKey)}">
        <label class="sb-label">Conteúdo da política (Markdown) <span class="sb-req">*</span></label>
        <textarea style="min-height:240px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;"
          data-err-key="${contKey}"
          oninput="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'content_md', this.value, this)"
          placeholder="# Política ABC\n\n## Escopo\n\nEsta política aplica-se a...">${esc(p.content_md || '')}</textarea>
        ${renderErr(contKey)}
        <div class="sb-help">Mínimo 50 caracteres.</div>
      </div>

      <div class="${fieldCls(lblKey)}">
        <label class="sb-label">Texto do aceite <span class="sb-req">*</span></label>
        <input type="text" maxlength="500"
          value="${esc(p.accept_label || '')}"
          data-err-key="${lblKey}"
          oninput="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'accept_label', this.value, this)"
          placeholder="Ex: Li e concordo com a Política DOC-001 v2.1">
        ${renderErr(lblKey)}
      </div>

      <label class="sb-checkbox-line">
        <input type="checkbox" ${p.require_full_scroll !== false ? 'checked' : ''}
          onchange="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'require_full_scroll', this.checked)">
        <span>Só habilita aceite após rolagem completa do conteúdo</span>
      </label>
    `;
  }

  window.SietchBuilder.updatePolicyPayload = function (modId, key, value, evtTarget) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), [key]: value };
    const errKey = `mod-${modId}-${key}`;
    if (hasErr(errKey)) {
      const ok = (key === 'policy_ref' || key === 'policy_version' || key === 'accept_label') ? (!!value && !!value.trim())
                : key === 'content_md' ? (!!value && value.length >= 50)
                : true;
      if (ok) clearFieldError(errKey, evtTarget);
    }
    saveStateDebounced();
  };

  // ─── Persistir módulo no state (lê os inputs comuns) ─────────────────

  window.SietchBuilder.persistModule = function (modId) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    const root = document.querySelector(`.sb-mod-editor[data-mod-id="${modId}"]`);
    if (!root) return;
    mod.title       = root.querySelector('[data-mod-field="title"]').value.trim();
    mod.durationMin = parseInt(root.querySelector('[data-mod-field="durationMin"]').value, 10) || 0;
    mod.description = root.querySelector('[data-mod-field="description"]').value.trim();
    mod.isRequired  = root.querySelector('[data-mod-field="isRequired"]').checked;
    mod.expanded    = false;
    render();
  };

  // ─── Módulos: helpers ────────────────────────────────────────────────

  // (removido: dropdown legado — substituído pela toolbar sticky)

  window.SietchBuilder.addModule = function (type) {
    state.modules.forEach(m => { m.expanded = false; });
    const defaultPayloads = {
      VIDEO:   { provider: 'youtube', source: {}, allow_speed: true, min_watch_pct: 90 },
      ARTICLE: { content_md: '' },
      QUIZ:    { passing_score: 70, max_attempts: 3, shuffle_questions: true, show_correct_answers: 'after_pass', questions: [] },
      TASK:    { statement_md: '', submission_kind: 'text', acceptance_criteria: [], auto_complete: false, reviewer_role: 'admin' },
      POLICY:  { policy_ref: '', policy_version: '', effective_date: '', content_md: '', require_full_scroll: true, accept_label: '' },
    };
    const item = {
      tempId: uid(),
      type,
      title: '',
      description: '',
      durationMin: 10,
      isRequired: true,
      payload: defaultPayloads[type] || {},
      expanded: true,
    };
    state.modules.push(item);
    state._toolbarOpen = false; // fecha a toolbar ao adicionar
    render();
    requestAnimationFrame(() => {
      const newCard = document.querySelector(`.sb-mod[data-id="${item.tempId}"]`);
      if (newCard) newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  window.SietchBuilder.toggleModule = function (modId) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.expanded = !mod.expanded;
    render();
  };

  window.SietchBuilder.moveModule = function (modId, delta) {
    const idx = state.modules.findIndex(m => m.tempId === modId);
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= state.modules.length) return;
    const [item] = state.modules.splice(idx, 1);
    state.modules.splice(next, 0, item);
    render();
  };

  window.SietchBuilder.removeModule = function (modId) {
    if (!confirm('Remover este módulo?')) return;
    state.modules = state.modules.filter(m => m.tempId !== modId);
    render();
  };

  // ─── Etapa 3: Configurações ──────────────────────────────────────────

  function renderStep3() {
    const s = state.settings;
    return `
      <div class="sb-form">
        ${renderBanner()}
        <div class="sb-grid-2">
          <label class="sb-checkbox-line sb-checkbox-line--card">
            <input type="checkbox" id="sb-set-mandatory" ${s.isMandatory ? 'checked' : ''}>
            <div>
              <div class="sb-label">Treinamento obrigatório</div>
              <div class="sb-help">Aparece com chip vermelho no card</div>
            </div>
          </label>
          <label class="sb-checkbox-line sb-checkbox-line--card">
            <input type="checkbox" id="sb-set-cert" ${s.hasCertificate ? 'checked' : ''}>
            <div>
              <div class="sb-label">Gerar certificado ao concluir</div>
              <div class="sb-help">PDF com nome, treinamento, data, hash</div>
            </div>
          </label>
        </div>

        <div class="sb-grid-3">
          <div class="${fieldCls('deadlineDays')}">
            <label class="sb-label">Prazo de conclusão (dias)</label>
            <input id="sb-set-deadline" type="number" min="0" max="365" value="${s.deadlineDays ?? 30}">
            ${renderErr('deadlineDays')}
            <div class="sb-help">0 = sem prazo</div>
          </div>
          <div class="${fieldCls('passingScore')}">
            <label class="sb-label">Nota mínima geral (%)</label>
            <input id="sb-set-passing" type="number" min="0" max="100" value="${s.passingScore ?? 70}">
            ${renderErr('passingScore')}
            <div class="sb-help">Aplicada à média ponderada dos quizzes</div>
          </div>
          <div class="${fieldCls('maxAttempts')}">
            <label class="sb-label">Tentativas máx (curso)</label>
            <input id="sb-set-attempts" type="number" min="0" max="20" value="${s.maxAttempts ?? 0}">
            ${renderErr('maxAttempts')}
            <div class="sb-help">0 = ilimitadas</div>
          </div>
        </div>

        <div class="sb-grid-2">
          <div class="sb-field">
            <label class="sb-label">Visibilidade</label>
            <select id="sb-set-visibility">
              <option value="ALL"     ${s.visibility === 'ALL'     ? 'selected' : ''}>Todos os colaboradores</option>
              <option value="BY_ROLE" ${s.visibility === 'BY_ROLE' ? 'selected' : ''}>Por cargo/role</option>
              <option value="BY_TEAM" ${s.visibility === 'BY_TEAM' ? 'selected' : ''}>Por time</option>
              <option value="MANUAL"  ${s.visibility === 'MANUAL'  ? 'selected' : ''}>Manual (admin atribui)</option>
            </select>
          </div>
          <div class="sb-field">
            <label class="sb-label">Reciclagem</label>
            <select id="sb-set-recurrence">
              <option value="never"  ${s.recurrence?.kind === 'never'  ? 'selected' : ''}>Sem reciclagem</option>
              <option value="annual" ${s.recurrence?.kind === 'annual' ? 'selected' : ''}>Anual</option>
              <option value="every_n_months" ${s.recurrence?.kind === 'every_n_months' ? 'selected' : ''}>A cada N meses</option>
            </select>
            <div class="sb-help">Dispara nova atribuição automática no vencimento</div>
          </div>
        </div>
      </div>
    `;
  }

  function readStep3() {
    state.settings.isMandatory    = $('#sb-set-mandatory').checked;
    state.settings.hasCertificate = $('#sb-set-cert').checked;
    state.settings.deadlineDays   = parseInt($('#sb-set-deadline').value, 10) || 0;
    state.settings.passingScore   = parseInt($('#sb-set-passing').value, 10) || 70;
    state.settings.maxAttempts    = parseInt($('#sb-set-attempts').value, 10) || 0;
    state.settings.visibility     = $('#sb-set-visibility').value;
    const recKind = $('#sb-set-recurrence').value;
    state.settings.recurrence = recKind === 'never' ? { kind: 'never' } : { kind: recKind, interval_months: recKind === 'annual' ? 12 : 6 };
  }

  // ─── Etapa 4: Revisão + publicação ───────────────────────────────────

  function renderStep4() {
    const v = state.validation;
    const m = state.meta;
    const totalMin = state.modules.reduce((s, x) => s + (x.durationMin || 0), 0);
    return `
      <div class="sb-form">
        <div class="sb-card">
          <div class="sb-card__title">${esc(m.title || '—')}</div>
          <div class="sb-card__desc">${esc(m.description || '—')}</div>
          <div class="sb-card__chips">
            <span class="sb-chip">${esc(m.category || '—')}</span>
            ${state.settings.isMandatory ? '<span class="sb-chip sb-chip--danger">Obrigatório</span>' : ''}
            ${state.settings.hasCertificate ? '<span class="sb-chip sb-chip--success">Certificado</span>' : ''}
            <span class="sb-chip">${state.modules.length} módulos</span>
            <span class="sb-chip">${totalMin} min</span>
            ${m.policyRef ? `<span class="sb-chip">Política: ${esc(m.policyRef)}</span>` : ''}
          </div>
        </div>

        <div class="sb-section-title">Módulos</div>
        <div class="sb-review-list">
          ${state.modules.map((mod, i) => {
            const t = MODULE_TYPES.find(x => x.value === mod.type) || {};
            return `
              <div class="sb-review-item">
                <span class="sb-review-item__num">${i + 1}</span>
                <span class="sb-review-item__icon">${t.icon}</span>
                <span class="sb-review-item__title">${esc(mod.title || '(sem título)')}</span>
                <span class="sb-review-item__meta">${t.label} · ${mod.durationMin || 0} min ${mod.isRequired === false ? '· opcional' : ''}</span>
              </div>
            `;
          }).join('') || '<div class="sb-help">Nenhum módulo.</div>'}
        </div>

        <div class="sb-section-title">Validação</div>
        ${v == null ? `
          <div class="sb-help">Clique em <strong>"Validar antes de publicar"</strong> para checar a estrutura.</div>
        ` : v.valid ? `
          <div class="sb-success">✓ Pronto pra publicar — sem erros estruturais.</div>
        ` : `
          <div class="sb-error">
            <strong>${v.errors.length} erro(s) encontrado(s):</strong>
            <ul style="margin:8px 0 0 18px;padding:0;">
              ${v.errors.map(e => `<li>${esc(e.message)} <small>(${esc(e.code)})</small></li>`).join('')}
            </ul>
          </div>
        `}
      </div>
    `;
  }

  // ─── Render principal + footer ───────────────────────────────────────

  function renderFooter() {
    const onLast = state.step === 4;
    const canSave = typeof state.trainingId === 'string' && state.trainingId.length > 0;
    const isEdit = state.mode === 'edit' && canSave;
    return `
      <div class="sb-footer">
        <div class="sb-footer__left">
          ${state.step > 1 ? `
            <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.back()">← Voltar</button>
          ` : ''}
          ${isEdit ? `
            <button type="button" class="sb-btn sb-btn--ghost sb-btn--danger-ghost"
              onclick="SietchBuilder.archiveTraining()"
              title="Arquivar treinamento">Arquivar</button>
          ` : ''}
        </div>

        <div class="sb-footer__right">
          ${canSave ? `
            <span class="sb-help" style="margin-right:12px;">${isEdit ? 'Editando' : 'Rascunho salvo'} · v${state.trainingId.slice(0, 6)}</span>
          ` : ''}
          ${isEdit ? `
            <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.previewAsStudent()"
              title="Ver como aluno">Pré-visualizar</button>
            <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.openAssignModal()"
              title="Atribuir a colaboradores">Atribuir</button>
          ` : ''}
          ${onLast ? `
            <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.runValidate()">Validar</button>
            <button type="button" class="sb-btn sb-btn--primary"
              ${state.validation && !state.validation.valid ? 'disabled' : ''}
              onclick="SietchBuilder.publish()">Publicar</button>
          ` : `
            <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.saveDraft()">Salvar</button>
            <button type="button" class="sb-btn sb-btn--primary" onclick="SietchBuilder.next()">Continuar →</button>
          `}
        </div>
      </div>
    `;
  }

  function render() {
    let body = '';
    if (state.step === 1) body = renderStep1();
    if (state.step === 2) body = renderStep2();
    if (state.step === 3) body = renderStep3();
    if (state.step === 4) body = renderStep4();

    let host = document.getElementById('sb-page-root');
    const isNew = !host;

    // Preserva scroll, foco e seleção do input antes do re-render
    let preservedScroll = 0;
    let preservedFocusSel = null;
    if (!isNew) {
      const oldMain = host.querySelector('.sb-page__main');
      if (oldMain) preservedScroll = oldMain.scrollTop;
      const af = document.activeElement;
      if (af && host.contains(af)) {
        preservedFocusSel = describeForFocus(af);
      }
    }

    if (isNew) {
      host = document.createElement('div');
      host.id = 'sb-page-root';
      document.body.appendChild(host);
    }

    const subtitle = state.mode === 'edit' ? 'Editando' : 'Novo curso';
    const title    = state.mode === 'edit' ? (state.meta.title || 'Sem título') : 'Criar treinamento';

    host.innerHTML = `
      <div class="sb-page" data-step="${state.step}">
        <header class="sb-page__head">
          <div class="sb-page__head-inner">
            <div class="sb-page__brand">
              <button type="button" class="sb-page__close" title="Fechar"
                onclick="SietchBuilder.close()" aria-label="Fechar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              </button>
              <div>
                <div class="sb-page__crumb">Sietch › Treinamentos › ${esc(subtitle)}</div>
                <h1 class="sb-page__title">${esc(title)}</h1>
              </div>
            </div>
            <div class="sb-page__stepper-wrap">${renderStepper()}</div>
          </div>
        </header>

        <main class="sb-page__main">
          <div class="sb-page__col">
            ${body}
          </div>
        </main>

        <footer class="sb-page__foot">
          <div class="sb-page__foot-inner">${renderFooter()}</div>
        </footer>
      </div>
    `;

    // Em re-renders, o innerHTML cria um .sb-page novo sem a classe --in.
    // Sem --in a página fica invisível (opacity: 0). Garante visibilidade
    // sempre, e só anima slide-up na PRIMEIRA abertura.
    const pageEl = host.querySelector('.sb-page');
    if (isNew) {
      attachOutsideClickClose();
      document.body.classList.add('sb-page-open');
      requestAnimationFrame(() => { if (pageEl) pageEl.classList.add('sb-page--in'); });
    } else if (pageEl) {
      pageEl.classList.add('sb-page--in');
    }

    // Restaura scroll e foco
    if (!isNew) {
      const newMain = host.querySelector('.sb-page__main');
      if (newMain && preservedScroll > 0) {
        newMain.scrollTop = preservedScroll;
      }
      if (preservedFocusSel) restoreFocus(preservedFocusSel);
    }

    // Auto-save em localStorage (debounced)
    saveStateDebounced();
  }

  // ─── Foco e scroll: preservação cross-render ─────────────────────────

  function describeForFocus(el) {
    if (!el) return null;
    // Tenta achar uma identidade estável: data-mod-field + data-mod-id pai,
    // ou um id, ou um attr name único.
    const modWrap = el.closest('[data-mod-id]');
    const modId = modWrap ? modWrap.getAttribute('data-mod-id') : null;
    const dataField = el.getAttribute('data-mod-field');
    const dataErrKey = el.getAttribute('data-err-key');
    const id = el.id || null;
    const name = el.getAttribute('name') || null;
    const selStart = (typeof el.selectionStart === 'number') ? el.selectionStart : null;
    const selEnd   = (typeof el.selectionEnd === 'number')   ? el.selectionEnd   : null;
    return { tag: el.tagName, modId, dataField, dataErrKey, id, name, selStart, selEnd };
  }

  function restoreFocus(d) {
    if (!d) return;
    let el = null;
    if (d.id) el = document.getElementById(d.id);
    if (!el && d.dataErrKey) el = document.querySelector(`[data-err-key="${d.dataErrKey}"]`);
    if (!el && d.modId && d.dataField) {
      const wrap = document.querySelector(`[data-mod-id="${d.modId}"]`);
      if (wrap) el = wrap.querySelector(`[data-mod-field="${d.dataField}"]`);
    }
    if (!el && d.name) el = document.querySelector(`[name="${d.name}"]`);
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
      if (d.selStart != null && d.selEnd != null && typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(d.selStart, d.selEnd);
      }
    } catch {}
  }

  function attachOutsideClickClose() {
    // Mantido apenas como no-op (dropdown legado removido). Escape continua fechando o wizard
    // via futuro handler se desejado.
  }

  window.SietchBuilder.close = function () {
    const host = document.getElementById('sb-page-root');
    if (!host) return;
    const page = host.querySelector('.sb-page');
    if (page) page.classList.remove('sb-page--in');
    setTimeout(() => {
      host.remove();
      document.body.classList.remove('sb-page-open');
    }, 220);
  };

  // ─── Salvar / publicar ───────────────────────────────────────────────

  async function ensureTrainingDraft() {
    if (state.trainingId) return state.trainingId;
    const r = await window.SietchAPI.createTraining({
      title: state.meta.title,
      description: state.meta.description,
      category: state.meta.category,
      tags: state.meta.tags,
      coverUrl: state.meta.coverUrl || null,
      policyRef: state.meta.policyRef || null,
      language: state.meta.language,
    });
    state.trainingId = r.training.id;
    return state.trainingId;
  }

  async function syncMetaUpdate() {
    if (!state.trainingId) return;
    await window.SietchAPI.updateTraining(state.trainingId, {
      title: state.meta.title,
      description: state.meta.description,
      category: state.meta.category,
      tags: state.meta.tags,
      coverUrl: state.meta.coverUrl || null,
      policyRef: state.meta.policyRef || null,
      language: state.meta.language,
    });
  }

  async function syncSettings() {
    if (!state.trainingId) return;
    await window.SietchAPI.updateTraining(state.trainingId, {
      isMandatory: state.settings.isMandatory,
      deadlineDays: state.settings.deadlineDays || null,
      passingScore: state.settings.passingScore,
      maxAttempts: state.settings.maxAttempts,
      visibility: state.settings.visibility,
      hasCertificate: state.settings.hasCertificate,
      recurrence: state.settings.recurrence,
    });
  }

  function isHttpUrl(s) {
    if (!s || typeof s !== 'string') return false;
    return /^https?:\/\/\S+$/i.test(s.trim());
  }
  function isUuid(s) {
    if (!s || typeof s !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
  }
  function clampInt(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  // Constrói payload limpo per-tipo, batendo exatamente com o schema Zod do backend.
  // Apenas os campos que o schema reconhece são incluídos; null não é enviado quando
  // o schema espera `optional` (não nullable).
  function sanitizeModulePayload(type, raw) {
    const p = raw || {};
    if (type === 'VIDEO') {
      const srcIn = p.source || {};
      const src = {};
      if (srcIn.video_id)      src.video_id     = String(srcIn.video_id);
      if (isHttpUrl(srcIn.url)) src.url         = srcIn.url.trim();
      if (srcIn.unlisted_hash) src.unlisted_hash = String(srcIn.unlisted_hash);
      if (isUuid(srcIn.asset_id)) src.asset_id  = srcIn.asset_id;
      if (srcIn.playback_id)   src.playback_id  = String(srcIn.playback_id);
      if (Number.isFinite(srcIn.duration_sec)) src.duration_sec = Math.max(0, Math.floor(srcIn.duration_sec));
      const out = {
        provider:      ['youtube','vimeo','upload'].includes(p.provider) ? p.provider : 'youtube',
        source:        src,
        allow_speed:   p.allow_speed !== false,
        min_watch_pct: clampInt(p.min_watch_pct, 50, 100, 90),
      };
      if (isHttpUrl(p.captions_url)) out.captions_url = p.captions_url.trim();
      const tr = (p.transcript_md || '').trim();
      if (tr) out.transcript_md = tr.slice(0, 50000);
      return out;
    }

    if (type === 'ARTICLE') {
      const out = {
        content_md: String(p.content_md || '').slice(0, 200000),
      };
      // attachments: array opcional — só envia se existir e bater com schema
      if (Array.isArray(p.attachments) && p.attachments.length) {
        out.attachments = p.attachments
          .filter(a => a && typeof a.name === 'string' && isHttpUrl(a.url))
          .map(a => ({ name: a.name, url: a.url }));
      }
      return out;
    }

    if (type === 'QUIZ') {
      const questions = Array.isArray(p.questions) ? p.questions : [];
      const out = {
        passing_score:        clampInt(p.passing_score, 0, 100, 70),
        max_attempts:         clampInt(p.max_attempts, 0, 100, 3),
        shuffle_questions:    p.shuffle_questions !== false,
        show_correct_answers: ['after_pass','always','never'].includes(p.show_correct_answers) ? p.show_correct_answers : 'after_pass',
        questions: questions.map(q => {
          const opts = Array.isArray(q.options) ? q.options : [];
          const cleanOpts = opts.map(o => ({
            id:      String(o.id || '').slice(0, 40) || 'o',
            text:    String(o.text || ''),
            correct: !!o.correct,
          })).filter(o => o.text.length > 0);
          const out = {
            id:        String(q.id || '').slice(0, 40),
            kind:      ['single','multiple','true_false'].includes(q.kind) ? q.kind : 'single',
            statement: String(q.statement || ''),
            options:   cleanOpts,
            weight:    clampInt(q.weight, 0, 100, 1),
          };
          const exp = (q.explanation || '').trim();
          if (exp) out.explanation = exp.slice(0, 2000);
          return out;
        }),
      };
      return out;
    }

    if (type === 'TASK') {
      const crit = Array.isArray(p.acceptance_criteria) ? p.acceptance_criteria : [];
      return {
        statement_md:    String(p.statement_md || '').slice(0, 50000),
        submission_kind: ['text','file','link','none'].includes(p.submission_kind) ? p.submission_kind : 'text',
        acceptance_criteria: crit
          .filter(c => c && c.text && String(c.text).trim())
          .map(c => ({ id: String(c.id || 'c'), text: String(c.text) })),
        auto_complete:   !!p.auto_complete,
        reviewer_role:   ['manager','admin','none'].includes(p.reviewer_role) ? p.reviewer_role : 'admin',
      };
    }

    if (type === 'POLICY') {
      // effective_date deve ser string ISO; usa hoje como fallback se vazio
      const today = new Date().toISOString().slice(0, 10);
      return {
        policy_ref:          String(p.policy_ref || '').slice(0, 20),
        policy_version:      String(p.policy_version || '').slice(0, 10),
        effective_date:      p.effective_date && /^\d{4}-\d{2}-\d{2}/.test(p.effective_date) ? p.effective_date : today,
        content_md:          String(p.content_md || '').slice(0, 200000),
        require_full_scroll: p.require_full_scroll !== false,
        accept_label:        String(p.accept_label || '').slice(0, 500),
      };
    }

    return p;
  }

  async function syncModules() {
    if (!state.trainingId) return;
    // estratégia simples: cria os que ainda não têm savedId, atualiza os que têm
    for (const mod of state.modules) {
      const body = {
        type: mod.type,
        title: mod.title || '(sem título)',
        description: mod.description || null,
        durationMin: mod.durationMin || 0,
        isRequired: mod.isRequired !== false,
        payload: sanitizeModulePayload(mod.type, mod.payload),
      };
      if (mod.savedId) {
        await window.SietchAPI.updateModule(state.trainingId, mod.savedId, {
          title: body.title,
          description: body.description,
          durationMin: body.durationMin,
          isRequired: body.isRequired,
          payload: body.payload,
        });
      } else {
        const r = await window.SietchAPI.createModule(state.trainingId, body);
        mod.savedId = r.module.id;
      }
    }
    // Reorder por garantia
    if (state.modules.length > 0) {
      const order = state.modules.map(m => m.savedId).filter(Boolean);
      if (order.length === state.modules.length) {
        await window.SietchAPI.reorderModules(state.trainingId, order);
      }
    }
  }

  // ─── Validadores das etapas 2 e 3 ────────────────────────────────────

  function validateStep2() {
    const errs = {};
    if (!state.modules || state.modules.length === 0) {
      errs._general = 'Adicione pelo menos 1 módulo antes de continuar.';
      return errs;
    }
    state.modules.forEach((mod, idx) => {
      const p = mod.payload || {};
      const k = (suffix) => `mod-${mod.tempId}-${suffix}`;
      const label = `Módulo ${idx + 1}`;

      if (!mod.title || mod.title.trim().length < 3) {
        errs[k('title')] = 'Título do módulo é obrigatório (≥ 3 caracteres)';
      }
      if (!mod.durationMin || mod.durationMin < 1) {
        errs[k('durationMin')] = 'Duração obrigatória (≥ 1 min)';
      }

      if (mod.type === 'VIDEO') {
        const src = p.source || {};
        const hasVideo = !!(src.video_id || src.asset_id);
        if (!hasVideo) {
          errs[k('video')] = `${label}: valide o link do vídeo (clique em "Validar") ou faça upload.`;
        }
        if (p.min_watch_pct != null && (p.min_watch_pct < 50 || p.min_watch_pct > 100)) {
          errs[k('min_watch_pct')] = `${label}: % mínima deve estar entre 50 e 100.`;
        }
      } else if (mod.type === 'ARTICLE') {
        const md = (p.content_md || '').trim();
        if (md.length < 50) {
          errs[k('content_md')] = `${label}: conteúdo do artigo precisa ter ≥ 50 caracteres.`;
        }
      } else if (mod.type === 'QUIZ') {
        const qs = p.questions || [];
        if (qs.length < 3) {
          errs[k('questions')] = `${label}: o quiz precisa de no mínimo 3 questões (tem ${qs.length}).`;
        }
        qs.forEach((q, qi) => {
          if (!q.statement || q.statement.trim().length < 5) {
            errs[k(`q-${q.id}-statement`)] = `${label} · Q${qi + 1}: enunciado obrigatório.`;
          }
          const opts = q.options || [];
          if (opts.length < 2) {
            errs[k(`q-${q.id}-opts`)] = `${label} · Q${qi + 1}: mínimo 2 opções.`;
          } else {
            const correct = opts.filter(o => o.correct);
            if (correct.length === 0) {
              errs[k(`q-${q.id}-correct`)] = `${label} · Q${qi + 1}: marque ao menos uma opção como correta.`;
            }
            opts.forEach((o, oi) => {
              if (!o.text || !o.text.trim()) {
                errs[k(`q-${q.id}-opt-${o.id}`)] = `${label} · Q${qi + 1}: opção ${oi + 1} sem texto.`;
              }
            });
          }
        });
        if (p.passing_score != null && (p.passing_score < 0 || p.passing_score > 100)) {
          errs[k('passing_score')] = `${label}: nota mínima entre 0 e 100.`;
        }
      } else if (mod.type === 'TASK') {
        const stmt = (p.statement_md || '').trim();
        if (stmt.length < 20) {
          errs[k('statement_md')] = `${label}: enunciado da tarefa (≥ 20 caracteres).`;
        }
      } else if (mod.type === 'POLICY') {
        if (!p.policy_ref || !p.policy_ref.trim()) {
          errs[k('policy_ref')] = `${label}: código da política obrigatório.`;
        }
        if (!p.policy_version || !p.policy_version.trim()) {
          errs[k('policy_version')] = `${label}: versão obrigatória.`;
        }
        if (!p.content_md || p.content_md.trim().length < 50) {
          errs[k('content_md')] = `${label}: conteúdo da política (≥ 50 caracteres).`;
        }
        if (!p.accept_label || !p.accept_label.trim()) {
          errs[k('accept_label')] = `${label}: texto do aceite obrigatório.`;
        }
      }
    });
    return errs;
  }

  function validateStep3() {
    const errs = {};
    const s = state.settings;
    if (s.deadlineDays != null && (s.deadlineDays < 0 || s.deadlineDays > 365)) {
      errs.deadlineDays = 'Entre 0 e 365 dias';
    }
    if (s.passingScore == null || s.passingScore < 0 || s.passingScore > 100) {
      errs.passingScore = 'Nota entre 0 e 100';
    }
    if (s.maxAttempts != null && (s.maxAttempts < 0 || s.maxAttempts > 20)) {
      errs.maxAttempts = 'Entre 0 e 20';
    }
    return errs;
  }

  // ─── Navegação entre etapas ──────────────────────────────────────────

  window.SietchBuilder.next = async function () {
    clearAllErrs();

    if (state.step === 1) {
      readStep1();
      const errs = validateStep1();
      if (hasAnyErrs(errs)) { setErrs(errs); render(); scrollFirstError(); return; }
      try {
        await ensureTrainingDraft();
        await syncMetaUpdate();
      } catch (e) {
        setErrs({ _general: 'Erro ao salvar: ' + e.message });
        render(); scrollFirstError(); return;
      }
    }

    if (state.step === 2) {
      const errs = validateStep2();
      if (hasAnyErrs(errs)) {
        // Expande módulos que têm erros pra usuário ver o que falta
        state.modules.forEach(m => {
          if (Object.keys(errs).some(k => k.startsWith(`mod-${m.tempId}-`))) {
            m.expanded = true;
          }
        });
        setErrs(errs);
        // Sem banner _general — o usuário vê os erros inline em cada campo
        render(); scrollFirstError(); return;
      }
      try { await syncModules(); }
      catch (e) {
        setErrs({ _general: 'Erro ao salvar módulos: ' + e.message });
        render(); scrollFirstError(); return;
      }
    }

    if (state.step === 3) {
      readStep3();
      const errs = validateStep3();
      if (hasAnyErrs(errs)) { setErrs(errs); render(); scrollFirstError(); return; }
      try { await syncSettings(); }
      catch (e) {
        setErrs({ _general: 'Erro ao salvar configs: ' + e.message });
        render(); scrollFirstError(); return;
      }
    }

    if (state.step < 4) state.step += 1;
    render();
  };

  window.SietchBuilder.back = function () {
    clearAllErrs();
    if (state.step > 1) state.step -= 1;
    render();
  };

  window.SietchBuilder.goTo = async function (n) {
    n = Math.max(1, Math.min(4, n));
    if (n === state.step) return;
    // Permite voltar livremente
    if (n < state.step) { clearAllErrs(); state.step = n; render(); return; }
    // Avançar: precisa rodar next() para cada etapa entre o atual e o alvo
    while (state.step < n) {
      const before = state.step;
      await window.SietchBuilder.next();
      // Se next bloqueou (erros), para
      if (state.step === before) return;
    }
  };

  window.SietchBuilder.saveDraft = async function () {
    try {
      if (state.step >= 1) readStep1();
      if (state.step >= 3) readStep3();
      await ensureTrainingDraft();
      await syncMetaUpdate();
      if (state.modules.length > 0) await syncModules();
      if (state.step >= 3) await syncSettings();
      if (window.showToast) window.showToast('Rascunho salvo', 'success');
      render();
    } catch (e) { alert('Erro: ' + e.message); }
  };

  window.SietchBuilder.runValidate = async function () {
    clearAllErrs();
    if (!state.trainingId) {
      try { await window.SietchBuilder.saveDraft(); }
      catch (e) { setErrs({ _general: 'Erro ao salvar: ' + e.message }); render(); return; }
    }
    try {
      const r = await window.SietchAPI.validateTraining(state.trainingId);
      state.validation = r;
      render();
    } catch (e) {
      setErrs({ _general: 'Erro ao validar: ' + e.message });
      render();
    }
  };

  // ─── Modal de atribuição ─────────────────────────────────────────────

  let _assignState = null;

  async function renderAssignModal(trainingId, trainingTitle) {
    _assignState = {
      trainingId,
      trainingTitle,
      mode: 'all',          // 'all' | 'specific'
      selectedUsers: new Set(),
      deadlineDays: 30,
      mandatory: true,
      users: [],
      loadingUsers: false,
    };

    // Cria overlay
    let host = document.getElementById('sb-assign-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sb-assign-root';
      document.body.appendChild(host);
    }
    renderAssignModalDom();

    // Carrega usuários do backend
    _assignState.loadingUsers = true;
    renderAssignModalDom();
    try {
      const r = await window.SietchAPI.colabUsers();
      _assignState.users = r.users || [];
    } catch (e) {
      _assignState.loadError = e.message;
    } finally {
      _assignState.loadingUsers = false;
      renderAssignModalDom();
    }
  }

  function renderAssignModalDom() {
    const s = _assignState;
    if (!s) return;
    const host = document.getElementById('sb-assign-root');
    if (!host) return;
    const allSelected = s.mode === 'specific' && s.users.length > 0 && s.users.every(u => s.selectedUsers.has(u.id));

    host.innerHTML = `
      <div class="sb-assign__backdrop" onclick="SietchBuilder.closeAssignModal()"></div>
      <div class="sb-assign__panel" role="dialog" aria-labelledby="sb-assign-title">
        <div class="sb-assign__head">
          <div>
            <div class="sb-assign__crumb">Atribuir</div>
            <h2 class="sb-assign__title" id="sb-assign-title">${esc(s.trainingTitle || '—')}</h2>
          </div>
          <button type="button" class="sb-page__close" onclick="SietchBuilder.closeAssignModal()" aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="sb-assign__body">
          <div class="sb-assign__section-title">Para quem?</div>
          <div class="sb-assign__choice-group">
            <label class="sb-assign__choice ${s.mode === 'all' ? 'is-selected' : ''}">
              <input type="radio" name="assign-mode" value="all" ${s.mode === 'all' ? 'checked' : ''}
                onchange="SietchBuilder.setAssignMode('all')">
              <div>
                <div class="sb-assign__choice-title">Todos os colaboradores</div>
                <div class="sb-assign__choice-desc">Atribuição em massa para todos os usuários ativos.</div>
              </div>
            </label>
            <label class="sb-assign__choice ${s.mode === 'specific' ? 'is-selected' : ''}">
              <input type="radio" name="assign-mode" value="specific" ${s.mode === 'specific' ? 'checked' : ''}
                onchange="SietchBuilder.setAssignMode('specific')">
              <div>
                <div class="sb-assign__choice-title">Colaboradores específicos</div>
                <div class="sb-assign__choice-desc">Você escolhe quem recebe.</div>
              </div>
            </label>
          </div>

          ${s.mode === 'specific' ? `
            <div class="sb-assign__users">
              <div class="sb-assign__users-head">
                <span class="sb-label sb-label--sm">${s.users.length} usuários · ${s.selectedUsers.size} selecionados</span>
                <button type="button" class="sb-add-opt" onclick="SietchBuilder.toggleAllUsers()">
                  ${allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>
              <div class="sb-assign__users-list">
                ${s.loadingUsers ? '<div class="sb-help">Carregando…</div>' :
                  s.users.length === 0 ? '<div class="sb-help">Nenhum usuário disponível.</div>' :
                  s.users.map(u => `
                    <label class="sb-assign__user ${s.selectedUsers.has(u.id) ? 'is-selected' : ''}">
                      <input type="checkbox" ${s.selectedUsers.has(u.id) ? 'checked' : ''}
                        onchange="SietchBuilder.toggleAssignUser('${u.id}')">
                      <div class="sb-assign__user-info">
                        <div class="sb-assign__user-name">${esc(u.name || u.email || '?')}</div>
                        <div class="sb-assign__user-meta">${esc(u.role || '')} ${u.team ? '· ' + esc(u.team) : ''}</div>
                      </div>
                    </label>
                  `).join('')
                }
              </div>
            </div>
          ` : ''}

          <div class="sb-assign__section-title" style="margin-top:18px;">Configurações</div>
          <div class="sb-grid-2">
            <div class="sb-field">
              <label class="sb-label">Prazo (dias)</label>
              <input type="number" min="1" max="365" value="${s.deadlineDays}"
                oninput="SietchBuilder.setAssignDeadline(parseInt(this.value, 10) || 30)">
            </div>
            <div class="sb-field">
              <label class="sb-label">Obrigatoriedade</label>
              <label class="sb-checkbox-line">
                <input type="checkbox" ${s.mandatory ? 'checked' : ''}
                  onchange="SietchBuilder.setAssignMandatory(this.checked)">
                <span>Marcar como obrigatório</span>
              </label>
            </div>
          </div>

          ${s.loadError ? `<div class="sb-banner-error">Erro: ${esc(s.loadError)}</div>` : ''}
          ${s.actionError ? `<div class="sb-banner-error">${esc(s.actionError)}</div>` : ''}
        </div>

        <div class="sb-assign__foot">
          <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.closeAssignModal()">Cancelar</button>
          <button type="button" class="sb-btn sb-btn--primary"
            ${s.mode === 'specific' && s.selectedUsers.size === 0 ? 'disabled' : ''}
            onclick="SietchBuilder.confirmAssign()">
            ${s.mode === 'all' ? 'Atribuir a todos' : `Atribuir a ${s.selectedUsers.size}`}
          </button>
        </div>
      </div>
    `;
  }

  window.SietchBuilder.setAssignMode = function (mode) {
    if (!_assignState) return;
    _assignState.mode = mode;
    renderAssignModalDom();
  };
  window.SietchBuilder.toggleAssignUser = function (userId) {
    if (!_assignState) return;
    if (_assignState.selectedUsers.has(userId)) _assignState.selectedUsers.delete(userId);
    else _assignState.selectedUsers.add(userId);
    renderAssignModalDom();
  };
  window.SietchBuilder.toggleAllUsers = function () {
    if (!_assignState) return;
    const allSelected = _assignState.users.every(u => _assignState.selectedUsers.has(u.id));
    if (allSelected) _assignState.selectedUsers.clear();
    else _assignState.users.forEach(u => _assignState.selectedUsers.add(u.id));
    renderAssignModalDom();
  };
  window.SietchBuilder.setAssignDeadline = function (d) {
    if (_assignState) _assignState.deadlineDays = d;
  };
  window.SietchBuilder.setAssignMandatory = function (m) {
    if (_assignState) _assignState.mandatory = m;
  };
  window.SietchBuilder.closeAssignModal = function () {
    const host = document.getElementById('sb-assign-root');
    if (host) host.remove();
    _assignState = null;
  };
  window.SietchBuilder.confirmAssign = async function () {
    const s = _assignState;
    if (!s) return;
    const userIds = s.mode === 'all' ? s.users.map(u => u.id) : Array.from(s.selectedUsers);
    if (userIds.length === 0) {
      s.actionError = 'Selecione pelo menos um colaborador';
      renderAssignModalDom();
      return;
    }
    try {
      const dueAt = s.deadlineDays
        ? new Date(Date.now() + s.deadlineDays * 86400000).toISOString()
        : null;
      await window.SietchAPI.bulkAssign({
        trainingId: s.trainingId,
        userIds,
        dueAt,
      });
      if (window.showToast) window.showToast(`Atribuído a ${userIds.length} colaborador(es)`, 'success');
      window.SietchBuilder.closeAssignModal();
      if (window.SietchBridge?.reloadAssignments) await window.SietchBridge.reloadAssignments();
      if (window.renderTreinamentos) window.renderTreinamentos();
    } catch (e) {
      s.actionError = 'Erro: ' + (e.details ? JSON.stringify(e.details) : e.message);
      renderAssignModalDom();
    }
  };

  // ─── Ações do edit mode ──────────────────────────────────────────────

  window.SietchBuilder.archiveTraining = async function () {
    if (!state.trainingId) return;
    if (!confirm('Arquivar este treinamento? Ele sairá do catálogo ativo (não é deletado).')) return;
    try {
      await window.SietchAPI.archiveTraining(state.trainingId);
      if (window.SietchBridge?.reloadCatalog) await window.SietchBridge.reloadCatalog();
      if (window.renderTreinamentos) window.renderTreinamentos();
      if (window.showToast) window.showToast('Treinamento arquivado', 'success');
      window.SietchBuilder.close();
    } catch (e) {
      setErrs({ _general: 'Erro ao arquivar: ' + e.message });
      render();
    }
  };

  window.SietchBuilder.previewAsStudent = async function () {
    if (!state.trainingId) return;
    // Injeta uma "assignment" sintética no MY_ASSIGNMENTS pra reutilizar o player
    const fakeId = 'preview-' + state.trainingId;
    window.MY_ASSIGNMENTS = window.MY_ASSIGNMENTS || [];
    if (!window.MY_ASSIGNMENTS.find(a => a.id === fakeId)) {
      window.MY_ASSIGNMENTS.push({
        id: fakeId,
        trainingId: state.trainingId,
        title: state.meta.title || 'Pré-visualização',
        track: 'soft',
        status: 'pendente',
        progress: 0,
        progressByModule: {},
        deadline: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        mandatory: !!state.settings.isMandatory,
        _preview: true,
      });
    }
    if (window.SietchBridge?.hydrateModules) {
      try { await window.SietchBridge.hydrateModules(state.trainingId); } catch {}
    }
    if (typeof window.openTrainingPlayer === 'function') {
      window.openTrainingPlayer(fakeId);
    }
  };

  window.SietchBuilder.openAssignModal = function () {
    if (!state.trainingId) return;
    renderAssignModal(state.trainingId, state.meta.title);
  };

  window.SietchBuilder.publish = async function () {
    if (!state.trainingId) {
      setErrs({ _general: 'Salve o rascunho antes de publicar.' });
      render(); return;
    }
    // Garante validação server-side antes de publicar
    if (!state.validation) {
      await window.SietchBuilder.runValidate();
      if (!state.validation || !state.validation.valid) return;
    }
    if (state.validation && !state.validation.valid) return;
    try {
      await window.SietchAPI.publishTraining(state.trainingId, 'minor');
      clearSavedState(); // rascunho não é mais necessário
      window.SietchBuilder.close();
      if (window.SietchBridge?.reloadCatalog) await window.SietchBridge.reloadCatalog();
      if (window.renderTreinamentos) window.renderTreinamentos();
      if (window.showToast) window.showToast('Treinamento publicado!', 'success');
    } catch (e) {
      setErrs({ _general: 'Erro ao publicar: ' + (e.details ? JSON.stringify(e.details) : e.message) });
      render();
    }
  };

  // ─── API pública ─────────────────────────────────────────────────────

  window.SietchBuilder.open = async function (opts = {}) {
    state = newDraftState();

    // Modo edit: hidrata do backend SEM restaurar localStorage
    if (opts.trainingId) {
      state.trainingId = opts.trainingId;
      state.mode = 'edit';
      render();
      try {
        await hydrateFromBackend(opts.trainingId);
      } catch (e) {
        setErrs({ _general: 'Erro ao carregar treinamento: ' + e.message });
      }
      render();
      return;
    }

    // Modo create: se houver rascunho salvo, restaura
    const saved = loadSavedState();
    if (saved && !opts.fresh) {
      // restaura tudo
      state.mode       = saved.mode || 'create';
      state.trainingId = saved.trainingId || null;
      state.step       = saved.step || 1;
      state.meta       = { ...state.meta, ...(saved.meta || {}) };
      state.modules    = Array.isArray(saved.modules) ? saved.modules : [];
      state.settings   = { ...state.settings, ...(saved.settings || {}) };
      state._toolbarOpen = !!saved._toolbarOpen;
      if (window.showToast) window.showToast('Rascunho restaurado', 'info');
    }
    render();
  };

  // Permite descartar manualmente
  window.SietchBuilder.discardDraft = function () {
    if (!confirm('Descartar o rascunho atual e começar do zero?')) return;
    clearSavedState();
    state = newDraftState();
    render();
  };

  window.SietchBuilder.hasDraft = function () {
    const s = loadSavedState();
    return !!(s && (s.meta?.title || s.modules?.length));
  };

  // Carrega dados do backend para o state do wizard (modo edição)
  async function hydrateFromBackend(trainingId) {
    const trainingResp = await window.SietchAPI.getTraining(trainingId);
    const t = trainingResp.training || trainingResp;
    // Meta
    state.meta = {
      title:       t.title || '',
      description: t.description || '',
      category:    t.category || '',
      tags:        t.tags || [],
      coverUrl:    t.coverUrl || '',
      policyRef:   t.policyRef || '',
      language:    t.language || 'pt-BR',
    };
    // Settings
    state.settings = {
      isMandatory:    !!t.isMandatory,
      deadlineDays:   t.deadlineDays ?? 30,
      passingScore:   t.passingScore ?? 70,
      maxAttempts:    t.maxAttempts ?? 0,
      visibility:     t.visibility || 'ALL',
      hasCertificate: !!t.hasCertificate,
      recurrence:     t.recurrence || { kind: 'never' },
    };
    // Módulos (vem em t.modules pelo include do getTrainingById)
    const mods = Array.isArray(t.modules) ? t.modules : (await window.SietchAPI.listModules(trainingId)).modules || [];
    state.modules = mods.map(m => ({
      tempId:      uid(),
      savedId:     m.id,
      type:        m.type,
      title:       m.title || '',
      description: m.description || '',
      durationMin: m.durationMin || 0,
      isRequired:  m.isRequired !== false,
      payload:     m.payload || {},
      expanded:    false,
    }));
  }

  // Hook global pro click no card admin
  window.openAdminTrainingEdit = function (trainingId) {
    window.SietchBuilder.open({ trainingId });
  };

  // Abrir treinamento no modo "visualização como aluno" com barra admin fixa
  window.openAdminTrainingView = async function (trainingId) {
    if (!trainingId) return;
    // Garante metadata mínima
    const t = (window.TRAINING_CATALOG || []).find(x => x.id === trainingId);
    const title = t?.title || 'Treinamento';

    // Cria assignment sintética
    const fakeId = 'preview-' + trainingId;
    window.MY_ASSIGNMENTS = window.MY_ASSIGNMENTS || [];
    if (!window.MY_ASSIGNMENTS.find(a => a.id === fakeId)) {
      window.MY_ASSIGNMENTS.push({
        id: fakeId,
        trainingId,
        title,
        track: t?.track || 'soft',
        status: 'pendente',
        progress: 0,
        progressByModule: {},
        deadline: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        mandatory: !!t?.mandatory,
        _preview: true,
      });
    }
    // Hidrata módulos do backend
    if (window.SietchBridge?.hydrateModules) {
      try { await window.SietchBridge.hydrateModules(trainingId); } catch {}
    }
    if (typeof window.openTrainingPlayer === 'function') {
      window.openTrainingPlayer(fakeId);
    }
    // Aguarda o player abrir e injeta a barra admin
    setTimeout(() => injectAdminActionBar(trainingId, title), 300);
  };

  function injectAdminActionBar(trainingId, title) {
    // Remove se já existe
    const old = document.getElementById('sb-admin-bar');
    if (old) old.remove();

    const overlay = document.getElementById('trein-player-overlay');
    if (!overlay) return;

    const bar = document.createElement('div');
    bar.id = 'sb-admin-bar';
    bar.innerHTML = `
      <div class="sb-admin-bar__inner">
        <div class="sb-admin-bar__label">
          <span class="sb-admin-bar__chip">ADMIN</span>
          <span class="sb-admin-bar__title">${esc(title)}</span>
        </div>
        <div class="sb-admin-bar__actions">
          <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.adminEditFromView('${trainingId}')">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-9 9H2v-3z"/></svg>
            Editar
          </button>
          <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.adminAssignFromView('${trainingId}', '${esc(title)}')">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M2 14c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M12 6v4M14 8h-4"/></svg>
            Atribuir
          </button>
          <button type="button" class="sb-btn sb-btn--ghost sb-btn--danger-ghost" onclick="SietchBuilder.adminArchiveFromView('${trainingId}')">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4M3.5 4l.7 9a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-9"/></svg>
            Arquivar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(bar);

    // Hook no fechamento do player pra remover a barra
    const origClose = window.closePlayerOverlay;
    if (origClose && !origClose._sietchAdminBarWrap) {
      window.closePlayerOverlay = function () {
        const b = document.getElementById('sb-admin-bar');
        if (b) b.remove();
        return origClose.apply(this, arguments);
      };
      window.closePlayerOverlay._sietchAdminBarWrap = true;
    }
  }

  window.SietchBuilder.adminEditFromView = function (trainingId) {
    // Fecha player e abre wizard em edit
    if (typeof window.closePlayerOverlay === 'function') window.closePlayerOverlay();
    setTimeout(() => window.SietchBuilder.open({ trainingId }), 220);
  };
  window.SietchBuilder.adminAssignFromView = function (trainingId, title) {
    renderAssignModal(trainingId, title);
  };
  window.SietchBuilder.adminArchiveFromView = async function (trainingId) {
    if (!confirm('Arquivar este treinamento? Ele sairá do catálogo ativo.')) return;
    try {
      await window.SietchAPI.archiveTraining(trainingId);
      if (typeof window.closePlayerOverlay === 'function') window.closePlayerOverlay();
      if (window.SietchBridge?.reloadCatalog) await window.SietchBridge.reloadCatalog();
      if (window.renderTreinamentos) window.renderTreinamentos();
      if (window.showToast) window.showToast('Treinamento arquivado', 'success');
    } catch (e) {
      alert('Erro ao arquivar: ' + e.message);
    }
  };

  // Substitui o openCreateTraining global — depois do bridge instalar o dele
  function installOverride() {
    window.openCreateTraining = function () { window.SietchBuilder.open(); };
  }

  // Auto-resume: se houver rascunho válido ao carregar, reabre o wizard
  function tryAutoResume() {
    try {
      const s = loadSavedState();
      if (!s) return;
      const hasContent = (s.meta?.title || (s.modules && s.modules.length > 0));
      if (!hasContent) return;
      // Aguarda um pouco para o bridge terminar de carregar o app
      setTimeout(() => {
        if (typeof window.openCreateTraining === 'function') {
          window.SietchBuilder.open();
        }
      }, 800);
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => { installOverride(); tryAutoResume(); }, 0);
    });
  } else {
    installOverride();
    tryAutoResume();
  }
})();
