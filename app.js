// Main Application Logic
(function() {
    'use strict';

    // ==================== Storage ====================
    const Storage = {
        KEY_CARDS: 'kf_cards',
        KEY_STATS: 'kf_stats',
        KEY_SETTINGS: 'kf_settings',

        save(key, data) {
            localStorage.setItem(key, JSON.stringify(data));
        },

        load(key) {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        },

        getCards() {
            return this.load(this.KEY_CARDS) || [];
        },

        saveCards(cards) {
            this.save(this.KEY_CARDS, cards);
            if (typeof FirebaseSync !== 'undefined') FirebaseSync.onDataChanged();
        },

        getStats() {
            return this.load(this.KEY_STATS) || {
                totalReviews: 0,
                streak: 0,
                lastStudyDate: null,
                dailyReviews: {},
                quizzesTaken: 0,
                quizCorrect: 0,
                quizWrong: 0,
                survivalHighScore: 0,
            };
        },

        saveStats(stats) {
            this.save(this.KEY_STATS, stats);
            if (typeof FirebaseSync !== 'undefined') FirebaseSync.onDataChanged();
        },

        getSettings() {
            return this.load(this.KEY_SETTINGS) || {
                sound: true,
                shuffle: false,
                flipSound: true,
                confetti: true,
                newCardsPerDay: 5,
            };
        },

        saveSettings(settings) {
            this.save(this.KEY_SETTINGS, settings);
        }
    };

    // ==================== App State ====================
    let state = {
        allCards: [],
        studyQueue: [],
        currentCardIndex: 0,
        isFlipped: false,
        sessionStats: { again: 0, hard: 0, good: 0, easy: 0 },
        currentDeck: null,
        returnToDeck: null,
        studyMode: 'normal', // 'normal', 'reverse', 'listening'
    };

    // ==================== Initialization ====================
    function init() {
        loadOrInitializeCards();
        updateHomeStats();
        bindEvents();
        showScreen('screen-home');
        fetchAndMergeGlobalCards();
    }

    async function fetchAndMergeGlobalCards() {
        if (typeof FirebaseSync === 'undefined') return;
        const globalCards = await FirebaseSync.fetchGlobalCards();
        if (globalCards.length === 0) return;

        let cards = Storage.getCards();
        let added = 0;

        for (const gc of globalCards) {
            // Skip if already exists (match by korean text)
            const exists = cards.some(c => c.korean.toLowerCase() === gc.korean.toLowerCase());
            if (exists) continue;

            cards.push({
                id: generateId(),
                deckId: gc.deckId || 'global',
                deckName: gc.deckName || 'Global',
                korean: gc.korean,
                english: gc.english,
                romanization: gc.romanization || '',
                example: gc.example || '',
                ...SRS.defaults,
            });
            added++;
        }

        if (added > 0) {
            Storage.save(Storage.KEY_CARDS, cards);
            state.allCards = cards;
            updateHomeStats();
        }
    }

    function loadOrInitializeCards() {
        let cards = Storage.getCards();

        if (cards.length === 0) {
            // First time — initialize from vocabulary data (don't trigger sync)
            cards = [];
            for (const deck of VOCABULARY_DATA.decks) {
                for (const cardData of deck.cards) {
                    cards.push({
                        id: generateId(),
                        deckId: deck.id,
                        deckName: deck.name,
                        korean: cardData.korean,
                        english: cardData.english,
                        romanization: cardData.romanization,
                        example: cardData.example,
                        ...SRS.defaults,
                    });
                }
            }
            // Save without triggering cloud sync
            Storage.save(Storage.KEY_CARDS, cards);
        }

        state.allCards = cards;
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    // ==================== Navigation ====================
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    // ==================== Home Screen ====================
    function updateHomeStats() {
        const cards = state.allCards;
        const settings = Storage.getSettings();
        const studyQueue = SRS.buildStudyQueue(cards, settings.newCardsPerDay);
        const learnedCards = cards.filter(c => c.repetitions >= 3);
        const stats = Storage.getStats();

        // Update streak
        updateStreak(stats);

        document.getElementById('due-count').textContent = studyQueue.length;
        document.getElementById('learned-count').textContent = learnedCards.length;
        document.getElementById('streak-count').textContent = stats.streak;
    }

    function updateStreak(stats) {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        if (!stats.lastStudyDate) {
            // Never studied — streak is 0
            stats.streak = 0;
        } else if (stats.lastStudyDate === today) {
            // Already studied today — streak is current, no change
        } else if (stats.lastStudyDate === yesterday) {
            // Last studied yesterday — streak still valid, waiting for today's session
        } else {
            // Missed more than 1 day — streak broken
            stats.streak = 0;
        }

        Storage.saveStats(stats);
    }

    // ==================== Study Session ====================
    function speakKorean(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ko-KR';
            utterance.rate = 0.8;
            window.speechSynthesis.speak(utterance);
        }
    }

    function showStudyMenu() {
        showScreen('screen-study-menu');
    }

    function startStudy(deckId) {
        let cards = state.allCards;
        const settings = Storage.getSettings();

        if (deckId) {
            cards = cards.filter(c => c.deckId === deckId);
            state.currentDeck = deckId;
        } else {
            state.currentDeck = null;
        }

        state.returnToDeck = null;
        state.studyQueue = SRS.buildStudyQueue(cards, settings.newCardsPerDay);
        
        if (settings.shuffle) {
            state.studyQueue = shuffleArray([...state.studyQueue]);
        }
        
        state.currentCardIndex = 0;
        state.sessionStats = { again: 0, hard: 0, good: 0, easy: 0 };

        if (state.studyQueue.length === 0) {
            alert('No cards to review! Come back later or try a different deck.');
            return;
        }

        showScreen('screen-study');
        showCurrentCard();
    }

    function showCurrentCard() {
        if (state.currentCardIndex >= state.studyQueue.length) {
            finishSession();
            return;
        }

        const card = state.studyQueue[state.currentCardIndex];
        const flashcard = document.getElementById('flashcard');

        // Reset card state
        flashcard.classList.remove('flipped', 'swipe-left', 'swipe-right');
        state.isFlipped = false;

        const audioBtn = document.getElementById('btn-play-audio');

        if (state.studyMode === 'reverse') {
            // English on front, Korean on back
            document.getElementById('card-front-text').textContent = card.english;
            document.getElementById('card-romanization').textContent = '';
            document.getElementById('card-back-text').textContent = card.korean;
            document.getElementById('card-example').textContent = card.romanization || '';
            audioBtn.classList.remove('hidden');
            speakKorean(card.korean);
        } else {
            // Normal: Korean on front, English on back
            document.getElementById('card-front-text').textContent = card.korean;
            document.getElementById('card-romanization').textContent = card.romanization;
            document.getElementById('card-back-text').textContent = card.english;
            document.getElementById('card-example').textContent = card.example;
            audioBtn.classList.remove('hidden');
            speakKorean(card.korean);
        }

        // Update favorite button
        const favBtn = document.getElementById('btn-study-fav');
        favBtn.textContent = card.favorite ? '★' : '☆';
        favBtn.classList.toggle('active', !!card.favorite);

        // Update remaining count
        const remaining = state.studyQueue.length - state.currentCardIndex;
        document.getElementById('cards-remaining').textContent = `${remaining} remaining`;

        // Hide rating buttons
        document.getElementById('rating-buttons').classList.add('hidden');
        document.getElementById('tap-hint').textContent = 'Tap card to flip';
    }

    function flipCard() {
        const flashcard = document.getElementById('flashcard');
        playFlipSound();

        if (!state.isFlipped) {
            flashcard.classList.add('flipped');
            state.isFlipped = true;
            document.getElementById('rating-buttons').classList.remove('hidden');
            document.getElementById('tap-hint').textContent = 'How well did you know it?';
        } else {
            flashcard.classList.remove('flipped');
            state.isFlipped = false;
            document.getElementById('rating-buttons').classList.add('hidden');
            document.getElementById('tap-hint').textContent = 'Tap card to flip';
        }
    }

    function rateCard(rating) {
        const card = state.studyQueue[state.currentCardIndex];

        // Update SRS data
        const updated = SRS.review(card, rating);
        Object.assign(card, updated);

        // Update in allCards
        const idx = state.allCards.findIndex(c => c.id === card.id);
        if (idx !== -1) {
            Object.assign(state.allCards[idx], updated);
        }

        // Track session stats
        const ratingNames = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
        state.sessionStats[ratingNames[rating]]++;

        // If "Again", add card back to end of queue
        if (rating === SRS.AGAIN) {
            state.studyQueue.push(card);
        }

        // Save cards and update streak immediately
        Storage.saveCards(state.allCards);
        updateDailyStreak();

        // Animate and show next card
        const flashcard = document.getElementById('flashcard');
        const direction = rating >= 3 ? 'swipe-right' : 'swipe-left';
        flashcard.classList.add(direction);

        setTimeout(() => {
            state.currentCardIndex++;
            showCurrentCard();
        }, 300);
    }

    function updateDailyStreak() {
        const stats = Storage.getStats();
        const today = new Date().toISOString().split('T')[0];

        // Track study dates for calendar
        if (!stats.studyDates) stats.studyDates = [];
        if (!stats.studyDates.includes(today)) {
            stats.studyDates.push(today);
        }

        if (stats.lastStudyDate === today) {
            Storage.saveStats(stats);
            return;
        }

        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (stats.lastStudyDate === yesterday || !stats.lastStudyDate) {
            stats.streak = (stats.streak || 0) + 1;
        } else {
            stats.streak = 1;
        }
        stats.lastStudyDate = today;
        if (stats.streak > (stats.bestStreak || 0)) {
            stats.bestStreak = stats.streak;
        }
        Storage.saveStats(stats);
    }

    function finishSession() {
        // Update stats
        const stats = Storage.getStats();
        const today = new Date().toISOString().split('T')[0];

        const totalReviewed = state.sessionStats.again + state.sessionStats.hard +
                              state.sessionStats.good + state.sessionStats.easy;

        stats.totalReviews += totalReviewed;

        if (!stats.dailyReviews[today]) {
            stats.dailyReviews[today] = 0;
        }
        stats.dailyReviews[today] += totalReviewed;

        Storage.saveStats(stats);

        // Show results
        document.getElementById('session-results').innerHTML = `
            <div class="result-item">
                <span class="number" style="color: var(--easy)">${state.sessionStats.easy}</span>
                <span class="label">Easy</span>
            </div>
            <div class="result-item">
                <span class="number" style="color: var(--good)">${state.sessionStats.good}</span>
                <span class="label">Good</span>
            </div>
            <div class="result-item">
                <span class="number" style="color: var(--hard)">${state.sessionStats.hard}</span>
                <span class="label">Hard</span>
            </div>
            <div class="result-item">
                <span class="number" style="color: var(--again)">${state.sessionStats.again}</span>
                <span class="label">Again</span>
            </div>
        `;

        showScreen('screen-complete');
    }

    // ==================== Decks Screen ====================
    function getDecks() {
        const builtInDecks = VOCABULARY_DATA.decks;
        const allDeckIds = [...new Set(state.allCards.map(c => c.deckId))];
        return allDeckIds.map(id => {
            const builtIn = builtInDecks.find(d => d.id === id);
            return {
                id: id,
                name: builtIn ? builtIn.name : (state.allCards.find(c => c.deckId === id)?.deckName || 'My Cards'),
            };
        });
    }

    function showDecks() {
        const deckList = document.getElementById('deck-list');

        // Reset search
        document.getElementById('global-search-input').value = '';
        document.getElementById('global-search-results').style.display = 'none';
        deckList.style.display = '';

        const decks = getDecks();
        const settings = Storage.getSettings();
        const favCards = state.allCards.filter(c => c.favorite);

        // Build deck list HTML
        let deckHTML = '';

        // Add Favorites deck at top if there are favorites
        if (favCards.length > 0) {
            deckHTML += `
                <div class="deck-item deck-item-fav" data-deck-id="__favorites__">
                    <div>
                        <div class="deck-name">⭐ Favorites</div>
                        <div class="deck-count">${favCards.length} cards</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="deck-due" style="background: var(--accent)">★</div>
                    </div>
                </div>
            `;
        }

        deckHTML += decks.map(deck => {
            const deckCards = state.allCards.filter(c => c.deckId === deck.id);
            const dueCount = SRS.buildStudyQueue(deckCards, settings.newCardsPerDay).length;

            return `
                <div class="deck-item" data-deck-id="${deck.id}">
                    <div>
                        <div class="deck-name">${deck.name}</div>
                        <div class="deck-count">${deckCards.length} cards</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="btn-delete-deck" data-delete-deck="${deck.id}" title="Delete deck">🗑</button>
                        ${dueCount > 0 ? `<div class="deck-due">${dueCount} due</div>` : '<div class="deck-due" style="background: var(--success)">✓</div>'}
                    </div>
                </div>
            `;
        }).join('');

        deckList.innerHTML = deckHTML;

        // Bind deck click events (show cards)
        deckList.querySelectorAll('.deck-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-deck')) return;
                const deckId = item.dataset.deckId;
                if (deckId === '__favorites__') {
                    showFavorites();
                } else {
                    showManageCards(deckId);
                }
            });
        });

        // Bind delete deck buttons
        deckList.querySelectorAll('.btn-delete-deck').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteDeck(btn.dataset.deleteDeck);
            });
        });

        showScreen('screen-decks');
    }

    function globalSearch(query) {
        const resultsContainer = document.getElementById('global-search-results');
        const deckList = document.getElementById('deck-list');

        if (!query || !query.trim()) {
            resultsContainer.style.display = 'none';
            deckList.style.display = '';
            return;
        }

        const q = query.trim().toLowerCase();
        const matches = state.allCards.filter(c =>
            c.korean.toLowerCase().includes(q) ||
            c.english.toLowerCase().includes(q) ||
            (c.romanization && c.romanization.toLowerCase().includes(q))
        );

        deckList.style.display = 'none';
        resultsContainer.style.display = 'flex';

        if (matches.length === 0) {
            resultsContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin-top: 40px;">No cards found</p>';
            return;
        }

        resultsContainer.innerHTML = matches.map(card => {
            const status = getCardStatus(card);
            return `
            <div class="card-list-item" data-card-id="${card.id}">
                <div class="card-list-info">
                    <div class="card-list-korean">${card.korean}</div>
                    <div class="card-list-english">${card.english}</div>
                    <div class="card-list-meta">
                        <span class="card-status ${status.class}">${status.label}</span>
                    </div>
                </div>
                <div class="card-list-actions">
                    <button class="btn-edit" data-edit-id="${card.id}">Edit</button>
                </div>
            </div>
        `;
        }).join('');

        // Bind edit buttons in search results
        resultsContainer.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                showEditCard(btn.dataset.editId);
            });
        });
    }

    function deleteDeck(deckId) {
        const deckCards = state.allCards.filter(c => c.deckId === deckId);
        if (!confirm(`Delete this deck and all ${deckCards.length} cards in it?`)) return;

        state.allCards = state.allCards.filter(c => c.deckId !== deckId);
        Storage.saveCards(state.allCards);
        showDecks();
    }

    // ==================== Manage Cards Screen ====================
    let currentManageDeck = null;

    function showManageCards(deckId) {
        currentManageDeck = deckId;
        const deckCards = state.allCards.filter(c => c.deckId === deckId);
        const deckName = deckCards[0]?.deckName || 'Cards';

        document.getElementById('manage-title').textContent = deckName;
        document.getElementById('card-search-input').value = '';

        renderCardList(deckId);
        showScreen('screen-manage');
    }

    function showFavorites() {
        currentManageDeck = '__favorites__';
        document.getElementById('manage-title').textContent = '⭐ Favorites';
        document.getElementById('card-search-input').value = '';
        renderFavoritesList();
        showScreen('screen-manage');
    }

    function renderFavoritesList(searchQuery) {
        let favCards = state.allCards.filter(c => c.favorite);
        const cardList = document.getElementById('card-list');

        if (searchQuery && searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            favCards = favCards.filter(c =>
                c.korean.toLowerCase().includes(q) ||
                c.english.toLowerCase().includes(q) ||
                (c.romanization && c.romanization.toLowerCase().includes(q))
            );
        }

        if (favCards.length === 0) {
            cardList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin-top: 40px;">No favorite cards</p>';
            return;
        }

        cardList.innerHTML = favCards.map(card => {
            const status = getCardStatus(card);
            return `
            <div class="card-list-item" data-card-id="${card.id}">
                <div class="card-list-info card-list-tap" data-study-id="${card.id}">
                    <div class="card-list-korean">${card.korean}</div>
                    <div class="card-list-english">${card.english}</div>
                    <div class="card-list-meta">
                        <span class="card-status ${status.class}">${status.label}</span>
                        <span class="card-reps">×${card.repetitions || 0}</span>
                    </div>
                </div>
                <div class="card-list-actions">
                    <button class="btn-fav active" data-fav-id="${card.id}">★</button>
                    <button class="btn-edit" data-edit-id="${card.id}">Edit</button>
                </div>
            </div>
        `;
        }).join('');

        // Bind favorite buttons (unfavorite)
        cardList.querySelectorAll('.btn-fav').forEach(btn => {
            btn.addEventListener('click', () => {
                toggleFavorite(btn.dataset.favId);
                renderFavoritesList(document.getElementById('card-search-input').value);
            });
        });

        // Bind card tap to study favorites
        cardList.querySelectorAll('.card-list-tap').forEach(el => {
            el.addEventListener('click', () => {
                const favCards = state.allCards.filter(c => c.favorite);
                if (favCards.length === 0) return;
                state.studyQueue = favCards;
                state.currentCardIndex = 0;
                state.sessionStats = { again: 0, hard: 0, good: 0, easy: 0 };
                state.studyMode = 'normal';
                state.returnToDeck = '__favorites__';
                showScreen('screen-study');
                showCurrentCard();
            });
        });

        // Bind edit buttons
        cardList.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                showEditCard(btn.dataset.editId);
            });
        });
    }

    function renderCardList(deckId, searchQuery) {
        let deckCards = state.allCards.filter(c => c.deckId === deckId);
        const cardList = document.getElementById('card-list');

        // Filter by search query
        if (searchQuery && searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            deckCards = deckCards.filter(c =>
                c.korean.toLowerCase().includes(q) ||
                c.english.toLowerCase().includes(q) ||
                (c.romanization && c.romanization.toLowerCase().includes(q))
            );
        }

        if (deckCards.length === 0) {
            cardList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin-top: 40px;">No cards found</p>';
            return;
        }

        cardList.innerHTML = deckCards.map(card => {
            const status = getCardStatus(card);
            const isFav = card.favorite ? 'active' : '';
            return `
            <div class="card-list-item" data-card-id="${card.id}">
                <div class="card-list-info card-list-tap" data-study-id="${card.id}">
                    <div class="card-list-korean">${card.korean}</div>
                    <div class="card-list-english">${card.english}</div>
                    <div class="card-list-meta">
                        <span class="card-status ${status.class}">${status.label}</span>
                        <span class="card-reps">×${card.repetitions || 0}</span>
                    </div>
                </div>
                <div class="card-list-actions">
                    <button class="btn-fav ${isFav}" data-fav-id="${card.id}">★</button>
                    <button class="btn-edit" data-edit-id="${card.id}">Edit</button>
                    <button class="btn-delete" data-delete-id="${card.id}">Delete</button>
                </div>
            </div>
        `;
        }).join('');

        // Bind favorite buttons
        cardList.querySelectorAll('.btn-fav').forEach(btn => {
            btn.addEventListener('click', () => {
                toggleFavorite(btn.dataset.favId);
                renderCardList(deckId, document.getElementById('card-search-input').value);
            });
        });

        // Bind card tap to study deck
        cardList.querySelectorAll('.card-list-tap').forEach(el => {
            el.addEventListener('click', () => {
                studyFromDeck(deckId);
            });
        });

        // Bind delete buttons
        cardList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                deleteCard(btn.dataset.deleteId, deckId);
            });
        });

        // Bind edit buttons
        cardList.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                showEditCard(btn.dataset.editId);
            });
        });
    }

    function studyFromDeck(deckId) {
        const deckCards = state.allCards.filter(c => c.deckId === deckId);

        if (deckCards.length === 0) {
            alert('No cards in this deck!');
            return;
        }

        state.currentDeck = deckId;
        state.returnToDeck = deckId;
        state.studyQueue = deckCards;
        state.currentCardIndex = 0;
        state.sessionStats = { again: 0, hard: 0, good: 0, easy: 0 };
        state.studyMode = 'normal';
        showScreen('screen-study');
        showCurrentCard();
    }

    function getCardStatus(card) {
        if (card.repetitions >= 3) {
            return { label: 'Learned', class: 'status-learned' };
        } else if (card.repetitions > 0 || card.lastReview) {
            if (card.easeFactor < 2.0) {
                return { label: 'Hard', class: 'status-hard' };
            }
            return { label: 'Learning', class: 'status-learning' };
        }
        return { label: 'New', class: 'status-new' };
    }

    function showEditCard(cardId) {
        const card = state.allCards.find(c => c.id === cardId);
        if (!card) return;

        document.getElementById('edit-card-id').value = card.id;

        // Populate deck dropdown
        const deckSelect = document.getElementById('edit-card-deck');
        const decks = getDecks();
        deckSelect.innerHTML = decks.map(d =>
            `<option value="${d.id}" ${d.id === card.deckId ? 'selected' : ''}>${d.name}</option>`
        ).join('');

        document.getElementById('edit-korean').value = card.korean;
        document.getElementById('edit-english').value = card.english;
        document.getElementById('edit-romanization').value = card.romanization || '';
        document.getElementById('edit-example').value = card.example || '';

        showScreen('screen-edit');
    }

    function saveEditCard(e) {
        e.preventDefault();

        const cardId = document.getElementById('edit-card-id').value;
        const card = state.allCards.find(c => c.id === cardId);
        if (!card) return;

        const korean = document.getElementById('edit-korean').value.trim();
        const english = document.getElementById('edit-english').value.trim();

        if (!korean || !english) {
            alert('Korean and English fields are required!');
            return;
        }

        card.korean = korean;
        card.english = english;
        card.romanization = document.getElementById('edit-romanization').value.trim();
        card.example = document.getElementById('edit-example').value.trim();

        const deckSelect = document.getElementById('edit-card-deck');
        card.deckId = deckSelect.value;
        card.deckName = deckSelect.options[deckSelect.selectedIndex].text;

        Storage.saveCards(state.allCards);
        showManageCards(card.deckId);
    }

    function deleteCard(cardId, deckId) {
        if (!confirm('Delete this card?')) return;

        state.allCards = state.allCards.filter(c => c.id !== cardId);
        Storage.saveCards(state.allCards);
        renderCardList(deckId);
    }

    // ==================== Quiz Mode ====================
    let quiz = {
        mode: null,        // 'mcq' or 'type'
        questions: [],
        currentIndex: 0,
        score: 0,
        total: 10,
        answered: false,
        mistakes: [],      // cards answered incorrectly
    };

    function showQuizMenu() {
        const stats = Storage.getStats();
        const highScoreEl = document.getElementById('high-score-display');
        if (stats.survivalHighScore > 0) {
            highScoreEl.innerHTML = `🔥 Survival High Score: <span class="score-value">${stats.survivalHighScore}</span>`;
        } else {
            highScoreEl.innerHTML = `🔥 Survival High Score: <span class="score-value">—</span>`;
        }
        showScreen('screen-quiz-menu');
    }

    function startQuiz(mode) {
        quiz.mode = mode;
        quiz.currentIndex = 0;
        quiz.score = 0;
        quiz.answered = false;
        quiz.mistakes = [];

        // Pick random cards for the quiz (need at least 4 for MCQ)
        const available = state.allCards.filter(c => c.korean && c.english);
        if (available.length < 4) {
            alert('Need at least 4 cards to start a quiz!');
            return;
        }

        if (mode === 'survival') {
            // Survival: use ALL cards shuffled, stop on first mistake
            quiz.total = available.length;
            quiz.questions = shuffleArray([...available]);
        } else {
            quiz.total = Math.min(10, available.length);
            quiz.questions = shuffleArray([...available]).slice(0, quiz.total);
        }

        showScreen('screen-quiz');
        showQuizQuestion();
    }

    function showQuizQuestion() {
        if (quiz.currentIndex >= quiz.questions.length) {
            showQuizResults();
            return;
        }

        const card = quiz.questions[quiz.currentIndex];
        quiz.answered = false;

        // Update progress
        if (quiz.mode === 'survival') {
            const stats = Storage.getStats();
            const highScore = stats.survivalHighScore || 0;
            document.getElementById('quiz-progress').textContent = `🔥 ${quiz.score}`;
            document.getElementById('quiz-score').textContent = `Best: ${highScore}`;
        } else {
            document.getElementById('quiz-progress').textContent =
                `${quiz.currentIndex + 1} / ${quiz.total}`;
            document.getElementById('quiz-score').textContent = `${quiz.score} ✓`;
        }

        // Hide feedback and next
        document.getElementById('quiz-feedback').classList.add('hidden');
        document.getElementById('quiz-next-btn').classList.add('hidden');

        if (quiz.mode === 'mcq') {
            showMCQ(card);
        } else if (quiz.mode === 'type') {
            showTypeQuestion(card);
        } else if (quiz.mode === 'listening') {
            showListeningQuestion(card);
        } else if (quiz.mode === 'survival') {
            // Survival: randomly pick from selected types
            const types = quiz.survivalTypes || ['mcq', 'type', 'listening'];
            const chosen = types[Math.floor(Math.random() * types.length)];
            if (chosen === 'mcq') {
                showMCQ(card);
            } else if (chosen === 'type') {
                showTypeQuestion(card);
            } else {
                showListeningQuestion(card);
            }
        }
    }

    function showMCQ(card) {
        document.getElementById('quiz-play-audio').classList.add('hidden');
        document.getElementById('quiz-mcq-options').classList.remove('hidden');
        document.getElementById('quiz-type-input').classList.add('hidden');

        // Randomly pick direction: show Korean → pick English, or show English → pick Korean
        const showKorean = Math.random() < 0.5;

        if (showKorean) {
            // Show Korean, pick English
            document.getElementById('quiz-prompt').textContent = card.korean;
            const wrongCards = state.allCards.filter(c => c.id !== card.id && c.english);
            const wrongOptions = shuffleArray([...wrongCards]).slice(0, 3).map(c => c.english);
            const options = shuffleArray([card.english, ...wrongOptions]);
            const correctAnswer = card.english;

            const optionsContainer = document.getElementById('quiz-mcq-options');
            optionsContainer.innerHTML = options.map(opt => `
                <button class="quiz-mcq-btn" data-answer="${opt}">${opt}</button>
            `).join('');

            optionsContainer.querySelectorAll('.quiz-mcq-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (quiz.answered) return;
                    handleMCQAnswer(btn, correctAnswer);
                });
            });
        } else {
            // Show English, pick Korean
            document.getElementById('quiz-prompt').textContent = card.english;
            const wrongCards = state.allCards.filter(c => c.id !== card.id && c.korean);
            const wrongOptions = shuffleArray([...wrongCards]).slice(0, 3).map(c => c.korean);
            const options = shuffleArray([card.korean, ...wrongOptions]);
            const correctAnswer = card.korean;

            const optionsContainer = document.getElementById('quiz-mcq-options');
            optionsContainer.innerHTML = options.map(opt => `
                <button class="quiz-mcq-btn" data-answer="${opt}">${opt}</button>
            `).join('');

            optionsContainer.querySelectorAll('.quiz-mcq-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (quiz.answered) return;
                    handleMCQAnswer(btn, correctAnswer);
                });
            });
        }
    }

    function showListeningQuestion(card) {
        // Hide text prompt, show audio button, show MCQ options
        document.getElementById('quiz-prompt').textContent = '🎧 Listen and choose';
        document.getElementById('quiz-play-audio').classList.remove('hidden');
        document.getElementById('quiz-mcq-options').classList.remove('hidden');
        document.getElementById('quiz-type-input').classList.add('hidden');

        // Play the word
        speakKorean(card.korean);

        // Randomly pick: English options or Korean options
        const showKoreanOptions = Math.random() < 0.5;

        let options, correctAnswer;
        if (showKoreanOptions) {
            // Hear audio → pick the matching Korean text
            const wrongCards = state.allCards.filter(c => c.id !== card.id && c.korean);
            const wrongOptions = shuffleArray([...wrongCards]).slice(0, 3).map(c => c.korean);
            options = shuffleArray([card.korean, ...wrongOptions]);
            correctAnswer = card.korean;
        } else {
            // Hear audio → pick the English meaning
            const wrongCards = state.allCards.filter(c => c.id !== card.id && c.english);
            const wrongOptions = shuffleArray([...wrongCards]).slice(0, 3).map(c => c.english);
            options = shuffleArray([card.english, ...wrongOptions]);
            correctAnswer = card.english;
        }

        const optionsContainer = document.getElementById('quiz-mcq-options');
        optionsContainer.innerHTML = options.map(opt => `
            <button class="quiz-mcq-btn" data-answer="${opt}">${opt}</button>
        `).join('');

        // Bind option clicks
        optionsContainer.querySelectorAll('.quiz-mcq-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (quiz.answered) return;
                handleMCQAnswer(btn, correctAnswer);
            });
        });
    }

    function handleMCQAnswer(btn, correctAnswer) {
        quiz.answered = true;
        const selected = btn.dataset.answer;
        const isCorrect = selected === correctAnswer;
        const card = quiz.questions[quiz.currentIndex];

        // Track mistakes
        if (!isCorrect) quiz.mistakes.push(card);

        // Update SRS based on quiz result
        applyQuizResultToSRS(card, isCorrect);

        // For listening quiz, show the Korean answer in feedback
        const isListening = quiz.mode === 'listening' ||
            (quiz.mode === 'survival' && document.getElementById('quiz-play-audio') && !document.getElementById('quiz-play-audio').classList.contains('hidden'));
        const koreanHint = isListening ? `\n${card.korean} (${card.english})` : '';

        if (isCorrect) {
            quiz.score++;
            btn.classList.add('correct');
            showFeedback(true, isListening ? `${card.korean} — ${card.english}` : '');
        } else {
            btn.classList.add('wrong');
            // Highlight the correct one
            document.querySelectorAll('.quiz-mcq-btn').forEach(b => {
                if (b.dataset.answer === correctAnswer) {
                    b.classList.add('correct');
                }
                b.classList.add('disabled');
            });
            showFeedback(false, isListening ? `${card.korean} — ${card.english}` : `Correct: ${correctAnswer}`);
        }

        document.getElementById('quiz-score').textContent = `${quiz.score} ✓`;

        // Survival mode: end on wrong answer
        if (quiz.mode === 'survival' && !isCorrect) {
            document.getElementById('quiz-next-btn').textContent = 'See Results';
            document.getElementById('quiz-next-btn').classList.remove('hidden');
        } else {
            document.getElementById('quiz-next-btn').textContent = 'Next →';
            document.getElementById('quiz-next-btn').classList.remove('hidden');
        }
    }

    function showTypeQuestion(card) {
        // Show English, user types Korean
        document.getElementById('quiz-prompt').textContent = card.english;
        document.getElementById('quiz-play-audio').classList.add('hidden');
        document.getElementById('quiz-type-input').classList.remove('hidden');
        document.getElementById('quiz-mcq-options').classList.add('hidden');

        const input = document.getElementById('quiz-answer-input');
        input.value = '';
        input.classList.remove('correct', 'wrong');
        input.disabled = false;
        input.focus();

        // Store correct answer on the input for reference
        input.dataset.correct = card.korean;
    }

    function handleTypeAnswer() {
        if (quiz.answered) return;
        quiz.answered = true;

        const input = document.getElementById('quiz-answer-input');
        const userAnswer = input.value.trim();
        const correct = input.dataset.correct;
        const card = quiz.questions[quiz.currentIndex];

        // Normalize: remove spaces for comparison
        const normalize = (s) => s.replace(/\s+/g, '').toLowerCase();
        const isCorrect = normalize(userAnswer) === normalize(correct);

        // Track mistakes
        if (!isCorrect) quiz.mistakes.push(card);

        // Update SRS based on quiz result
        applyQuizResultToSRS(card, isCorrect);

        input.disabled = true;

        if (isCorrect) {
            quiz.score++;
            input.classList.add('correct');
            showFeedback(true, '');
        } else {
            input.classList.add('wrong');
            showFeedback(false, `Correct: ${correct}`);
        }

        document.getElementById('quiz-score').textContent = `${quiz.score} ✓`;

        // Survival mode: end on wrong answer
        if (quiz.mode === 'survival' && !isCorrect) {
            document.getElementById('quiz-next-btn').textContent = 'See Results';
            document.getElementById('quiz-next-btn').classList.remove('hidden');
        } else {
            document.getElementById('quiz-next-btn').textContent = 'Next →';
            document.getElementById('quiz-next-btn').classList.remove('hidden');
        }
    }

    function applyQuizResultToSRS(card, isCorrect) {
        // Wrong = "Again" (card resets, shows up sooner)
        // Right = "Good" (card progresses normally)
        const rating = isCorrect ? SRS.GOOD : SRS.AGAIN;
        const updated = SRS.review(card, rating);

        // Update in allCards
        const idx = state.allCards.findIndex(c => c.id === card.id);
        if (idx !== -1) {
            Object.assign(state.allCards[idx], updated);
        }
        Object.assign(card, updated);
        Storage.saveCards(state.allCards);
    }

    function playFeedbackSound(correct) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const gain = ctx.createGain();
            gain.connect(ctx.destination);
            gain.gain.value = 0.2;

            if (correct) {
                // Duolingo-style "ding ding" - two ascending notes
                const osc1 = ctx.createOscillator();
                osc1.type = 'sine';
                osc1.frequency.value = 587; // D5
                osc1.connect(gain);
                osc1.start(ctx.currentTime);
                osc1.stop(ctx.currentTime + 0.1);

                const osc2 = ctx.createOscillator();
                osc2.type = 'sine';
                osc2.frequency.value = 784; // G5
                osc2.connect(gain);
                osc2.start(ctx.currentTime + 0.12);
                osc2.stop(ctx.currentTime + 0.2);
            } else {
                // Duolingo-style soft "bonk" - short descending thud
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(300, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.25, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
                osc.connect(gain);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
            }
        } catch (e) {}
    }

    function showFeedback(correct, message) {
        const el = document.getElementById('quiz-feedback');
        el.classList.remove('hidden', 'correct', 'wrong');
        el.classList.add(correct ? 'correct' : 'wrong');
        el.textContent = correct ? '✓ Correct!' : `✗ Wrong. ${message}`;

        const settings = Storage.getSettings();
        // Sound feedback
        if (settings.sound) {
            playFeedbackSound(correct);
        }
    }

    function nextQuizQuestion() {
        // In survival mode, if last answer was wrong, go to results
        if (quiz.mode === 'survival') {
            const lastCard = quiz.questions[quiz.currentIndex];
            // Check if we just got it wrong (score didn't increase means wrong)
            // Actually check: if currentIndex+1 > score means we got this one wrong
            if (quiz.currentIndex + 1 > quiz.score) {
                showQuizResults();
                return;
            }
        }
        quiz.currentIndex++;
        showQuizQuestion();
    }

    function showQuizResults() {
        const stats = Storage.getStats();

        if (quiz.mode === 'survival') {
            // Survival mode results
            const isNewHighScore = quiz.score > (stats.survivalHighScore || 0);
            if (isNewHighScore) {
                stats.survivalHighScore = quiz.score;
            }
            stats.quizzesTaken = (stats.quizzesTaken || 0) + 1;
            stats.quizCorrect = (stats.quizCorrect || 0) + quiz.score;
            stats.quizWrong = (stats.quizWrong || 0) + 1;
            Storage.saveStats(stats);
            updateDailyStreak();

            let title = '🔥 Game Over!';
            if (isNewHighScore && quiz.score > 0) title = '🏆 New High Score!';
            else if (quiz.score >= 20) title = '🌟 Amazing Run!';
            else if (quiz.score >= 10) title = '💪 Great Run!';

            document.getElementById('quiz-results-title').textContent = title;
            document.getElementById('quiz-results-score').textContent = quiz.score;
            document.getElementById('quiz-results-detail').innerHTML = `
                <div class="result-item">
                    <span class="number" style="color: var(--accent)">${quiz.score}</span>
                    <span class="label">Score</span>
                </div>
                <div class="result-item">
                    <span class="number" style="color: var(--success)">${stats.survivalHighScore}</span>
                    <span class="label">Best</span>
                </div>
            ` + (isNewHighScore && quiz.score > 0 ? `<p style="color: var(--accent); font-size: 0.9rem; margin-top: 12px; font-weight: 600;">🎉 You beat your record!</p>` : '');

            // Confetti on new high score
            if (isNewHighScore && quiz.score > 0) launchConfetti();

        } else {
            // Normal quiz results
            const percent = Math.round((quiz.score / quiz.total) * 100);
            const mistakes = quiz.total - quiz.score;

            stats.quizzesTaken = (stats.quizzesTaken || 0) + 1;
            stats.quizCorrect = (stats.quizCorrect || 0) + quiz.score;
            stats.quizWrong = (stats.quizWrong || 0) + mistakes;
            Storage.saveStats(stats);
            updateDailyStreak();

            let title = '🎯 Quiz Complete!';
            if (percent === 100) title = '🏆 Perfect Score!';
            else if (percent >= 80) title = '🌟 Great Job!';
            else if (percent < 50) title = '📚 Keep Practicing!';

            let mistakeNote = '';
            if (mistakes > 0) {
                mistakeNote = `<p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 12px;">` +
                    `${mistakes} card${mistakes > 1 ? 's' : ''} will appear sooner in Study mode for review.</p>`;
            }

            document.getElementById('quiz-results-title').textContent = title;
            document.getElementById('quiz-results-score').textContent = `${quiz.score} / ${quiz.total}`;
            document.getElementById('quiz-results-detail').innerHTML = `
                <div class="result-item">
                    <span class="number" style="color: var(--success)">${percent}%</span>
                    <span class="label">Accuracy</span>
                </div>
                <div class="result-item">
                    <span class="number" style="color: var(--good)">${quiz.score}</span>
                    <span class="label">Correct</span>
                </div>
                <div class="result-item">
                    <span class="number" style="color: var(--again)">${mistakes}</span>
                    <span class="label">Wrong</span>
                </div>
            ` + mistakeNote;

            // Confetti on perfect score
            if (percent === 100) launchConfetti();
        }

        // Show/hide review mistakes button
        const reviewBtn = document.getElementById('btn-quiz-review-mistakes');
        if (quiz.mistakes.length > 0) {
            reviewBtn.classList.remove('hidden');
        } else {
            reviewBtn.classList.add('hidden');
        }

        showScreen('screen-quiz-results');
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ==================== Confetti ====================
    function launchConfetti() {
        const settings = Storage.getSettings();
        if (!settings.confetti) return;

        const canvas = document.getElementById('confetti-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.display = 'block';

        const particles = [];
        const colors = ['#91A8D0', '#F7CAC9', '#4ecdc4', '#ffe66d', '#ff6b6b', '#a8e6cf'];

        for (let i = 0; i < 100; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height - canvas.height,
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 3 + 2,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 10,
            });
        }

        let frame = 0;
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let alive = false;

            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.1;
                p.rotation += p.rotSpeed;

                if (p.y < canvas.height + 20) {
                    alive = true;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation * Math.PI / 180);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                    ctx.restore();
                }
            });

            frame++;
            if (alive && frame < 180) {
                requestAnimationFrame(animate);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                canvas.style.display = 'none';
            }
        }
        animate();
    }

    // ==================== Card Flip Sound ====================
    function playFlipSound() {
        const settings = Storage.getSettings();
        if (!settings.flipSound) return;

        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.08);
        } catch (e) {}
    }

    // ==================== Settings ====================
    function showSettings() {
        const settings = Storage.getSettings();
        document.getElementById('setting-sound').checked = settings.sound;
        document.getElementById('setting-shuffle').checked = settings.shuffle;
        document.getElementById('setting-flip-sound').checked = settings.flipSound;
        document.getElementById('setting-new-cards').value = settings.newCardsPerDay;
        showScreen('screen-settings');
    }

    function saveSettingsFromUI() {
        const settings = {
            sound: document.getElementById('setting-sound').checked,
            shuffle: document.getElementById('setting-shuffle').checked,
            flipSound: document.getElementById('setting-flip-sound').checked,
            confetti: true,
            newCardsPerDay: parseInt(document.getElementById('setting-new-cards').value),
        };
        Storage.saveSettings(settings);
    }

    // ==================== Favorites ====================
    function toggleFavorite(cardId) {
        const card = state.allCards.find(c => c.id === cardId);
        if (!card) return;
        card.favorite = !card.favorite;
        Storage.saveCards(state.allCards);
    }

    // ==================== Stats Screen ====================
    // Calendar state for month navigation
    let calendarMonth = new Date().getMonth();
    let calendarYear = new Date().getFullYear();

    function renderCalendar(studyDates) {
        const today = new Date();
        const dates = studyDates || [];

        const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
        const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
        const monthName = new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long', year: 'numeric' });

        // Determine if we can go prev/next
        const canPrev = calendarYear > 2026 || (calendarYear === 2026 && calendarMonth > 4);
        const canNext = calendarYear < today.getFullYear() || (calendarYear === today.getFullYear() && calendarMonth < today.getMonth());

        let html = `<div class="stats-card">
            <div class="cal-nav">
                <button class="cal-nav-btn" id="cal-prev" ${!canPrev ? 'disabled' : ''}>‹</button>
                <h3>📅 ${monthName}</h3>
                <button class="cal-nav-btn" id="cal-next" ${!canNext ? 'disabled' : ''}>›</button>
            </div>
            <div class="calendar">
                <div class="cal-header">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                </div>
                <div class="cal-grid">`;

        for (let i = 0; i < firstDay; i++) {
            html += `<span class="cal-day empty"></span>`;
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isStudied = dates.includes(dateStr);
            const isToday = (d === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear());
            let classes = 'cal-day';
            if (isStudied) classes += ' studied';
            if (isToday) classes += ' today';
            html += `<span class="${classes}">${d}</span>`;
        }

        html += `</div></div></div>`;
        return html;
    }

    function setupCalendarNav() {
        const prevBtn = document.getElementById('cal-prev');
        const nextBtn = document.getElementById('cal-next');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                calendarMonth--;
                if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
                updateCalendarDisplay();
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                calendarMonth++;
                if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
                updateCalendarDisplay();
            });
        }
    }

    function updateCalendarDisplay() {
        const stats = Storage.getStats();
        const calendarCard = document.querySelector('.cal-nav')?.closest('.stats-card');
        if (calendarCard) {
            calendarCard.outerHTML = renderCalendar(stats.studyDates);
            setupCalendarNav();
        }
    }

    function showStats() {
        // Reset calendar to current month
        calendarMonth = new Date().getMonth();
        calendarYear = new Date().getFullYear();

        const stats = Storage.getStats();
        const cards = state.allCards;
        const totalCards = cards.length;
        const learnedCards = cards.filter(c => c.repetitions >= 3).length;
        const inProgress = cards.filter(c => c.repetitions > 0 && c.repetitions < 3).length;
        const notStarted = cards.filter(c => c.repetitions === 0 && !c.lastReview).length;
        const progressPercent = totalCards > 0 ? Math.round((learnedCards / totalCards) * 100) : 0;

        document.getElementById('stats-detail').innerHTML = `
            <div class="stats-card">
                <h3>Overall Progress <span class="info-btn" id="info-progress">ⓘ</span></h3>
                <div class="value">${learnedCards}/${totalCards}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">${progressPercent}% learned</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
            </div>
            <div class="stats-card">
                <h3>Cards Breakdown <span class="info-btn" id="info-breakdown">ⓘ</span></h3>
                <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--success)">${learnedCards}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary)">Learned</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--warning)">${inProgress}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary)">Learning</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-secondary)">${notStarted}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary)">New</div>
                    </div>
                </div>
            </div>
            <div class="stats-card">
                <h3>Study Streak</h3>
                <div class="value">${stats.streak} days</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 6px;">🏆 Best: ${stats.bestStreak || stats.streak} days</div>
            </div>
            ${renderCalendar(stats.studyDates)}
            <div class="stats-card">
                <h3>Total Reviews <span class="info-btn" id="info-reviews">ⓘ</span></h3>
                <div class="value">${stats.totalReviews}</div>
            </div>
            <div class="stats-card">
                <h3>Quiz Performance</h3>
                ${(stats.quizzesTaken || 0) > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent)">${stats.quizzesTaken || 0}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary)">Quizzes</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--success)">${stats.quizCorrect || 0}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary)">Correct</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--again)">${stats.quizWrong || 0}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary)">Wrong</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--good)">${Math.round(((stats.quizCorrect || 0) / ((stats.quizCorrect || 0) + (stats.quizWrong || 0))) * 100)}%</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary)">Accuracy</div>
                    </div>
                </div>
                ` : `<div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 8px;">No quizzes taken yet</div>`}
            </div>
        `;

        showScreen('screen-stats');

        // Setup calendar navigation
        setupCalendarNav();

        // Bind info buttons
        document.getElementById('info-progress').addEventListener('click', () => {
            alert('Overall Progress\n\nOnly cards marked as Learned (3+ correct answers in a row) count toward your progress.\n\nKeep studying and rating cards Good or Easy to increase this!');
        });
        document.getElementById('info-breakdown').addEventListener('click', () => {
            alert('Cards Breakdown\n\n• Learned: Cards you answered correctly 3+ times in a row. These are well memorized.\n\n• Learning: Cards you have started studying but haven\'t reached 3 correct answers yet.\n\n• New: Cards you haven\'t studied at all yet.');
        });
        document.getElementById('info-reviews').addEventListener('click', () => {
            alert('Total Reviews\n\nCounts every card you rate (Again, Hard, Good, or Easy) during study sessions.\n\nIt includes partial sessions — if you leave early, cards already reviewed still count.\n\nQuiz answers are NOT included in this count.');
        });
    }

    // ==================== Export / Import ====================
    function exportData() {
        const data = {
            version: 1,
            exportDate: new Date().toISOString(),
            cards: state.allCards,
            stats: Storage.getStats(),
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `korean-flashcards-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importData(file) {
        const statusEl = document.getElementById('import-status');

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);

                // Validate structure
                if (!data.cards || !Array.isArray(data.cards)) {
                    showImportStatus('Invalid file: no cards found', false);
                    return;
                }

                // Validate each card has required fields
                for (const card of data.cards) {
                    if (!card.korean || !card.english || !card.id) {
                        showImportStatus('Invalid file: cards missing required fields', false);
                        return;
                    }
                }

                // Merge: add cards that don't already exist (match by id or korean text)
                const existingIds = new Set(state.allCards.map(c => c.id));
                const existingKorean = new Map(state.allCards.map(c => [c.korean.toLowerCase(), c]));
                let addedCount = 0;
                let updatedCount = 0;

                for (const card of data.cards) {
                    if (existingIds.has(card.id)) {
                        // Update existing card by ID
                        const idx = state.allCards.findIndex(c => c.id === card.id);
                        if (idx !== -1) {
                            state.allCards[idx] = card;
                            updatedCount++;
                        }
                    } else if (existingKorean.has(card.korean.toLowerCase())) {
                        // Same Korean text exists — update it with imported data
                        const existing = existingKorean.get(card.korean.toLowerCase());
                        const idx = state.allCards.findIndex(c => c.id === existing.id);
                        if (idx !== -1) {
                            card.id = existing.id; // keep existing ID
                            state.allCards[idx] = card;
                            updatedCount++;
                        }
                    } else {
                        state.allCards.push(card);
                        addedCount++;
                    }
                }

                // Optionally restore stats
                if (data.stats) {
                    Storage.saveStats(data.stats);
                }

                Storage.saveCards(state.allCards);
                showImportStatus(`Imported! ${addedCount} new cards, ${updatedCount} updated.`, true);
                updateHomeStats();

            } catch (err) {
                showImportStatus('Error: Could not read file', false);
            }
        };
        reader.readAsText(file);
    }

    function showImportStatus(message, success) {
        const el = document.getElementById('import-status');
        el.textContent = message;
        el.classList.remove('hidden', 'success', 'error');
        el.classList.add(success ? 'success' : 'error');

        setTimeout(() => {
            el.classList.add('hidden');
        }, 4000);
    }

    // ==================== Add Card Screen ====================
    function showAddCard() {
        // Populate deck dropdown
        const select = document.getElementById('input-deck');
        const existingDecks = VOCABULARY_DATA.decks;

        select.innerHTML = '<option value="custom">My Cards</option>';
        existingDecks.forEach(deck => {
            select.innerHTML += `<option value="${deck.id}">${deck.name}</option>`;
        });

        // Also add any custom decks the user has created
        const customDeckIds = [...new Set(
            state.allCards
                .filter(c => !existingDecks.find(d => d.id === c.deckId))
                .map(c => c.deckId)
        )];
        customDeckIds.forEach(id => {
            if (id !== 'custom') {
                const name = state.allCards.find(c => c.deckId === id)?.deckName || id;
                select.innerHTML += `<option value="${id}">${name}</option>`;
            }
        });

        // Always add "Create New Deck" at the end
        select.innerHTML += '<option value="__new__">+ Create New Deck</option>';

        // Reset form
        document.getElementById('add-card-form').reset();
        document.getElementById('add-card-success').classList.add('hidden');
        document.getElementById('new-deck-group').classList.add('hidden');

        showScreen('screen-add');
    }

    function handleAddCard(e) {
        e.preventDefault();

        const korean = document.getElementById('input-korean').value.trim();
        const english = document.getElementById('input-english').value.trim();
        const romanization = document.getElementById('input-romanization').value.trim();
        const example = document.getElementById('input-example').value.trim();
        let deckId = document.getElementById('input-deck').value;

        if (!korean || !english) return;

        // Check for duplicate cards
        const duplicateKorean = state.allCards.find(c => c.korean.toLowerCase() === korean.toLowerCase());
        const duplicateEnglish = !duplicateKorean && state.allCards.find(c => c.english.toLowerCase() === english.toLowerCase());
        const duplicate = duplicateKorean || duplicateEnglish;

        if (duplicate) {
            const matchType = duplicateKorean ? 'Korean' : 'English';
            const deckName = duplicate.deckName || getDecks().find(d => d.id === duplicate.deckId)?.name || 'Unknown';
            const addAnyway = confirm(
                `A card with the same ${matchType} already exists in "${deckName}" deck:\n\n` +
                `${duplicate.korean} → ${duplicate.english}\n\n` +
                `• OK = Add anyway\n• Cancel = Continue editing`
            );
            if (!addAnyway) {
                return;
            }
        }

        // Handle new deck creation
        let deckName = 'My Cards';
        if (deckId === '__new__') {
            const newDeckName = document.getElementById('input-new-deck').value.trim();
            if (!newDeckName) {
                document.getElementById('input-new-deck').focus();
                return;
            }
            deckId = 'custom_' + generateId();
            deckName = newDeckName;
        } else {
            const builtInDeck = VOCABULARY_DATA.decks.find(d => d.id === deckId);
            if (builtInDeck) {
                deckName = builtInDeck.name;
            } else {
                const existingCard = state.allCards.find(c => c.deckId === deckId);
                if (existingCard) deckName = existingCard.deckName;
            }
        }

        const newCard = {
            id: generateId(),
            deckId: deckId,
            deckName: deckName,
            korean: korean,
            english: english,
            romanization: romanization || '',
            example: example || '',
            ...SRS.defaults,
        };

        state.allCards.push(newCard);
        Storage.saveCards(state.allCards);

        // Show success message
        const successEl = document.getElementById('add-card-success');
        successEl.classList.remove('hidden');

        // Reset form for next card
        document.getElementById('input-korean').value = '';
        document.getElementById('input-english').value = '';
        document.getElementById('input-romanization').value = '';
        document.getElementById('input-example').value = '';
        document.getElementById('input-new-deck').value = '';
        document.getElementById('new-deck-group').classList.add('hidden');
        document.getElementById('input-korean').focus();

        // After creating a new deck, refresh dropdown so it shows up
        showAddCard();
        successEl.classList.remove('hidden');

        // Hide success after 2s
        setTimeout(() => {
            successEl.classList.add('hidden');
        }, 2000);
    }

    // ==================== Event Bindings ====================
    function bindEvents() {
        // Home buttons
        document.getElementById('btn-study').addEventListener('click', () => {
            state.currentDeck = null;
            state.returnToDeck = null;
            showStudyMenu();
        });
        document.getElementById('btn-quiz').addEventListener('click', showQuizMenu);
        document.getElementById('btn-decks').addEventListener('click', showDecks);
        document.getElementById('btn-add').addEventListener('click', showAddCard);

        // Info buttons
        document.getElementById('info-due').addEventListener('click', (e) => {
            e.stopPropagation();
            alert('Due Today\n\nCards ready to study right now:\n\n• New cards you haven\'t seen yet (up to 5 per session)\n• Cards whose review date has arrived based on spaced repetition\n\nIf you rate a card "Again," it comes back in ~1 minute. Rating "Good" or "Easy" pushes it days/weeks into the future.');
        });
        document.getElementById('info-learned').addEventListener('click', (e) => {
            e.stopPropagation();
            alert('Learned\n\nCards you\'ve answered correctly 3+ times in a row.\n\nThese are cards you\'ve demonstrated solid recall on. They\'ll still come back for review at longer intervals to keep them fresh.');
        });
        document.getElementById('info-streak').addEventListener('click', (e) => {
            e.stopPropagation();
            alert('Day Streak\n\nConsecutive days you\'ve studied or taken a quiz.\n\nStudy or quiz at least once per day to keep your streak going! Missing a day resets it to 0.');
        });

        // Study mode menu
        document.getElementById('btn-back-study-menu').addEventListener('click', () => {
            showScreen('screen-home');
            updateHomeStats();
        });
        document.getElementById('btn-study-normal').addEventListener('click', () => {
            state.studyMode = 'normal';
            if (state.studyQueue && state.studyQueue.length > 0 && state.returnToDeck) {
                showScreen('screen-study');
                showCurrentCard();
            } else {
                startStudy(state.currentDeck);
            }
        });
        document.getElementById('btn-study-reverse').addEventListener('click', () => {
            state.studyMode = 'reverse';
            if (state.studyQueue && state.studyQueue.length > 0 && state.returnToDeck) {
                showScreen('screen-study');
                showCurrentCard();
            } else {
                startStudy(state.currentDeck);
            }
        });

        // Audio play button
        document.getElementById('btn-play-audio').addEventListener('click', (e) => {
            e.stopPropagation();
            const card = state.studyQueue[state.currentCardIndex];
            if (card) speakKorean(card.korean);
        });
        document.getElementById('btn-study-fav').addEventListener('click', (e) => {
            e.stopPropagation();
            const card = state.studyQueue[state.currentCardIndex];
            if (card) {
                toggleFavorite(card.id);
                const favBtn = document.getElementById('btn-study-fav');
                favBtn.textContent = card.favorite ? '★' : '☆';
                favBtn.classList.toggle('active', !!card.favorite);
            }
        });
        document.getElementById('btn-stats').addEventListener('click', showStats);
        document.getElementById('btn-settings').addEventListener('click', showSettings);
        document.getElementById('btn-back-settings').addEventListener('click', () => {
            showScreen('screen-home');
        });
        // Settings auto-save on change
        document.querySelectorAll('#screen-settings input, #screen-settings select').forEach(el => {
            el.addEventListener('change', saveSettingsFromUI);
        });

        // Review mistakes button
        document.getElementById('btn-quiz-review-mistakes').addEventListener('click', () => {
            if (quiz.mistakes.length === 0) return;
            state.studyQueue = [...quiz.mistakes];
            state.currentCardIndex = 0;
            state.sessionStats = { again: 0, hard: 0, good: 0, easy: 0 };
            state.studyMode = 'normal';
            state.returnToDeck = null;
            showScreen('screen-study');
            showCurrentCard();
        });

        // Back buttons
        document.getElementById('btn-back-study').addEventListener('click', () => {
            // Save partial session stats if any reviews were done
            const totalReviewed = state.sessionStats.again + state.sessionStats.hard +
                                  state.sessionStats.good + state.sessionStats.easy;
            if (totalReviewed > 0 && state.currentCardIndex < state.studyQueue.length) {
                const stats = Storage.getStats();
                const today = new Date().toISOString().split('T')[0];
                stats.totalReviews += totalReviewed;
                if (!stats.dailyReviews[today]) stats.dailyReviews[today] = 0;
                stats.dailyReviews[today] += totalReviewed;
                if (!stats.studyDates) stats.studyDates = [];
                if (!stats.studyDates.includes(today)) stats.studyDates.push(today);
                updateDailyStreak(stats);
                Storage.saveStats(stats);
            }
            if (state.returnToDeck === '__favorites__') {
                showFavorites();
                state.returnToDeck = null;
            } else if (state.returnToDeck) {
                showManageCards(state.returnToDeck);
                state.returnToDeck = null;
            } else {
                showScreen('screen-home');
                updateHomeStats();
            }
        });
        document.getElementById('btn-back-decks').addEventListener('click', () => {
            showScreen('screen-home');
            updateHomeStats();
        });
        document.getElementById('global-search-input').addEventListener('input', (e) => {
            globalSearch(e.target.value);
        });
        document.getElementById('btn-back-stats').addEventListener('click', () => {
            showScreen('screen-home');
        });
        document.getElementById('btn-back-add').addEventListener('click', () => {
            showDecks();
        });
        document.getElementById('btn-back-manage').addEventListener('click', () => {
            showDecks();
        });
        document.getElementById('card-search-input').addEventListener('input', (e) => {
            if (currentManageDeck === '__favorites__') {
                renderFavoritesList(e.target.value);
            } else if (currentManageDeck) {
                renderCardList(currentManageDeck, e.target.value);
            }
        });
        document.getElementById('btn-back-edit').addEventListener('click', () => {
            if (currentManageDeck === '__favorites__') {
                showFavorites();
            } else {
                const deckId = document.getElementById('edit-card-deck').value;
                showManageCards(deckId);
            }
        });
        document.getElementById('edit-card-form').addEventListener('submit', saveEditCard);
        document.getElementById('btn-back-quiz-menu').addEventListener('click', () => {
            showScreen('screen-home');
        });
        document.getElementById('btn-back-quiz').addEventListener('click', () => {
            if (quiz.mode === 'survival' && quiz.score > 0) {
                const stats = Storage.getStats();
                const highScore = stats.survivalHighScore || 0;
                const diff = highScore - quiz.score;
                let msg = `Current score: ${quiz.score}\n`;
                if (quiz.score >= highScore) {
                    msg += `🔥 You're at a new high score!\n`;
                } else {
                    msg += `${diff} more to beat your best (${highScore})\n`;
                }
                msg += `\nQuit survival mode?`;
                if (!confirm(msg)) return;
                // Save high score if it's the best
                if (quiz.score > highScore) {
                    stats.survivalHighScore = quiz.score;
                    Storage.saveStats(stats);
                }
            } else if (quiz.mode !== 'survival') {
                if (!confirm(`Quit quiz?\n\nProgress: ${quiz.currentIndex}/${quiz.total}\n\nYour progress will not be recorded.`)) return;
            }
            showQuizMenu();
        });

        // Quiz events
        document.getElementById('btn-quiz-mcq').addEventListener('click', () => startQuiz('mcq'));
        document.getElementById('btn-quiz-type').addEventListener('click', () => startQuiz('type'));
        document.getElementById('btn-quiz-listening').addEventListener('click', () => startQuiz('listening'));
        document.getElementById('btn-quiz-survival').addEventListener('click', () => {
            showScreen('screen-survival-setup');
        });
        document.getElementById('btn-back-survival-setup').addEventListener('click', () => {
            showQuizMenu();
        });
        document.getElementById('btn-start-survival').addEventListener('click', () => {
            const mcq = document.getElementById('survival-mcq').checked;
            const type = document.getElementById('survival-type').checked;
            const listen = document.getElementById('survival-listen').checked;
            if (!mcq && !type && !listen) {
                alert('Select at least one question type!');
                return;
            }
            quiz.survivalTypes = [];
            if (mcq) quiz.survivalTypes.push('mcq');
            if (type) quiz.survivalTypes.push('type');
            if (listen) quiz.survivalTypes.push('listening');
            startQuiz('survival');
        });
        document.getElementById('quiz-next-btn').addEventListener('click', nextQuizQuestion);
        document.getElementById('quiz-submit-btn').addEventListener('click', handleTypeAnswer);
        document.getElementById('quiz-play-audio').addEventListener('click', () => {
            const card = quiz.questions[quiz.currentIndex];
            if (card) speakKorean(card.korean);
        });
        document.getElementById('quiz-answer-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!quiz.answered) {
                    handleTypeAnswer();
                } else {
                    nextQuizQuestion();
                }
            }
        });
        document.getElementById('btn-quiz-retry').addEventListener('click', () => {
            startQuiz(quiz.mode);
        });
        document.getElementById('btn-quiz-home').addEventListener('click', () => {
            showScreen('screen-home');
            updateHomeStats();
        });

        // Add card form
        document.getElementById('add-card-form').addEventListener('submit', handleAddCard);

        // Show/hide new deck name input
        document.getElementById('input-deck').addEventListener('change', (e) => {
            const newDeckGroup = document.getElementById('new-deck-group');
            if (e.target.value === '__new__') {
                newDeckGroup.classList.remove('hidden');
                document.getElementById('input-new-deck').focus();
            } else {
                newDeckGroup.classList.add('hidden');
            }
        });

        // Export / Import
        document.getElementById('btn-export').addEventListener('click', exportData);
        document.getElementById('import-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importData(file);
                e.target.value = ''; // reset so same file can be re-imported
            }
        });

        // Firebase sync buttons
        document.getElementById('btn-google-signin').addEventListener('click', () => {
            FirebaseSync.signIn();
        });
        document.getElementById('btn-google-signout').addEventListener('click', () => {
            if (confirm('Are you sure you want to sign out? Your local data will remain on this device.')) {
                FirebaseSync.signOut();
            }
        });
        document.getElementById('btn-sync-now').addEventListener('click', () => {
            FirebaseSync.sync();
        });

        // Complete screen
        document.getElementById('btn-home').addEventListener('click', () => {
            if (state.returnToDeck === '__favorites__') {
                showFavorites();
                state.returnToDeck = null;
            } else if (state.returnToDeck) {
                showManageCards(state.returnToDeck);
                state.returnToDeck = null;
            } else {
                showScreen('screen-home');
                updateHomeStats();
            }
        });

        // Flash card tap to flip
        document.getElementById('flashcard').addEventListener('click', flipCard);

        // Rating buttons
        document.querySelectorAll('.btn-rating').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const rating = parseInt(btn.dataset.rating);
                rateCard(rating);
            });
        });

        // Keyboard shortcuts (for desktop testing)
        document.addEventListener('keydown', (e) => {
            if (document.getElementById('screen-study').classList.contains('active')) {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (!state.isFlipped) {
                        flipCard();
                    }
                } else if (state.isFlipped) {
                    if (e.key === '1') rateCard(1);
                    if (e.key === '2') rateCard(2);
                    if (e.key === '3') rateCard(3);
                    if (e.key === '4') rateCard(4);
                }
            }
        });
    }

    // ==================== Start App ====================
    // Expose reload function for Firebase sync
    window.reloadAppState = function() {
        loadOrInitializeCards();
        updateHomeStats();
        showScreen('screen-home');
    };

    document.addEventListener('DOMContentLoaded', init);
})();
