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

  // ─── Estado global do wizard ─────────────────────────────────────────

  let state = null;

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
      error: null,
    };
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
      ${renderStepper()}
      <div class="sb-form">
        <div class="sb-field">
          <label class="sb-label">Título <span class="sb-req">*</span></label>
          <input id="sb-title" type="text" maxlength="80"
            value="${esc(m.title)}"
            placeholder="Ex: Fundamentos de Cyber Security">
          <div class="sb-help">3–80 caracteres</div>
        </div>

        <div class="sb-field">
          <label class="sb-label">Descrição <span class="sb-req">*</span></label>
          <textarea id="sb-desc" maxlength="500"
            placeholder="O que o colaborador vai aprender? Em quais situações vai aplicar?"
            style="min-height:100px;">${esc(m.description)}</textarea>
          <div class="sb-help">20–500 caracteres</div>
        </div>

        <div class="sb-grid-2">
          <div class="sb-field">
            <label class="sb-label">Categoria <span class="sb-req">*</span></label>
            <select id="sb-category">
              <option value="">Selecionar…</option>
              ${CATEGORIES.map(c => `
                <option value="${c.value}" ${m.category === c.value ? 'selected' : ''}>${c.label}</option>
              `).join('')}
            </select>
          </div>
          <div class="sb-field">
            <label class="sb-label">Idioma</label>
            <select id="sb-language">
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
          <div class="sb-field">
            <label class="sb-label">Capa (URL)</label>
            <input id="sb-cover" type="url" value="${esc(m.coverUrl)}"
              placeholder="https://..." >
            <div class="sb-help">Recomendado 1200×630, jpg/png/webp</div>
          </div>
          <div class="sb-field">
            <label class="sb-label">Política vinculada</label>
            <input id="sb-policy-ref" type="text" maxlength="20" value="${esc(m.policyRef)}"
              placeholder="Ex: DOC-005">
            <div class="sb-help">Código da política (opcional)</div>
          </div>
        </div>
      </div>
    `;
  }

  function readStep1() {
    state.meta.title       = $('#sb-title').value.trim();
    state.meta.description = $('#sb-desc').value.trim();
    state.meta.category    = $('#sb-category').value;
    state.meta.language    = $('#sb-language').value;
    state.meta.coverUrl    = $('#sb-cover').value.trim();
    state.meta.policyRef   = $('#sb-policy-ref').value.trim();
  }

  function validateStep1() {
    const m = state.meta;
    if (!m.title || m.title.length < 3) return 'Título obrigatório (3–80 chars)';
    if (m.title.length > 80) return 'Título muito longo (máx 80)';
    if (!m.description || m.description.length < 20) return 'Descrição precisa ter no mínimo 20 caracteres';
    if (m.description.length > 500) return 'Descrição muito longa (máx 500)';
    if (!m.category) return 'Categoria obrigatória';
    return null;
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
      ${renderStepper()}
      <div class="sb-form">
        <div class="sb-section-head">
          <div>
            <div class="sb-section-title">Módulos do treinamento</div>
            <div class="sb-help">Adicione na ordem em que aparecerão pro colaborador. Reordenar com ↑/↓.</div>
          </div>
          <div class="sb-add-menu">
            <button type="button" class="sb-btn sb-btn--primary" onclick="SietchBuilder.toggleAddMenu()">+ Adicionar módulo</button>
            <div id="sb-add-menu" class="sb-add-menu__list" hidden>
              ${MODULE_TYPES.map(t => `
                <button type="button" class="sb-add-menu__item" onclick="SietchBuilder.addModule('${t.value}')">
                  <span class="sb-add-menu__icon">${t.icon}</span>
                  <span>
                    <span class="sb-add-menu__label">${t.label}</span>
                    <span class="sb-add-menu__desc">${t.desc}</span>
                  </span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        ${state.modules.length === 0 ? `
          <div class="sb-empty">
            <div class="sb-empty__title">Nenhum módulo ainda</div>
            <div class="sb-empty__desc">Comece adicionando vídeo, artigo, quiz, tarefa ou política.</div>
          </div>
        ` : `
          <div class="sb-modules">
            ${state.modules.map((mod, i) => renderModuleCard(mod, i)).join('')}
          </div>
        `}
      </div>
    `;
  }

  function renderModuleCard(mod, idx) {
    const total = state.modules.length;
    const typeMeta = MODULE_TYPES.find(t => t.value === mod.type) || {};
    const isExpanded = mod.expanded;

    return `
      <div class="sb-mod ${isExpanded ? 'is-open' : ''}" data-id="${mod.tempId}">
        <div class="sb-mod__head" onclick="SietchBuilder.toggleModule('${mod.tempId}')">
          <div class="sb-mod__index">${idx + 1}</div>
          <div class="sb-mod__type">
            <span class="sb-mod__icon">${typeMeta.icon || '·'}</span>
            <span class="sb-mod__type-label">${typeMeta.label || mod.type}</span>
          </div>
          <div class="sb-mod__title">${esc(mod.title || `Novo ${typeMeta.label || ''}`)}</div>
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
    const common = `
      <div class="sb-grid-2">
        <div class="sb-field">
          <label class="sb-label">Título do módulo <span class="sb-req">*</span></label>
          <input data-mod-field="title" type="text" value="${esc(mod.title)}" placeholder="Ex: OWASP Top 10">
        </div>
        <div class="sb-field">
          <label class="sb-label">Duração estimada (min) <span class="sb-req">*</span></label>
          <input data-mod-field="durationMin" type="number" min="0" max="600" value="${mod.durationMin || 0}">
        </div>
      </div>
      <div class="sb-field">
        <label class="sb-label">Descrição curta</label>
        <input data-mod-field="description" type="text" maxlength="200" value="${esc(mod.description || '')}" placeholder="Aparece abaixo do título">
      </div>
      <label class="sb-checkbox-line">
        <input type="checkbox" data-mod-field="isRequired" ${mod.isRequired !== false ? 'checked' : ''}>
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
      <div class="sb-mod-editor" data-mod-id="${mod.tempId}">
        ${common}
        <div class="sb-divider"></div>
        ${payloadEditor}
        <div class="sb-mod-editor__footer">
          <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.persistModule('${mod.tempId}')">Salvar módulo</button>
        </div>
      </div>
    `;
  }

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
        <div class="sb-field">
          <label class="sb-label">URL ou ID do vídeo</label>
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
    return `
      <div class="sb-field">
        <label class="sb-label">Conteúdo (Markdown) <span class="sb-req">*</span></label>
        <textarea style="min-height:240px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;"
          onchange="SietchBuilder.updateArticlePayload('${mod.tempId}', 'content_md', this.value)"
          placeholder="# Título\n\nTexto do artigo em markdown…">${esc(p.content_md || '')}</textarea>
        <div class="sb-help">Suporta cabeçalhos, listas, links, código, etc. Máx 200KB.</div>
      </div>
      <div class="sb-field">
        <label class="sb-label">Link externo (opcional)</label>
        <input type="url" value="${esc(p.external_link || '')}"
          onchange="SietchBuilder.updateArticlePayload('${mod.tempId}', 'external_link', this.value || null)"
          placeholder="https://...">
      </div>
    `;
  }

  window.SietchBuilder.updateArticlePayload = function (modId, key, value) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), [key]: value };
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
    return `
      <div class="sb-question">
        <div class="sb-question__head">
          <span class="sb-question__num">Q${idx + 1}</span>
          <select onchange="SietchBuilder.updateQuestion('${modId}', '${q.id}', 'kind', this.value)">
            <option value="single"     ${q.kind === 'single' ? 'selected' : ''}>Única correta</option>
            <option value="multiple"   ${q.kind === 'multiple' ? 'selected' : ''}>Múltiplas corretas</option>
            <option value="true_false" ${q.kind === 'true_false' ? 'selected' : ''}>Verdadeiro / Falso</option>
          </select>
          <input type="number" min="0" max="10" value="${q.weight ?? 1}" style="width:80px;"
            title="Peso"
            onchange="SietchBuilder.updateQuestion('${modId}', '${q.id}', 'weight', parseInt(this.value, 10) || 0)">
          <button type="button" class="sb-icon-btn sb-icon-btn--danger" title="Remover"
            onclick="SietchBuilder.removeQuestion('${modId}', '${q.id}')">×</button>
        </div>
        <div class="sb-field">
          <textarea style="min-height:60px;"
            onchange="SietchBuilder.updateQuestion('${modId}', '${q.id}', 'statement', this.value)"
            placeholder="Enunciado da questão">${esc(q.statement || '')}</textarea>
        </div>
        <div class="sb-options">
          ${(q.options || []).map((opt) => `
            <label class="sb-option">
              <input type="${q.kind === 'multiple' ? 'checkbox' : 'radio'}"
                name="sb-opt-${q.id}"
                ${opt.correct ? 'checked' : ''}
                onchange="SietchBuilder.toggleOptionCorrect('${modId}', '${q.id}', '${opt.id}', this.checked)">
              <input type="text" value="${esc(opt.text || '')}"
                placeholder="Texto da opção"
                onchange="SietchBuilder.updateOptionText('${modId}', '${q.id}', '${opt.id}', this.value)">
              <button type="button" class="sb-icon-btn sb-icon-btn--danger"
                onclick="SietchBuilder.removeOption('${modId}', '${q.id}', '${opt.id}')">×</button>
            </label>
          `).join('')}
        </div>
        ${q.kind !== 'true_false' ? `
          <button type="button" class="sb-btn sb-btn--ghost sb-btn--sm"
            onclick="SietchBuilder.addOption('${modId}', '${q.id}')">+ adicionar opção</button>
        ` : ''}
        <div class="sb-field">
          <label class="sb-label sb-label--sm">Explicação (opcional)</label>
          <input type="text" value="${esc(q.explanation || '')}"
            placeholder="Mostrada após responder"
            onchange="SietchBuilder.updateQuestion('${modId}', '${q.id}', 'explanation', this.value || null)">
        </div>
      </div>
    `;
  }

  window.SietchBuilder.updateQuizMeta = function (modId, key, value) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), [key]: value };
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

  window.SietchBuilder.toggleOptionCorrect = function (modId, qid, oid, checked) {
    const mod = state.modules.find(m => m.tempId === modId);
    const q = mod?.payload?.questions?.find(x => x.id === qid);
    if (!q) return;
    if (q.kind === 'multiple') {
      const o = q.options.find(o => o.id === oid);
      if (o) o.correct = checked;
    } else {
      q.options.forEach(o => { o.correct = (o.id === oid && checked); });
    }
    render();
  };

  window.SietchBuilder.updateOptionText = function (modId, qid, oid, text) {
    const mod = state.modules.find(m => m.tempId === modId);
    const q = mod?.payload?.questions?.find(x => x.id === qid);
    const o = q?.options.find(o => o.id === oid);
    if (o) o.text = text;
  };

  // ─── Editor: TASK ────────────────────────────────────────────────────

  function renderTaskEditor(mod) {
    const p = mod.payload || {};
    const criteria = p.acceptance_criteria || [];
    return `
      <div class="sb-field">
        <label class="sb-label">Enunciado (Markdown) <span class="sb-req">*</span></label>
        <textarea style="min-height:140px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;"
          onchange="SietchBuilder.updateTaskPayload('${mod.tempId}', 'statement_md', this.value)"
          placeholder="## Tarefa\n\nDescreva o que o colaborador deve entregar...">${esc(p.statement_md || '')}</textarea>
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

  window.SietchBuilder.updateTaskPayload = function (modId, key, value) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), [key]: value };
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
    return `
      <div class="sb-grid-3">
        <div class="sb-field">
          <label class="sb-label">Código <span class="sb-req">*</span></label>
          <input type="text" maxlength="20" value="${esc(p.policy_ref || '')}"
            onchange="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'policy_ref', this.value)"
            placeholder="Ex: DOC-001, A-01">
        </div>
        <div class="sb-field">
          <label class="sb-label">Versão <span class="sb-req">*</span></label>
          <input type="text" maxlength="10" value="${esc(p.policy_version || '')}"
            onchange="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'policy_version', this.value)"
            placeholder="Ex: 2.1">
        </div>
        <div class="sb-field">
          <label class="sb-label">Vigência</label>
          <input type="date" value="${esc(p.effective_date || '')}"
            onchange="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'effective_date', this.value)">
        </div>
      </div>

      <div class="sb-field">
        <label class="sb-label">Conteúdo da política (Markdown) <span class="sb-req">*</span></label>
        <textarea style="min-height:240px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;"
          onchange="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'content_md', this.value)"
          placeholder="# Política ABC\n\n## Escopo\n\nEsta política aplica-se a...">${esc(p.content_md || '')}</textarea>
      </div>

      <div class="sb-field">
        <label class="sb-label">Texto do aceite <span class="sb-req">*</span></label>
        <input type="text" maxlength="500"
          value="${esc(p.accept_label || '')}"
          onchange="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'accept_label', this.value)"
          placeholder="Ex: Li e concordo com a Política DOC-001 v2.1">
      </div>

      <label class="sb-checkbox-line">
        <input type="checkbox" ${p.require_full_scroll !== false ? 'checked' : ''}
          onchange="SietchBuilder.updatePolicyPayload('${mod.tempId}', 'require_full_scroll', this.checked)">
        <span>Só habilita aceite após rolagem completa do conteúdo</span>
      </label>
    `;
  }

  window.SietchBuilder.updatePolicyPayload = function (modId, key, value) {
    const mod = state.modules.find(m => m.tempId === modId);
    if (!mod) return;
    mod.payload = { ...(mod.payload || {}), [key]: value };
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

  window.SietchBuilder.toggleAddMenu = function () {
    const el = $('#sb-add-menu');
    if (el) el.hidden = !el.hidden;
  };

  window.SietchBuilder.addModule = function (type) {
    state.modules.forEach(m => { m.expanded = false; });
    const defaultPayloads = {
      VIDEO:   { provider: 'youtube', source: {}, allow_speed: true, min_watch_pct: 90 },
      ARTICLE: { content_md: '' },
      QUIZ:    { passing_score: 70, max_attempts: 3, shuffle_questions: true, show_correct_answers: 'after_pass', questions: [] },
      TASK:    { statement_md: '', submission_kind: 'text', acceptance_criteria: [], auto_complete: false, reviewer_role: 'admin' },
      POLICY:  { policy_ref: '', policy_version: '', effective_date: '', content_md: '', require_full_scroll: true, accept_label: '' },
    };
    state.modules.push({
      tempId: uid(),
      type,
      title: '',
      description: '',
      durationMin: 10,
      isRequired: true,
      payload: defaultPayloads[type] || {},
      expanded: true,
    });
    $('#sb-add-menu').hidden = true;
    render();
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
      ${renderStepper()}
      <div class="sb-form">
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
          <div class="sb-field">
            <label class="sb-label">Prazo de conclusão (dias)</label>
            <input id="sb-set-deadline" type="number" min="0" max="365" value="${s.deadlineDays ?? 30}">
            <div class="sb-help">0 = sem prazo</div>
          </div>
          <div class="sb-field">
            <label class="sb-label">Nota mínima geral (%)</label>
            <input id="sb-set-passing" type="number" min="0" max="100" value="${s.passingScore ?? 70}">
            <div class="sb-help">Aplicada à média ponderada dos quizzes</div>
          </div>
          <div class="sb-field">
            <label class="sb-label">Tentativas máx (curso)</label>
            <input id="sb-set-attempts" type="number" min="0" max="20" value="${s.maxAttempts ?? 0}">
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
    const typeCounts = state.modules.reduce((acc, x) => {
      acc[x.type] = (acc[x.type] || 0) + 1;
      return acc;
    }, {});
    return `
      ${renderStepper()}
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
    const canSave = state.trainingId !== null;
    return `
      <div class="sb-footer">
        ${state.step > 1 ? `
          <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.back()">← Voltar</button>
        ` : '<span></span>'}

        <div class="sb-footer__right">
          ${canSave ? `
            <span class="sb-help" style="margin-right:12px;">Rascunho salvo · v${state.trainingId.slice(0, 6)}</span>
          ` : ''}
          ${onLast ? `
            <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.runValidate()">Validar antes de publicar</button>
            <button type="button" class="sb-btn sb-btn--primary"
              ${state.validation && !state.validation.valid ? 'disabled' : ''}
              onclick="SietchBuilder.publish()">Publicar treinamento</button>
          ` : `
            <button type="button" class="sb-btn sb-btn--ghost" onclick="SietchBuilder.saveDraft()">Salvar rascunho</button>
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

    window.treinOpenModal({
      title: state.mode === 'edit' ? 'Editar treinamento' : 'Criar treinamento',
      body,
      footer: renderFooter(),
      wide: true,
    });
  }

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
        payload: mod.payload || {},
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

  window.SietchBuilder.next = async function () {
    if (state.step === 1) {
      readStep1();
      const err = validateStep1();
      if (err) { alert(err); return; }
      try {
        await ensureTrainingDraft();
        await syncMetaUpdate();
      } catch (e) { alert('Erro ao salvar: ' + e.message); return; }
    }
    if (state.step === 2) {
      // garante que módulos foram persistidos
      try { await syncModules(); }
      catch (e) { alert('Erro ao salvar módulos: ' + e.message); return; }
    }
    if (state.step === 3) {
      readStep3();
      try { await syncSettings(); }
      catch (e) { alert('Erro ao salvar configs: ' + e.message); return; }
    }
    if (state.step < 4) state.step += 1;
    render();
  };

  window.SietchBuilder.back = function () {
    if (state.step > 1) state.step -= 1;
    render();
  };

  window.SietchBuilder.goTo = function (n) {
    state.step = Math.max(1, Math.min(4, n));
    render();
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
    if (!state.trainingId) {
      await window.SietchBuilder.saveDraft();
    }
    try {
      const r = await window.SietchAPI.validateTraining(state.trainingId);
      state.validation = r;
      render();
    } catch (e) { alert('Erro: ' + e.message); }
  };

  window.SietchBuilder.publish = async function () {
    if (!state.trainingId) { alert('Salve primeiro'); return; }
    try {
      await window.SietchAPI.publishTraining(state.trainingId, 'minor');
      if (window.closeModal) window.closeModal();
      if (window.SietchBridge?.reloadCatalog) await window.SietchBridge.reloadCatalog();
      if (window.renderTreinamentos) window.renderTreinamentos();
      if (window.showToast) window.showToast('Treinamento publicado!', 'success');
    } catch (e) {
      alert('Erro ao publicar: ' + (e.details ? JSON.stringify(e.details) : e.message));
    }
  };

  // ─── API pública ─────────────────────────────────────────────────────

  window.SietchBuilder.open = function (opts = {}) {
    state = newDraftState();
    if (opts.trainingId) {
      state.trainingId = opts.trainingId;
      state.mode = 'edit';
      // TODO: hidratar do backend
    }
    render();
  };

  // Substitui o openCreateTraining global — depois do bridge instalar o dele
  function installOverride() {
    window.openCreateTraining = function () { window.SietchBuilder.open(); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Roda após o handler do bridge (que também escuta DOMContentLoaded).
      // Usar setTimeout 0 garante que o bridge installOverrides já rodou.
      setTimeout(installOverride, 0);
    });
  } else {
    installOverride();
  }
})();
