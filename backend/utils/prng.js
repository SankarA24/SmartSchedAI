// backend/utils/prng.js
//
// Seeded pseudo-random number generator.
//
// The genetic algorithm must be reproducible: re-running it with
// the same seed and the same inputs has to produce exactly the
// same timetable, so an evaluator can verify a published result.
// Math.random() cannot do that, and mulberry32 needs no
// dependency: 32 bits of state, uniform output, fast.

/**
 * Create a seeded random source for one GA run.
 *
 * @param {number} seed any integer; the same seed always replays
 *                      the same sequence
 * @returns {{random: function, int: function, pick: function,
 *            shuffle: function, chance: function}}
 */
export function createRng(seed) {

    let state =
        (Number(seed) >>> 0) || 1;

    /** Uniform float in [0, 1). */
    function random() {

        state =
            (state + 0x6D2B79F5) >>> 0;

        let t = state;

        t = Math.imul(
            t ^ (t >>> 15),
            t | 1
        );

        t ^= t + Math.imul(
            t ^ (t >>> 7),
            t | 61
        );

        return (
            ((t ^ (t >>> 14)) >>> 0) /
            4294967296
        );
    }

    /** Uniform integer in [0, n). */
    function int(n) {

        const bound = Math.floor(n);

        if (
            !Number.isFinite(bound) ||
            bound <= 0
        ) {
            return 0;
        }

        return Math.floor(random() * bound);
    }

    /** A uniformly chosen element, or undefined for an empty array. */
    function pick(array) {

        if (
            !Array.isArray(array) ||
            array.length === 0
        ) {
            return undefined;
        }

        return array[int(array.length)];
    }

    /** Fisher-Yates shuffle; returns a new array. */
    function shuffle(array) {

        const copy = Array.from(array || []);

        for (
            let i = copy.length - 1;
            i > 0;
            i--
        ) {

            const j = int(i + 1);

            const temp = copy[i];

            copy[i] = copy[j];
            copy[j] = temp;
        }

        return copy;
    }

    /** True with probability p. */
    function chance(p) {
        return random() < p;
    }

    return {
        random,
        int,
        pick,
        shuffle,
        chance,
    };
}
