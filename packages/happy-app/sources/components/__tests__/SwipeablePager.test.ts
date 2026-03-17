import { describe, it, expect } from 'vitest';
import { computeSnapTarget } from '../SwipeablePager';

describe('computeSnapTarget', () => {
    const W = 390; // typical screen width

    it('snaps to 0 when offset is below 0.5 and no velocity', () => {
        expect(computeSnapTarget(0.3, 0, W)).toBe(0);
    });

    it('snaps to 1 when offset is above 0.5 and no velocity', () => {
        expect(computeSnapTarget(0.7, 0, W)).toBe(1);
    });

    it('snaps to 1 from offset 0.3 when leftward velocity is strong enough', () => {
        // velocityX is negative when swiping left (toward log page)
        // normalizedVelocity = -(-1200) / 390 ≈ +3.07 → projected = 0.3 + 3.07*0.15 ≈ 0.76 > 0.5 → 1
        expect(computeSnapTarget(0.3, -1200, W)).toBe(1);
    });

    it('snaps to 0 from offset 0.7 when rightward velocity is strong enough', () => {
        // velocityX positive → swiping right (toward chat page)
        // normalizedVelocity = -(1200) / 390 ≈ -3.07 → projected = 0.7 - 0.46 ≈ 0.24 < 0.5 → 0
        expect(computeSnapTarget(0.7, 1200, W)).toBe(0);
    });

    it('returns 0 at boundary 0.5 (tie goes to left/chat)', () => {
        expect(computeSnapTarget(0.5, 0, W)).toBe(0);
    });
});
