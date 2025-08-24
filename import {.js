import {
	auth, db, onAuthStateChanged, signOut,
	doc, getDoc, setDoc, updateDoc, collection, onSnapshot, serverTimestamp,
	query, where, getDocs
} from './firebase-config.js';

const $ = (q) => document.querySelector(q);

// Monthly Performance elements
const mpTaskPct = $('#mpTaskPct');
const mpTaskMeta = $('#mpTaskMeta');
// NOTE: fallbacks added below to update the value even if id differs
let mpAttendancePct = $('#mpAttendancePct');
const mpAttitudePct = $('#mpAttitudePct');
const mpOverallPct = $('#mpOverallPct');

// Replace old attendance input with two new inputs
let inpWorkDays = document.getElementById('inpWorkDays');
let inpWorkedDays = document.getElementById('inpWorkedDays');
let inpLateMinutes = document.getElementById('inpLateMinutes'); // NEW
const inpAttitudePoints = $('#inpAttitudePoints');

// Helper: robustly find the Attendance value element inside the card
function getAttendanceValueEl() {
  if (mpAttendancePct) return mpAttendancePct;
  const card = document.getElementById('attendanceCard')
    || document.getElementById('mpAttendancePct')?.closest('.card')
    || document.getElementById('mpAttendancePct')?.parentElement;
  if (!card) return null;
  // Try common big-number selectors used in cards
  const el = card.querySelector('#mpAttendancePct, .value, .big, strong, .stat-value, h2 .number, h2');
  if (el) mpAttendancePct = el;
  return mpAttendancePct;
}

// NEW: set grid columns responsively (3 columns on desktop)
function updateAttendanceGridColumns(grid) {
  const containerWidth = (grid.parentElement?.clientWidth || 0);
  // Force 3 columns if there is reasonable width (desktop-like), otherwise wrap
  if (window.matchMedia('(min-width: 900px)').matches || containerWidth >= 420) {
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
    grid.style.gap = '12px';
  } else {
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(140px, 1fr))';
    grid.style.gap = '12px';
  }
}

// Ensure a greeting badge exists under the sidebar brand (Agent dashboard)
function setSidebarGreeting(name) {
  const sidebar = document.querySelector('.sidebar');
  const brand = sidebar?.querySelector('.brand');
  let el = document.getElementById('agentGreeting');
  if (!el) {
    el = document.createElement('div');
    el.id = 'agentGreeting';
    el.className = 'badge';
  }
  el.textContent = `Hello, ${name || 'Agent'}`;

  if (sidebar && brand) {
    el.style.margin = '8px 0 0 0';
    el.style.marginLeft = '0';
    if (el.parentElement !== sidebar || el.previousElementSibling !== brand) {
      sidebar.insertBefore(el, brand.nextSibling);
    }
  } else {
    // Fallback: show in topbar if sidebar not present
    const host = document.querySelector('.topbar') || document.querySelector('.main') || document.body;
    el.style.marginLeft = 'auto';
    if (!host.contains(el)) host.appendChild(el);
  }
}

// Place greeting badge(s) under the brand in the left sidebar
function placeGreetingBadges() {
  const sidebar = document.querySelector('.sidebar');
  const brand = sidebar?.querySelector('.brand');
  if (!sidebar || !brand) return;
  const moveBadge = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.margin = '8px 0 0 0';
    el.style.marginLeft = '0';
    if (el.previousElementSibling !== brand) {
      sidebar.insertBefore(el, brand.nextSibling);
    }
  };
  moveBadge('adminGreeting');
  moveBadge('agentGreeting');
}

// NEW: Observe DOM until sidebar brand is available, then place the greeting
(function observeSidebarForGreeting() {
  const tryPlace = () => {
    placeGreetingBadges();
    const sidebar = document.querySelector('.sidebar');
    const brand = sidebar?.querySelector('.brand');
    return !!(sidebar && brand && (document.getElementById('agentGreeting') || document.getElementById('adminGreeting')));
  };
  if (tryPlace()) return;
  const mo = new MutationObserver(() => {
    if (tryPlace()) mo.disconnect();
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();

// Build/ensure Attendance inputs exist and hide legacy points input
function ensureAttendanceInputs() {
	const pctEl = getAttendanceValueEl(); // use robust finder
	const card = pctEl?.closest('.card') || document.getElementById('attendanceCard') || pctEl?.parentElement;
	if (!card) return;

	// Force helper text to reflect new computation
	const helper = card.querySelector('.muted, .meta, small');
	if (helper) helper.textContent = 'from days + late minutes';

	// Remove old "Points (0-100)" input if present
	const oldPts = document.getElementById('inpAttendancePoints');
	oldPts?.closest('.input')?.remove();

	// Ensure a grid container for our inputs (responsive 3-in-a-row)
	let grid = card.querySelector('#attendanceInputs');
	if (!grid) {
		grid = document.createElement('div');
		grid.id = 'attendanceInputs';
		grid.style.marginTop = '10px';
		card.appendChild(grid);
	}
	// Apply responsive columns now and on resize
	updateAttendanceGridColumns(grid);
	if (!grid.dataset.responsiveBound) {
		grid.dataset.responsiveBound = '1';
		window.addEventListener('resize', () => updateAttendanceGridColumns(grid));
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
			<input id="inpWorkedDays" type="number" min="0" step="1" placeholder="e.g., 20" />
		`;
		grid.appendChild(wrap2);
	}

	// Total late minutes (ensure it's inside the same grid)
	let lateWrap = document.getElementById('inpLateMinutes')?.closest('.input') || null;
	if (!lateWrap) {
		lateWrap = document.createElement('div');
		lateWrap.className = 'input';
		lateWrap.innerHTML = `
			<label for="inpLateMinutes">Total late minutes</label>
			<input id="inpLateMinutes" type="number" min="0" step="1" placeholder="e.g., 75" />
		`;
		grid.appendChild(lateWrap);
	} else if (lateWrap.parentElement !== grid) {
		// Move existing late minutes input into the grid container
		grid.appendChild(lateWrap);
	}

	// Rebind local refs and attach listeners
	inpWorkDays = document.getElementById('inpWorkDays');
	inpWorkedDays = document.getElementById('inpWorkedDays');
	inpLateMinutes = document.getElementById('inpLateMinutes');
	inpWorkDays?.addEventListener('input', computeAndRenderPerformance);
	inpWorkedDays?.addEventListener('input', computeAndRenderPerformance);
	inpLateMinutes?.addEventListener('input', computeAndRenderPerformance);

	// After building inputs, compute once to refresh card
	computeAndRenderPerformance();
}

// Clamp helper
function clampPct(n) {
	return Math.min(100, Math.max(0, n));
}

// Compute Attendance using your detailed formula and render
function computeAndRenderPerformance() {
	// Attendance metric with lateness
	const H_DAY_MINUTES = 480; // 8 hours × 60
	inpWorkDays = document.getElementById('inpWorkDays');
	inpWorkedDays = document.getElementById('inpWorkedDays');
	inpLateMinutes = document.getElementById('inpLateMinutes');

	const workingDays = Math.max(0, Math.floor(Number(inpWorkDays?.value || 0)));   // D_total
	const workedDays  = Math.max(0, Math.floor(Number(inpWorkedDays?.value || 0))); // D_worked
	const lateMinutes = Math.max(0, Math.floor(Number(inpLateMinutes?.value || 0))); // M_late

	let attendanceMetric = 0;
	let attendanceDaysScore = 0;
	let lateScore = 100;

	if (workingDays > 0) {
		if (workedDays === 0) {
			attendanceMetric = 0;
			attendanceDaysScore = 0;
			lateScore = 100;
		} else {
			attendanceDaysScore = clampPct((workedDays / workingDays) * 100);
			const denom = workedDays * H_DAY_MINUTES;
			lateScore = Math.max(0, 100 - (lateMinutes / denom) * 100);
			attendanceMetric = clampPct(attendanceDaysScore * 0.90 + lateScore * 0.10);
		}
	} else {
		attendanceMetric = 0;
	}

	// Render to value element (2 decimals so lateness is visible)
	const valEl = getAttendanceValueEl();
	if (valEl) {
		valEl.textContent = `${attendanceMetric.toFixed(2)}%`;
		valEl.title = `Days: ${attendanceDaysScore.toFixed(2)}% • Late: ${lateScore.toFixed(2)}%`;
	}
	// Also update helper text if still showing "from points"
	const helper = (valEl?.closest('.card') || document.getElementById('attendanceCard'))?.querySelector('.muted, .meta, small');
	if (helper) helper.textContent = 'from days + late minutes';
}

// KPI doc listen/save
function listenAgentKpi(uid, monthId) {
	const ref = doc(db, 'users', uid, 'kpi', monthId);
	unsubAgentKpi?.();
	unsubAgentKpi = onSnapshot(ref, (snap) => {
		const data = snap.exists() ? snap.data() : {};
		// Populate fields
		if (!inpWorkDays)   inpWorkDays   = document.getElementById('inpWorkDays');
		if (!inpWorkedDays) inpWorkedDays = document.getElementById('inpWorkedDays');
		if (!inpLateMinutes) inpLateMinutes = document.getElementById('inpLateMinutes');
		if (inpWorkDays && document.activeElement !== inpWorkDays)     inpWorkDays.value   = data.workingDays != null ? Number(data.workingDays) : '';
		if (inpWorkedDays && document.activeElement !== inpWorkedDays) inpWorkedDays.value = data.workedDays  != null ? Number(data.workedDays)  : '';
		if (inpLateMinutes && document.activeElement !== inpLateMinutes) inpLateMinutes.value = data.lateMinutes != null ? Number(data.lateMinutes) : '';
		if (inpAttitudePoints && document.activeElement !== inpAttitudePoints) {
			inpAttitudePoints.value = data.attitudePoints != null ? Number(data.attitudePoints) : '';
		}
		computeAndRenderPerformance();
	});
}

function initHandlers() {
	// Save KPI fields for selected agent/month
	btnSaveKpi?.addEventListener('click', async () => {
		if (!selectedAgent) return;
		const monthId = adminMonth.value;

		// Re-grab elements in case they were created dynamically
		inpWorkDays = document.getElementById('inpWorkDays');
		inpWorkedDays = document.getElementById('inpWorkedDays');
		inpLateMinutes = document.getElementById('inpLateMinutes');

		const workingDays = Math.max(0, Math.floor(Number(inpWorkDays?.value || 0)));
		const workedDays  = Math.max(0, Math.floor(Number(inpWorkedDays?.value || 0)));
		const lateMinutes = Math.max(0, Math.floor(Number(inpLateMinutes?.value || 0)));
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
				lateMinutes,
				attitudePoints,
				updatedAt: serverTimestamp(),
				updatedBy: auth.currentUser?.uid || null
			}, { merge: true });
			saveKpiStatus.textContent = 'Saved.';
			setTimeout(() => (saveKpiStatus.textContent = ''), 1200);
			computeAndRenderPerformance(); // reflect immediately
		} catch (e) {
			saveKpiStatus.textContent = e.message || 'Error saving.';
		} finally {
			btnSaveKpi.disabled = false;
		}
	});

	// Ensure Attendance inputs are present
	ensureAttendanceInputs();
	// ...existing code...
}

// Init: ensure inputs and first render even if other initializers didn’t run yet
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ensureAttendanceInputs();
    computeAndRenderPerformance();
    placeGreetingBadges();
    // Run again shortly after to catch badges created post-auth
    setTimeout(placeGreetingBadges, 800);
  });
} else {
  ensureAttendanceInputs();
  computeAndRenderPerformance();
  placeGreetingBadges();
  setTimeout(placeGreetingBadges, 800);
}

// Also set/create the greeting after auth resolves (Agent)
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap.data() || {};
    const name = data.name || user.displayName || 'Agent';
    setSidebarGreeting(name);       // create/update badge text
    placeGreetingBadges();          // ensure it sits under the brand
  } catch {
    setSidebarGreeting('Agent');
    placeGreetingBadges();
  }
});