import {
	auth, db,
	createUserWithEmailAndPassword,
	updateProfile,
	doc, setDoc, serverTimestamp
} from './firebase-config.js';

const $ = (q) => document.querySelector(q);

const registerForm = document.getElementById('registerForm');
const regName = document.getElementById('reg-name');
const regEmail = document.getElementById('reg-email');
const regPass = document.getElementById('reg-pass');
const regClient = document.getElementById('reg-client'); // dropdown: KG Stevens / McDermott
const regPosition = document.getElementById('reg-position'); // dropdown with positions
const regStatus = document.getElementById('reg-status'); // optional small status element

registerForm?.addEventListener('submit', async (e) => {
	e.preventDefault();
	const name = (regName?.value || '').trim();
	const email = (regEmail?.value || '').trim();
	const password = regPass?.value || '';
	const client = (regClient?.value || '').trim(); // "KG Stevens" | "McDermott"
	const position = (regPosition?.value || '').trim();

	if (!name || !email || !password || !client || !position) {
		if (regStatus) regStatus.textContent = 'Please complete all fields.';
		return;
	}

	try {
		if (regStatus) regStatus.textContent = 'Creating account...';
		const cred = await createUserWithEmailAndPassword(auth, email, password);
		if (name) {
			await updateProfile(cred.user, { displayName: name });
		}

		// Normalize client casing just in case
		const normalizedClient = client === 'mcdermott' ? 'McDermott' : client;

		// Persist user profile in Firestore
		await setDoc(doc(db, 'users', cred.user.uid), {
			name,
			email: cred.user.email,
			client: normalizedClient,
			position,
			role: 'agent',
			profile: {
				role: 'agent',
				client: normalizedClient,
				position,
				name
			},
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		}, { merge: true });

		if (regStatus) regStatus.textContent = 'Registration successful.';
		// ...existing post-register navigation...
		// window.location.href = './agent.html';
	} catch (err) {
		if (regStatus) regStatus.textContent = err.message || 'Registration failed.';
	}
});