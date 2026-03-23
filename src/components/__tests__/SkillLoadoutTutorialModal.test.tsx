/**
 * Tests for Skill Loadout tutorial eligibility helper and constant.
 * Modal UI: eligible user with unseen flag gets modal on sign-in; "Set My Loadout" / "Later" mark seen (manual QA).
 */

import { hasSeenSkillLoadoutTutorial, SKILL_LOADOUT_TUTORIAL_KEY } from '../../utils/skillLoadoutTutorial';
import { getDoc } from 'firebase/firestore';

jest.mock('../../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn()
}));

describe('skillLoadoutTutorial utils', () => {
  it('exposes SKILL_LOADOUT_TUTORIAL_KEY for eligibility checks', () => {
    expect(SKILL_LOADOUT_TUTORIAL_KEY).toBe('skillLoadoutV1');
  });
});

describe('hasSeenSkillLoadoutTutorial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns false when user doc does not exist', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
    const result = await hasSeenSkillLoadoutTutorial('test-uid');
    expect(result).toBe(false);
  });

  it('returns false when tutorials.skillLoadoutV1 is missing', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ tutorials: {} })
    });
    const result = await hasSeenSkillLoadoutTutorial('test-uid');
    expect(result).toBe(false);
  });

  it('returns true when tutorials.skillLoadoutV1.completed is true', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        tutorials: {
          skillLoadoutV1: { completed: true }
        }
      })
    });
    const result = await hasSeenSkillLoadoutTutorial('test-uid');
    expect(result).toBe(true);
  });

  it('returns true when tutorials.skillLoadoutV1.skipped is true', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        tutorials: {
          skillLoadoutV1: { skipped: true }
        }
      })
    });
    const result = await hasSeenSkillLoadoutTutorial('test-uid');
    expect(result).toBe(true);
  });

  it('returns true on getDoc error (defensive)', async () => {
    (getDoc as jest.Mock).mockRejectedValue(new Error('network'));
    const result = await hasSeenSkillLoadoutTutorial('test-uid');
    expect(result).toBe(true);
  });
});
