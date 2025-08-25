// Replace the config below with your Firebase project's config values.
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged,
  // ALIAS raw SDK functions so we can wrap them with loader
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPassword,
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword,
  signOut as fbSignOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc,
  // CHANGED: alias write ops to wrap with loader
  setDoc as fbSetDoc, getDoc, updateDoc as fbUpdateDoc, addDoc as fbAddDoc, getDocs,
  collection, onSnapshot, serverTimestamp, increment, runTransaction as fbRunTransaction,
  query, orderBy, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCwpK4M--nZ10OI5azk_ugpvGplraQ9-Rc",
  authDomain: "remote-kpi-tracking-system.firebaseapp.com",
  projectId: "remote-kpi-tracking-system",
  storageBucket: "remote-kpi-tracking-system.firebasestorage.app",
  messagingSenderId: "254390515735",
  appId: "1:254390515735:web:52819e520ff6f7b71d4452"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// NEW: Global loader overlay (auto-injected)
function ensureLoaderOverlay() {
  if (typeof document === 'undefined') return;
  const install = () => {
    if (!document.getElementById('appLoaderStyles')) {
      const css = document.createElement('style');
      css.id = 'appLoaderStyles';
      css.textContent = `
        .app-loader{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(8,11,20,.55);backdrop-filter:blur(2px)}
        .app-loader.hidden{display:none}
        .app-loader .box{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:14px;background:#0f1426;color:#e5e7eb;box-shadow:0 12px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08)}
        .app-loader .spinner{width:22px;height:22px;border-radius:50%;border:3px solid rgba(255,255,255,.18);border-top-color:#a78bfa;animation:appSpin .9s linear infinite}
        .app-loader .label{font-weight:600;letter-spacing:.2px;font-size:14px}
        @keyframes appSpin{to{transform:rotate(360deg)}}
      `;
      document.head.appendChild(css);
    }
    if (!document.getElementById('appLoader')) {
      const overlay = document.createElement('div');
      overlay.id = 'appLoader';
      overlay.className = 'app-loader hidden';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.innerHTML = `
        <div class="box">
          <div class="spinner" aria-hidden="true"></div>
          <div class="label">Loading…</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}
function setLoaderLabel(text) {
  const el = document.getElementById('appLoader');
  if (!el) return;
  const label = el.querySelector('.label');
  if (label && text != null) label.textContent = String(text);
}
function showLoader(text = 'Loading…') {
  ensureLoaderOverlay();
  const el = document.getElementById('appLoader');
  if (!el) return;
  setLoaderLabel(text);
  el.classList.remove('hidden');
}
function hideLoader(delay = 150) {
  const el = document.getElementById('appLoader');
  if (!el) return;
  setTimeout(() => el.classList.add('hidden'), delay);
}
// Expose globally for easy use in pages without imports
if (typeof window !== 'undefined') {
  window.AppLoader = { show: showLoader, hide: hideLoader, label: setLoaderLabel };
}

// NEW: infer a friendly label for writes based on collection/path and payload
function inferWriteLabel(refOrCol, data) {
  try {
    const p = String(refOrCol?.path || '').toLowerCase();
    if (p === 'targets/positions') return 'Saving targets…';
    if (p === 'settings/metrics') {
      return data && typeof data === 'object' && data.weights ? 'Saving performance weights…' : 'Saving settings…';
    }
    if (p.includes('/kpi/')) return 'Saving KPI scores…';
    if (p.includes('/tasks/')) {
      if (p.endsWith('/entries') || p.includes('/entries/')) return 'Adding task…';
      return 'Saving task…';
    }
  } catch {}
  return 'Saving…';
}

// NEW: Wrapped Firestore writes to auto-show loader
async function setDoc(ref, data, options) {
  const label = inferWriteLabel(ref, data);
  showLoader(label);
  try {
    return await fbSetDoc(ref, data, options);
  } finally {
    hideLoader(250);
  }
}
async function updateDoc(ref, data, ...rest) {
  const label = inferWriteLabel(ref, data);
  showLoader(label);
  try {
    return await fbUpdateDoc(ref, data, ...rest);
  } finally {
    hideLoader(250);
  }
}
async function addDoc(colRef, data) {
  const label = inferWriteLabel(colRef, data);
  showLoader(label);
  try {
    return await fbAddDoc(colRef, data);
  } finally {
    hideLoader(250);
  }
}
async function runTransaction(dbInst, updateFunction, options) {
  showLoader('Applying changes…');
  try {
    return await fbRunTransaction(dbInst, updateFunction, options);
  } finally {
    hideLoader(250);
  }
}

// NEW: Wrapped auth helpers that auto-show the loader
async function signInWithEmailAndPassword(...args) {
  try {
    showLoader('Signing you in…');
    return await fbSignInWithEmailAndPassword(...args);
  } finally {
    hideLoader(250);
  }
}
async function createUserWithEmailAndPassword(...args) {
  try {
    showLoader('Creating your account…');
    return await fbCreateUserWithEmailAndPassword(...args);
  } finally {
    hideLoader(250);
  }
}
async function signOut(...args) {
  try {
    showLoader('Signing out…');
    return await fbSignOut(...args);
  } finally {
    hideLoader(250);
  }
}

// Exports for app modules.
export {
  app, auth, db,
  // Auth
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  // Firestore (wrapped writes + unmodified reads)
  doc, setDoc, getDoc, updateDoc, addDoc, getDocs, collection, onSnapshot,
  serverTimestamp, increment, runTransaction, query, orderBy, where,
  // Loader
  showLoader, hideLoader, setLoaderLabel
};
