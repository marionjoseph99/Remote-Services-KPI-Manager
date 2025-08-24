// Replace the config below with your Firebase project's config values.
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, addDoc, getDocs, collection, onSnapshot,
  serverTimestamp, increment, runTransaction, query, orderBy, where
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

// Exports for app modules.
export {
  app, auth, db,
  // Auth
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  // Firestore
  doc, setDoc, getDoc, updateDoc, addDoc, getDocs, collection, onSnapshot,
  serverTimestamp, increment, runTransaction, query, orderBy, where
};
