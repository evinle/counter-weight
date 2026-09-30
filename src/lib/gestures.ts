/** Fraction of the card's width a right swipe must pass to complete the timer. */
export const SWIPE_COMPLETE_THRESHOLD = 0.7

/** Width in px of the panel a left swipe reveals; the card stops here and holds open when armed. */
export const DROP_REVEAL_WIDTH = 96

/** How long an armed card waits for the Drop? tap before closing itself. */
export const ARM_TIMEOUT_MS = 2000

/** How long a completed or dropped card stays on screen, showing its confirmation, after its timer leaves the feed. */
export const DEPARTURE_LINGER_MS = 1000
