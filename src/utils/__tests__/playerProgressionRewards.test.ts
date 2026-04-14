import { trackPlayerAction } from '../playerProgressionRewards';

const mockUpdateByType = jest.fn().mockResolvedValue(undefined);

jest.mock('../dailyChallengeTracker', () => ({
  updateChallengeProgressByType: function mockImpl() {
    return mockUpdateByType.apply(null, arguments);
  },
}));

describe('trackPlayerAction', () => {
  beforeEach(() => {
    mockUpdateByType.mockClear();
  });

  it('maps BATTLE_WON to win_battle', async () => {
    await trackPlayerAction('uid1', 'BATTLE_WON', 1);
    expect(mockUpdateByType).toHaveBeenCalledWith('uid1', 'win_battle', 1);
  });

  it('maps LIVE_EVENT_SESSION_FINALIZED to participate_live_event', async () => {
    await trackPlayerAction('uid2', 'LIVE_EVENT_SESSION_FINALIZED', 1);
    expect(mockUpdateByType).toHaveBeenCalledWith('uid2', 'participate_live_event', 1);
  });

  it('no-ops for non-positive value', async () => {
    await trackPlayerAction('uid3', 'EARN_PP', 0);
    expect(mockUpdateByType).not.toHaveBeenCalled();
  });
});
