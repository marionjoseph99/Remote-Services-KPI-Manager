import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, /* remove addDoc */ collection, onSnapshot, serverTimestamp, increment,
  query, where /* for monthly filtering */
} from './firebase-config.js';

const $ = (q) => document.querySelector(q);
const todayTable = $('#todayTable');
const submitBtn = $('#btn-submit');
const submitStatus = $('#submitStatus');
const activityInput = $('#activity');
const countInput = $('#count');
const difficultySelect = $('#difficulty'); // New: difficulty selector
const welcomeBadge = $('#welcomeBadge');
const profName = $('#profName');
const profClient = $('#profClient');
const profPosition = $('#profPosition');
const profRole = $('#profRole');
const logoutBtn = $('#btn-logout');
const monthPicker = $('#monthPicker');
// Removed KPI-only UI dependency; keep references guarded
const monthTotalEl = $('#monthTotal');       // may be null (removed from UI)
const monthTargetGapEl = $('#monthTargetGap'); // may be null (removed from UI)
const targetTasksEl = $('#targetTasks');
const attendanceTargetEl = $('#attendanceTarget');
const monthTable = $('#monthTable'); // New monthly entries list

let uid = null;
let charts = {
  today: null,
  month: null
};
let currentMonthId = null;
let unsubEntries = null; // no longer used, kept for compatibility
let unsubDay = null;
let unsubMonthDays = null;
let unsubMetrics = null;

let positionTarget = 0;
let monthTotalCount = 0; // track without needing DOM

const pad = (n) => n.toString().padStart(2, '0');
const toMonthId = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const toDayId = (d) => `${toMonthId(d)}-${pad(d.getDate())}`;
const sanitizeKey = (s) => s.trim().toLowerCase().replace(/[.#$/\[\]]/g, '_').slice(0, 60);

function setMonthPickerToCurrent() {
  const d = new Date();
  monthPicker.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function upsertMetricsDefaults() {
  // No-op here; admin controls it. We only read, and show "-" if unset.
}

function drawTodayChart(perActivity) {
  const ctx = document.getElementById('todayChart');
  if (!ctx) return; // no-op if chart removed
  const labels = Object.keys(perActivity);
  const data = labels.map(k => perActivity[k]);
  if (charts.today) charts.today.destroy();
  charts.today = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Today', data, backgroundColor: 'rgba(167,139,250,0.65)' }]
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
}

function drawMonthChart(dayTotalsMap) {
  const ctx = document.getElementById('monthChart');
  if (!ctx) return; // no-op if chart removed
  const days = Object.keys(dayTotalsMap).sort();
  const data = days.map(d => dayTotalsMap[d]);
  if (charts.month) charts.month.destroy();
  charts.month = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: 'Daily totals',
        data,
        borderColor: 'rgba(244,114,182,0.9)',
        backgroundColor: 'rgba(244,114,182,0.25)',
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
}

function updateTargetGap() {
  const current = monthTotalCount;
  if (monthTargetGapEl) monthTargetGapEl.textContent = positionTarget ? Math.max(0, positionTarget - current) : '-';
}

function listenMetrics() {
  const ref = doc(db, 'settings', 'metrics');
  unsubMetrics = onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    // Do NOT set per-position target here anymore.
    // Only attendance remains on this doc.
    const attendance = Number(data.attendanceTarget || 0);
    attendanceTargetEl.textContent = attendance ? `${attendance}%` : '-';
  });
}

function listenPositionTargets(userPosition) {
  const ref = doc(db, 'targets', 'positions');
  onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    const tgt = Number(data[userPosition] || 0);
    positionTarget = Number.isFinite(tgt) ? tgt : 0;
    if (targetTasksEl) targetTasksEl.textContent = positionTarget ? `${positionTarget}` : '-';
    updateTargetGap();
  });
}

function listenToday(uid) {
  const d = new Date();
  const monthId = toMonthId(d);
  currentMonthId = monthId;
  const dayId = toDayId(d);

  // Read a single per-day document under the user's tasks
  const dayDocRef = doc(db, 'users', uid, 'tasks', dayId);
  unsubDay?.();

  unsubDay = onSnapshot(dayDocRef, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    const perActivity = data.perActivity || {};
    drawTodayChart(perActivity);

    // Render today's entries from array on the same doc
    const entries = Array.isArray(data.entries) ? data.entries.slice() : [];
    // Sort by createdAt desc
    entries.sort((a,b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });
    const rows = entries.map(e => {
      const ts = e.createdAt?.toDate?.() || new Date();
      const time = `${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
      return `<tr><td>${time}</td><td>${e.activity}</td><td>${e.count}</td></tr>`;
    });
    todayTable.innerHTML = rows.join('') || `<tr><td colspan="3" class="muted">No entries yet.</td></tr>`;
  });
}

function listenMonth(uid, monthId) {
  const daysRef = collection(db, 'users', uid, 'tasks');
  const qy = query(daysRef, where('month', '==', monthId));
  unsubMonthDays?.();
  unsubMonthDays = onSnapshot(qy, (snapshot) => {
    const dayTotals = {};
    monthTotalCount = 0;
    // Build monthly entries list
    const allEntries = [];
    snapshot.forEach((d) => {
      const data = d.data();
      const dayKey = data.date || d.id; // yyyy-mm-dd
      const t = Number(data.total || 0);
      dayTotals[dayKey] = t;
      monthTotalCount += t;

      const entries = Array.isArray(data.entries) ? data.entries : [];
      entries.forEach(e => {
        const ts = e.createdAt?.toDate?.() || (e.createdAt instanceof Date ? e.createdAt : new Date());
        allEntries.push({
          date: dayKey,
          time: `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`,
          activity: e.activity,
          count: e.count,
          difficulty: e.difficulty || ''
        });
      });
    });

    // Populate monthly entries table
    if (monthTable) {
      allEntries.sort((a,b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.time < b.time ? 1 : -1)));
      monthTable.innerHTML = allEntries.length
        ? allEntries.map(e => `<tr><td>${e.date}</td><td>${e.time}</td><td>${e.activity}</td><td>${e.count}</td><td>${e.difficulty}</td></tr>`).join('')
        : `<tr><td colspan="5" class="muted">No entries this month.</td></tr>`;
    }

    // Keep chart support no-op if removed
    drawMonthChart(dayTotals);

    // Update target gap and optional month total UI if present
    if (monthTotalEl) monthTotalEl.textContent = String(monthTotalCount);
    updateTargetGap();
  });
}

async function addTask(uid, activity, count, difficulty) {
  const d = new Date();
  const monthId = toMonthId(d);
  const dayId = toDayId(d);

  // Per-day document under user tasks
  const dayDocRef = doc(db, 'users', uid, 'tasks', dayId);

  const key = sanitizeKey(activity);
  // Update totals atomically on the per-day doc
  await setDoc(dayDocRef, {
    date: dayId,
    month: monthId,
    updatedAt: serverTimestamp(),
    total: increment(Number(count)),
    [`perActivity.${key}`]: increment(Number(count))
  }, { merge: true });

  // Append entry to entries array on the same doc (no subcollection to comply with current rules)
  const snap = await getDoc(dayDocRef);
  const prev = Array.isArray(snap.data()?.entries) ? snap.data().entries : [];
  const newEntry = {
    activity,
    key,
    count: Number(count),
    difficulty: String(difficulty),
    difficultyKey: String(difficulty).toLowerCase(),
    // Use a plain Date to avoid Firestore error: serverTimestamp() not allowed in arrays
    createdAt: new Date()
  };
  await setDoc(dayDocRef, { entries: [...prev, newEntry] }, { merge: true });
}

function initHandlers() {
  submitBtn.addEventListener('click', async () => {
    const activity = activityInput.value.trim();
    const count = Number(countInput.value);
    const difficulty = difficultySelect.value;
    if (!activity || !count || count <= 0 || !difficulty) {
      submitStatus.textContent = 'Please enter activity, count and difficulty.';
      return;
    }
    submitBtn.disabled = true;
    submitStatus.textContent = 'Saving...';
    try {
      await addTask(uid, activity, count, difficulty);
      activityInput.value = '';
      countInput.value = '';
      difficultySelect.value = ''; // reset
      submitStatus.textContent = 'Saved.';
      setTimeout(() => (submitStatus.textContent = ''), 1200);
    } catch (e) {
      submitStatus.textContent = e.message || 'Error saving entry.';
    } finally {
      submitBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = './index.html';
  });

  monthPicker.addEventListener('change', () => {
    const val = monthPicker.value; // yyyy-mm
    if (!val || !uid) return;
    listenMonth(uid, val);
  });

  // New event listener for processing pasted Excel data
  document.getElementById('process-data-btn').addEventListener('click', async function() {
    const textarea = document.getElementById('excel-paste-area');
    const feedback = document.getElementById('process-feedback');
    const rawData = textarea.value.trim();

    if (!rawData) {
        feedback.textContent = "Please paste some data first.";
        return;
    }

    // Split into rows
    const rows = rawData.split('\n').filter(row => row.trim() !== '');
    let successCount = 0;
    let failCount = 0;

    for (let row of rows) {
        // Split by tab
        const cols = row.split('\t');
        // Ensure at least two columns: activityName and numberCompleted
        if (cols.length < 2) {
            failCount++;
            continue;
        }
        const activityName = cols[0].trim();
        const numberCompleted = parseInt(cols[1].replace(/,/g, '').trim(), 10);
        // If there are more columns, you can extract them here as needed

        if (!activityName || isNaN(numberCompleted)) {
            failCount++;
            continue;
        }

        // Prepare the object for Firebase
        const submission = {
            activityName,
            numberCompleted,
            difficulty: "not specified", // Default value
            timestamp: new Date(),
            uid: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null
        };

        try {
            await addDoc(collection(db, 'user-submissions'), submission);
            successCount++;
        } catch (err) {
            failCount++;
        }
    }

    textarea.value = '';
    feedback.textContent = `Activities logged successfully! (${successCount} succeeded, ${failCount} failed)`;
});
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = './index.html';
    return;
  }
  uid = user.uid;
  setMonthPickerToCurrent();

  // Load profile
  const snap = await getDoc(doc(db, 'users', uid));
  let userPosition = '';
  if (snap.exists()) {
    const u = snap.data();
    welcomeBadge.textContent = `Hello, ${u.name}`;
    profName.textContent = u.name || '-';
    profClient.textContent = u.client || '-';
    profPosition.textContent = u.position || '-';
    profRole.textContent = u.role || 'agent';
    userPosition = u.position || '';
  } else {
    welcomeBadge.textContent = `Hello`;
  }

  listenMetrics();              // attendance
  if (userPosition) listenPositionTargets(userPosition); // per-position targets
  listenToday(uid);
  listenMonth(uid, monthPicker.value);
});

initHandlers();