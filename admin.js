import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, collection, onSnapshot, serverTimestamp,
  query, where, getDocs
} from './firebase-config.js';

const $ = (q) => document.querySelector(q);
// NEW: loader helpers
function showLoader(text = 'Loading...') {
  const el = document.getElementById('appLoader');
  if (!el) return;
  el.classList.remove('hidden');
  const label = el.querySelector('.label');
  if (label && text) label.textContent = text;
}
function hideLoader(delay = 150) {
  const el = document.getElementById('appLoader');
  if (!el) return;
  // small delay to avoid flicker on very fast ops
  setTimeout(() => el.classList.add('hidden'), delay);
}

// Immediately show while booting dashboard
showLoader('Loading dashboard...');

const logoutBtn = $('#btn-logout');
const toggleSidebar = $('#toggleSidebar');
const sidebar = $('#sidebar');

const agentsList = $('#agentsList');
const adminMonth = $('#adminMonth');
const detailName = $('#detailName');
const detailClient = $('#detailClient');
const detailPosition = $('#detailPosition');
const detailTotal = $('#detailTotal');
const detailToTarget = $('#detailToTarget');
const snapTargetTasks = $('#snapTargetTasks');
const snapAttendance = $('#snapAttendance');

// Advanced Settings toggle
const btnToggleAdv = $('#btnToggleAdv');
const advPanel = $('#advPanel');
const btnOverview = $('#btnOverview');
const overviewPanel = $('#overviewPanel');

// New: Performance Weights panel/button (created if missing)
let btnToggleWeights = document.getElementById('btnToggleWeights');
let weightsPanel = document.getElementById('weightsPanel');

// Per-position targets
const posInputs = () => Array.from(document.querySelectorAll('.pos-target'));
const btnSavePosTargets = document.getElementById('btnSavePosTargets');
const savePosStatus = document.getElementById('savePosStatus');

// Daily entries
const detailDay = $('#detailDay');
const detailEntries = $('#detailEntries');

// Monthly Performance elements
const mpTaskPct = $('#mpTaskPct');
const mpTaskMeta = $('#mpTaskMeta');
const mpAttendancePct = $('#mpAttendancePct');
const mpAttitudePct = $('#mpAttitudePct');
const mpOverallPct = $('#mpOverallPct');
// Replace old attendance input with two new inputs
// const inpAttendancePoints = $('#inpAttendancePoints');
let inpWorkDays = document.getElementById('inpWorkDays');      // CHANGED: let + late binding
let inpWorkedDays = document.getElementById('inpWorkedDays');  // CHANGED: let + late binding
let inpLateMinutes = document.getElementById('inpLateMinutes'); // NEW: total late minutes
const inpAttitudePoints = $('#inpAttitudePoints');
const btnSaveKpi = $('#btnSaveKpi');
const saveKpiStatus = $('#saveKpiStatus');

// Top 10 elements (if present)
const top10Table = document.getElementById('top10Table');
const top10Month = document.getElementById('top10Month');
// Replace const with let and add fallback to find the enclosing card
let top10Card = document.getElementById('top10Card') || (top10Table ? top10Table.closest('.card') : null);

// Helper: init collapsible behavior for Top 10 card
function initTop10Collapsible() {
  if (!top10Card) return;
  // Find or create heading
  let heading = top10Card.querySelector('h2');
  if (!heading) {
    heading = document.createElement('h2');
    heading.textContent = 'Top 10 Agents (Overall Performance)';
    top10Card.insertBefore(heading, top10Card.firstChild);
  }
  // Wrap the content (everything after the heading) into a single container we can hide/show
  let contentWrap = top10Card.querySelector('#top10Content');
  if (!contentWrap) {
    contentWrap = document.createElement('div');
    contentWrap.id = 'top10Content';
    // Move all siblings after heading into the wrapper
    while (heading.nextSibling) {
      contentWrap.appendChild(heading.nextSibling);
    }
    top10Card.appendChild(contentWrap);
  }
  // Add a toggle button if missing
  let toggle = top10Card.querySelector('#btnTop10Collapse');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.id = 'btnTop10Collapse';
    toggle.className = 'btn secondary';
    toggle.style.float = 'right';
    toggle.style.marginTop = '-6px';
    toggle.style.marginRight = '4px';
    heading.appendChild(toggle);
  }
  // Restore state
  const collapsed = localStorage.getItem('top10Collapsed') === '1';
  contentWrap.classList.toggle('hidden', collapsed);
  toggle.textContent = collapsed ? 'Show' : 'Hide';

  toggle.onclick = () => {
    const isHidden = contentWrap.classList.toggle('hidden');
    localStorage.setItem('top10Collapsed', isHidden ? '1' : '0');
    toggle.textContent = isHidden ? 'Show' : 'Hide';
  };
}

toggleSidebar?.addEventListener('click', () => sidebar.classList.toggle('open'));

let selectedAgent = null;
let selectedAgentProfile = null;
let detailChart = null;
let unsubUsers = null;
let unsubMetrics = null;
let unsubAgentMonth = null;
let unsubAgentDay = null;
let unsubAgentKpi = null; // KPI doc listener
let currentMonthTargetForAgent = 0;
// NEW: bar chart instance for Summary card
let summaryChart = null;

// Caches for Top 10
let agentsCache = [];        // filtered agents (non-admin, assigned)
let positionsTargetMap = {}; // position -> target

// New: performance weights (percentages)
let perfWeights = { task: 50, attendance: 30, attitude: 20 };

// Helper: update the label text in the Overall Performance card
function updateOverallWeightsLabel() {
  // Find the label that sits next to the overall percentage value
  const overallLabel = document.querySelector('#mpOverallPct')?.parentElement?.querySelector('.label');
  if (!overallLabel) return;
  overallLabel.textContent = `Task ${perfWeights.task}% • Attendance ${perfWeights.attendance}% • Attitude ${perfWeights.attitude}%`;
}

const pad = (n) => n.toString().padStart(2, '0');
function setMonthToCurrent() {
  const d = new Date();
  adminMonth.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function toDayIdFromInput(val /* yyyy-mm-dd */) { return val; }

// Highlight helper for the selected agent in the list
function setActiveAgentListItem() {
  if (!agentsList) return;
  agentsList.querySelectorAll('.list-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-uid') === selectedAgent);
  });
}

// Grouped agents list remains
function renderGroupedAgents(users) {
  // Group by client -> position
  const groups = {};
  users.forEach(u => {
    // Use "Unassigned" when client is missing/empty
    const client = ((u.client || '').trim() || 'Unassigned');
    const position = (u.position || 'Unknown').trim();
    // ...no guard; include all non-admin users...
    groups[client] = groups[client] || {};
    groups[client][position] = groups[client][position] || [];
    groups[client][position].push(u);
  });

  const parts = [];
  Object.keys(groups).sort().forEach(client => {
    parts.push(`<div class="group-header">${client}</div>`);
    const positions = groups[client];
    Object.keys(positions).sort().forEach(pos => {
      parts.push(`<div class="muted" style="margin:6px 0 4px 6px;">${pos}</div>`);
      positions[pos]
        .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
        .forEach(agent => {
          parts.push(`
            <div class="list-item" data-uid="${agent.id}">
              <div>
                <div style="font-weight:700;">${agent.name || '(no name)'}</div>
                <div class="meta">${agent.email || ''}</div>
              </div>
              <div class="badge">${agent.role || agent.profile?.role || 'agent'}</div>
            </div>
          `);
        });
    });
  });

  agentsList.innerHTML = parts.join('') || '<div class="muted">No agents found.</div>';
  agentsList.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => {
      const uid = el.getAttribute('data-uid');
      const agent = users.find(u => u.id === uid);
      if (agent) selectAgent(agent);
    });
  });
  // After re-render, keep the active highlight in sync
  setActiveAgentListItem();
}

function listenUsers() {
  const ref = collection(db, 'users');
  unsubUsers = onSnapshot(ref, (snapshot) => {
    const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    // Show all non-admin users, regardless of client assignment
    const filtered = users.filter(u => {
      const role = u.role || u.profile?.role || 'agent';
      return role !== 'admin';
    });
    agentsCache = filtered; // cache for Top 10 (now includes Unassigned/missing clients)
    renderGroupedAgents(filtered);
    recomputeTop10(); // refresh rankings
  });
}

function ensureMetricsDoc() {
  // Default attendance target is 100%
  const ref = doc(db, 'settings', 'metrics');
  return getDoc(ref).then(async (snap) => {
    if (!snap.exists()) {
      await setDoc(ref, {
        attendanceTarget: 100,
        // initialize weights if not present
        weights: { task: 50, attendance: 30, attitude: 20 },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  }).catch(() => {});
}

function listenMetrics() {
  const ref = doc(db, 'settings', 'metrics');
  unsubMetrics = onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    const attendanceTarget = Number(data.attendanceTarget || 0);
    if (snapAttendance) snapAttendance.textContent = attendanceTarget ? `${attendanceTarget}%` : '-';
    if (snapTargetTasks) snapTargetTasks.textContent = 'per-position';

    // Pull dynamic weights (support both nested and legacy flat fields)
    const w = data.weights || {
      task: Number(data.weightTask ?? 50),
      attendance: Number(data.weightAttendance ?? 30),
      attitude: Number(data.weightAttitude ?? 20)
    };
    // Sanitize and keep in cache
    const t = Number.isFinite(w.task) ? w.task : 50;
    const a = Number.isFinite(w.attendance) ? w.attendance : 30;
    const d = Number.isFinite(w.attitude) ? w.attitude : 20;
    perfWeights = { task: t, attendance: a, attitude: d };

    // Prefill inputs if they exist
    const it = document.getElementById('inpWeightTask');
    const ia = document.getElementById('inpWeightAttendance');
    const id = document.getElementById('inpWeightAttitude');
    if (it) it.value = String(t);
    if (ia) ia.value = String(a);
    if (id) id.value = String(d);

    // Update Overall Performance label to reflect current weights
    updateOverallWeightsLabel();

    // Recompute any open panels relying on these values
    computeAndRenderPerformance();
    recomputeTop10();
  });
}

// New: per-position targets
function listenPositionTargets() {
  const ref = doc(db, 'targets', 'positions');
  onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    // Make sure our new positions exist in the UI before prefilling values
    ensurePositionInputs();
    positionsTargetMap = data; // cache for Top 10
    posInputs().forEach(input => {
      const posName = input.getAttribute('data-pos');
      const val = Number(data[posName] || 0);
      input.value = val || '';
    });
    // Update detail gap if agent selected
    if (selectedAgentProfile) {
      const tgt = Number(data[selectedAgentProfile.position] || 0);
      currentMonthTargetForAgent = tgt || 0;
      const current = Number(detailTotal.textContent || 0);
      detailToTarget.textContent = currentMonthTargetForAgent ? Math.max(0, currentMonthTargetForAgent - current) : '-';
      // reflect target in the tile
      const tgtEl = document.getElementById('detailTarget');
      if (tgtEl) {
        tgtEl.textContent = currentMonthTargetForAgent ? currentMonthTargetForAgent.toLocaleString() : '-';
      }
      computeAndRenderPerformance();
    }
    recomputeTop10(); // targets changed -> recompute rankings
  });
}

// Keep leaderboard visible only on Overview
if (!window.updateLeaderboardVisibility) {
  window.updateLeaderboardVisibility = function updateLeaderboardVisibility() {
    if (!top10Card) return;
    const isOverviewVisible = overviewPanel && !overviewPanel.classList.contains('hidden');
    top10Card.classList.toggle('hidden', !isOverviewVisible);
  };
}

// View toggles
function showAdv() {
  advPanel?.classList.remove('hidden');
  overviewPanel?.classList.add('hidden');
  weightsPanel?.classList.add('hidden');
  btnToggleAdv?.classList.add('active');
  btnOverview?.classList.remove('active');
  btnToggleWeights?.classList.remove('active');
  // Ensure the new positions are present when opening Advanced Settings
  ensurePositionInputs();
  window.updateLeaderboardVisibility?.();
}

function showOverview() {
  advPanel?.classList.add('hidden');
  overviewPanel?.classList.remove('hidden');
  weightsPanel?.classList.add('hidden');
  btnOverview?.classList.add('active');
  btnToggleAdv?.classList.remove('active');
  btnToggleWeights?.classList.remove('active');
  window.updateLeaderboardVisibility?.();
}

function showWeights() {
  ensureWeightsPanel();
  advPanel?.classList.add('hidden');
  overviewPanel?.classList.add('hidden');
  weightsPanel?.classList.remove('hidden');
  btnToggleWeights?.classList.add('active');
  btnOverview?.classList.remove('active');
  btnToggleAdv?.classList.remove('active');
  window.updateLeaderboardVisibility?.();
}

// Wire existing nav
btnToggleAdv?.addEventListener('click', (e) => {
  e.preventDefault();
  showAdv();
  advPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
btnOverview?.addEventListener('click', (e) => {
  e.preventDefault();
  showOverview();
});

// Ensure a sidebar button for Performance Weights exists
function ensureWeightsNavButton() {
  if (btnToggleWeights) return;
  const nav = btnToggleAdv?.parentElement; // same container as other nav buttons
  if (!nav) return;

  btnToggleWeights = document.createElement('button');
  btnToggleWeights.id = 'btnToggleWeights';
  btnToggleWeights.textContent = 'Performance Weights';

  // SAFE INSERT: only insertBefore if the reference is a child of nav
  const logout = document.getElementById('btn-logout');
  if (logout && logout.parentElement === nav) {
    nav.insertBefore(btnToggleWeights, logout);
  } else {
    nav.appendChild(btnToggleWeights);
  }

  btnToggleWeights.addEventListener('click', (e) => {
    e.preventDefault();
    showWeights();
    weightsPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// Ensure a main panel card exists for weights
function ensureWeightsPanel() {
  if (weightsPanel) return;
  const main = overviewPanel?.parentElement; // main element
  if (!main) return;
  weightsPanel = document.createElement('div');
  weightsPanel.id = 'weightsPanel';
  weightsPanel.className = 'card hidden';
  weightsPanel.style.marginTop = '16px';
  // Minimal header; body will be built by buildPerfWeightsUI()
  weightsPanel.innerHTML = `<h2>Performance Weights</h2>`;
  // Insert after advPanel if present, otherwise append
  if (advPanel && advPanel.parentElement === main) {
    main.insertBefore(weightsPanel, advPanel.nextSibling);
  } else {
    main.appendChild(weightsPanel);
  }
}

// New positions to add into Advanced Settings > per-position targets
const NEW_POSITIONS = [
  'Estimator (Residential/Commercial)',
  'Data Processor - Invoicing Clerk'
];

// Ensure the two new positions exist as inputs inside #posTargets
function ensurePositionInputs() {
  const container = document.getElementById('posTargets');
  if (!container) return;
  NEW_POSITIONS.forEach((name) => {
    if (!container.querySelector(`.pos-target[data-pos="${name}"]`)) {
      const wrap = document.createElement('div');
      wrap.className = 'input';
      wrap.innerHTML = `
        <label>${name}</label>
        <input class="pos-target" data-pos="${name}" type="number" min="0" step="1" placeholder="e.g., 500" />
      `;
      container.appendChild(wrap);
    }
  });
}

// Build/ensure Attendance inputs exist and hide legacy points input
function ensureAttendanceInputs() {
  const pctEl = document.getElementById('mpAttendancePct');
  const card = pctEl?.closest('.card') || document.getElementById('attendanceCard') || pctEl?.parentElement;
  if (!card) return;

  // Remove old "Points (0-100)" input if present
  const oldPts = document.getElementById('inpAttendancePoints');
  if (oldPts) oldPts.closest('.input')?.remove();

  // Ensure container for inputs
  let grid = card.querySelector('#attendanceInputs');
  if (!grid) {
    grid = document.createElement('div');
    grid.id = 'attendanceInputs';
    grid.className = 'grid two';
    grid.style.marginTop = '10px';
    card.appendChild(grid);
  }

  // Working days
  if (!document.getElementById('inpWorkDays')) {
    const wrap = document.createElement('div');
    wrap.className = 'input';
    wrap.innerHTML = `
      <label for="inpWorkDays">Working days (month)</label>
      <input id="inpWorkDays" type="number" min="0" step="1" placeholder="e.g., 20" />
    `;
    grid.appendChild(wrap);
  }
  // Worked days
  if (!document.getElementById('inpWorkedDays')) {
    const wrap2 = document.createElement('div');
    wrap2.className = 'input';
    wrap2.innerHTML = `
      <label for="inpWorkedDays">Worked days</label>
      <input id="inpWorkedDays" type="number" min="0" step="1" placeholder="e.g., 17" />
    `;
    grid.appendChild(wrap2);
  }
  // NEW: Total late minutes
  if (!document.getElementById('inpLateMinutes')) {
    const wrap3 = document.createElement('div');
    wrap3.className = 'input';
    wrap3.innerHTML = `
      <label for="inpLateMinutes">Total late minutes</label>
      <input id="inpLateMinutes" type="number" min="0" step="1" placeholder="e.g., 75" />
    `;
    grid.appendChild(wrap3);
  }

  // Rebind refs and listeners
  inpWorkDays = document.getElementById('inpWorkDays');
  inpWorkedDays = document.getElementById('inpWorkedDays');
  inpLateMinutes = document.getElementById('inpLateMinutes');
  inpWorkDays?.addEventListener('input', computeAndRenderPerformance);
  inpWorkedDays?.addEventListener('input', computeAndRenderPerformance);
  inpLateMinutes?.addEventListener('input', computeAndRenderPerformance);
}

// Select agent and wire listeners
function selectAgent(agent) {
  selectedAgent = agent.id;
  selectedAgentProfile = agent;

  // Remove legacy header text if present (we no longer show "KPIs for ...")
  document.getElementById('detailHeader')?.remove();

  detailName.textContent = agent.name || '-';
  detailClient.textContent = agent.client || '-';
  detailPosition.textContent = agent.position || '-';
  // Load current position target then listen month/day + KPI doc
  getDoc(doc(db, 'targets', 'positions')).then(snap => {
    const data = snap.exists() ? snap.data() : {};
    currentMonthTargetForAgent = Number(data[agent.position] || 0);
    // set target text in the tile
    const tgtEl = document.getElementById('detailTarget');
    if (tgtEl) {
      tgtEl.textContent = currentMonthTargetForAgent ? currentMonthTargetForAgent.toLocaleString() : '-';
    }
  }).finally(() => {
    listenAgentMonth(selectedAgent, adminMonth.value);
    setDayPickerToMonth(adminMonth.value);
    listenAgentDay(selectedAgent, detailDay.value);
    listenAgentKpi(selectedAgent, adminMonth.value);
    computeAndRenderPerformance();
  });
  // Update active highlight in the sidebar list
  setActiveAgentListItem();
}

function setDayPickerToMonth(monthVal) {
  const [y, m] = monthVal.split('-').map(Number);
  const today = new Date();
  const isSameMonth = today.getFullYear() === y && (today.getMonth()+1) === m;
  const day = isSameMonth ? today.getDate() : 1;
  detailDay.value = `${y}-${pad(m)}-${pad(day)}`;
}

// Chart draw can be a no-op if chart was removed from HTML; keeping as-is
function drawDetailChart(dayTotals) {
  const canvas = document.getElementById('detailChart');
  // If the chart canvas is not present (e.g., view removed/hidden), skip rendering
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const days = Object.keys(dayTotals || {}).sort();
  const data = days.map(d => dayTotals[d]);

  try {
    if (detailChart) detailChart.destroy();
    detailChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Daily totals',
          data,
          borderColor: 'rgba(167,139,250,0.9)',
          backgroundColor: 'rgba(167,139,250,0.25)',
          tension: 0.25,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#c7c9d3' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { ticks: { color: '#c7c9d3' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true }
        }
      }
    });
  } catch (err) {
    console.warn('Chart render skipped:', err);
  }
}

// NEW: draw monthly summary bar chart (tasks per day)
function drawSummaryBar(dayTotals) {
  const canvas = document.getElementById('summaryBar');
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const days = Object.keys(dayTotals || {}).sort(); // YYYY-MM-DD
  const labels = days.map(() => '');                // hide ticks; keep placeholders
  const data = days.map(d => Number(dayTotals[d] || 0));

  try {
    if (summaryChart) summaryChart.destroy();
    summaryChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Tasks per day', // legend hidden; safe to keep
          data,
          backgroundColor: 'rgba(167,139,250,0.35)',
          borderColor: 'rgba(167,139,250,0.9)',
          borderWidth: 1,
          borderRadius: 6,
          dates: days
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,         // NEW: fill container height
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const it = items?.[0];
                return it?.dataset?.dates?.[it.dataIndex] || '';
              },
              label: (it) => `${it.parsed.y}` // CHANGED: remove "Tasks" text
            }
          }
        },
        layout: { padding: 0 },             // NEW: occupy dead space (card handles padding)
        scales: {
          x: {
            ticks: { display: false },
            title: { display: false },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            beginAtZero: true,
            title: { display: false },      // CHANGED: remove "Tasks" axis title
            ticks: { color: '#c7c9d3' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  } catch (err) {
    console.warn('Summary bar render skipped:', err);
  }
}

function listenAgentMonth(uid, monthId) {
  const ref = collection(db, 'users', uid, 'tasks');
  const qy = query(ref, where('month', '==', monthId));
  unsubAgentMonth?.();
  unsubAgentMonth = onSnapshot(qy, (snapshot) => {
    const dayTotals = {};
    let total = 0;
    snapshot.forEach(d => {
      const t = Number(d.data().total || 0);
      const id = d.data().date || d.id;
      dayTotals[id] = t;
      total += t;
    });
    detailTotal.textContent = String(total);
    detailToTarget.textContent = currentMonthTargetForAgent ? Math.max(0, currentMonthTargetForAgent - total) : '-';
    drawDetailChart(dayTotals);
    // NEW: update Summary bar chart
    drawSummaryBar(dayTotals);
    computeAndRenderPerformance(); // Update Task Created % and Overall
  });
}

function listenAgentDay(uid, dayId) {
  const ref = doc(db, 'users', uid, 'tasks', dayId);
  unsubAgentDay?.();
  unsubAgentDay = onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    const entries = Array.isArray(data.entries) ? data.entries.slice() : [];
    entries.sort((a,b) => {
      const toMillis = (v) => (typeof v?.toMillis === 'function' ? v.toMillis() : (v instanceof Date ? v.getTime() : 0));
      return toMillis(b.createdAt) - toMillis(a.createdAt);
    });
    const rows = entries.map(e => {
      const ts = e.createdAt?.toDate?.() || (e.createdAt instanceof Date ? e.createdAt : new Date());
      const time = `${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
      return `<tr><td>${time}</td><td>${e.activity}</td><td>${e.count}</td><td>${(e.difficulty || '').toString()}</td></tr>`;
    });
    detailEntries.innerHTML = rows.join('') || `<tr><td colspan="4" class="muted">No entries for this day.</td></tr>`;
  });
}

// KPI doc listen/save
function listenAgentKpi(uid, monthId) {
  const ref = doc(db, 'users', uid, 'kpi', monthId);
  unsubAgentKpi?.();
  unsubAgentKpi = onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    // Populate new attendance fields
    if (!inpWorkDays) inpWorkDays = document.getElementById('inpWorkDays');
    if (!inpWorkedDays) inpWorkedDays = document.getElementById('inpWorkedDays');
    if (!inpLateMinutes) inpLateMinutes = document.getElementById('inpLateMinutes');
    if (inpWorkDays && document.activeElement !== inpWorkDays) {
      inpWorkDays.value = data.workingDays != null ? Number(data.workingDays) : '';
    }
    if (inpWorkedDays && document.activeElement !== inpWorkedDays) {
      inpWorkedDays.value = data.workedDays != null ? Number(data.workedDays) : '';
    }
    if (inpLateMinutes && document.activeElement !== inpLateMinutes) {
      inpLateMinutes.value = data.lateMinutes != null ? Number(data.lateMinutes) : '';
    }
    // Attitude
    if (inpAttitudePoints && document.activeElement !== inpAttitudePoints) {
      inpAttitudePoints.value = data.attitudePoints != null ? Number(data.attitudePoints) : '';
    }
    computeAndRenderPerformance();
  });
}

async function requireAdmin(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const data = snap.data() || {};
  const role = data.role || data.profile?.role || 'agent';
  if (role !== 'admin') {
    window.location.href = './agent.html';
    return false;
  }
  // Self-heal: ensure profile.role is present to satisfy Firestore rules
  if (!data.profile?.role) {
    await setDoc(ref, {
      profile: {
        role: 'admin',
        // copy common fields if available
        client: data.client || null,
        position: data.position || null
      }
    }, { merge: true });
  }
  return true;
}

function initHandlers() {
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = './index.html';
  });

  adminMonth.addEventListener('change', () => {
    if (selectedAgent) {
      listenAgentMonth(selectedAgent, adminMonth.value);
      setDayPickerToMonth(adminMonth.value);
      listenAgentDay(selectedAgent, detailDay.value);
      listenAgentKpi(selectedAgent, adminMonth.value);
      computeAndRenderPerformance();
    }
    recomputeTop10(); // month changed -> refresh rankings
  });

  detailDay.addEventListener('change', () => {
    if (selectedAgent && detailDay.value) {
      listenAgentDay(selectedAgent, toDayIdFromInput(detailDay.value));
    }
  });

  // Save per-position targets
  btnSavePosTargets?.addEventListener('click', async () => {
    const inputs = Array.from(document.querySelectorAll('.pos-target'));
    const payload = {};
    // FIX: proper forEach syntax
    inputs.forEach((input) => {
      const posName = input.getAttribute('data-pos');
      const num = Number(input.value);
      payload[posName] = Number.isFinite(num) ? num : 0;
    });

    btnSavePosTargets.disabled = true;
    savePosStatus.textContent = 'Saving...';
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('Not authenticated');
      await requireAdmin(u);
      await setDoc(
        doc(db, 'targets', 'positions'),
        { ...payload, updatedAt: serverTimestamp(), updatedBy: u.uid },
        { merge: true }
      );
      savePosStatus.textContent = 'Saved.';
      setTimeout(() => (savePosStatus.textContent = ''), 1200);
    } catch (e) {
      savePosStatus.textContent = e.message || 'Error saving.';
    } finally {
      btnSavePosTargets.disabled = false;
    }
  });

  // Save KPI points for selected agent/month
  btnSaveKpi?.addEventListener('click', async () => {
    if (!selectedAgent) return;
    const monthId = adminMonth.value;
    inpWorkDays = document.getElementById('inpWorkDays');
    inpWorkedDays = document.getElementById('inpWorkedDays');
    inpLateMinutes = document.getElementById('inpLateMinutes');
    const workingDays = Math.max(0, Math.floor(Number(inpWorkDays?.value || 0)));
    const workedDays = Math.max(0, Math.floor(Number(inpWorkedDays?.value || 0)));
    const lateMinutes = Math.max(0, Math.floor(Number(inpLateMinutes?.value || 0))); // NEW
    const attitudePoints = Math.max(0, Math.min(100, Number(inpAttitudePoints?.value || 0)));

    if (workedDays > workingDays) {
      saveKpiStatus.textContent = 'Worked days cannot exceed working days.';
      setTimeout(() => (saveKpiStatus.textContent = ''), 1500);
      return;
    }

    btnSaveKpi.disabled = true;
    saveKpiStatus.textContent = 'Saving...';
    try {
      const ok = await requireAdmin(auth.currentUser);
      if (!ok) throw new Error('Not authorized');
      await setDoc(doc(db, 'users', selectedAgent, 'kpi', monthId), {
        workingDays,
        workedDays,
        lateMinutes,       // NEW: persist late minutes
        attitudePoints,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null
      }, { merge: true });
      saveKpiStatus.textContent = 'Saved.';
      setTimeout(() => (saveKpiStatus.textContent = ''), 1200);
      recomputeTop10();
    } catch (e) {
      saveKpiStatus.textContent = e.message || 'Error saving.';
    } finally {
      btnSaveKpi.disabled = false;
    }
  });

  // Ensure Attendance inputs are present
  ensureAttendanceInputs();
  // Recompute on manual input edits
  // inpAttendancePoints?.addEventListener('input', computeAndRenderPerformance);
  // moved to ensureAttendanceInputs(): inpWorkDays/inpWorkedDays listeners
  inpAttitudePoints?.addEventListener('input', computeAndRenderPerformance);
}

// Helper: inject Performance Weights section into Advanced Settings panel
function buildPerfWeightsUI() {
  ensureWeightsPanel();
  if (!weightsPanel) return;

  // Avoid duplicates
  if (document.getElementById('weightsSection')) return;

  const section = document.createElement('div');
  section.id = 'weightsSection';
  section.className = 'section';
  section.style.marginTop = '8px';
  section.innerHTML = `
    <p class="muted">Tune how the overall performance is computed. Sum must equal 100.</p>
    <div class="grid two" style="margin-top:10px;">
      <div class="input">
        <label for="inpWeightTask">Task (%)</label>
        <input id="inpWeightTask" type="number" min="0" max="100" step="1" />
      </div>
      <div class="input">
        <label for="inpWeightAttendance">Attendance (%)</label>
        <input id="inpWeightAttendance" type="number" min="0" max="100" step="1" />
      </div>
      <div class="input">
        <label for="inpWeightAttitude">Attitude (%)</label>
        <input id="inpWeightAttitude" type="number" min="0" max="100" step="1" />
      </div>
    </div>
    <button id="btnSaveWeights" class="btn" style="margin-top:12px;">Save Weights</button>
    <div id="saveWeightsStatus" class="muted" style="margin-top:8px;"></div>
  `;
  weightsPanel.appendChild(section);

  // Prefill from current weights
  const inpTask = document.getElementById('inpWeightTask');
  const inpAttn = document.getElementById('inpWeightAttendance');
  const inpAttd = document.getElementById('inpWeightAttitude');
  const applyValues = (w) => {
    inpTask.value = String(Number.isFinite(w.task) ? w.task : 50);
    inpAttn.value = String(Number.isFinite(w.attendance) ? w.attendance : 30);
    inpAttd.value = String(Number.isFinite(w.attitude) ? w.attitude : 20);
  };
  applyValues(perfWeights);

  document.getElementById('btnSaveWeights').addEventListener('click', async () => {
    const status = document.getElementById('saveWeightsStatus');
    const t = Math.max(0, Math.min(100, Number(inpTask.value || 0)));
    const a = Math.max(0, Math.min(100, Number(inpAttn.value || 0)));
    const d = Math.max(0, Math.min(100, Number(inpAttd.value || 0)));
    const sum = t + a + d;
    if (sum !== 100) {
      status.textContent = `Weights must sum to 100. Current sum: ${sum}.`;
      return;
    }
    status.textContent = 'Saving...';
    const u = auth.currentUser;
    try {
      if (!u) throw new Error('Not authenticated');
      const ok = await requireAdmin(u);
      if (!ok) throw new Error('Not authorized');
      await setDoc(doc(db, 'settings', 'metrics'), {
        weights: { task: t, attendance: a, attitude: d },
        updatedAt: serverTimestamp(),
        updatedBy: u.uid
      }, { merge: true });
      status.textContent = 'Saved.';
      setTimeout(() => (status.textContent = ''), 1200);
      perfWeights = { task: t, attendance: a, attitude: d };
      updateOverallWeightsLabel();
      computeAndRenderPerformance();
      recomputeTop10();
    } catch (e) {
      status.textContent = e.message || 'Error saving.';
    }
  });
}

// Helper: clamp a percentage value to 0-100 range
function clampPct(n) { return Math.min(100, Math.max(0, n)); }

// Animate the circular progress ring from 'from' to 'to' over 'ms' with easing
function animateCircleProgress(progEl, labelEl, from, to, ms = 800) {
  if (!progEl) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const apply = (v) => {
    progEl.style.setProperty('--p', clamp(v));
    if (labelEl) labelEl.textContent = `${Math.round(clamp(v))}%`;
  };

  if (reduce) {
    apply(to);
    progEl.dataset.p = String(to);
    return;
  }

  if (progEl._anim) cancelAnimationFrame(progEl._anim);
  const start = performance.now();
  const diff = to - from;
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

  const frame = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const v = from + diff * easeOutCubic(t);
    apply(v);
    if (t < 1) {
      progEl._anim = requestAnimationFrame(frame);
    } else {
      progEl._anim = null;
      progEl.dataset.p = String(to);
    }
  };
  progEl._anim = requestAnimationFrame(frame);
}

function computeAndRenderPerformance() {
  const totalTasks = Number(detailTotal.textContent || 0);
  const target = Number(currentMonthTargetForAgent || 0);
  const taskPct = target > 0 ? clampPct((totalTasks / target) * 100) : 0;
  const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString() : '0');

  // Existing task KPI values
  if (mpTaskPct) mpTaskPct.textContent = `${Math.round(taskPct)}%`;
  if (mpTaskMeta) mpTaskMeta.textContent = `${fmt(totalTasks)} / ${fmt(target)}`;

  // Circular progress + meta (animated)
  const prog = document.getElementById('taskProgress');
  const progPct = document.getElementById('taskProgressPct');
  const tgtEl = document.getElementById('detailTarget');
  const prev = prog ? parseFloat(prog.dataset.p || '0') : 0;

  if (prog) {
    // animate from previous displayed value to the new one
    animateCircleProgress(
      prog,
      progPct,
      Number.isFinite(prev) ? prev : 0,
      taskPct,
      900 // duration ms
    );
  } else if (progPct) {
    // fallback if ring not present
    progPct.textContent = `${Math.round(taskPct)}%`;
  }
  if (tgtEl) tgtEl.textContent = target ? fmt(target) : '-';

  // Attendance metric with lateness
  inpWorkDays = document.getElementById('inpWorkDays');
  inpWorkedDays = document.getElementById('inpWorkedDays');
  inpLateMinutes = document.getElementById('inpLateMinutes');
  const workingDays = Math.max(0, Math.floor(Number(inpWorkDays?.value || 0)));
  const workedDays = Math.max(0, Math.floor(Number(inpWorkedDays?.value || 0)));
  const lateMinutes = Math.max(0, Math.floor(Number(inpLateMinutes?.value || 0)));
  const H_day_minutes = 480;
  let attendanceMetric = 0;
  if (workingDays > 0) {
    const attendanceDaysScore = clampPct((workedDays / workingDays) * 100);
    const lateScore = workedDays > 0
      ? clampPct(100 - (lateMinutes / (workedDays * H_day_minutes)) * 100)
      : 100;
    attendanceMetric = clampPct(attendanceDaysScore * 0.90 + lateScore * 0.10);
  }
  if (mpAttendancePct) mpAttendancePct.textContent = `${Math.round(attendanceMetric)}%`;

  // Attitude
  const attitudePts = Math.max(0, Math.min(100, Number(inpAttitudePoints?.value || 0)));
  if (mpAttitudePct) mpAttitudePct.textContent = `${Math.round(attitudePts)}%`;

  // Overall Performance using dynamic weights
  const wT = (perfWeights.task || 0) / 100;
  const wA = (perfWeights.attendance || 0) / 100;
  const wD = (perfWeights.attitude || 0) / 100;
  const overall = clampPct(taskPct * wT + attendanceMetric * wA + attitudePts * wD);
  if (mpOverallPct) mpOverallPct.textContent = `${Math.round(overall)}%`;

  updateOverallWeightsLabel();
}

// Build Top 10 agents based on overall performance
async function recomputeTop10() {
  try {
    if (!top10Table || !adminMonth) return;
    const monthId = adminMonth.value;
    if (!monthId) return;
    if (top10Month) top10Month.textContent = monthId;

    const rows = await Promise.all(agentsCache.map(async (u) => {
      const uid = u.id;
      const position = (u.position || '').trim();
      const target = Number(positionsTargetMap[position] || 0);

      const daysRef = collection(db, 'users', uid, 'tasks');
      const qy = query(daysRef, where('month', '==', monthId));
      const snapDays = await getDocs(qy);
      let totalTasks = 0;
      snapDays.forEach(d => totalTasks += Number(d.data()?.total || 0));

      const kpiSnap = await getDoc(doc(db, 'users', uid, 'kpi', monthId));
      const kpi = kpiSnap.exists() ? kpiSnap.data() : {};
      const workingDays = Math.max(0, Math.floor(Number(kpi.workingDays || 0)));
      const workedDays = Math.max(0, Math.floor(Number(kpi.workedDays || 0)));
      const lateMinutes = Math.max(0, Math.floor(Number(kpi.lateMinutes || 0)));
      const legacyAttendance = Number.isFinite(Number(kpi.attendancePoints))
        ? Math.max(0, Math.min(100, Number(kpi.attendancePoints)))
        : null;

      let attendanceMetric = 0;
      if (workingDays > 0) {
        const daysScore = clampPct((workedDays / workingDays) * 100);
        const lateScore = workedDays > 0
          ? clampPct(100 - (lateMinutes / (workedDays * 480)) * 100)
          : 100;
        attendanceMetric = clampPct(daysScore * 0.90 + lateScore * 0.10);
      } else if (legacyAttendance != null) {
        attendanceMetric = legacyAttendance;
      }

      const attitudePts = Math.max(0, Math.min(100, Number(kpi.attitudePoints || 0)));
      const taskPct = target > 0 ? clampPct((totalTasks / target) * 100) : 0;

      const wT = (perfWeights.task || 0) / 100;
      const wA = (perfWeights.attendance || 0) / 100;
      const wD = (perfWeights.attitude || 0) / 100;
      const overall = clampPct(taskPct * wT + attendanceMetric * wA + attitudePts * wD);

      return {
        uid,
        name: u.name || '(no name)',
        client: u.client || '',
        position,
        totalTasks,
        target,
        taskPct,
        attendancePts: attendanceMetric,
        attitudePts,
        overall
      };
    }));

    rows.sort((a, b) => b.overall - a.overall);
    const top = rows.slice(0, 10);
    const fmt = (n) => Number.isFinite(n) ? n.toLocaleString() : '0';

    // NEW: render cards grid
    const grid = document.getElementById('top10Grid');
    if (grid) {
      grid.innerHTML = top.length ? top.map((r, i) => {
        const rank = i + 1;
        const overallPct = Math.round(r.overall);
        const bucket = overallPct >= 85 ? 'great' : overallPct >= 70 ? 'good' : overallPct >= 50 ? 'ok' : 'bad';
        const tasksCell = `${fmt(r.totalTasks)} / ${fmt(r.target)} (${Math.round(r.taskPct)}%)`;
        const initials = (r.name || '?')
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map(s => s[0]?.toUpperCase() || '')
          .join('') || '?';
        return `
          <div class="agent-card" data-rank="${rank}">
            <div class="rank-ribbon rank-${rank <= 3 ? rank : ''}">#${rank}</div>
            <div class="agent-head">
              <div class="agent-avatar" title="${r.name}">${initials}</div>
              <div class="agent-meta">
                <div class="name">${r.name}</div>
                <div class="sub">${r.client || '-'} • ${r.position || '-'}</div>
              </div>
            </div>
            <div class="chips">
              <span class="chip">Tasks: ${tasksCell}</span>
              <span class="chip">Attendance: ${Math.round(r.attendancePts)}%</span>
              <span class="chip">Attitude: ${Math.round(r.attitudePts)}%</span>
            </div>
            <span class="overall-badge ${bucket}" title="Overall">
              ${overallPct}%
            </span>
          </div>
        `;
      }).join('') : `<div class="muted">No data for ${monthId}.</div>`;
    }

    // Fallback: keep table rows too (hidden by CSS)
    top10Table.innerHTML = top.length ? top.map((r, i) => `
      <tr data-rank="${i + 1}">
        <td>${i + 1}</td>
        <td>${r.name}</td>
        <td>${r.client}</td>
        <td>${r.position || '-'}</td>
        <td>${fmt(r.totalTasks)} / ${fmt(r.target)} (${Math.round(r.taskPct)}%)</td>
        <td>${Math.round(r.attendancePts)}%</td>
        <td>${Math.round(r.attitudePts)}%</td>
        <td><strong>${Math.round(r.overall)}%</strong></td>
      </tr>
    `).join('') : `<tr><td colspan="8" class="muted">No data for ${monthId}.</td></tr>`;
  } catch (e) {
    const grid = document.getElementById('top10Grid');
    if (grid) grid.innerHTML = `<div class="muted">Unable to build Top Agents: ${e.message || e}</div>`;
    if (top10Table) top10Table.innerHTML = `<tr><td colspan="8" class="muted">Unable to build Top 10: ${e.message || e}</td></tr>`;
  }
}

function setAdminGreeting(name) {
  const txt = `Hello, ${name || 'Admin'}`;
  const sidebar = document.querySelector('.sidebar');
  const brand = sidebar?.querySelector('.brand');
  // Create or reuse badge
  let el = document.getElementById('adminGreeting');
  if (!el) {
    el = document.createElement('div');
    el.id = 'adminGreeting';
    el.className = 'badge';
  }
  el.textContent = txt;

  if (sidebar && brand) {
    // Style for sidebar placement and insert directly below brand
    el.style.margin = '8px 0 0 0';
    el.style.marginLeft = '0';
    if (el.parentElement !== sidebar || el.previousElementSibling !== brand) {
      sidebar.insertBefore(el, brand.nextSibling);
    }
  } else {
    // Fallback to topbar/main if sidebar not found
    const host = document.querySelector('.topbar') || document.querySelector('.main') || document.body;
    el.style.marginLeft = 'auto';
    if (!host.contains(el)) host.appendChild(el);
  }
}

// Lazy-load Flatpickr + MonthSelect plugin
async function ensureFlatpickr() {
  if (window.flatpickr && window.monthSelectPlugin) return;
  // base CSS (structure)
  if (!document.getElementById('fp-base-css')) {
    const l = document.createElement('link');
    l.id = 'fp-base-css';
    l.rel = 'stylesheet';
    l.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
    document.head.appendChild(l);
  }
  // NEW: official dark theme to match original look
  if (!document.getElementById('fp-theme-dark')) {
    const lTheme = document.createElement('link');
    lTheme.id = 'fp-theme-dark';
    lTheme.rel = 'stylesheet';
    lTheme.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css';
    document.head.appendChild(lTheme);
  }
  // plugin CSS (layout for month grid)
  if (!document.getElementById('fp-month-css')) {
    const l2 = document.createElement('link');
    l2.id = 'fp-month-css';
    l2.rel = 'stylesheet';
    l2.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/monthSelect/style.css';
    document.head.appendChild(l2);
  }
  // base JS
  if (!window.flatpickr) {
    await new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
      s.onload = res;
      document.head.appendChild(s);
    });
  }
  // plugin JS
  if (!window.monthSelectPlugin) {
    await new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/monthSelect/index.js';
      s.onload = res;
      document.head.appendChild(s);
    });
  }

  // After assets are ensured, inject our theme overrides once
  ensureFlatpickrTheme();
}

// Inject Flatpickr theme overrides that match the site's palette
function ensureFlatpickrTheme() {
  // Revert to Flatpickr's original/default styles by removing our overrides
  const el = document.getElementById('fp-theme-overrides');
  if (el) el.remove();
}

async function initAdminCalendars() {
  await ensureFlatpickr();

  const dayEl = document.getElementById('detailDay');
  if (dayEl) {
    if (dayEl.type !== 'text') dayEl.type = 'text';
    window.flatpickr(dayEl, {
      dateFormat: 'Y-m-d',
      defaultDate: dayEl.value || null,
      disableMobile: true,
      nextArrow: '›',
      prevArrow: '‹',
      onChange: (dates, str) => {
        dayEl.value = str;
        dayEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  const monthEl = document.getElementById('adminMonth');
  if (monthEl) {
    if (monthEl.type !== 'text') monthEl.type = 'text';
    window.flatpickr(monthEl, {
      plugins: [window.monthSelectPlugin({ shorthand: true, dateFormat: 'Y-m' })],
      defaultDate: monthEl.value || null,
      disableMobile: true,
      nextArrow: '›',
      prevArrow: '‹',
      onChange: (dates, str) => {
        monthEl.value = str;
        monthEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }
}

// NEW: jsPDF loader
async function ensureJsPDF() {
  if (window.jspdf?.jsPDF || window.jsPDF) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload = () => res();
    s.onerror = rej;
    document.head.appendChild(s);
  });
}
function getJsPDF() {
  const ctor = window.jspdf?.jsPDF || window.jsPDF;
  if (!ctor) throw new Error('jsPDF not available');
  return new ctor({ unit: 'pt', format: 'a4' });
}

// NEW: jsPDF AutoTable loader
async function ensureJsPDFAutoTable() {
  if (window.jspdf?.jsPDF && window.jspdf?.autoTable) return;
  await ensureJsPDF();
  if (window.jspdf?.autoTable) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js';
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

// NEW: JSZip loader + save helper
async function ensureJSZip() {
  if (window.JSZip) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}
function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// NEW: Daily report generator (per client) -> single ZIP download
async function generateDailyReport(dayId) {
  showLoader(`Generating daily report ${dayId}…`);
  try {
    await ensureJsPDF();
    await ensureJsPDFAutoTable();
    await ensureJSZip();

    // Build client -> agents map (sorted)
    const all = Array.isArray(agentsCache) ? agentsCache.slice() : [];
    all.sort((a, b) =>
      (a.client || '').localeCompare(b.client || '') ||
      (a.name || '').localeCompare(b.name || '')
    );
    const groups = {};
    all.forEach(u => {
      const c = (u.client || 'Unassigned').trim() || 'Unassigned';
      (groups[c] ||= []).push(u);
    });

    const zip = new window.JSZip();
    let files = 0;

    const toMs = (v) =>
      (typeof v?.toMillis === 'function' && v.toMillis()) ||
      (v?.seconds ? v.seconds * 1000 : 0) ||
      (v instanceof Date ? v.getTime() : 0) ||
      (typeof v === 'number' ? v : 0);

    for (const client of Object.keys(groups).sort()) {
      const pdf = getJsPDF();
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 40;
      let y = margin;

      // Header with client
      pdf.setFontSize(16);
      pdf.text(`Daily Report - ${dayId}`, margin, y);
      y += 8;
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text(`Client: ${client}  •  Generated: ${new Date().toLocaleString()}`, margin, y);
      pdf.setTextColor(20);
      y += 16;

      for (const u of groups[client]) {
        const ref = doc(db, 'users', u.id, 'tasks', dayId);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        const entries = Array.isArray(data.entries) ? data.entries.slice() : [];
        const total = Number(data.total || 0);

        // Agent section
        y = pdfEnsureSpace(pdf, y + 6, margin, pageH);
        pdf.setFontSize(12);
        pdf.setTextColor(90);
        const hdr = `${u.name || '(no name)'}  •  ${u.position || '-'}`;
        pdf.text(hdr, margin, y);
        y += 14;

        pdf.setTextColor(20);
        pdf.setFontSize(11);
        pdf.text(`Tasks submitted: ${entries.length} • Total count: ${total}`, margin, y);
        y += 8;

        // Table rows (newest first). If none, add placeholder.
        entries.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        const rows = entries.length
          ? entries.map((e) => {
              let when = '--:--';
              try {
                const d =
                  e.createdAt?.toDate?.() ||
                  (e.createdAt?.seconds ? new Date(e.createdAt.seconds * 1000)
                    : (e.createdAt instanceof Date ? e.createdAt
                    : (typeof e.createdAt === 'number' ? new Date(e.createdAt) : null)));
                if (d) {
                  const hh = String(d.getHours()).padStart(2, '0');
                  const mm = String(d.getMinutes()).padStart(2, '0');
                  when = `${hh}:${mm}`;
                }
              } catch {}
              return [when, e.activity || '-', Number(e.count || 0), (e.difficulty || '').toString()];
            })
          : [['-', 'No tasks submitted', 0, '-']];

        pdf.autoTable({
          startY: y + 6,
          head: [['Time', 'Activity', 'Count', 'Difficulty']],
          body: rows,
          theme: 'grid',
          styles: { fontSize: 9, cellPadding: 4, lineColor: [200, 200, 200], lineWidth: 0.25 },
          headStyles: { fillColor: [17, 24, 39], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          margin: { left: margin, right: margin },
          columnStyles: { 2: { halign: 'right' } }
        });

        y = (pdf.lastAutoTable?.finalY || y) + 10;
        pdf.setDrawColor(230, 230, 230);
        pdf.line(margin, y - 6, pageW - margin, y - 6);
      }

      // Add client PDF to ZIP
      const fname = `KPI_Daily_${dayId}_${safeFilename(client)}.pdf`;
      const blob = pdf.output('blob');
      zip.file(fname, blob);
      files++;
    }

    if (!files) {
      zip.file('README.txt', `No agents or data found for ${dayId}.`);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(`KPI_Daily_${dayId}_AllClients.zip`, zipBlob);
  } finally {
    hideLoader(250);
  }
}

// NEW: Monthly report generator (per client) -> single ZIP download
async function generateMonthlyReport(monthId) {
  showLoader(`Generating monthly report ${monthId}…`);
  try {
    await ensureJsPDF();
    await ensureJsPDFAutoTable();
    await ensureJSZip();

    // Build client -> agents map (sorted)
    const all = Array.isArray(agentsCache) ? agentsCache.slice() : [];
    all.sort((a, b) =>
      (a.client || '').localeCompare(b.client || '') ||
      (a.name || '').localeCompare(b.name || '')
    );
    const groups = {};
    all.forEach(u => {
      const c = (u.client || 'Unassigned').trim() || 'Unassigned';
      (groups[c] ||= []).push(u);
    });

    const zip = new window.JSZip();
    let files = 0;

    for (const client of Object.keys(groups).sort()) {
      const pdf = getJsPDF();
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 40;
      let y = margin;

      // Header with client
      pdf.setFontSize(16);
      pdf.text(`Monthly Report - ${monthId}`, margin, y);
      y += 8;
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text(`Client: ${client}  •  Generated: ${new Date().toLocaleString()}`, margin, y);
      pdf.setTextColor(20);
      y += 16;

      for (const u of groups[client]) {
        // Sum totals across the month
        const daysRef = collection(db, 'users', u.id, 'tasks');
        const qy = query(daysRef, where('month', '==', monthId));
        const snapDays = await getDocs(qy);
        let total = 0;
        const perDay = [];
        snapDays.forEach(d => {
          const val = Number(d.data()?.total || 0);
          total += val;
          perDay.push({ date: d.data()?.date || d.id, total: val });
        });

        // Agent header
        y = pdfEnsureSpace(pdf, y + 6, margin, pageH);
        pdf.setFontSize(12);
        pdf.setTextColor(90);
        const hdr = `${u.name || '(no name)'}  •  ${u.position || '-'}`;
        pdf.text(hdr, margin, y);
        y += 14;

        pdf.setTextColor(20);
        pdf.setFontSize(11);
        pdf.text(`Monthly Total: ${total}`, margin, y);
        y += 8;

        if (total > 0) {
          perDay.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          const rows = perDay.map(d => [d.date, d.total]);
          pdf.autoTable({
            startY: y + 6,
            head: [['Date', 'Total']],
            body: rows,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 4, lineColor: [200, 200, 200], lineWidth: 0.25 },
            headStyles: { fillColor: [17, 24, 39], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { left: margin, right: margin }
          });
          y = (pdf.lastAutoTable?.finalY || y) + 10;
        } else {
          // No data note for the month
          pdf.setFontSize(10);
          pdf.setTextColor(120);
          y = pdfAddWrappedText(pdf, 'No data for this month.', margin + 6, y + 6, pageW - margin * 2 - 20, 12) + 6;
          pdf.setTextColor(20);
        }

        pdf.setDrawColor(230, 230, 230);
        pdf.line(margin, y, pageW - margin, y);
        y += 6;
      }

      // Add client PDF to ZIP
      const fname = `KPI_Monthly_${monthId}_${safeFilename(client)}.pdf`;
      const blob = pdf.output('blob');
      zip.file(fname, blob);
      files++;
    }

    if (!files) {
      zip.file('README.txt', `No agents or data found for ${monthId}.`);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(`KPI_Monthly_${monthId}_AllClients.zip`, zipBlob);
  } finally {
    hideLoader(250);
  }
}

// NEW: helper to sanitize client names for filenames
function safeFilename(name) {
  return String(name || 'Unassigned')
    .trim()
    .replace(/[^a-z0-9\-_.]+/gi, '_')
    .slice(0, 100);
}

// Restore: Report UI wiring (dropdown -> daily/monthly generators)
function initReportUI() {
  const btn = document.getElementById('btnReports');
  const menu = document.getElementById('reportMenu');
  const optDaily = document.getElementById('optDailyReport');
  const optMonthly = document.getElementById('optMonthlyReport');
  if (!btn || !menu) return;

  const hide = () => menu.classList.add('hidden');
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden')) {
      const dd = document.getElementById('reportDropdown');
      if (dd && !dd.contains(e.target)) hide();
    }
  });

  optDaily?.addEventListener('click', async (e) => {
    e.preventDefault();
    hide();
    const def = document.getElementById('detailDay')?.value || new Date().toISOString().slice(0, 10);
    const day = prompt('Enter day (YYYY-MM-DD):', def);
    if (!day) return;
    try { await generateDailyReport(day); } catch {}
  });
  optMonthly?.addEventListener('click', async (e) => {
    e.preventDefault();
    hide();
    const def = document.getElementById('adminMonth')?.value || new Date().toISOString().slice(0, 7);
    const month = prompt('Enter month (YYYY-MM):', def);
    if (!month) return;
    try { await generateMonthlyReport(month); } catch {}
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = './index.html';
    return;
  }
  const ok = await requireAdmin(user);
  if (!ok) return;

  // Set admin background
  document.body.classList.add('admin-page');

  // Fetch name for greeting
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap.data() || {};
    const name = data.name || user.displayName || 'Admin';
    setAdminGreeting(name);
  } catch {
    setAdminGreeting('Admin');
  }

  // Prepare panels and buttons
  ensureWeightsNavButton();
  ensureWeightsPanel();
  // Default to Overview on load
  showOverview();
  setMonthToCurrent();
  await ensureMetricsDoc();
  // Ensure new positions inputs are present early
  ensurePositionInputs();
  listenUsers();
  listenMetrics();
  listenPositionTargets();
  // Initialize UIs
  buildPerfWeightsUI();
  initTop10Collapsible?.();
  window.updateLeaderboardVisibility?.(); // initial sync
  updateOverallWeightsLabel(); // ensure label matches weights
  recomputeTop10(); // initial build

  // Initialize calendars after UI is ready
  initAdminCalendars().catch(() => {});

  // NEW: init report UI
  initReportUI();

  // NEW: hide loader after initial setup
  hideLoader(250);
});

btnOverview?.addEventListener('click', (e) => {
  e.preventDefault();
  showOverview();
  initTop10Collapsible?.();
});

initHandlers();
initHandlers();
