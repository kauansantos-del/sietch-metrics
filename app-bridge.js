// =====================================================================
//  app-bridge.js — Conecta o frontend (mockado) ao backend real.
//
//  Estratégia: não reescrevemos o HTML. Substituímos os arrays mock e
//  funções de save por chamadas API. O resto do render permanece igual.
// =====================================================================

(function () {
  'use strict';

  const API_BASE = (() => {
    const host = window.location.hostname;
    // Em dev local, o backend está em :4000. Em produção, no mesmo domínio.
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4000/api';
    return '/api';
  })();

  // ─── API client ──────────────────────────────────────────────────────

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
    });

    if (!res.ok) {
      let err;
      try { err = await res.json(); } catch { err = { error: { message: res.statusText } }; }
      const e = new Error(err.error?.message || `HTTP ${res.status}`);
      e.code = err.error?.code;
      e.status = res.status;
      e.details = err.error?.details;
      throw e;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  window.SietchAPI = {
    // Auth
    me:                () => api('/auth/me'),
    login:             (email) => api('/auth/login', { method: 'POST', body: { email } }),
    logout:            () => api('/auth/logout', { method: 'POST' }),
    usersForLogin:     () => api('/auth/users-for-login'),

    // Trainings (admin)
    listTrainings:     (q = '') => api('/trainings' + (q ? `?${q}` : '')),
    getTraining:       (id) => api(`/trainings/${id}`),
    createTraining:    (body) => api('/trainings', { method: 'POST', body }),
    updateTraining:    (id, body) => api(`/trainings/${id}`, { method: 'PATCH', body }),
    validateTraining:  (id) => api(`/trainings/${id}/validate`, { method: 'POST' }),
    publishTraining:   (id, bump = 'minor') => api(`/trainings/${id}/publish`, { method: 'POST', body: { version_bump: bump } }),
    archiveTraining:   (id) => api(`/trainings/${id}/archive`, { method: 'POST' }),

    // Modules
    listModules:       (tid) => api(`/trainings/${tid}/modules`),
    createModule:      (tid, body) => api(`/trainings/${tid}/modules`, { method: 'POST', body }),
    updateModule:      (tid, mid, body) => api(`/trainings/${tid}/modules/${mid}`, { method: 'PATCH', body }),
    deleteModule:      (tid, mid) => api(`/trainings/${tid}/modules/${mid}`, { method: 'DELETE' }),
    reorderModules:    (tid, order) => api(`/trainings/${tid}/modules/order`, { method: 'PUT', body: { order } }),

    // Assignments
    myAssignments:     (q = '') => api('/assignments/me' + (q ? `?${q}` : '')),
    mySummary:         () => api('/assignments/me/summary'),
    myAssignment:      (id) => api(`/assignments/me/${id}`),
    createAssignment:  (body) => api('/assignments', { method: 'POST', body }),
    bulkAssign:        (body) => api('/assignments/bulk', { method: 'POST', body }),

    // Player — module progress
    startModule:       (aid, mid) => api(`/assignments/me/${aid}/modules/${mid}/start`, { method: 'POST' }),
    completeModule:    (aid, mid) => api(`/assignments/me/${aid}/modules/${mid}/complete`, { method: 'POST' }),
    updateModuleProgress: (aid, mid, body) => api(`/assignments/me/${aid}/modules/${mid}/progress`, { method: 'PATCH', body }),

    // Player — quiz
    quizStart:         (aid, mid) => api(`/player/quiz/${aid}/${mid}/start`, { method: 'POST' }),
    quizSubmit:        (aid, mid, body) => api(`/player/quiz/${aid}/${mid}/submit`, { method: 'POST', body }),
    quizAttempts:      (aid, mid) => api(`/player/quiz/${aid}/${mid}/attempts`),
    quizAttempt:       (id) => api(`/player/quiz/attempts/${id}`),

    // Player — task
    taskSubmit:        (aid, mid, body) => api(`/player/task/${aid}/${mid}/submit`, { method: 'POST', body }),
    taskSubmissions:   (aid, mid) => api(`/player/task/${aid}/${mid}/submissions`),
    taskPendingReviews:() => api('/player/task/pending-reviews'),
    taskReview:        (sid, body) => api(`/player/task/submissions/${sid}/review`, { method: 'POST', body }),

    // Player — policy
    policyAccept:      (aid, mid, body) => api(`/player/policy/${aid}/${mid}/accept`, { method: 'POST', body }),
    policyAcceptances: () => api('/player/policy/acceptances'),
    policySnapshot:    (id) => api(`/player/policy/acceptances/${id}/snapshot`),

    // Player — video
    videoProgressGet:  (mid) => api(`/player/video/${mid}/progress`),
    videoProgressPost: (mid, body) => api(`/player/video/${mid}/progress`, { method: 'POST', body }),
    videoResolve:      (provider, input) => api('/player/video/resolve', { method: 'POST', body: { provider, input } }),

    // Drill-down (admin/RH)
    colabSummary:      (userId = 'me') => api(`/colaborador/users/${userId}/training-summary`),
    colabAssignment:   (userId, aid) => api(`/colaborador/users/${userId}/assignments/${aid}`),
    colabTimeline:     (userId, q = '') => api(`/colaborador/users/${userId}/activity` + (q ? `?${q}` : '')),

    // Listas de apoio
    listUsers:         () => api('/users'),
  };

  // ─── Mapeamento de enums ─────────────────────────────────────────────

  const CATEGORY_TO_TRACK = {
    COMPLIANCE: 'compliance',
    CYBER_SECURITY: 'cyber',
    PENTEST: 'pentest',
    DEV_FRONTEND: 'dev-front',
    DEV_BACKEND: 'dev-back',
    LIDERANCA: 'soft',
    SOFT_SKILLS: 'soft',
    OUTROS: 'ux',
  };

  const TRACK_TO_CATEGORY = {
    compliance: 'COMPLIANCE',
    cyber: 'CYBER_SECURITY',
    pentest: 'PENTEST',
    'dev-front': 'DEV_FRONTEND',
    'dev-back': 'DEV_BACKEND',
    antifraude: 'COMPLIANCE',
    ux: 'OUTROS',
    soft: 'SOFT_SKILLS',
  };

  const ASSIGNMENT_STATUS = {
    NOT_STARTED: 'pendente',
    IN_PROGRESS: 'andamento',
    COMPLETED: 'concluido',
    OVERDUE: 'atrasado',
    WAITING: 'aguardando',
  };

  const MODULE_TYPE_TO_FRONT = {
    VIDEO: 'video',
    ARTICLE: 'artigo',
    QUIZ: 'quiz',
    TASK: 'tarefa',
    POLICY: 'politica',
    LIVE: 'live',
  };

  function formatDuration(modules) {
    if (!Array.isArray(modules)) return 0;
    return modules.reduce((s, m) => s + (m.durationMin || 0), 0);
  }

  function diffDays(deadline) {
    if (!deadline) return null;
    const d = new Date(deadline);
    return Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24));
  }

  // ─── Adapters: backend → frontend mock format ────────────────────────

  function trainingToCatalog(t) {
    return {
      id: t.id,
      title: t.title,
      track: CATEGORY_TO_TRACK[t.category] || 'soft',
      duration: formatDuration(t.modules),
      mandatory: t.isMandatory,
      desc: t.description,
      modules: t._count?.modules ?? (t.modules?.length || 0),
      done: t._count?.assignments ?? 0,
      rating: 4.5,
      status: t.status === 'PUBLISHED' ? 'ativo' : (t.status === 'DRAFT' ? 'rascunho' : 'arquivado'),
      policy: t.policyRef || null,
      _raw: t, // mantém original
    };
  }

  function assignmentToFront(a) {
    const completed = (a.modulesProgress || []).filter(p => p.status === 'COMPLETED').length;
    return {
      id: a.id,
      trainingId: a.trainingId,
      trainingVersionId: a.trainingVersionId,
      title: a.training?.title || 'Treinamento',
      track: CATEGORY_TO_TRACK[a.training?.category] || 'soft',
      status: ASSIGNMENT_STATUS[a.status] || 'pendente',
      progress: Number(a.progressPct || 0),
      assignedBy: a.assignedByUser?.name || 'Sistema',
      deadline: a.dueAt ? String(a.dueAt).slice(0, 10) : null,
      duration: formatDuration(a.training?.modules),
      remaining: diffDays(a.dueAt) ?? 0,
      _completed: completed,
      _raw: a,
    };
  }

  // ─── Login overlay ───────────────────────────────────────────────────

  function buildLoginOverlay(users) {
    const opts = users.map(u => `<option value="${u.email}">${u.name} — ${u.email} (${u.role})</option>`).join('');
    return `
      <div id="sietch-login-overlay" style="
        position:fixed;inset:0;z-index:99999;
        background:radial-gradient(circle at 30% 30%, #1a1d2e 0%, #0d0e16 60%);
        display:flex;align-items:center;justify-content:center;
        font-family:'IBM Plex Sans',system-ui,sans-serif;color:#eaeaea;">
        <div style="
          background:#161823;border:1px solid #2a2d3d;border-radius:14px;
          padding:32px 36px;width:480px;max-width:92vw;
          box-shadow:0 20px 80px rgba(0,0,0,0.5);">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
            <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);"></div>
            <div>
              <div style="font-family:Michroma,sans-serif;font-size:18px;letter-spacing:1px;">SIETCH</div>
              <div style="font-size:11px;color:#888;letter-spacing:2px;">METRICS</div>
            </div>
          </div>
          <h2 style="font-size:22px;font-weight:600;margin:14px 0 6px;">Entrar</h2>
          <p style="font-size:13px;color:#8e92a8;margin:0 0 22px;">
            Selecione seu usuário para entrar na plataforma.
          </p>
          <label style="font-size:12px;color:#aab;display:block;margin-bottom:6px;">USUÁRIO</label>
          <select id="sietch-login-select" style="
            width:100%;padding:11px 13px;
            background:#0e1019;border:1px solid #2a2d3d;border-radius:8px;
            color:#eaeaea;font-size:14px;outline:none;">
            ${opts || '<option value="">Nenhum usuário disponível</option>'}
          </select>
          <button id="sietch-login-btn" style="
            margin-top:18px;width:100%;padding:12px 16px;
            background:linear-gradient(135deg,#6366f1,#8b5cf6);
            color:white;border:none;border-radius:8px;
            font-size:14px;font-weight:600;cursor:pointer;
            transition:opacity .2s;">
            Entrar
          </button>
          <div id="sietch-login-err" style="margin-top:12px;font-size:12px;color:#ff5e7d;min-height:16px;"></div>
          <div style="margin-top:24px;padding-top:18px;border-top:1px solid #22243380;font-size:11px;color:#666;text-align:center;">
            Login simplificado por email — para uso interno.
          </div>
        </div>
      </div>
    `;
  }

  async function showLoginScreen() {
    let users = [];
    try { const r = await window.SietchAPI.usersForLogin(); users = r.users || []; }
    catch (e) { console.warn('[bridge] users-for-login failed', e); }

    const wrap = document.createElement('div');
    wrap.innerHTML = buildLoginOverlay(users);
    document.body.appendChild(wrap.firstElementChild);

    return new Promise((resolve) => {
      const btn = document.getElementById('sietch-login-btn');
      const sel = document.getElementById('sietch-login-select');
      const err = document.getElementById('sietch-login-err');

      btn.addEventListener('click', async () => {
        const email = sel.value;
        if (!email) { err.textContent = 'Selecione um usuário'; return; }
        btn.disabled = true; btn.style.opacity = '0.6'; err.textContent = '';
        try {
          const r = await window.SietchAPI.login(email);
          document.getElementById('sietch-login-overlay').remove();
          resolve(r.user);
        } catch (e) {
          err.textContent = e.message || 'Falha ao entrar';
          btn.disabled = false; btn.style.opacity = '1';
        }
      });
    });
  }

  // ─── Loader de dados → preenche os arrays mock ───────────────────────

  async function loadCatalogIntoMock() {
    try {
      const r = await window.SietchAPI.listTrainings('limit=100');
      const items = (r.items || []).map(trainingToCatalog);

      if (window.TRAINING_CATALOG) {
        window.TRAINING_CATALOG.length = 0;
        items.forEach(i => window.TRAINING_CATALOG.push(i));
      } else {
        window.TRAINING_CATALOG = items;
      }
    } catch (e) {
      console.error('[bridge] listTrainings failed', e);
    }
  }

  async function loadAssignmentsIntoMock() {
    try {
      const r = await window.SietchAPI.myAssignments('limit=100');
      const items = (r.items || []).map(assignmentToFront);

      if (window.MY_ASSIGNMENTS) {
        window.MY_ASSIGNMENTS.length = 0;
        items.forEach(i => window.MY_ASSIGNMENTS.push(i));
      } else {
        window.MY_ASSIGNMENTS = items;
      }
    } catch (e) {
      console.error('[bridge] myAssignments failed', e);
    }
  }

  async function loadAllTrainingData() {
    await Promise.all([loadCatalogIntoMock(), loadAssignmentsIntoMock()]);
  }

  // ─── Bootstrap ───────────────────────────────────────────────────────

  async function bootstrap() {
    let user = null;

    try {
      const r = await window.SietchAPI.me();
      user = r.user;
    } catch {
      user = await showLoginScreen();
    }

    if (!user) return;

    // Popula currentUser global
    window.currentUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      picture: user.picture,
      // Compatibilidade com a estrutura mockada
      avatar: (user.name || '?').split(' ').map(s => s[0]).slice(0, 2).join(''),
    };

    // Mostra o app
    document.body.style.visibility = 'visible';

    // Carrega dados reais por trás dos arrays mock
    await loadAllTrainingData();

    // Re-renderiza a tela de treinamentos se já estiver montada
    if (typeof window.renderTreinamentos === 'function') {
      try { window.renderTreinamentos(); } catch (e) { console.warn(e); }
    }
    if (typeof window.renderHeader === 'function') {
      try { window.renderHeader(); } catch (e) { /* opcional */ }
    }
  }

  // ─── Helpers expostos pro código original ────────────────────────────

  window.SietchBridge = {
    reloadCatalog: loadCatalogIntoMock,
    reloadAssignments: loadAssignmentsIntoMock,
    reloadAll: loadAllTrainingData,
    logout: async () => {
      try { await window.SietchAPI.logout(); } finally { window.location.reload(); }
    },
    TRACK_TO_CATEGORY,
    CATEGORY_TO_TRACK,
    MODULE_TYPE_TO_FRONT,
  };

  // ─── Override de funções de save (criar, completar etc) ──────────────

  function installOverrides() {
    // Conclusão de módulo no player → POST /assignments/me/:aid/modules/:mid/complete
    window.completeModuleViaAPI = async function (assignmentId, moduleId) {
      try {
        await window.SietchAPI.completeModule(assignmentId, moduleId);
        await loadAssignmentsIntoMock();
        if (typeof window.renderTreinamentos === 'function') window.renderTreinamentos();
      } catch (e) {
        alert('Erro ao concluir módulo: ' + e.message);
      }
    };

    // Quiz: iniciar + submeter via API
    window.quizStartViaAPI  = (aid, mid) => window.SietchAPI.quizStart(aid, mid);
    window.quizSubmitViaAPI = (aid, mid, attemptId, answers) =>
      window.SietchAPI.quizSubmit(aid, mid, { attempt_id: attemptId, answers });

    // Task: submeter via API
    window.taskSubmitViaAPI = (aid, mid, kind, content) =>
      window.SietchAPI.taskSubmit(aid, mid, { kind, content });

    // Policy: aceitar via API
    window.policyAcceptViaAPI = (aid, mid, readingTimeSec) =>
      window.SietchAPI.policyAccept(aid, mid, { reading_time_sec: readingTimeSec });

    // Video: reportar progresso
    window.videoTickViaAPI = (mid, currentTimeSec, durationSec, intervalCovered) =>
      window.SietchAPI.videoProgressPost(mid, {
        event: 'tick',
        current_time_sec: currentTimeSec,
        duration_sec: durationSec,
        interval_covered: intervalCovered,
      });

    // Criar treinamento via API
    window.createTrainingViaAPI = async function (data) {
      const trackToCat = TRACK_TO_CATEGORY[data.track] || 'OUTROS';
      const payload = {
        title: data.title,
        description: data.desc || data.description || '',
        category: trackToCat,
        tags: data.tags || [],
        policyRef: data.policy || null,
      };
      const r = await window.SietchAPI.createTraining(payload);
      await loadCatalogIntoMock();
      return r.training;
    };
  }

  // ─── Start ───────────────────────────────────────────────────────────

  document.body.style.visibility = 'hidden';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installOverrides();
      bootstrap();
    });
  } else {
    installOverrides();
    bootstrap();
  }
})();
