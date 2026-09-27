// ===== State =====
const state = {
  auth: null,
  feedback: [],
  themes: [],
  actions: [],
  clusters: [],
  spikes: [],
  pixelAnalytics: null,
  pixelPollTimer: null,
  feedbackPage: 1,
  feedbackPageSize: 10,
  currentAction: null,
};

function saveAuth(auth) {
  sessionStorage.setItem('vocAuth', JSON.stringify(auth));
}

function loadAuth() {
  try {
    const stored = sessionStorage.getItem('vocAuth');
    return stored ? JSON.parse(stored) : null;
  } catch (err) {
    return null;
  }
}

function getAuthHeaders() {
  if (!state.auth) return {};
  return {
    'x-local-user': state.auth.username || '',
    'x-local-email': state.auth.email || '',
    'x-local-roles': Array.isArray(state.auth.roles) ? state.auth.roles.join(',') : '',
  };
}

// ===== UX Utilities =====
// Transient notifications (toasts)
function showToast(message, type = 'info', title) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <div class="toast-body">
      ${title ? `<div class="toast-title"></div>` : ''}
      <div class="toast-message"></div>
    </div>
    <button type="button" class="toast-close" aria-label="Dismiss notification">×</button>
  `;
  if (title) toast.querySelector('.toast-title').textContent = title;
  toast.querySelector('.toast-message').textContent = message;
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => dismissToast(toast));
  container.appendChild(toast);

  const dismiss = () => dismissToast(toast);
  toast._timer = setTimeout(dismiss, 6000);
  toast.addEventListener('mouseenter', () => clearTimeout(toast._timer));
  toast.addEventListener('mouseleave', () => {
    clearTimeout(toast._timer);
    toast._timer = setTimeout(dismiss, 4000);
  });
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  if (toast._timer) clearTimeout(toast._timer);
  toast.classList.add('toast-exit');
  setTimeout(() => toast.remove(), 260);
}

// Unified error handler: logs to console AND surfaces a visible toast
function handleLoadError(context, e) {
  console.error(`${context}:`, e);
  const message = (e && e.message) || 'Unknown error';
  showToast(`${context}. ${message}`, 'error', 'Something went wrong');
}

// Button busy state (disables + shows spinner, prevents double-submit)
const busyButtons = new WeakSet();
function setBusy(button, busy) {
  if (!button) return;
  if (busy) {
    busyButtons.add(button);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-loading');
  } else {
    busyButtons.delete(button);
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-loading');
  }
}

// Offline / connectivity banner
function setOffline(isOffline) {
  const banner = document.getElementById('offline-banner');
  const body = document.body;
  if (!banner) return;
  banner.hidden = !isOffline;
  body.classList.toggle('is-offline', isOffline);
}

const rolePermissions = {
  overview: ['admin', 'viewer'],
  pixel: ['admin', 'manager', 'analyst', 'viewer', 'ingest'],
  visitors : ['admin', 'manager', 'analyst', 'viewer', 'ingest'],
  feedback: ['admin'],
  themes: ['admin', 'analyst'],
  actions: ['admin', 'manager'],
  clusters: ['admin'],
  spikes: ['admin'],
  ingest: ['admin', 'ingest'],
};

const actionManagementRoles = ['admin', 'manager'];
const themeEstimatorRoles = ['admin', 'analyst'];
const ingestRoles = ['admin', 'ingest'];

const primarySectionByRole = {
  admin: 'overview',
  manager: 'actions',
  ingest: 'ingest',
  analyst: 'themes',
  viewer: 'overview',
};

function hasRole(role) {
  return state.auth && Array.isArray(state.auth.roles) && state.auth.roles.includes(role);
}

function hasAnyRole(roles) {
  return state.auth && Array.isArray(state.auth.roles) && roles.some((role) => state.auth.roles.includes(role));
}

function getAllowedSections() {
  return Object.keys(rolePermissions).filter((section) => hasAnyRole(rolePermissions[section]));
}

function getPrimaryAllowedSection() {
  if (hasRole('admin')) {
    return null;
  }
  const roleOrder = ['manager', 'ingest', 'analyst', 'viewer'];
  for (const role of roleOrder) {
    if (hasRole(role) && primarySectionByRole[role]) {
      return primarySectionByRole[role];
    }
  }
  return null;
}

function applyRoleBasedView() {
  const allowedSections = getAllowedSections();
  const primarySection = getPrimaryAllowedSection();
  const visibleSections = primarySection ? [primarySection] : allowedSections;

  document.querySelectorAll('.nav-item').forEach((btn) => {
    const section = btn.dataset.section;
    const visible = visibleSections.includes(section);
    btn.style.display = visible ? 'flex' : 'none';
    if (!visible) btn.classList.remove('active');
  });

  document.querySelectorAll('.section').forEach((section) => {
    const sectionName = section.id.replace(/^section-/, '');
    if (!visibleSections.includes(sectionName)) {
      section.classList.remove('active');
      section.style.display = 'none';
    } else if (section.classList.contains('active')) {
      section.style.display = 'block';
    }
  });

  const canGenerateActions = hasAnyRole(actionManagementRoles);
  const canEstimateThemes = hasAnyRole(themeEstimatorRoles);

  const actionButtons = [
    document.getElementById('btn-generate-actions'),
    document.getElementById('btn-generate-actions-pipeline'),
  ];
  actionButtons.forEach((btn) => {
    if (btn) btn.style.display = canGenerateActions ? 'inline-flex' : 'none';
  });

  const estimateButton = document.getElementById('btn-estimate-themes');
  if (estimateButton) estimateButton.style.display = canEstimateThemes ? 'inline-flex' : 'none';

  const currentSection = document.querySelector('.nav-item.active')?.dataset.section;
  const defaultSection = visibleSections[0];
  if (!currentSection || !visibleSections.includes(currentSection)) {
    if (defaultSection) switchSection(defaultSection);
  }
}

// ===== API Helpers =====
async function fetchJson(path, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    ...getAuthHeaders(),
  };

  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function postJson(path, body) {
  return fetchJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function patchJson(path, body) {
  return fetchJson(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ===== Formatting Helpers =====
function formatScore(score) {
  if (score === undefined || score === null) return 'N/A';
  return Number(score).toFixed(2);
}

function formatConfidence(confidence) {
  if (confidence === undefined || confidence === null) return 'N/A';
  return `${Math.round(Number(confidence) * 100)}%`;
}

function formatDate(iso) {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  return d.toLocaleString();
}

function formatRating(rating) {
  if (rating === undefined || rating === null) return '—';
  return '★'.repeat(Math.max(0, Math.min(5, Math.round(rating))));
}

function showLoginScreen(show) {
  const login = document.getElementById('login-screen');
  const app = document.querySelector('.app-shell');
  if (login) login.style.display = show ? 'flex' : 'none';
  if (app) app.style.display = show ? 'none' : 'flex';
}

function renderUserPanel() {
  const container = document.getElementById('sidebar-user');
  if (!container) return;

  if (!state.auth) {
    container.innerHTML = '';
    return;
  }

  const roles = Array.isArray(state.auth.roles) ? state.auth.roles.join(', ') : '';
  container.innerHTML = `
    <div class="sidebar-user-info">
      <div class="sidebar-user-name">${escapeHtml(state.auth.username)}</div>
      <div class="sidebar-user-roles">${escapeHtml(roles)}</div>
    </div>
    <button id="logout-button">Logout</button>
  `;

  const logoutButton = document.getElementById('logout-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }
}

function logout() {
  state.auth = null;
  sessionStorage.removeItem('vocAuth');
  if (state.pixelPollTimer) {
    clearInterval(state.pixelPollTimer);
    state.pixelPollTimer = null;
  }
  showLoginScreen(true);
  renderUserPanel();
}

function initDashboard() {
  renderUserPanel();
  applyRoleBasedView();
  checkHealth();
  updateClock();
  // Avoid stacking duplicate intervals if initDashboard runs twice
  if (!window.__vocClockInterval) {
    window.__vocClockInterval = setInterval(updateClock, 1000);
    window.__vocHealthInterval = setInterval(checkHealth, 30000);
  }

  const allowed = getAllowedSections();
  if (allowed.includes('overview')) loadOverview();
  if (allowed.includes('pixel')) {
    loadPixelAnalytics();
    startPixelPolling();
  }
  if (allowed.includes('feedback')) loadFeedback();
  if (allowed.includes('themes')) loadThemes();
  if (allowed.includes('actions')) loadActions();
  if (allowed.includes('clusters')) loadClusters();
  if (allowed.includes('spikes')) loadSpikes();
}

// Valid roles accepted by the backend role mapping
const KNOWN_ROLES = ['admin', 'manager', 'ingest', 'analyst', 'viewer'];

function setLoginError(message) {
  const errorBox = document.getElementById('login-error');
  if (!errorBox) return;
  if (message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  } else {
    errorBox.textContent = '';
    errorBox.hidden = true;
  }
}

function toggleRoleChip(role) {
  const input = document.getElementById('login-roles');
  const current = String(input.value)
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  const idx = current.indexOf(role);
  if (idx !== -1) {
    current.splice(idx, 1);
  } else {
    current.push(role);
  }
  input.value = current.join(',');
  updateRoleChips();
  setLoginError('');
}

function updateRoleChips() {
  const input = document.getElementById('login-roles');
  const current = String(input.value)
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  document.querySelectorAll('.role-chip').forEach((chip) => {
    chip.classList.toggle('selected', current.includes(chip.dataset.role));
  });
}

function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const email = document.getElementById('login-email').value.trim();
  const rawRoles = String(document.getElementById('login-roles').value)
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);

  if (!username) {
    setLoginError('Please enter your username.');
    document.getElementById('login-username').focus();
    return;
  }
  if (rawRoles.length === 0) {
    setLoginError('Please select at least one role.');
    document.getElementById('login-roles').focus();
    return;
  }
  const unknownRoles = [...new Set(rawRoles.filter((role) => !KNOWN_ROLES.includes(role)))];
  if (unknownRoles.length > 0) {
    setLoginError(`Unknown role${unknownRoles.length > 1 ? 's' : ''}: ${unknownRoles.join(', ')}. Valid roles: ${KNOWN_ROLES.join(', ')}.`);
    document.getElementById('login-roles').focus();
    return;
  }

  // Deduplicate while preserving order
  const roles = [...new Set(rawRoles)];

  setLoginError('');
  state.auth = { username, email, roles };
  saveAuth(state.auth);
  showLoginScreen(false);
  initDashboard();
  showToast(`Welcome, ${username}!`, 'success', 'Signed in');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

function sentimentBadge(sentiment) {
  const cls = sentiment === 'positive' ? 'badge-positive' : sentiment === 'negative' ? 'badge-negative' : 'badge-neutral';
  return `<span class="badge ${cls}">${escapeHtml(sentiment || 'unknown')}</span>`;
}

function severityBadge(severity) {
  const cls = severity === 'high' ? 'badge-high' : severity === 'medium' ? 'badge-medium' : 'badge-low';
  return `<span class="badge ${cls}">${escapeHtml(severity || 'low')}</span>`;
}

function statusBadge(status) {
  const cls = `badge-${status || 'pending'}`;
  return `<span class="badge ${cls}">${escapeHtml((status || 'pending').replace('_', ' '))}</span>`;
}

// ===== Navigation =====
function switchSection(section) {
  const sectionEl = document.getElementById(`section-${section}`);
  const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (!sectionEl || !navItem || navItem.style.display === 'none') return;

  document.querySelectorAll('.section').forEach((el) => {
    el.classList.remove('active');
    el.style.display = 'none';
  });
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.remove('active');
    el.removeAttribute('aria-current');
  });

  sectionEl.classList.add('active');
  sectionEl.style.display = 'block';
  navItem.classList.add('active');
  navItem.setAttribute('aria-current', 'page');
}

// ===== Health & Clock =====
async function checkHealth() {
  try {
    const data = await fetchJson('/api/health');
    const indicator = document.getElementById('health-indicator');
    const dot = indicator ? indicator.querySelector('.health-dot') : null;
    const text = document.getElementById('health-text');
    if (data.status === 'ok') {
      if (dot) dot.className = 'health-dot online';
      if (text) text.textContent = 'Online';
      setOffline(false);
    } else {
      if (dot) dot.className = 'health-dot offline';
      if (text) text.textContent = 'Offline';
      setOffline(true);
    }
  } catch (e) {
    const dot = document.querySelector('.health-dot');
    if (dot) dot.className = 'health-dot offline';
    const text = document.getElementById('health-text');
    if (text) text.textContent = 'Offline';
    setOffline(true);
  }
}

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString();
}

// ===== Chart Rendering =====
function renderBarChart(containerId, data, colorClass = 'default') {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="chart-empty">No data</div>';
    return;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  container.innerHTML = data
    .map((d) => {
      const pct = Math.round((d.value / max) * 100);
      return `
        <div class="chart-bar-row">
          <div class="chart-bar-label">${escapeHtml(d.label)}</div>
          <div class="chart-bar-track">
            <div class="chart-bar-fill ${colorClass}" style="width: ${pct}%"></div>
          </div>
          <div class="chart-bar-value">${d.value}</div>
        </div>
      `;
    })
    .join('');
}

function aggregateBy(items, keyFn) {
  const map = {};
  items.forEach((item) => {
    const key = keyFn(item) || 'unknown';
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

// ===== Overview =====
async function loadOverview() {
  const loadBtn = document.getElementById('btn-load-overview');
  const refreshBtn = document.getElementById('btn-refresh-overview');
  setBusy(loadBtn, true);
  setBusy(refreshBtn, true);
  try {
    const [overviewData, themesData] = await Promise.all([
      fetchJson('/api/overview'),
      fetchJson('/api/themes'),
    ]);
    state.themes = themesData.themes || [];
    state.actions = overviewData.actions || [];
    state.clusters = overviewData.clusters || [];
    state.spikes = overviewData.spikes || [];

    // KPI cards
    document.getElementById('kpi-themes').textContent = overviewData.themeCount || 0;
    document.getElementById('kpi-actions').textContent = overviewData.actionCount || 0;
    document.getElementById('kpi-clusters').textContent = state.clusters.length;
    document.getElementById('kpi-spikes').textContent = state.spikes.length;

    // Nav badges
    document.getElementById('nav-theme-count').textContent = state.themes.length;
    document.getElementById('nav-action-count').textContent = state.actions.length;
    document.getElementById('nav-spike-count').textContent = state.spikes.length;

    // Charts
    renderBarChart('chart-sentiment', aggregateBy(state.themes, (t) => t.sentiment), 'default');
    renderBarChart('chart-severity', aggregateBy(state.themes, (t) => t.severity), 'default');
    renderBarChart('chart-product', aggregateBy(state.themes, (t) => t.product), 'default');
    renderBarChart('chart-stage', aggregateBy(state.themes, (t) => t.journeyStage), 'default');

    // Recent spikes
    const spikesContainer = document.getElementById('overview-spikes');
    if (state.spikes.length === 0) {
      spikesContainer.innerHTML = '<div class="chart-empty">No emerging issues detected</div>';
    } else {
      spikesContainer.innerHTML = state.spikes
        .slice(0, 5)
        .map(
          (spike) => `
            <div class="spike-item">
              <div class="spike-header">
                <div class="spike-title">${escapeHtml(spike.reason)}</div>
                ${severityBadge(spike.score >= 3 ? 'high' : 'medium')}
              </div>
              <div class="spike-text">${escapeHtml(spike.text)}</div>
              <div class="spike-meta">
                ${sentimentBadge(spike.sentiment)}
                <span class="score-chip">Score: ${formatScore(spike.score)}</span>
                <span class="score-chip">Confidence: ${formatConfidence(spike.confidence)}</span>
              </div>
            </div>
          `
        )
        .join('');
    }
  } catch (e) {
    handleLoadError('Could not load overview', e);
  } finally {
    setBusy(loadBtn, false);
    setBusy(refreshBtn, false);
  }
}

// ===== Pixel Analytics =====
async function loadPixelAnalytics() {
  try {
    const data = await fetchJson('/api/pixel/analytics');
    state.pixelAnalytics = data;

    document.getElementById('kpi-visits').textContent = data.totalVisits || 0;
    document.getElementById('kpi-unique-visitors').textContent = data.uniqueVisitors || 0;
    document.getElementById('kpi-pages').textContent = (data.topPages || []).length;
    document.getElementById('kpi-referrers').textContent = (data.topReferrers || []).length;
    document.getElementById('nav-pixel-count').textContent = data.uniqueVisitors || 0;

    renderBarChart('chart-pixel-pages', (data.topPages || []).map((t) => ({ label: t.path, value: t.count })), 'primary');
    renderBarChart('chart-pixel-referrers', (data.topReferrers || []).map((t) => ({ label: t.ref, value: t.count })), 'info');
    renderBarChart('chart-pixel-stages', (data.journeyStages || []).map((t) => ({ label: t.stage, value: t.count })), 'success');
    renderBarChart('chart-pixel-products', (data.products || []).map((t) => ({ label: t.product, value: t.count })), 'warning');

    renderPixelVisitFeed(data.recentVisits || []);
  } catch (e) {
    handleLoadError('Could not load pixel analytics', e);
  }
}

function renderPixelVisitFeed(visits) {
  const tbody = document.getElementById('pixel-visit-body');
  if (!tbody) return;
  if (!visits || visits.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No visits yet — embed the pixel to start streaming</td></tr>';
    return;
  }
  tbody.innerHTML = visits
    .map(
      (v) => `
        <tr>
          <td class="text-cell" title="${escapeHtml(v.clientId)}">${escapeHtml(v.clientId)}</td>
          <td class="text-cell" title="${escapeHtml(v.pageUrl || v.text || '')}">${escapeHtml(v.text || '')}</td>
          <td class="text-cell" title="${escapeHtml(v.referrer || '')}">${escapeHtml(extractHost(v.referrer) || 'direct')}</td>
          <td>${escapeHtml(v.product || '—')}</td>
          <td>${escapeHtml(v.journeyStage || '—')}</td>
          <td>${formatDate(v.receivedAt)}</td>
        </tr>
      `,
    )
    .join('');
}

function extractHost(url) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function startPixelPolling() {
  if (state.pixelPollTimer) return;
  state.pixelPollTimer = setInterval(loadPixelAnalytics, 10000);
}

// ===== Feedback =====
async function loadFeedback() {
  const loadBtn = document.getElementById('btn-load-feedback');
  const refreshBtn = document.getElementById('btn-refresh-overview');
  setBusy(loadBtn, true);
  setBusy(refreshBtn, true);
  try {
    const data = await fetchJson('/api/feedback');
    state.feedback = data.items || [];
    document.getElementById('kpi-feedback').textContent = state.feedback.length;
    document.getElementById('nav-feedback-count').textContent = state.feedback.length;
    populateFeedbackFilters();
    renderFeedbackTable();
  } catch (e) {
    handleLoadError('Could not load feedback', e);
  } finally {
    setBusy(loadBtn, false);
    setBusy(refreshBtn, false);
  }
}

function populateFeedbackFilters() {
  const unique = (key) => [...new Set(state.feedback.map((f) => f[key]).filter(Boolean))].sort();
  populateSelect('filter-feedback-source', unique('source'));
  populateSelect('filter-feedback-product', unique('product'));
  populateSelect('filter-feedback-store', unique('store'));
  populateSelect('filter-feedback-stage', unique('journeyStage'));
}

function populateSelect(id, values) {
  const select = document.getElementById(id);
  const current = select.value;
  select.innerHTML = `<option value="">All ${select.title.replace('Filter by ', '')}s</option>`;
  values.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
  select.value = current;
}

function getFilteredFeedback() {
  const source = document.getElementById('filter-feedback-source').value;
  const product = document.getElementById('filter-feedback-product').value;
  const store = document.getElementById('filter-feedback-store').value;
  const stage = document.getElementById('filter-feedback-stage').value;
  const search = document.getElementById('search-feedback').value.toLowerCase();

  return state.feedback.filter((f) => {
    if (source && f.source !== source) return false;
    if (product && f.product !== product) return false;
    if (store && f.store !== store) return false;
    if (stage && f.journeyStage !== stage) return false;
    if (search && !(f.text || '').toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderFeedbackTable() {
  const filtered = getFilteredFeedback();
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.feedbackPageSize));
  state.feedbackPage = Math.min(state.feedbackPage, totalPages);
  const start = (state.feedbackPage - 1) * state.feedbackPageSize;
  const pageItems = filtered.slice(start, start + state.feedbackPageSize);

  const tbody = document.getElementById('feedback-table-body');
  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No feedback records found</td></tr>';
  } else {
    tbody.innerHTML = pageItems
      .map(
        (f) => `
          <tr>
            <td class="text-cell" title="${escapeHtml(f.text)}">${escapeHtml(f.text)}</td>
            <td>${escapeHtml(f.source || '—')}</td>
            <td>${escapeHtml(f.product || '—')}</td>
            <td>${escapeHtml(f.store || '—')}</td>
            <td>${escapeHtml(f.journeyStage || '—')}</td>
            <td>${formatRating(f.rating)}</td>
            <td>${formatDate(f.timestamp)}</td>
          </tr>
        `
      )
      .join('');
  }

  renderPagination('feedback-pagination', state.feedbackPage, totalPages, (page) => {
    state.feedbackPage = page;
    renderFeedbackTable();
  });
}

function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">← Prev</button>
    <span class="page-info">Page ${currentPage} of ${totalPages}</span>
    <button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next →</button>
  `;
  container.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page, 10);
      if (page >= 1 && page <= totalPages) onPageChange(page);
    });
  });
}

// ===== Themes =====
async function loadThemes() {
  const loadBtn = document.getElementById('btn-load-themes');
  setBusy(loadBtn, true);
  try {
    const data = await fetchJson('/api/themes');
    state.themes = data.themes || [];
    document.getElementById('nav-theme-count').textContent = state.themes.length;
    populateThemeFilters();
    renderThemes();
  } catch (e) {
    handleLoadError('Could not load themes', e);
  } finally {
    setBusy(loadBtn, false);
  }
}

function populateThemeFilters() {
  const products = [...new Set(state.themes.map((t) => t.product).filter(Boolean))].sort();
  const select = document.getElementById('filter-theme-product');
  const current = select.value;
  select.innerHTML = '<option value="">All Products</option>';
  products.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    select.appendChild(opt);
  });
  select.value = current;
}

function getFilteredThemes() {
  const product = document.getElementById('filter-theme-product').value;
  const severity = document.getElementById('filter-theme-severity').value;
  const sentiment = document.getElementById('filter-theme-sentiment').value;
  const search = document.getElementById('search-themes').value.toLowerCase();

  return state.themes.filter((t) => {
    if (product && t.product !== product) return false;
    if (severity && t.severity !== severity) return false;
    if (sentiment && t.sentiment !== sentiment) return false;
    if (search && !(t.text || '').toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderThemes() {
  const filtered = getFilteredThemes();
  const container = document.getElementById('themes-grid');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="chart-empty">No themes found</div>';
    return;
  }
  container.innerHTML = filtered
    .map(
      (t) => `
        <div class="theme-card">
          <div class="theme-card-header">
            <div class="theme-card-title">${escapeHtml(t.text || t.themeId)}</div>
            ${severityBadge(t.severity)}
          </div>
          <div class="theme-card-text">${escapeHtml(t.text)}</div>
          <div class="theme-meta">
            ${sentimentBadge(t.sentiment)}
            <span class="score-chip">Score: ${formatScore(t.sentimentScore)}</span>
            <span class="score-chip">Issue: ${formatScore(t.issueScore)}</span>
            <span class="score-chip">Confidence: ${formatConfidence(t.confidence)}</span>
          </div>
          <div class="theme-meta">
            <span class="aspect-chip">Product: ${escapeHtml(t.product || 'general')}</span>
            <span class="aspect-chip">Stage: ${escapeHtml(t.journeyStage || 'general')}</span>
            <span class="aspect-chip">Source: ${escapeHtml(t.source || 'unknown')}</span>
          </div>
          ${t.aspects && t.aspects.length > 0 ? `
            <div class="theme-aspects">
              ${t.aspects
                .map(
                  (a) => `
                    <span class="aspect-chip">
                      ${escapeHtml(a.aspect)}: ${sentimentBadge(a.sentiment)} ${formatScore(a.score)}
                    </span>
                  `
                )
                .join('')}
            </div>
          ` : ''}
        </div>
      `
    )
    .join('');
}

// ===== Actions =====
async function loadActions() {
  const loadBtn = document.getElementById('btn-load-actions');
  setBusy(loadBtn, true);
  try {
    const data = await fetchJson('/api/actions');
    state.actions = data.actions || [];
    document.getElementById('nav-action-count').textContent = state.actions.length;
    renderKanban();
  } catch (e) {
    handleLoadError('Could not load actions', e);
  } finally {
    setBusy(loadBtn, false);
  }
}

async function generateActions() {
  const pipelineBtn = document.getElementById('btn-generate-actions-pipeline');
  const generateBtn = document.getElementById('btn-generate-actions');
  setBusy(pipelineBtn, true);
  setBusy(generateBtn, true);
  try {
    const data = await postJson('/api/actions', {});
    state.actions = data.actions || [];
    document.getElementById('nav-action-count').textContent = state.actions.length;
    renderKanban();
    showResult('pipeline-result', `Generated ${state.actions.length} actions from themes`, 'success');
    showToast(`Generated ${state.actions.length} action(s)`, 'success');
  } catch (e) {
    handleLoadError('Could not generate actions', e);
    showResult('pipeline-result', e.message, 'error');
  } finally {
    setBusy(pipelineBtn, false);
    setBusy(generateBtn, false);
  }
}

function renderKanban() {
  const statuses = ['pending', 'assigned', 'in_progress', 'resolved', 'closed'];
  statuses.forEach((status) => {
    const list = document.getElementById(`kanban-${status}`);
    const items = state.actions.filter((a) => a.status === status);
    if (items.length === 0) {
      list.innerHTML = '<div class="kanban-empty">No actions</div>';
    } else {
      list.innerHTML = items
        .map(
          (a) => `
            <div class="kanban-card" data-action-id="${a.actionId}">
              <div class="kanban-card-title">${escapeHtml(a.recommendations?.[0]?.recommendedAction || 'No recommendation')}</div>
              <div class="kanban-card-meta">Owner: ${escapeHtml(a.assignedOwner || 'unassigned')}</div>
              <div class="kanban-card-meta">${severityBadge(a.severity)} ${sentimentBadge(a.sentiment)}</div>
              <div class="kanban-card-footer">
                <span class="score-chip">Issue: ${formatScore(a.issueScore)}</span>
                <span class="score-chip">Conf: ${formatConfidence(a.confidence)}</span>
              </div>
            </div>
          `
        )
        .join('');
    }
    list.querySelectorAll('.kanban-card').forEach((card) => {
      card.addEventListener('click', () => {
        const action = state.actions.find((a) => a.actionId === card.dataset.actionId);
        if (action) openActionModal(action);
      });
    });
  });
}

// ===== Action Modal =====
function openActionModal(action) {
  state.currentAction = action;
  const body = document.getElementById('action-modal-body');
  const canUpdateActions = hasAnyRole(actionManagementRoles);

  body.innerHTML = `
    <div class="modal-section">
      <h4>Recommendation</h4>
      <p>${escapeHtml(action.recommendations?.[0]?.recommendedAction || 'No recommendation')}</p>
    </div>
    <div class="modal-section">
      <h4>Details</h4>
      <p>Status: ${statusBadge(action.status)}</p>
      <p>Owner: ${escapeHtml(action.assignedOwner || 'unassigned')}</p>
      <p>Severity: ${severityBadge(action.severity)}</p>
      <p>Sentiment: ${sentimentBadge(action.sentiment)}</p>
      <p>Issue Score: ${formatScore(action.issueScore)}</p>
      <p>Confidence: ${formatConfidence(action.confidence)}</p>
      <p>Product: ${escapeHtml(action.product || 'general')} · Stage: ${escapeHtml(action.journeyStage || 'general')}</p>
      <p>Created: ${formatDate(action.recommendedAt)}</p>
    </div>
    ${action.recommendations && action.recommendations.length > 0 ? `
      <div class="modal-section">
        <h4>All Recommendations</h4>
        ${action.recommendations
          .map(
            (r) => `
              <p>
                <strong>${escapeHtml(r.aspect)}</strong>: ${escapeHtml(r.recommendedAction)}
                <br />
                <small>Owner: ${escapeHtml(r.owner)} · ${sentimentBadge(r.sentiment)} ${formatScore(r.sentimentScore)}</small>
              </p>
            `
          )
          .join('')}
      </div>
    ` : ''}
    <div class="modal-section">
      <h4>Update Status</h4>
      <div class="modal-actions">
        ${canUpdateActions
          ? ['pending', 'assigned', 'in_progress', 'resolved', 'closed']
              .map(
                (s) => `
                  <button class="btn ${action.status === s ? 'btn-primary' : 'btn-secondary'}" data-status="${s}">
                    ${s.replace('_', ' ')}
                  </button>
                `
              )
              .join('')
          : '<div class="info-text">You do not have permission to update action status.</div>'}
      </div>
    </div>
  `;
  body.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      setBusy(btn, true);
      try {
        const updated = await patchJson(`/api/actions/${action.actionId}`, { status: btn.dataset.status });
        const idx = state.actions.findIndex((a) => a.actionId === action.actionId);
        if (idx !== -1) state.actions[idx] = updated.action;
        renderKanban();
        closeActionModal();
        showToast(`Action marked as "${btn.dataset.status.replace('_', ' ')}"`, 'success');
      } catch (e) {
        handleLoadError('Could not update action', e);
      } finally {
        setBusy(btn, false);
      }
    });
  });
  const modalEl = document.getElementById('action-modal');
  modalEl.classList.add('active');
  modalEl.setAttribute('aria-hidden', 'false');
  const closeBtn = modalEl.querySelector('.modal-close');
  if (closeBtn) closeBtn.focus();
}

function closeActionModal() {
  const modalEl = document.getElementById('action-modal');
  modalEl.classList.remove('active');
  modalEl.setAttribute('aria-hidden', 'true');
  state.currentAction = null;
}

// ===== Clusters =====
async function loadClusters() {
  const loadBtn = document.getElementById('btn-load-clusters');
  setBusy(loadBtn, true);
  try {
    const data = await fetchJson('/api/clusters');
    state.clusters = data.clusters || [];
    renderClusters();
  } catch (e) {
    handleLoadError('Could not load clusters', e);
  } finally {
    setBusy(loadBtn, false);
  }
}

function renderClusters() {
  const container = document.getElementById('clusters-grid');
  if (state.clusters.length === 0) {
    container.innerHTML = '<div class="chart-empty">No clusters found</div>';
    return;
  }
  container.innerHTML = state.clusters
    .map(
      (c) => `
        <div class="cluster-card">
          <div class="cluster-card-header">
            <div class="cluster-card-title">${escapeHtml(c.clusterId)}</div>
            <div class="cluster-count">${c.count}</div>
          </div>
          <div class="cluster-meta">
            Product: ${escapeHtml(c.product || 'general')} · Stage: ${escapeHtml(c.journeyStage || 'general')}
          </div>
          ${c.sentimentDistribution ? `
            <div class="theme-meta">
              ${Object.entries(c.sentimentDistribution)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => `${sentimentBadge(k)} <span class="score-chip">${v}</span>`)
                .join(' ')}
            </div>
          ` : ''}
          ${c.items && c.items.length > 0 ? `
            <div class="cluster-themes">
              ${c.items.map((item) => `<span class="aspect-chip">${escapeHtml(item.text || item.themeId)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `
    )
    .join('');
}

// ===== Spikes =====
async function loadSpikes() {
  const loadBtn = document.getElementById('btn-load-spikes');
  setBusy(loadBtn, true);
  try {
    const data = await fetchJson('/api/detection/spikes');
    state.spikes = data.spikes || [];
    document.getElementById('nav-spike-count').textContent = state.spikes.length;
    renderSpikes();
  } catch (e) {
    handleLoadError('Could not load spikes', e);
  } finally {
    setBusy(loadBtn, false);
  }
}

function getSpikeSearchTerm() {
  return (document.getElementById('search-spikes')?.value || '').toLowerCase();
}

function getFilteredSpikes() {
  const sentiment = document.getElementById('filter-spike-sentiment')?.value || '';
  const search = getSpikeSearchTerm();
  return state.spikes.filter((s) => {
    if (sentiment && (s.sentiment || '') !== sentiment) return false;
    if (search && !(s.text || '').toLowerCase().includes(search) && !(s.reason || '').toLowerCase().includes(search)) return false;
    return true;
  });
}

function spikeTitleFallback(s) {
  if (s && s.text) return s.text.length > 60 ? `${s.text.slice(0, 60)}…` : s.text;
  return s && s.reason ? s.reason : 'Emerging issue';
}

function renderSpikes() {
  const container = document.getElementById('spikes-list');
  const filtered = getFilteredSpikes();
  if (filtered.length === 0) {
    container.innerHTML =
      state.spikes.length === 0
        ? '<div class="chart-empty"><p>No emerging issues detected.</p><p class="spike-empty-hint">Spikes are derived from extracted themes. Load themes first, then run spike detection.</p></div>'
        : '<div class="chart-empty"><p>No spikes match the current filters.</p></div>';
    return;
  }

  container.innerHTML = filtered
    .map(
      (s, index) => `
        <div class="spike-item" role="button" tabindex="0"
             aria-label="View spike detail: ${escapeHtml(spikeTitleFallback(s))}"
             data-spike-index="${index}">
          <div class="spike-header">
            <div class="spike-title">${escapeHtml(s.reason)}</div>
            ${severityBadge(s.score >= 3 ? 'high' : 'medium')}
          </div>
          <div class="spike-text">${escapeHtml(s.text)}</div>
          <div class="spike-meta">
            ${sentimentBadge(s.sentiment)}
            <span class="score-chip">Score: ${formatScore(s.score)}</span>
            <span class="score-chip">Sentiment: ${formatScore(s.sentimentScore)}</span>
            <span class="score-chip">Confidence: ${formatConfidence(s.confidence)}</span>
            <span class="score-chip">Detected: ${formatDate(s.detectedAt)}</span>
          </div>
        </div>
      `
    )
    .join('');

  // Click / keyboard activation to open the spike detail modal.
  // DOM order mirrors `filtered` order, so zip them one-to-one.
  const items = container.querySelectorAll('.spike-item');
  items.forEach((item, i) => {
    const spike = filtered[i];
    if (!spike) return;
    const open = () => openSpikeModal(spike);
    item.addEventListener('click', open);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function openSpikeModal(spike) {
  if (!spike) return;
  const body = document.getElementById('spike-modal-body');
  body.innerHTML = `
    <div class="modal-section">
      <h4>Signal</h4>
      <p class="modal-reading">${escapeHtml(spike.text || spike.reason || 'No text captured')}</p>
    </div>
    <div class="modal-section">
      <h4>Why it was flagged</h4>
      <p>${escapeHtml(spike.reason || 'Issue score threshold exceeded')}</p>
    </div>
    <div class="modal-section">
      <h4>Metrics</h4>
      <p>
        ${severityBadge(spike.score >= 3 ? 'high' : 'medium')}
        ${sentimentBadge(spike.sentiment)}
        <span class="score-chip">Score: ${formatScore(spike.score)}</span>
        <span class="score-chip">Confidence: ${formatConfidence(spike.confidence)}</span>
      </p>
      ${spike.themeId ? `<p class="modal-meta">Theme: <code>${escapeHtml(spike.themeId)}</code></p>` : ''}
      ${spike.sourceId ? `<p class="modal-meta">Source: <code>${escapeHtml(spike.sourceId)}</code></p>` : ''}
      <p class="modal-meta">Detected: ${formatDate(spike.detectedAt)}</p>
    </div>
  `;
  const modalEl = document.getElementById('spike-modal');
  modalEl.classList.add('active');
  modalEl.setAttribute('aria-hidden', 'false');
  const closeBtn = modalEl.querySelector('.modal-close');
  if (closeBtn) closeBtn.focus();
}

function closeSpikeModal() {
  const modalEl = document.getElementById('spike-modal');
  modalEl.classList.remove('active');
  modalEl.setAttribute('aria-hidden', 'true');
}

// ===== Ingest =====
function showResult(containerId, message, type) {
  const container = document.getElementById(containerId);
  container.className = `result-box ${type}`;
  container.textContent = message;
}

async function handleIngestSubmit(e) {
  e.preventDefault();
  const text = document.getElementById('ingest-text').value.trim();
  if (!text) {
    showResult('ingest-result', 'Feedback text is required', 'error');
    return;
  }

  const submitBtn = document.getElementById('btn-ingest-submit');
  setBusy(submitBtn, true);

  const item = {
    text,
    source: document.getElementById('ingest-source').value,
    product: document.getElementById('ingest-product').value || null,
    store: document.getElementById('ingest-store').value || null,
    journeyStage: document.getElementById('ingest-stage').value || null,
    rating: document.getElementById('ingest-rating').value ? parseInt(document.getElementById('ingest-rating').value, 10) : null,
  };

  try {
    const data = await postJson('/api/feedback/ingest', { items: [item] });
    showResult('ingest-result', `Successfully ingested ${data.ingested} feedback item(s)`, 'success');
    showToast(`Successfully ingested ${data.ingested} feedback item(s)`, 'success');
    document.getElementById('ingest-form').reset();
    loadFeedback();
  } catch (err) {
    showResult('ingest-result', err.message, 'error');
    handleLoadError('Could not ingest feedback', err);
  } finally {
    setBusy(submitBtn, false);
  }
}

async function estimateThemes() {
  const estimateBtn = document.getElementById('btn-estimate-themes');
  setBusy(estimateBtn, true);
  try {
    const data = await fetchJson('/api/feedback');
    const items = data.items || [];
    if (items.length === 0) {
      showResult('pipeline-result', 'No feedback to analyze. Ingest feedback first.', 'error');
      return;
    }
    const result = await postJson('/api/themes/estimate', { items });
    showResult('pipeline-result', `Estimated ${result.themes.length} themes from ${items.length} feedback items`, 'success');
    showToast(`Estimated ${result.themes.length} theme(s)`, 'success');
    loadThemes();
  } catch (e) {
    showResult('pipeline-result', e.message, 'error');
    handleLoadError('Could not estimate themes', e);
  } finally {
    setBusy(estimateBtn, false);
  }
}

// ===== Event Listeners =====
function init() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  // Overview
  document.getElementById('btn-load-overview').addEventListener('click', loadOverview);
  document.getElementById('btn-refresh-overview').addEventListener('click', async () => {
    await Promise.all([loadOverview(), loadFeedback(), loadActions()]);
  });

  // Pixel Analytics
  document.getElementById('btn-refresh-pixel').addEventListener('click', loadPixelAnalytics);

  // Feedback
  document.getElementById('btn-load-feedback').addEventListener('click', loadFeedback);
  ['filter-feedback-source', 'filter-feedback-product', 'filter-feedback-store', 'filter-feedback-stage'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      state.feedbackPage = 1;
      renderFeedbackTable();
    });
  });
  document.getElementById('search-feedback').addEventListener('input', () => {
    state.feedbackPage = 1;
    renderFeedbackTable();
  });

  // Themes
  document.getElementById('btn-load-themes').addEventListener('click', loadThemes);
  ['filter-theme-product', 'filter-theme-severity', 'filter-theme-sentiment'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderThemes);
  });
  document.getElementById('search-themes').addEventListener('input', renderThemes);

  // Actions
  document.getElementById('btn-load-actions').addEventListener('click', loadActions);
  document.getElementById('btn-generate-actions').addEventListener('click', generateActions);

  // Clusters
  document.getElementById('btn-load-clusters').addEventListener('click', loadClusters);

  // Spikes
  document.getElementById('btn-load-spikes').addEventListener('click', loadSpikes);
  document.getElementById('filter-spike-sentiment')?.addEventListener('change', renderSpikes);
  document.getElementById('search-spikes')?.addEventListener('input', renderSpikes);

  // Ingest
  document.getElementById('ingest-form').addEventListener('submit', handleIngestSubmit);
  document.getElementById('btn-estimate-themes').addEventListener('click', estimateThemes);
  document.getElementById('btn-generate-actions-pipeline').addEventListener('click', generateActions);

  // Login
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleLogin();
  });
  document.getElementById('login-role-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.role-chip');
    if (chip) toggleRoleChip(chip.dataset.role);
  });

  // Retry connection (offline banner)
  document.getElementById('btn-retry-connection').addEventListener('click', async () => {
    const btn = document.getElementById('btn-retry-connection');
    setBusy(btn, true);
    await checkHealth();
    setBusy(btn, false);
    const allowed = getAllowedSections();
    if (allowed.includes('overview')) loadOverview();
    if (allowed.includes('pixel')) {
      loadPixelAnalytics();
      startPixelPolling();
    }
    if (allowed.includes('feedback')) loadFeedback();
    if (allowed.includes('themes')) loadThemes();
    if (allowed.includes('actions')) loadActions();
    if (allowed.includes('clusters')) loadClusters();
    if (allowed.includes('spikes')) loadSpikes();
  });

  // Login UX: typing clears inline error; manual role edits sync with chips
  ['login-username', 'login-email', 'login-roles'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => setLoginError(''));
  });
  document.getElementById('login-roles').addEventListener('input', updateRoleChips);

  // Modal
  document.getElementById('modal-close').addEventListener('click', closeActionModal);
  document.getElementById('action-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeActionModal();
  });
  document.getElementById('spike-modal-close')?.addEventListener('click', closeSpikeModal);
  document.getElementById('spike-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSpikeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeActionModal();
      closeSpikeModal();
    }
  });

  // Init
  state.auth = loadAuth();
  if (!state.auth) {
    showLoginScreen(true);
    return;
  }

  showLoginScreen(false);
  initDashboard();
}

// Initialize the dashboard
init();
