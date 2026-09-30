/** Fraction of the card's width a right swipe must pass to complete the timer. */
export const SWIPE_COMPLETE_THRESHOLD = 0.7

/** Fraction of the card's width a left swipe must pass for the card to stick open and enable Drop. */
export const DROP_ARM_THRESHOLD = 0.4

/** Width in px the card rests at once armed, i.e. the width of the Drop button it exposes. */
export const DROP_REVEAL_WIDTH = 96

/** How long an armed card waits for the Drop? tap before closing itself. */
export const ARM_TIMEOUT_MS = 2000

/** How long a completed or dropped card stays on screen, showing its confirmation, after its timer leaves the feed. */
export const DEPARTURE_LINGER_MS = 1000

/** Distance in px a pointer must travel before the drag commits to the horizontal (swipe) or vertical (scroll) axis. */
export const SWIPE_AXIS_SLOP_PX = 10
