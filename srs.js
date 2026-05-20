// SM-2 Spaced Repetition Algorithm
// Based on SuperMemo SM-2: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2

const SRS = {
    // Default values for a new card
    defaults: {
        interval: 0,       // days until next review
        repetitions: 0,    // number of consecutive correct answers
        easeFactor: 2.5,   // difficulty multiplier (minimum 1.3)
        nextReview: null,   // Date ISO string
        lastReview: null,
    },

    // Rating constants
    AGAIN: 1,
    HARD: 2,
    GOOD: 3,
    EASY: 4,

    /**
     * Calculate next review schedule based on user rating
     * @param {object} card - Card with SRS fields
     * @param {number} rating - 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
     * @returns {object} Updated SRS fields
     */
    review(card, rating) {
        let { interval, repetitions, easeFactor } = card;

        if (rating === this.AGAIN) {
            // Failed — reset
            repetitions = 0;
            interval = 0;
        } else {
            // Passed
            if (repetitions === 0) {
                interval = 1;
            } else if (repetitions === 1) {
                interval = 3;
            } else {
                interval = Math.round(interval * easeFactor);
            }
            repetitions++;
        }

        // Update ease factor
        // Modified SM-2 formula
        const q = rating - 1; // Convert to 0-3 scale
        easeFactor = easeFactor + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02));

        // Clamp ease factor
        if (easeFactor < 1.3) easeFactor = 1.3;
        if (easeFactor > 3.0) easeFactor = 3.0;

        // Apply modifiers based on rating
        if (rating === this.HARD) {
            interval = Math.max(1, Math.round(interval * 0.8));
        } else if (rating === this.EASY) {
            interval = Math.round(interval * 1.3);
        }

        // Calculate next review date
        const now = new Date();
        const nextReview = new Date(now);
        if (interval === 0) {
            // Show again in 1 minute (for current session)
            nextReview.setMinutes(nextReview.getMinutes() + 1);
        } else {
            nextReview.setDate(nextReview.getDate() + interval);
        }

        return {
            interval,
            repetitions,
            easeFactor: Math.round(easeFactor * 100) / 100,
            nextReview: nextReview.toISOString(),
            lastReview: now.toISOString(),
        };
    },

    /**
     * Check if a card is due for review
     * @param {object} card - Card with SRS fields
     * @returns {boolean}
     */
    isDue(card) {
        if (!card.nextReview) return true;
        return new Date(card.nextReview) <= new Date();
    },

    /**
     * Get cards due for review from a list, sorted by priority
     * @param {Array} cards - All cards
     * @returns {Array} Cards due for review
     */
    getDueCards(cards) {
        return cards
            .filter(card => this.isDue(card))
            .sort((a, b) => {
                // Priority: failed cards first, then by due date
                if (a.interval === 0 && b.interval !== 0) return -1;
                if (b.interval === 0 && a.interval !== 0) return 1;
                const dateA = a.nextReview ? new Date(a.nextReview) : new Date(0);
                const dateB = b.nextReview ? new Date(b.nextReview) : new Date(0);
                return dateA - dateB;
            });
    },

    /**
     * Get new cards (never reviewed) limited by daily count
     * @param {Array} cards - All cards
     * @param {number} limit - Max new cards per day
     * @returns {Array}
     */
    getNewCards(cards, limit = 5) {
        return cards
            .filter(card => card.repetitions === 0 && !card.lastReview)
            .slice(0, limit);
    },

    /**
     * Build a study queue combining due reviews + new cards
     * @param {Array} cards - All cards
     * @param {number} newCardsPerDay - How many new cards to introduce
     * @returns {Array}
     */
    buildStudyQueue(cards, newCardsPerDay = 5) {
        const dueCards = this.getDueCards(cards);
        const newCards = this.getNewCards(cards, newCardsPerDay);

        // Interleave: reviews first, then new cards
        const queue = [...dueCards];

        // Add new cards that aren't already in the due queue
        for (const card of newCards) {
            if (!queue.find(c => c.id === card.id)) {
                queue.push(card);
            }
        }

        return queue;
    }
};
