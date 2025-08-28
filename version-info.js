const VERSION = "V2.0";

const notes = {
  agent: {
    "V2.0": [
      "• Improved admin and agent synchronization.",
      "• Improved database sync and reliability.",
      "• Submit tasks manually or via Excel.",
      "• View daily and monthly entries.",
      "• Improved performance and UI.",
      "• Personalized performance messages.",
      "• Bug fixes and enhancements.",
      "• Filter and view past version notes."
    ],
    "V1.9": [
      "• Added summary bar chart.",
      "• Improved sidebar navigation.",
      "• Minor bug fixes."
    ],
    "V1.5": [
      "• Initial agent dashboard release.",
      "• Manual task entry.",
      "• Basic KPI calculations."
    ],
    "V1.0": [
      "• Internal prototype."
    ]
  },
  admin: {
    "V2.0": [
      "• Manage agents and set targets.",
      "• View and monitor all agents' KPIs.",
      "• Download and export reports.",
      "• Adjust KPI weights and settings.",
      "• Enhanced admin controls and bug fixes.",
      "• Click outside the modal to close it.",
      "• Background is blurred when version notes are open.",
      "• Filter and view past version notes."
    ],
    "V1.9": [
      "• Added advanced settings panel.",
      "• Improved agent KPI detail view.",
      "• Minor bug fixes."
    ],
    "V1.5": [
      "• Initial admin dashboard release.",
      "• View agent KPIs.",
      "• Set monthly targets."
    ],
    "V1.0": [
      "• Internal prototype."
    ]
  }
};

const versionList = ["V2.0", "V1.9", "V1.8", "V1.7"];

function getPageType() {
  if (document.body.classList.contains('admin-page')) return 'admin';
  if (document.body.classList.contains('agent-page')) return 'agent';
  return 'agent';
}

function showVersionModal() {
  let modal = document.getElementById('versionModal');
  let blurOverlay = document.getElementById('versionBlurOverlay');
  // --- Fix: Always create modal if not present, and always show both on open ---
  if (!blurOverlay) {
    blurOverlay = document.createElement('div');
    blurOverlay.id = 'versionBlurOverlay';
    blurOverlay.style.position = 'fixed';
    blurOverlay.style.left = 0;
    blurOverlay.style.top = 0;
    blurOverlay.style.width = '100vw';
    blurOverlay.style.height = '100vh';
    blurOverlay.style.zIndex = 9998;
    blurOverlay.style.backdropFilter = 'blur(6px)';
    blurOverlay.style.background = 'rgba(0,0,0,0.18)';
    blurOverlay.style.pointerEvents = 'auto';
    document.body.appendChild(blurOverlay);
  }
  blurOverlay.style.display = 'block';

  // Remove any previous modal if present (to fix stuck state)
  let oldModal = document.getElementById('versionModal');
  if (oldModal) oldModal.remove();

  modal = document.createElement('div');
  modal.id = 'versionModal';
  modal.style.position = 'fixed';
  modal.style.left = 0;
  modal.style.top = 0;
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.background = 'rgba(0,0,0,0.45)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = 9999;
  modal.style.opacity = 0;
  modal.style.pointerEvents = 'none';
  modal.innerHTML = `
    <div id="versionModalContent" style="
      background: var(--card, #222);
      color: var(--text, #fff);
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      padding: 32px 28px 22px 28px;
      width: 400px;
      min-height: 320px;
      font-family: 'Lexend', system-ui, sans-serif;
      position: relative;
      display: flex;
      flex-direction: column;
      transition: transform 0.32s cubic-bezier(.4,0,.2,1), opacity 0.32s cubic-bezier(.4,0,.2,1);
      transform: scale(0.95) translateY(30px);
      opacity: 0;
    ">
      <div style="display:flex; gap:12px; margin-bottom:18px;">
        <button id="btnReportBug" style="
          background: #ef4444;
          color: #fff;
          border: none;
          border-radius: 7px;
          padding: 7px 18px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        ">Report A Bug</button>
        <button id="btnSuggestFeature" style="
          background: #6366f1;
          color: #fff;
          border: none;
          border-radius: 7px;
          padding: 7px 18px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        ">Suggest a Feature</button>
      </div>
      <div style="font-size: 18px; font-weight: 700; margin-bottom: 10px;">
        Version Details
      </div>
      <div id="versionBtnRow" style="
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      "></div>
      <div id="versionNotes" style="font-size: 15px; margin-bottom: 18px; white-space: pre-line; min-height: 120px;"></div>
      <div id="creditsCollapsible" style="margin-bottom: 0;">
        <button id="toggleCredits" style="
          background: none;
          border: none;
          color: var(--accent, #a78bfa);
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          padding: 0 0 0 0;
          margin-bottom: 0;
          margin-top: 0;
          display: flex;
          align-items: center;
        ">
          <span>Show Credits</span>
          <span id="creditsArrow" style="display:inline-block; margin-left:6px; transition:transform 0.2s;">▼</span>
        </button>
        <div id="versionCredits" style="
          border-top: 1px solid #444;
          margin-top: 10px;
          padding-top: 12px;
          font-size: 13px;
          color: #a3a3a3;
          text-align: left;
          line-height: 1.7;
          display: none;
          opacity: 0;
          max-height: 0;
          overflow: hidden;
          transition: opacity 0.32s cubic-bezier(.4,0,.2,1), max-height 0.32s cubic-bezier(.4,0,.2,1);
        ">
          <div style="font-weight:600; margin-bottom:2px;">Credits</div>
          <div>Designed &amp; built by <b>Marjo Paguia</b></div>
          <div>Tools: HTML5, CSS3, JavaScript (ES6+), Chart.js, Flatpickr</div>
          <div>Framework: Vanilla JS (no framework)</div>
          <div>Database: Firebase Firestore</div>
          <div>Deployment: Static Web (OneDrive/Cloud/Local)</div>
          <div>Created: 2024</div>
        </div>
      </div>
    </div>
    <style>
      #versionBtnRow::-webkit-scrollbar { display: none; }
      #versionBtnRow { scrollbar-width: none; -ms-overflow-style: none; }
      .ver-btn {
        background: #23263a;
        color: #fff;
        border: none;
        border-radius: 7px;
        padding: 5px 16px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        outline: none;
        white-space: nowrap;
      }
      .ver-btn.active, .ver-btn:focus {
        background: var(--accent, #a78bfa);
        color: #222;
      }
      #versionModal {
        transition: opacity 0.32s cubic-bezier(.4,0,.2,1);
      }
    </style>
  `;
  document.body.appendChild(modal);

  // Animate modal open
  setTimeout(() => {
    modal.style.pointerEvents = 'auto';
    modal.style.opacity = 1;
    const modalContent = document.getElementById('versionModalContent');
    if (modalContent) {
      modalContent.style.transform = 'scale(1) translateY(0)';
      modalContent.style.opacity = '1';
      modalContent.style.transition = 'transform 0.32s cubic-bezier(.4,0,.2,1), opacity 0.32s cubic-bezier(.4,0,.2,1)';
    }
  }, 10);

  // Optionally: add handlers for the new buttons (customize as needed)
  // If you want to show an image in a new tab, you must provide the path to an image file (e.g., PNG, JPG, etc.).
  // The code below will open the image in a new browser tab.
  document.getElementById('btnReportBug').onclick = () => {
    window.open('meme1.jpg', '_blank');
  };
  document.getElementById('btnSuggestFeature').onclick = () => {
    window.open('meme2.jpg', '_blank');
  };

  // Render version filter buttons and notes
  renderVersionBtns('V2.0');
  renderVersionNotes('V2.0');

  // Collapsible credits logic with animation
  const creditsBtn = document.getElementById('toggleCredits');
  const creditsDiv = document.getElementById('versionCredits');
  const creditsArrow = document.getElementById('creditsArrow');
  let creditsOpen = false;
  function setCredits(open) {
    creditsOpen = open;
    if (open) {
      creditsDiv.style.display = 'block';
      setTimeout(() => {
        creditsDiv.style.opacity = '1';
        creditsDiv.style.maxHeight = '400px';
      }, 10);
    } else {
      creditsDiv.style.opacity = '0';
      creditsDiv.style.maxHeight = '0';
      setTimeout(() => {
        if (!creditsOpen) creditsDiv.style.display = 'none';
      }, 320);
    }
    creditsBtn.querySelector('span').textContent = open ? 'Hide Credits' : 'Show Credits';
    creditsArrow.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
  }
  creditsBtn.onclick = () => setCredits(!creditsOpen);
  setCredits(false);

  // Remove close button (do not render it)
  // Close on click outside modal content
  modal.addEventListener('mousedown', function (e) {
    const content = document.getElementById('versionModalContent');
    if (e.target === modal) closeVersionModal();
  });

  function closeVersionModal() {
    // Animate close
    modal.style.opacity = 0;
    modal.style.pointerEvents = 'none';
    const modalContent = document.getElementById('versionModalContent');
    if (modalContent) {
      modalContent.style.transform = 'scale(0.95) translateY(30px)';
      modalContent.style.opacity = '0';
    }
    setTimeout(() => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      if (blurOverlay.parentNode) blurOverlay.parentNode.removeChild(blurOverlay);
    }, 320);
  }

  function renderVersionBtns(activeVersion) {
    const btnRow = document.getElementById('versionBtnRow');
    btnRow.innerHTML = '';
    versionList.forEach(ver => {
      const btn = document.createElement('button');
      btn.className = 'ver-btn' + (ver === activeVersion ? ' active' : '');
      btn.textContent = ver;
      btn.onclick = () => {
        renderVersionBtns(ver);
        renderVersionNotes(ver);
      };
      btnRow.appendChild(btn);
    });
  }

  function renderVersionNotes(version) {
    const type = getPageType();
    let html = `<div style="font-weight:600; margin-bottom:6px;">${version}</div>`;
    const notesArr = notes[type][version];
    if (notesArr && notesArr.length) {
      html += notesArr.map(line => `<div>${line}</div>`).join('');
    } else {
      html += `<div style="color:#aaa;">Past version notes not available in detail.</div>`;
    }
    document.getElementById('versionNotes').innerHTML = html;
    // Highlight active button
    Array.from(document.querySelectorAll('.ver-btn')).forEach(btn => {
      btn.classList.toggle('active', btn.textContent === version);
    });
  }
}

export function injectVersionButton() {
  // Only inject once
  if (document.getElementById('btn-version-info')) return;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Insert above the credits/footer if present, else after logout
  const btn = document.createElement('button');
  btn.id = 'btn-version-info';
  btn.className = 'btn secondary';
  btn.style.marginTop = '10px';
  btn.style.width = '100%';
  btn.textContent = 'Version Info';
  btn.onclick = showVersionModal;

  // Try to insert before credits/footer if present
  const creditsFooter = sidebar.querySelector('#creditsFooter');
  if (creditsFooter) {
    sidebar.insertBefore(btn, creditsFooter);
  } else {
    // Insert after logout button if present, else at end
    const logoutBtn = sidebar.querySelector('#btn-logout');
    if (logoutBtn && logoutBtn.nextSibling) {
      sidebar.insertBefore(btn, logoutBtn.nextSibling);
    } else {
      sidebar.appendChild(btn);
    }
  }
}
