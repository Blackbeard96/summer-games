/**
 * Tests for Loadout constants
 * - MAX_EQUIPPED_SKILLS is 6
 */

import { MAX_EQUIPPED_SKILLS } from '../loadout';

describe('Loadout', () => {
  it('MAX_EQUIPPED_SKILLS is 6', () => {
    expect(MAX_EQUIPPED_SKILLS).toBe(6);
  });
});
