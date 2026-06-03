// LV Battle League scoring system
// Base points by placement, multiplied by attendance bracket, rounded up

const BASE_POINTS = {
    1: 25,
    2: 18,
    3: 13,
    4: 10,
    5: 7,   // 5th-6th
    7: 5,   // 7th-8th
    9: 3    // 9th-12th
};

// Multiplier brackets based on entrant count
const MULTIPLIER_BRACKETS = [
    { min: 20, multiplier: 1.5 },
    { min: 18, multiplier: 1.3 },
    { min: 16, multiplier: 1.2 },
    { min: 12, multiplier: 1.0 },
    { min: 8,  multiplier: 0.8 },
    { min: 6,  multiplier: 0.75 },
    { min: 0,  multiplier: 0.5 }
];

function getMultiplier(entrantCount) {
    for (const bracket of MULTIPLIER_BRACKETS) {
        if (entrantCount >= bracket.min) return bracket.multiplier;
    }
    return 0.5;
}

// options:
//   useMultiplier  - apply the entrant-count multiplier (default true)
//   attendancePoint - add 1 point per attendee for showing up (default false)
function placementToPoints(placement, entrantCount, options = {}) {
    const { useMultiplier = true, attendancePoint = false } = options;
    const bonus = attendancePoint ? 1 : 0;

    // Find base points for this placement
    const brackets = Object.keys(BASE_POINTS).map(Number).sort((a, b) => a - b);
    let base = 0;
    for (let i = brackets.length - 1; i >= 0; i--) {
        if (placement >= brackets[i]) {
            base = BASE_POINTS[brackets[i]];
            break;
        }
    }

    // 13th and beyond earn no placement points, but still get the attendance point
    if (base === 0 || placement > 12) return bonus;

    const multiplier = useMultiplier ? getMultiplier(entrantCount) : 1;
    return Math.ceil(base * multiplier) + bonus;
}

module.exports = { placementToPoints, getMultiplier };
