// Firebase Configuration & Sync
const firebaseConfig = {
    apiKey: "AIzaSyDGpM10sHseMklVrypLFWZh_YuTrc-qCY0",
    authDomain: "korean-flashcards-7a078.firebaseapp.com",
    projectId: "korean-flashcards-7a078",
    storageBucket: "korean-flashcards-7a078.firebasestorage.app",
    messagingSenderId: "881377079698",
    appId: "1:881377079698:web:78ce4f162b1d8b6739114b"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const FirebaseSync = {
    currentUser: null,
    syncInProgress: false,

    // Initialize auth state listener
    init() {
        auth.onAuthStateChanged((user) => {
            this.currentUser = user;
            this.updateUI();
            if (user) {
                this.pullFromCloud();
            }
        });
    },

    // Google sign in
    async signIn() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithPopup(provider);
        } catch (error) {
            // Try redirect for mobile (popup blocked on iOS)
            if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
                const provider = new firebase.auth.GoogleAuthProvider();
                await auth.signInWithRedirect(provider);
            } else {
                console.error('Sign in error:', error);
                alert('Sign in failed: ' + error.message);
            }
        }
    },

    // Sign out
    async signOut() {
        try {
            await auth.signOut();
        } catch (error) {
            console.error('Sign out error:', error);
        }
    },

    // Update UI based on auth state
    updateUI() {
        const signedOut = document.getElementById('sync-signed-out');
        const signedIn = document.getElementById('sync-signed-in');
        const signoutSection = document.getElementById('signout-section');

        if (this.currentUser) {
            signedOut.classList.add('hidden');
            signedIn.classList.remove('hidden');
            signoutSection.classList.remove('hidden');

            // Update user info
            document.getElementById('sync-user-name').textContent = this.currentUser.displayName || 'User';
            document.getElementById('sync-user-email').textContent = this.currentUser.email || '';
            const avatar = document.getElementById('sync-user-avatar');
            if (this.currentUser.photoURL) {
                avatar.src = this.currentUser.photoURL;
                avatar.style.display = 'block';
            } else {
                avatar.style.display = 'none';
            }
        } else {
            signedOut.classList.remove('hidden');
            signedIn.classList.add('hidden');
            signoutSection.classList.add('hidden');
        }
    },

    // Push local data to Firestore
    async pushToCloud() {
        if (!this.currentUser || this.syncInProgress) return;
        this.syncInProgress = true;
        this.setStatus('Syncing...');

        try {
            const userRef = db.collection('users').doc(this.currentUser.uid);

            const cards = JSON.parse(localStorage.getItem('kf_cards') || '[]');
            const stats = JSON.parse(localStorage.getItem('kf_stats') || '{}');
            const settings = JSON.parse(localStorage.getItem('kf_settings') || '{}');

            await userRef.set({
                cards: JSON.stringify(cards),
                stats: JSON.stringify(stats),
                settings: JSON.stringify(settings),
                lastSync: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: Date.now()
            });

            this.setStatus('✓ Synced ' + new Date().toLocaleTimeString());
        } catch (error) {
            console.error('Push error:', error);
            this.setStatus('✗ Sync failed');
        } finally {
            this.syncInProgress = false;
        }
    },

    // Pull cloud data to local
    async pullFromCloud() {
        if (!this.currentUser || this.syncInProgress) return;
        this.syncInProgress = true;
        this.setStatus('Loading from cloud...');

        try {
            const userRef = db.collection('users').doc(this.currentUser.uid);
            const doc = await userRef.get();

            if (doc.exists) {
                const data = doc.data();
                const cloudUpdatedAt = data.updatedAt || 0;

                // Compare with local timestamp
                const localUpdatedAt = parseInt(localStorage.getItem('kf_updated_at') || '0');

                if (localUpdatedAt === 0 || cloudUpdatedAt > localUpdatedAt) {
                    // First sync or cloud is newer — pull
                    if (data.cards) localStorage.setItem('kf_cards', data.cards);
                    if (data.stats) localStorage.setItem('kf_stats', data.stats);
                    if (data.settings) localStorage.setItem('kf_settings', data.settings);
                    localStorage.setItem('kf_updated_at', String(cloudUpdatedAt));

                    this.setStatus('✓ Loaded from cloud');
                    // Reload app state
                    if (typeof reloadAppState === 'function') {
                        reloadAppState();
                    }
                } else {
                    // Local is newer — push
                    this.syncInProgress = false;
                    await this.pushToCloud();
                    return;
                }
            } else {
                // No cloud data — push local data up
                this.syncInProgress = false;
                await this.pushToCloud();
                return;
            }
        } catch (error) {
            console.error('Pull error:', error);
            this.setStatus('✗ Load failed: ' + error.message);
        } finally {
            this.syncInProgress = false;
        }
    },

    // Manual sync (push)
    async sync() {
        localStorage.setItem('kf_updated_at', String(Date.now()));
        await this.pushToCloud();
    },

    // Set status text
    setStatus(text) {
        const el = document.getElementById('sync-status');
        if (el) el.textContent = text;
    },

    // Call after any data change to auto-sync
    onDataChanged() {
        localStorage.setItem('kf_updated_at', String(Date.now()));
        // Debounce: sync after 3 seconds of no changes
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            if (this.currentUser) {
                this.pushToCloud();
            }
        }, 3000);
    },

    // Fetch global cards shared across all users
    async fetchGlobalCards() {
        try {
            const snapshot = await db.collection('globalCards').get();
            if (snapshot.empty) return [];
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Failed to fetch global cards:', error);
            return [];
        }
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    FirebaseSync.init();
});
