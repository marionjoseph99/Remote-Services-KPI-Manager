import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, collection, onSnapshot, serverTimestamp,
  query, where, getDocs
} from './firebase-config.js';

const $ = (q) => document.querySelector(q);
const logoutBtn = $('#btn-logout');
const toggleSidebar = $('#toggleSidebar');
const sidebar = $('#sidebar');

const agentsList = $('#agentsList');
const adminMonth = $('#adminMonth');
const detailHeader = $('#detailHeader');
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
    snapAttendance.textContent = attendanceTarget ? `${attendanceTarget}%` : '-';
    snapTargetTasks.textContent = 'per-position';

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
  nav.insertBefore(btnToggleWeights, document.getElementById('btn-logout') || null);
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
  detailHeader.textContent = `KPIs for ${agent.name}`;
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
          label: 'Tasks per day',
          data,
          // keep original colors
          backgroundColor: 'rgba(167,139,250,0.35)',
          borderColor: 'rgba(167,139,250,0.9)',
          borderWidth: 1,
          borderRadius: 6,
          // carry full dates for tooltip use
          dates: days
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const it = items?.[0];
                return it?.dataset?.dates?.[it.dataIndex] || '';
              },
              label: (it) => `Tasks: ${it.parsed.y}`
            }
          }
        },
        scales: {
          x: {
            // hide tick numbers and axis title
            ticks: { display: false },
            title: { display: false },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Tasks', color: '#c7c9d3' },
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
    inputs.forEach(input => {
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
        attendancePts: attendanceMetric, // display metric
        attitudePts,
        overall
      };
    }));

    rows.sort((a, b) => b.overall - a.overall);
    const top = rows.slice(0, 10);
    const fmt = (n) => Number.isFinite(n) ? n.toLocaleString() : '0';
    top10Table.innerHTML = top.length ? top.map((r, i) => `
      <tr>
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
  if (document.getElementById('fp-theme-overrides')) return;
  const css = `
  .flatpickr-calendar{
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)), var(--panel);
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: var(--shadow);
    border-radius: var(--radius);
    color: var(--text);
    overflow: hidden;
  }
  .flatpickr-months{ border-bottom:1px solid rgba(255,255,255,0.06); }
  .flatpickr-months .flatpickr-month{ color:var(--text); fill:var(--text); padding:8px 6px; }
  .flatpickr-months .flatpickr-prev-month, .flatpickr-months .flatpickr-next-month{
    color:var(--text); fill:var(--text); opacity:.85; border-radius:10px;
  }
  .flatpickr-months .flatpickr-prev-month:hover, .flatpickr-months .flatpickr-next-month:hover{
    background:rgba(255,255,255,0.06); opacity:1;
  }
  .flatpickr-weekdays{ background:rgba(255,255,255,0.03); border-bottom:1px solid rgba(255,255,255,0.06); }
  span.flatpickr-weekday{ color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.3px; font-size:11px; }
  .flatpickr-days,.dayContainer{ padding:10px; }
  .flatpickr-day{
    color:var(--text); border-radius:10px; border:1px solid transparent;
    width:36px; height:36px; line-height:36px; margin:2px;
  }
  .flatpickr-day:hover{ background:rgba(167,139,250,0.12); border-color:rgba(167,139,250,0.25); }
  .flatpickr-day.today{ background:transparent; box-shadow: inset 0 0 0 2px rgba(244,114,182,0.8); }
  .flatpickr-day.selected,.flatpickr-day.startRange,.flatpickr-day.endRange{
    background:linear-gradient(135deg, var(--accent), var(--accent-2)); color:#0d0f1a; border-color:transparent; box-shadow:0 6px 16px rgba(167,139,250,0.25);
  }
  .flatpickr-day.inRange{ background:rgba(167,139,250,0.10); box-shadow: inset 0 0 0 1px rgba(167,139,250,0.25); }
  .flatpickr-day.disabled,.flatpickr-day.flatpickr-disabled,.flatpickr-day.prevMonthDay,.flatpickr-day.nextMonthDay{
    color:rgba(255,255,255,0.35); background:transparent; border-color:transparent;
  }
  .flatpickr-time input,.flatpickr-time .numInput{
    background:var(--panel); color:var(--text); border:1px solid rgba(255,255,255,0.08); border-radius:10px;
  }
  .flatpickr-monthSelect-month{
    background:transparent; color:var(--text); border-radius:10px; padding:10px 8px; border:1px solid transparent; margin:2px;
  }
  .flatpickr-monthSelect-month:hover{ background:rgba(167,139,250,0.12); border-color:rgba(167,139,250,0.25); }
  .flatpickr-monthSelect-month.selected{
    background:linear-gradient(135deg, var(--accent), var(--accent-2)); color:#0d0f1a; border-color:transparent; box-shadow:0 6px 16px rgba(167,139,250,0.25);
  }`;
  const style = document.createElement('style');
  style.id = 'fp-theme-overrides';
  style.textContent = css;
  document.head.appendChild(style);
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
});

btnOverview?.addEventListener('click', (e) => {
  e.preventDefault();
  showOverview();
  initTop10Collapsible?.();
});

initHandlers();
