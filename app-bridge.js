// =====================================================================
//  app-bridge.js — Conecta o frontend ao backend real.
//
//  Estratégia:
//  1) Auth via Bearer token (cross-origin-friendly em dev 5500↔4000)
//  2) Hijack dos arrays mock (TRAINING_CATALOG, MY_ASSIGNMENTS, etc)
//  3) Override de funções de salvamento (criar, completar, submeter)
//  4) Re-render automático após cada operação
// =====================================================================

(function () {
  'use strict';

  const API_BASE = (() => {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4000/api';
    return '/api';
  })();

  const TOKEN_KEY = 'sietch_metrics_token';

  function getToken()  { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); }
  function clearToken(){ localStorage.removeItem(TOKEN_KEY); }

  // ─── API client ──────────────────────────────────────────────────────

  async function api(path, options = {}) {
    const token = getToken();
    const headers = {
      ...(options.headers || {}),
    };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(API_BASE + path, {
      ...options,
      credentials: 'include',
      headers,
      body:
        options.body && typeof options.body !== 'string' && !(options.body instanceof FormData)
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

      if (res.status === 401) clearToken();
      throw e;
    }
    if (res.status === 204) return null;

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    if (ct.includes('text/csv') || ct.includes('text/html')) return res.text();
    return res.blob();
  }

  window.SietchAPI = {
    // Auth
    me:                () => api('/auth/me'),
    login:             async (email) => {
      const r = await api('/auth/login', { method: 'POST', body: { email } });
      if (r.token) setToken(r.token);
      return r;
    },
    logout:            async () => {
      try { await api('/auth/logout', { method: 'POST' }); } finally { clearToken(); }
    },
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

    // Drill-down (admin/gestor)
    colabSummary:      (userId = 'me') => api(`/colaborador/users/${userId}/training-summary`),
    colabAssignment:   (userId, aid) => api(`/colaborador/users/${userId}/assignments/${aid}`),
    colabTimeline:     (userId, q = '') => api(`/colaborador/users/${userId}/activity` + (q ? `?${q}` : '')),
    colabUsers:        () => api('/colaborador/users'),

    // Admin actions
    adminResetAttempts:(body) => api('/admin/quiz/reset-attempts', { method: 'POST', body }),
    adminVoidQuestion: (body) => api('/admin/quiz/void-question', { method: 'POST', body }),
    adminReassign:     (body) => api('/admin/assignments/reassign', { method: 'POST', body }),
    adminCertificate:  (aid) => api(`/admin/certificate/${aid}`),

    // Exports — devolve URL (link de download) ou blob
    exportTrainingsCsv:(userId = 'me') => `${API_BASE}/admin/exports/users/${userId}/trainings.csv`,
    exportAcceptancesCsv: (userId = 'me') => `${API_BASE}/admin/exports/users/${userId}/acceptances.csv`,
    exportProgressCsv: (trainingId) => `${API_BASE}/admin/exports/trainings/${trainingId}/progress.csv`,

    // Uploads
    uploadCover:       (file) => {
      const fd = new FormData(); fd.append('file', file);
      return api('/uploads/cover', { method: 'POST', body: fd });
    },
    uploadVideo:       (file) => {
      const fd = new FormData(); fd.append('file', file);
      return api('/uploads/video', { method: 'POST', body: fd });
    },
    getVideoAsset:     (id) => api(`/uploads/video/${id}`),
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
      cover: t.coverUrl || null,
      _raw: t,
    };
  }

  function assignmentToFront(a) {
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
      _raw: a,
    };
  }

  // ─── Login overlay ───────────────────────────────────────────────────

  function buildLoginOverlay(users) {
    const opts = users.map(u =>
      `<option value="${u.email}">${u.name} — ${u.email} (${u.role})</option>`,
    ).join('');
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
            font-size:14px;font-weight:600;cursor:pointer;">
            Entrar
          </button>
          <div id="sietch-login-err" style="margin-top:12px;font-size:12px;color:#ff5e7d;min-height:16px;"></div>
          <div style="margin-top:24px;padding-top:18px;border-top:1px solid #22243380;font-size:11px;color:#666;text-align:center;">
            Login simplificado por email — uso interno.
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

  // ─── Loader de dados ─────────────────────────────────────────────────

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

  async function loadTeamIntoMock() {
    try {
      const r = await window.SietchAPI.colabUsers();
      const items = (r.users || []).map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        team: u.team,
        avatar: (u.name || '?').split(' ').map(s => s[0]).slice(0, 2).join(''),
        andamento: 0,
        atrasados: 0,
        concluidos: 0,
        proximoPrazo: null,
        ultimaConclusao: null,
      }));
      if (window.TEAM_MEMBERS_TREIN) {
        window.TEAM_MEMBERS_TREIN.length = 0;
        items.forEach(i => window.TEAM_MEMBERS_TREIN.push(i));
      } else {
        window.TEAM_MEMBERS_TREIN = items;
      }
    } catch (e) {
      console.error('[bridge] colabUsers failed', e);
    }
  }

  async function loadPendingReviewsIntoMock() {
    try {
      const r = await window.SietchAPI.taskPendingReviews();
      const items = (r.submissions || []).map((s) => ({
        id: s.id,
        collaborator: s.moduleProgress?.assignment?.user?.name || '?',
        training: s.moduleProgress?.assignment?.training?.title || '?',
        completedAt: s.submittedAt ? String(s.submittedAt).slice(0, 10) : '',
        evidence: true,
      }));
      if (window.VALIDATION_QUEUE) {
        window.VALIDATION_QUEUE.length = 0;
        items.forEach(i => window.VALIDATION_QUEUE.push(i));
      } else {
        window.VALIDATION_QUEUE = items;
      }
    } catch (e) {
      console.error('[bridge] pendingReviews failed', e);
    }
  }

  async function loadAllTrainingData() {
    await Promise.all([
      loadCatalogIntoMock(),
      loadAssignmentsIntoMock(),
      loadTeamIntoMock(),
      loadPendingReviewsIntoMock(),
    ]);
  }

  function reRender() {
    if (typeof window.renderTreinamentos === 'function') {
      try { window.renderTreinamentos(); } catch (e) { console.warn(e); }
    }
  }

  // ─── Overrides de ações ──────────────────────────────────────────────

  function installOverrides() {
    // ── Conclusão de módulo (player) ──────────────────────────────────
    window.completeModuleViaAPI = async function (assignmentId, moduleId) {
      try {
        await window.SietchAPI.completeModule(assignmentId, moduleId);
        await loadAssignmentsIntoMock();
        reRender();
      } catch (e) {
        alert('Erro ao concluir módulo: ' + e.message);
      }
    };

    // ── Quiz ──────────────────────────────────────────────────────────
    window.quizStartViaAPI  = (aid, mid) => window.SietchAPI.quizStart(aid, mid);
    window.quizSubmitViaAPI = async (aid, mid, attemptId, answers) => {
      const r = await window.SietchAPI.quizSubmit(aid, mid, {
        attempt_id: attemptId, answers,
      });
      await loadAssignmentsIntoMock();
      reRender();
      return r;
    };
    window.quizAttemptsViaAPI = (aid, mid) => window.SietchAPI.quizAttempts(aid, mid);
    window.quizAttemptDetailViaAPI = (attemptId) => window.SietchAPI.quizAttempt(attemptId);

    // ── Task ──────────────────────────────────────────────────────────
    window.taskSubmitViaAPI = async (aid, mid, kind, content) => {
      const r = await window.SietchAPI.taskSubmit(aid, mid, { kind, content });
      await loadAssignmentsIntoMock();
      reRender();
      return r;
    };
    window.taskSubmissionsViaAPI = (aid, mid) => window.SietchAPI.taskSubmissions(aid, mid);
    window.taskReviewViaAPI = async (sid, decision, feedback, criteriaChecks) => {
      const r = await window.SietchAPI.taskReview(sid, { decision, feedback, criteriaChecks });
      await loadPendingReviewsIntoMock();
      reRender();
      return r;
    };

    // ── Policy ────────────────────────────────────────────────────────
    window.policyAcceptViaAPI = async (aid, mid, readingTimeSec) => {
      const r = await window.SietchAPI.policyAccept(aid, mid, {
        reading_time_sec: readingTimeSec,
      });
      await loadAssignmentsIntoMock();
      reRender();
      return r;
    };
    window.policyAcceptancesViaAPI = () => window.SietchAPI.policyAcceptances();

    // ── Video ─────────────────────────────────────────────────────────
    let lastVideoTick = 0;
    window.videoTickViaAPI = (mid, currentTimeSec, durationSec, intervalCovered) => {
      const now = Date.now();
      if (now - lastVideoTick < 4000) return Promise.resolve(null); // throttle 4s
      lastVideoTick = now;
      return window.SietchAPI.videoProgressPost(mid, {
        event: 'tick',
        current_time_sec: currentTimeSec,
        duration_sec: durationSec,
        interval_covered: intervalCovered,
      });
    };
    window.videoProgressGetViaAPI = (mid) => window.SietchAPI.videoProgressGet(mid);
    window.videoResolveViaAPI = (provider, input) => window.SietchAPI.videoResolve(provider, input);

    // ── Criar treinamento (admin) ─────────────────────────────────────
    window.createTrainingViaAPI = async function (data) {
      const trackToCat = TRACK_TO_CATEGORY[data.track] || 'OUTROS';
      const payload = {
        title: data.title,
        description: data.desc || data.description || '',
        category: trackToCat,
        tags: data.tags || [],
        policyRef: data.policy || null,
        coverUrl: data.cover || data.coverUrl || null,
      };
      const r = await window.SietchAPI.createTraining(payload);
      await loadCatalogIntoMock();
      reRender();
      return r.training;
    };

    window.publishTrainingViaAPI = async (id, bump) => {
      const r = await window.SietchAPI.publishTraining(id, bump || 'minor');
      await loadCatalogIntoMock();
      reRender();
      return r.training;
    };

    window.archiveTrainingViaAPI = async (id) => {
      const r = await window.SietchAPI.archiveTraining(id);
      await loadCatalogIntoMock();
      reRender();
      return r.training;
    };

    window.addModuleViaAPI = async (trainingId, moduleData) => {
      const r = await window.SietchAPI.createModule(trainingId, moduleData);
      await loadCatalogIntoMock();
      return r.module;
    };

    window.uploadCoverViaAPI = (file) => window.SietchAPI.uploadCover(file);
    window.uploadVideoViaAPI = (file) => window.SietchAPI.uploadVideo(file);

    // ── Atribuir treinamento (admin) ──────────────────────────────────
    window.assignTrainingViaAPI = async (trainingId, userIds, dueAt) => {
      const r = await window.SietchAPI.bulkAssign({
        userIds, trainingId, dueAt,
      });
      await loadAssignmentsIntoMock();
      reRender();
      return r;
    };

    // ── Drill-down do colaborador (admin) ─────────────────────────────
    window.colabSummaryViaAPI    = (userId) => window.SietchAPI.colabSummary(userId);
    window.colabAssignmentViaAPI = (userId, aid) => window.SietchAPI.colabAssignment(userId, aid);
    window.colabTimelineViaAPI   = (userId, q) => window.SietchAPI.colabTimeline(userId, q);

    // ── Admin actions ─────────────────────────────────────────────────
    window.adminResetAttemptsViaAPI = async (assignmentId, moduleId) => {
      const r = await window.SietchAPI.adminResetAttempts({
        assignment_id: assignmentId, module_id: moduleId,
      });
      reRender();
      return r;
    };
    window.adminVoidQuestionViaAPI = (moduleId, questionId) =>
      window.SietchAPI.adminVoidQuestion({ module_id: moduleId, question_id: questionId });
    window.adminReassignViaAPI = async (userId, trainingId) => {
      const r = await window.SietchAPI.adminReassign({
        user_id: userId, training_id: trainingId,
      });
      await loadAssignmentsIntoMock();
      reRender();
      return r;
    };

    // ── Certificado ───────────────────────────────────────────────────
    window.openCertificateViaAPI = (assignmentId) => {
      const token = getToken();
      // Abre numa nova aba com Bearer via fetch + blob
      window.SietchAPI.adminCertificate(assignmentId)
        .then((html) => {
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        })
        .catch((e) => alert('Erro ao gerar certificado: ' + e.message));
    };

    // ── Override de openCreateTraining (modal simples — fallback) ─────
    // O wizard completo está em training-builder.js (que sobrescreve isso
    // depois). Esse modal aqui só existe se o builder não carregar.
    window.openCreateTraining = function () {
      const tracks = window.TRAINING_TRACKS || [];
      const trackOptions = tracks.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');

      const labelCss = 'font-size:13px;font-weight:600;color:var(--text-default);display:block;margin-bottom:6px;';
      const fieldCss = 'width:100%;';
      window.treinOpenModal({
        title: 'Criar treinamento',
        body: `
          <div style="display:flex;flex-direction:column;gap:var(--spacing-4);">
            <div>
              <label style="${labelCss}">Título *</label>
              <input id="sb-train-title" type="text" style="${fieldCss}" placeholder="Ex: Fundamentos de Cyber Security">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label style="${labelCss}">Trilha *</label>
                <select id="sb-train-track" style="${fieldCss}">
                  <option value="">Selecionar…</option>
                  ${trackOptions}
                </select>
              </div>
              <div>
                <label style="${labelCss}">Prazo (dias)</label>
                <input id="sb-train-deadline" type="number" style="${fieldCss}" placeholder="30" value="30">
              </div>
            </div>
            <div>
              <label style="${labelCss}">Descrição *</label>
              <textarea id="sb-train-desc" style="${fieldCss}min-height:96px;" placeholder="Mínimo 20 caracteres — aparece nos cards"></textarea>
            </div>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;">
              <input type="checkbox" id="sb-train-mandatory">
              <span style="font-size:14px;color:var(--text-default);">Treinamento obrigatório</span>
            </label>
            <div>
              <label style="${labelCss}">Política vinculada (opcional)</label>
              <input id="sb-train-policy" type="text" style="${fieldCss}" placeholder="Ex: DOC-005">
            </div>
            <div id="sb-train-err" style="color:#ff5e7d;font-size:13px;min-height:18px;"></div>
          </div>
        `,
        footer: `
          <button id="sb-train-save-btn" class="btn btn-primary btn-md" onclick="window.__sietchSaveTraining()">Criar treinamento</button>
          <button class="btn btn-text btn-md" onclick="closeModal()">Cancelar</button>
        `,
        wide: true,
      });
    };

    window.__sietchSaveTraining = async function () {
      const err = document.getElementById('sb-train-err');
      const btn = document.getElementById('sb-train-save-btn');
      const title = document.getElementById('sb-train-title').value.trim();
      const track = document.getElementById('sb-train-track').value;
      const desc  = document.getElementById('sb-train-desc').value.trim();
      const deadline = parseInt(document.getElementById('sb-train-deadline').value, 10);
      const mandatory = document.getElementById('sb-train-mandatory').checked;
      const policy = document.getElementById('sb-train-policy').value.trim();

      err.textContent = '';
      if (!title || title.length < 3) { err.textContent = 'Título obrigatório (3-80 chars)'; return; }
      if (!track) { err.textContent = 'Selecione uma trilha'; return; }
      if (!desc || desc.length < 20) { err.textContent = 'Descrição precisa ter no mínimo 20 caracteres'; return; }

      btn.disabled = true; btn.textContent = 'Salvando…';
      try {
        const training = await window.createTrainingViaAPI({
          title, desc, track, policy: policy || null,
        });
        // Aplica deadline + mandatory via PATCH
        if (training?.id && (deadline || mandatory)) {
          await window.SietchAPI.updateTraining(training.id, {
            isMandatory: mandatory,
            deadlineDays: deadline || 30,
          });
        }
        await loadCatalogIntoMock();
        reRender();
        window.closeModal();
        if (window.showToast) window.showToast('Treinamento criado!', 'success');
      } catch (e) {
        err.textContent = e.message || 'Erro ao criar';
        btn.disabled = false; btn.textContent = 'Criar treinamento';
      }
    };

    // ── Override de confirmAssign ─────────────────────────────────────
    // Era mock — agora chama a API de bulk assign de verdade.
    window.confirmAssign = async function () {
      const trainingMockId = window.assignSelectedTraining;
      const training = (window.TRAINING_CATALOG || []).find((t) => t.id === trainingMockId);
      if (!training) { alert('Selecione um treinamento'); return; }

      const selectedMockIds = window.assignSelectedCollabs || [];
      const userIds = selectedMockIds
        .map((mockId) => {
          const m = (window.TEAM_MEMBERS_TREIN || []).find((x) => x.id === mockId);
          return m?.id; // já é o uuid real (vem do colabUsers)
        })
        .filter(Boolean);

      if (userIds.length === 0) { alert('Selecione pelo menos 1 colaborador'); return; }

      try {
        const dueAt = window.assignDeadline
          ? new Date(window.assignDeadline).toISOString()
          : null;
        const r = await window.SietchAPI.bulkAssign({
          userIds,
          trainingId: training.id,
          dueAt,
        });
        await loadAssignmentsIntoMock();
        if (window.renderLiderView) window.renderLiderView();
        reRender();
        window.closeModal();
        if (window.showToast)
          window.showToast(
            `${training.title} atribuído a ${r.succeeded} colaborador(es).`,
            'success',
          );
      } catch (e) {
        alert('Erro ao atribuir: ' + e.message);
      }
    };

    // ── Exports CSV ───────────────────────────────────────────────────
    window.downloadExportViaAPI = async (kind, userIdOrTrainingId) => {
      const url =
        kind === 'trainings'
          ? window.SietchAPI.exportTrainingsCsv(userIdOrTrainingId)
          : kind === 'acceptances'
          ? window.SietchAPI.exportAcceptancesCsv(userIdOrTrainingId)
          : window.SietchAPI.exportProgressCsv(userIdOrTrainingId);

      const token = getToken();
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { alert('Falha ao exportar'); return; }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${kind}-${userIdOrTrainingId}.csv`;
      a.click();
    };
  }

  // ─── Bootstrap ───────────────────────────────────────────────────────

  async function autoSession() {
    // Cria/recupera o admin padrão e devolve token+user. Sem tela de login.
    const res = await fetch(API_BASE + '/auth/session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('auto-session failed');
    const data = await res.json();
    if (data.token) setToken(data.token);
    return data.user;
  }

  async function bootstrap() {
    let user = null;

    if (getToken()) {
      try { const r = await window.SietchAPI.me(); user = r.user; }
      catch { clearToken(); }
    }

    if (!user) {
      try { user = await autoSession(); }
      catch (e) { console.error('[bridge] autoSession failed', e); }
    }

    if (!user) {
      // Fallback final: mostra a UI mesmo sem auth (modo offline/leitura)
      if (typeof window.__sietchShowApp === 'function') window.__sietchShowApp();
      document.body.style.visibility = 'visible';
      return;
    }

    window.currentUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      picture: user.picture,
      avatar: (user.name || '?').split(' ').map(s => s[0]).slice(0, 2).join(''),
    };

    if (typeof window.__sietchShowApp === 'function') window.__sietchShowApp();
    document.body.style.visibility = 'visible';

    await loadAllTrainingData();
    reRender();

    if (typeof window.renderHeader === 'function') {
      try { window.renderHeader(); } catch {}
    }

    // Hidratação do player só funciona depois que o openTrainingPlayer foi definido
    // pelo código inline do index.html. Aqui já passou pelo DOMContentLoaded.
    installPlayerHydration();

    // Persistência de navegação: salva tab atual e restaura ao recarregar
    installNavPersistence();
  }

  // ─── Persistência de navegação ───────────────────────────────────────

  const NAV_KEY = 'sietch_nav_state_v1';

  function saveNavState(partial) {
    try {
      const prev = JSON.parse(localStorage.getItem(NAV_KEY) || '{}');
      localStorage.setItem(NAV_KEY, JSON.stringify({ ...prev, ...partial, _ts: Date.now() }));
    } catch {}
  }
  function loadNavState() {
    try { return JSON.parse(localStorage.getItem(NAV_KEY) || '{}'); }
    catch { return {}; }
  }

  function installNavPersistence() {
    // Envolve showView (top-level sidebar)
    if (typeof window.showView === 'function' && !window.showView._sietchWrapped) {
      const orig = window.showView;
      window.showView = function (view) {
        saveNavState({ view });
        return orig.apply(this, arguments);
      };
      window.showView._sietchWrapped = true;
    }
    // Envolve switchTreinRole (Meus/Equipe/Admin)
    if (typeof window.switchTreinRole === 'function' && !window.switchTreinRole._sietchWrapped) {
      const orig = window.switchTreinRole;
      window.switchTreinRole = function (role) {
        saveNavState({ treinRole: role });
        return orig.apply(this, arguments);
      };
      window.switchTreinRole._sietchWrapped = true;
    }
    // Envolve switchRHTab (Catálogo/Atribuições/Relatórios)
    if (typeof window.switchRHTab === 'function' && !window.switchRHTab._sietchWrapped) {
      const orig = window.switchRHTab;
      window.switchRHTab = function (tab) {
        saveNavState({ rhTab: tab });
        return orig.apply(this, arguments);
      };
      window.switchRHTab._sietchWrapped = true;
    }

    // Restaura navegação após boot
    const s = loadNavState();
    if (s && s.view) {
      try { window.showView(s.view); } catch {}
    }
    if (s && s.treinRole && typeof window.switchTreinRole === 'function') {
      try { window.switchTreinRole(s.treinRole); } catch {}
    }
    if (s && s.rhTab && typeof window.switchRHTab === 'function') {
      // Garante que a view rh está visível primeiro
      setTimeout(() => { try { window.switchRHTab(s.rhTab); } catch {} }, 80);
    }
  }

  // ─── Adapter backend → player ────────────────────────────────────────

  // Mini markdown → HTML (cabeçalhos, listas, negrito, parágrafos)
  function mdToHtml(md) {
    if (!md) return '';
    const escapeHtml = (s) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = String(md).split(/\r?\n/);
    const out = [];
    let inList = false;
    const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } };
    for (let raw of lines) {
      const line = raw.trim();
      if (!line) { flushList(); continue; }
      let m;
      if ((m = line.match(/^######\s+(.*)/))) { flushList(); out.push(`<h6>${escapeHtml(m[1])}</h6>`); continue; }
      if ((m = line.match(/^#####\s+(.*)/)))  { flushList(); out.push(`<h5>${escapeHtml(m[1])}</h5>`); continue; }
      if ((m = line.match(/^####\s+(.*)/)))   { flushList(); out.push(`<h4>${escapeHtml(m[1])}</h4>`); continue; }
      if ((m = line.match(/^###\s+(.*)/)))    { flushList(); out.push(`<h3>${escapeHtml(m[1])}</h3>`); continue; }
      if ((m = line.match(/^##\s+(.*)/)))     { flushList(); out.push(`<h3>${escapeHtml(m[1])}</h3>`); continue; }
      if ((m = line.match(/^#\s+(.*)/)))      { flushList(); out.push(`<h3>${escapeHtml(m[1])}</h3>`); continue; }
      if ((m = line.match(/^[-*]\s+(.*)/))) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${inlineMd(escapeHtml(m[1]))}</li>`);
        continue;
      }
      flushList();
      out.push(`<p>${inlineMd(escapeHtml(line))}</p>`);
    }
    flushList();
    return out.join('\n');
  }
  function inlineMd(s) {
    return String(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function backendModuleToPlayer(m) {
    const base = {
      id: m.id,
      name: m.title || '(sem título)',
      dur: m.durationMin || 0,
      desc: m.description || null,
    };
    const p = m.payload || {};
    if (m.type === 'VIDEO') {
      return {
        ...base,
        type: 'video',
        provider: p.provider || 'youtube',
        videoId:  p.source?.video_id || null,
        videoUrl: p.source?.url || null,
        minWatchPct: p.min_watch_pct || 90,
      };
    }
    if (m.type === 'ARTICLE') {
      return {
        ...base,
        type: 'article',
        readingTime: m.durationMin || 5,
        content: mdToHtml(p.content_md || ''),
      };
    }
    if (m.type === 'QUIZ') {
      const qs = (p.questions || []).map(q => {
        const opts = q.options || [];
        // Player espera correct como ÍNDICE da opção correta (single-choice).
        // Para multiple: pega o primeiro correct (aproximação).
        const correctIdx = Math.max(0, opts.findIndex(o => o.correct));
        return {
          q: q.statement || '',
          opts: opts.map(o => o.text || ''),
          correct: correctIdx,
          feedback: q.explanation || '',
        };
      });
      return {
        ...base,
        type: 'quiz',
        minScore:    p.passing_score || 70,
        maxAttempts: p.max_attempts ?? 3,
        questions: qs,
      };
    }
    if (m.type === 'TASK') {
      return {
        ...base,
        type: 'task',
        desc:     p.statement_md || m.description || '',
        snippets: [],
        criteria: (p.acceptance_criteria || []).map(c => c.text || ''),
        delivery: p.submission_kind || 'text',
        validatedBy: '—',
        daysReview: 3,
      };
    }
    if (m.type === 'POLICY') {
      return {
        ...base,
        type: 'policy',
        version: p.policy_version || '1.0',
        docRef:  p.policy_ref || '',
        effectiveDate: p.effective_date || '',
        content: mdToHtml(p.content_md || ''),
        acceptLabel: p.accept_label || '',
      };
    }
    return { ...base, type: 'article', content: '<p>Tipo não suportado.</p>' };
  }

  // Hidrata o cache MODULES_BY_TRAINING com módulos REAIS do backend
  const _hydratingTrainings = new Map(); // trainingId → Promise
  async function hydrateModulesForTraining(trainingId) {
    if (!trainingId) return [];
    window.MODULES_BY_TRAINING = window.MODULES_BY_TRAINING || {};
    // Se já tem em cache e não está vazio, devolve
    if (Array.isArray(window.MODULES_BY_TRAINING[trainingId]) && window.MODULES_BY_TRAINING[trainingId].length > 0) {
      return window.MODULES_BY_TRAINING[trainingId];
    }
    // Deduplica chamadas simultâneas
    if (_hydratingTrainings.has(trainingId)) return _hydratingTrainings.get(trainingId);
    const p = (async () => {
      try {
        const r = await window.SietchAPI.listModules(trainingId);
        const mods = (r.modules || []).map(backendModuleToPlayer);
        window.MODULES_BY_TRAINING[trainingId] = mods;
        return mods;
      } catch (e) {
        console.error('[bridge] hydrateModulesForTraining failed', e);
        window.MODULES_BY_TRAINING[trainingId] = [];
        return [];
      } finally {
        _hydratingTrainings.delete(trainingId);
      }
    })();
    _hydratingTrainings.set(trainingId, p);
    return p;
  }

  // Override de openTrainingPlayer: hidrata módulos antes de abrir
  function installPlayerHydration() {
    if (typeof window.openTrainingPlayer !== 'function') return;
    if (window.openTrainingPlayer._sietchWrapped) return;
    const orig = window.openTrainingPlayer;
    window.openTrainingPlayer = async function (assignmentId) {
      const a = (window.MY_ASSIGNMENTS || []).find(x => x.id === assignmentId);
      if (a && a.trainingId) {
        const cached = (window.MODULES_BY_TRAINING || {})[a.trainingId];
        if (!Array.isArray(cached) || cached.length === 0) {
          // Mostra um loader visual rápido (opcional)
          try { await hydrateModulesForTraining(a.trainingId); } catch {}
        }
      }
      return orig.call(this, assignmentId);
    };
    window.openTrainingPlayer._sietchWrapped = true;
  }

  // Helpers expostos pro código original
  window.SietchBridge = {
    reloadCatalog: loadCatalogIntoMock,
    reloadAssignments: loadAssignmentsIntoMock,
    reloadAll: loadAllTrainingData,
    hydrateModules: hydrateModulesForTraining,
    logout: async () => {
      await window.SietchAPI.logout();
      window.location.reload();
    },
    TRACK_TO_CATEGORY,
    CATEGORY_TO_TRACK,
    MODULE_TYPE_TO_FRONT,
  };

  // ─── Start ───────────────────────────────────────────────────────────

  function hideAppContent() {
    // Esconde só o conteúdo da app, não o body inteiro (senão o overlay
    // herda visibility: hidden e não aparece).
    let style = document.getElementById('sietch-bridge-hide-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'sietch-bridge-hide-css';
      style.textContent = `
        body > *:not(#sietch-login-overlay):not(script):not(style) {
          visibility: hidden !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  function showAppContent() {
    const s = document.getElementById('sietch-bridge-hide-css');
    if (s) s.remove();
  }

  // Expõe pro bootstrap
  window.__sietchHideApp = hideAppContent;
  window.__sietchShowApp = showAppContent;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      hideAppContent();
      installOverrides();
      bootstrap();
    });
  } else {
    hideAppContent();
    installOverrides();
    bootstrap();
  }
})();
