import {
  getJoinEligibility,
  markParticipantStatus,
  rebuildAllyTurnOrderSnapshot,
} from '../coopBattleRoomState';

describe('coopBattleRoomState', () => {
  test('getJoinEligibility full', () => {
    expect(
      getJoinEligibility({
        uid: 'u1',
        roomStatus: 'active',
        players: ['a'],
        joinableMidBattle: true,
        participantCap: 4,
      }).ok
    ).toBe(true);
  });

  test('getJoinEligibility already in', () => {
    const r = getJoinEligibility({
      uid: 'u1',
      roomStatus: 'active',
      players: ['u1'],
      joinableMidBattle: true,
      participantCap: 4,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('already_in_battle');
  });

  test('getJoinEligibility not joinable', () => {
    const r = getJoinEligibility({
      uid: 'u1',
      roomStatus: 'active',
      players: [],
      joinableMidBattle: false,
      participantCap: 4,
    });
    expect(r.reason).toBe('not_joinable');
  });

  test('rebuildAllyTurnOrderSnapshot orders players then npc', () => {
    const snap = rebuildAllyTurnOrderSnapshot({
      players: ['p2', 'p1'],
      npcAllies: [{ participantId: 'npc1' }, { participantId: 'npc2' }],
      participantRecords: {
        p1: { participantId: 'p1', type: 'player', userId: 'p1', displayName: 'A', team: 'allies', status: 'active' },
        p2: { participantId: 'p2', type: 'player', userId: 'p2', displayName: 'B', team: 'allies', status: 'active' },
        npc1: {
          participantId: 'npc1',
          type: 'allyNpc',
          userId: null,
          displayName: 'N1',
          team: 'allies',
          status: 'active',
        },
      },
    });
    expect(snap).toEqual(['p2', 'p1', 'npc1', 'npc2']);
  });

  test('markParticipantStatus', () => {
    const next = markParticipantStatus(
      {
        x: {
          participantId: 'x',
          type: 'player',
          userId: 'x',
          displayName: 'X',
          team: 'allies',
          status: 'active',
        },
      },
      'x',
      'left'
    );
    expect(next.x.status).toBe('left');
  });
});
