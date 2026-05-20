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
    }

    function loadOrInitializeCards() {
        let cards = Storage.getCards();

        if (cards.length === 0) {
            // First time — initialize from vocabulary data
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
            Storage.saveCards(cards);
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
        const studyQueue = SRS.buildStudyQueue(cards, 5);
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

        if (deckId) {
            cards = cards.filter(c => c.deckId === deckId);
            state.currentDeck = deckId;
        } else {
            state.currentDeck = null;
        }

        state.returnToDeck = null;
        state.studyQueue = SRS.buildStudyQueue(cards, 5);
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

        // Update remaining count
        const remaining = state.studyQueue.length - state.currentCardIndex;
        document.getElementById('cards-remaining').textContent = `${remaining} remaining`;

        // Hide rating buttons
        document.getElementById('rating-buttons').classList.add('hidden');
        document.getElementById('tap-hint').textContent = 'Tap card to flip';
    }

    function flipCard() {
        const flashcard = document.getElementById('flashcard');

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
    function showDecks() {
        const deckList = document.getElementById('deck-list');
        const builtInDecks = VOCABULARY_DATA.decks;

        // Reset search
        document.getElementById('global-search-input').value = '';
        document.getElementById('global-search-results').style.display = 'none';
        deckList.style.display = '';

        // Gather all unique decks (built-in + custom)
        const allDeckIds = [...new Set(state.allCards.map(c => c.deckId))];
        const decks = allDeckIds.map(id => {
            const builtIn = builtInDecks.find(d => d.id === id);
            return {
                id: id,
                name: builtIn ? builtIn.name : (state.allCards.find(c => c.deckId === id)?.deckName || 'My Cards'),
            };
        });

        deckList.innerHTML = decks.map(deck => {
            const deckCards = state.allCards.filter(c => c.deckId === deck.id);
            const dueCount = SRS.getDueCards(deckCards).length +
                           SRS.getNewCards(deckCards, 5).length;

            return `
                <div class="deck-item" data-deck-id="${deck.id}">
                    <div>
                        <div class="deck-name">${deck.name}</div>
                        <div class="deck-count">${deckCards.length} cards</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="btn-manage" data-manage-deck="${deck.id}" title="Manage cards">✎</button>
                        <button class="btn-delete-deck" data-delete-deck="${deck.id}" title="Delete deck">🗑</button>
                        ${dueCount > 0 ? `<div class="deck-due">${dueCount} due</div>` : '<div class="deck-due" style="background: var(--success)">✓</div>'}
                    </div>
                </div>
            `;
        }).join('');

        // Bind deck click events (study)
        deckList.querySelectorAll('.deck-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger study when clicking manage/delete button
                if (e.target.closest('.btn-manage') || e.target.closest('.btn-delete-deck')) return;
                startStudy(item.dataset.deckId);
            });
        });

        // Bind manage button events
        deckList.querySelectorAll('.btn-manage').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showManageCards(btn.dataset.manageDeck);
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
                    <button class="btn-edit" data-edit-id="${card.id}">Edit</button>
                    <button class="btn-delete" data-delete-id="${card.id}">Delete</button>
                </div>
            </div>
        `;
        }).join('');

        // Bind card tap to study
        cardList.querySelectorAll('.card-list-tap').forEach(el => {
            el.addEventListener('click', () => {
                studySingleCard(el.dataset.studyId, deckId);
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

    function studySingleCard(cardId, returnDeckId) {
        const card = state.allCards.find(c => c.id === cardId);
        if (!card) return;

        state.studyQueue = [card];
        state.currentCardIndex = 0;
        state.sessionStats = { again: 0, hard: 0, good: 0, easy: 0 };
        state.returnToDeck = returnDeckId;

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
        document.getElementById('edit-card-deck').value = card.deckId;
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
            // Survival: randomly pick MCQ, type, or listening each round
            const rand = Math.random();
            if (rand < 0.4) {
                showMCQ(card);
            } else if (rand < 0.7) {
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

        // Update SRS based on quiz result
        applyQuizResultToSRS(card, isCorrect);

        if (isCorrect) {
            quiz.score++;
            btn.classList.add('correct');
            showFeedback(true, '');
        } else {
            btn.classList.add('wrong');
            // Highlight the correct one
            document.querySelectorAll('.quiz-mcq-btn').forEach(b => {
                if (b.dataset.answer === correctAnswer) {
                    b.classList.add('correct');
                }
                b.classList.add('disabled');
            });
            showFeedback(false, `Correct: ${correctAnswer}`);
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

    function showFeedback(correct, message) {
        const el = document.getElementById('quiz-feedback');
        el.classList.remove('hidden', 'correct', 'wrong');
        el.classList.add(correct ? 'correct' : 'wrong');
        el.textContent = correct ? '✓ Correct!' : `✗ Wrong. ${message}`;
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

        } else {
            // Normal quiz results
            const percent = Math.round((quiz.score / quiz.total) * 100);
            const mistakes = quiz.total - quiz.score;

            stats.quizzesTaken = (stats.quizzesTaken || 0) + 1;
            stats.quizCorrect = (stats.quizCorrect || 0) + quiz.score;
            stats.quizWrong = (stats.quizWrong || 0) + mistakes;
            Storage.saveStats(stats);

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

    // ==================== Stats Screen ====================
    function renderCalendar(studyDates) {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const monthName = today.toLocaleString('default', { month: 'long', year: 'numeric' });

        const dates = studyDates || [];

        let html = `<div class="stats-card">
            <h3>📅 ${monthName}</h3>
            <div class="calendar">
                <div class="cal-header">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                </div>
                <div class="cal-grid">`;

        // Empty cells for days before the 1st
        for (let i = 0; i < firstDay; i++) {
            html += `<span class="cal-day empty"></span>`;
        }

        // Days of the month
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isStudied = dates.includes(dateStr);
            const isToday = d === today.getDate();
            let classes = 'cal-day';
            if (isStudied) classes += ' studied';
            if (isToday) classes += ' today';
            html += `<span class="${classes}">${d}</span>`;
        }

        html += `</div></div></div>`;
        return html;
    }

    function showStats() {
        const stats = Storage.getStats();
        const cards = state.allCards;
        const totalCards = cards.length;
        const learnedCards = cards.filter(c => c.repetitions >= 3).length;
        const inProgress = cards.filter(c => c.repetitions > 0 && c.repetitions < 3).length;
        const notStarted = cards.filter(c => c.repetitions === 0 && !c.lastReview).length;
        const progressPercent = totalCards > 0 ? Math.round((learnedCards / totalCards) * 100) : 0;

        document.getElementById('stats-detail').innerHTML = `
            <div class="stats-card">
                <h3>Overall Progress</h3>
                <div class="value">${progressPercent}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
            </div>
            <div class="stats-card">
                <h3>Cards Breakdown</h3>
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
            </div>
            ${renderCalendar(stats.studyDates)}
            <div class="stats-card">
                <h3>Total Reviews</h3>
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

                // Merge: add cards that don't already exist
                const existingIds = new Set(state.allCards.map(c => c.id));
                let addedCount = 0;
                let updatedCount = 0;

                for (const card of data.cards) {
                    if (existingIds.has(card.id)) {
                        // Update existing card's SRS data
                        const idx = state.allCards.findIndex(c => c.id === card.id);
                        if (idx !== -1) {
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
        document.getElementById('btn-study').addEventListener('click', showStudyMenu);
        document.getElementById('btn-quiz').addEventListener('click', showQuizMenu);
        document.getElementById('btn-decks').addEventListener('click', showDecks);
        document.getElementById('btn-add').addEventListener('click', showAddCard);

        // Study mode menu
        document.getElementById('btn-back-study-menu').addEventListener('click', () => {
            showScreen('screen-home');
            updateHomeStats();
        });
        document.getElementById('btn-study-normal').addEventListener('click', () => {
            state.studyMode = 'normal';
            startStudy(null);
        });
        document.getElementById('btn-study-reverse').addEventListener('click', () => {
            state.studyMode = 'reverse';
            startStudy(null);
        });

        // Audio play button
        document.getElementById('btn-play-audio').addEventListener('click', (e) => {
            e.stopPropagation();
            const card = state.studyQueue[state.currentCardIndex];
            if (card) speakKorean(card.korean);
        });
        document.getElementById('btn-stats').addEventListener('click', showStats);

        // Back buttons
        document.getElementById('btn-back-study').addEventListener('click', () => {
            if (state.returnToDeck) {
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
            if (currentManageDeck) {
                renderCardList(currentManageDeck, e.target.value);
            }
        });
        document.getElementById('btn-back-edit').addEventListener('click', () => {
            const deckId = document.getElementById('edit-card-deck').value;
            showManageCards(deckId);
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
            }
            showQuizMenu();
        });

        // Quiz events
        document.getElementById('btn-quiz-mcq').addEventListener('click', () => startQuiz('mcq'));
        document.getElementById('btn-quiz-type').addEventListener('click', () => startQuiz('type'));
        document.getElementById('btn-quiz-listening').addEventListener('click', () => startQuiz('listening'));
        document.getElementById('btn-quiz-survival').addEventListener('click', () => startQuiz('survival'));
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

        // Complete screen
        document.getElementById('btn-home').addEventListener('click', () => {
            if (state.returnToDeck) {
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
    document.addEventListener('DOMContentLoaded', init);
})();
