# Debug Utility Migration Examples

## Before & After Examples

### Example 1: ChapterTracker Requirement Checks

**Before (Noisy - fires on every render):**
```typescript
const getRequirementStatus = (requirement: any) => {
  console.log('ChapterTracker: Checking requirement:', requirement.type, {
    studentData,
    userProgress,
    requirement
  });
  
  switch (requirement.type) {
    case 'level':
      const userLevel = studentData?.level || userProgress?.level || 1;
      const requiredLevel = requirement.value || 1;
      console.log(`ChapterTracker: Level check - user: ${userLevel}, required: ${requiredLevel}`);
      return userLevel >= requiredLevel;
    // ...
  }
};

const getChapterStatus = (chapter: Chapter) => {
  const requirementsMet = chapter.requirements.every(req => {
    const requirementStatus = getRequirementStatus(req);
    console.log(`ChapterTracker: Chapter ${chapter.id} requirement ${req.type}:`, requirementStatus);
    return requirementStatus;
  });
  console.log(`ChapterTracker: Chapter ${chapter.id} requirements met:`, requirementsMet);
  // ...
};
```

**After (Controlled - throttled and grouped):**
```typescript
const getRequirementStatus = (requirement: any) => {
  debug.throttle(
    `requirement-check-${requirement.type}`,
    1000,
    'ChapterTracker',
    `Checking requirement: ${requirement.type}`,
    { requirement }
  );
  
  switch (requirement.type) {
    case 'level':
      const userLevel = studentData?.level || userProgress?.level || 1;
      const requiredLevel = requirement.value || 1;
      debug.log('ChapterTracker', `Level check - user: ${userLevel}, required: ${requiredLevel}`);
      return userLevel >= requiredLevel;
    // ...
  }
};

const getChapterStatus = (chapter: Chapter) => {
  debug.groupCollapsed('ChapterTracker', `Chapter ${chapter.id} Requirements Check`);
  const requirementsMet = chapter.requirements.every(req => {
    const requirementStatus = getRequirementStatus(req);
    debug.log('ChapterTracker', `Requirement ${req.type}`, requirementStatus);
    return requirementStatus;
  });
  debug.log('ChapterTracker', `All requirements met`, requirementsMet);
  debug.groupEnd();
  // ...
};
```

**Result:**
- Requirement checks are throttled (max once per second)
- All requirements for a chapter are grouped in a collapsible section
- Easy to expand only the chapter you're debugging

---

### Example 2: IslandRaidBattle Wave Transitions

**Before (Noisy - fires every useEffect):**
```typescript
useEffect(() => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🌊 [WAVE TRANSITION CHECK] Current Wave: ${waveNumber}/${battleRoom?.maxWaves || 5}`);
  console.log(`   Opponents: ${opponents.length}, Processing: ${isProcessingWaveTransitionRef.current}, Locked: ${waveAdvanceLockRef.current}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // ... checks ...
  
  console.log(`🌊 [WAVE CHECK] Filtering enemies for Wave ${waveNumber}:`, {
    totalOpponents: opponents.length,
    currentWaveEnemies: currentWaveEnemies.length,
    enemyWaves: [...]
  });
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ [WAVE TRANSITION] ALL ENEMIES DEFEATED IN WAVE ${waveNumber}!`);
  console.log(`   Preparing to spawn next wave...`);
  console.log(`${'='.repeat(60)}\n`);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 [WAVE TRANSITION] STARTING TRANSITION: Wave ${waveNumber} → Wave ${nextWave}`);
  console.log(`   Current wave: ${waveNumber}`);
  console.log(`   Next wave: ${nextWave}`);
  console.log(`   Max waves: ${battleRoom.maxWaves || 5}`);
  console.log(`${'='.repeat(60)}\n`);
}, [opponents, waveNumber, battleRoom]);
```

**After (Controlled - throttled and grouped):**
```typescript
useEffect(() => {
  debug.throttle(
    'wave-transition-check',
    1000,
    'IslandRaidBattle',
    `Wave Transition Check: Wave ${waveNumber}/${battleRoom?.maxWaves || 5}`,
    {
      opponents: opponents.length,
      processing: isProcessingWaveTransitionRef.current,
      locked: waveAdvanceLockRef.current
    }
  );
  
  // ... checks ...
  
  debug.groupCollapsed('IslandRaidBattle', `Wave ${waveNumber} Enemy Filter`);
  debug.log('IslandRaidBattle', 'Filtering enemies', {
    totalOpponents: opponents.length,
    currentWaveEnemies: currentWaveEnemies.length,
    enemyWaves: [...]
  });
  debug.groupEnd();
  
  debug.group('IslandRaidBattle', `✅ Wave ${waveNumber} Complete - Transitioning`);
  debug.log('IslandRaidBattle', 'ALL ENEMIES DEFEATED', { waveNumber, maxWaves: battleRoom.maxWaves || 5 });
  
  debug.log('IslandRaidBattle', `STARTING TRANSITION: Wave ${waveNumber} → Wave ${nextWave}`, {
    currentWave: waveNumber,
    nextWave,
    maxWaves: battleRoom.maxWaves || 5
  });
  
  // ... transition logic ...
  
  debug.groupEnd();
}, [opponents, waveNumber, battleRoom]);
```

**Result:**
- Wave checks are throttled (max once per second)
- Enemy filtering is in a collapsed group
- Wave transitions are in an expanded group
- Easy to follow the flow of one wave transition

---

### Example 3: InSessionNotification Polling

**Before (Noisy - fires every 1.5 seconds):**
```typescript
const checkForActiveSessions = async (userId: string) => {
  console.log('[InSessionNotification] Found active sessions:', sessionsSnapshot.size);
  
  console.log('[InSessionNotification] All active sessions:', allSessions.map(s => ({
    id: s.id,
    classId: s.classId,
    className: s.className,
    playersCount: s.players?.length || 0,
    playerIds: s.players?.map((p: any) => p.userId) || []
  })));
  
  console.log('[InSessionNotification] Filtered by classrooms:', {
    userClassrooms: userClassroomsCache,
    filteredCount: userSessions.length,
    allSessionsCount: allSessions.length
  });
  
  console.log('[InSessionNotification] Session check:', {
    sessionId: latestSession.id,
    className: latestSession.className,
    // ... many fields ...
  });
  
  console.log('[InSessionNotification] ✅ Showing join notification - user not in session', {
    sessionId: latestSession.id,
    userId,
    playerIds: latestSession.players?.map((p: any) => p.userId) || []
  });
};

// Polls every 1.5 seconds
setInterval(() => {
  checkForActiveSessions(currentUser.uid);
}, 1500);
```

**After (Controlled - throttled and grouped):**
```typescript
const checkForActiveSessions = async (userId: string) => {
  debug.throttle('active-sessions-count', 2000, 'InSessionNotification', 'Found active sessions', sessionsSnapshot.size);
  
  debug.groupCollapsed('InSessionNotification', `All Active Sessions (${allSessions.length})`);
  debug.log('InSessionNotification', 'Session details', allSessions.map(s => ({
    id: s.id,
    classId: s.classId,
    className: s.className,
    playersCount: s.players?.length || 0,
    playerIds: s.players?.map((p: any) => p.userId) || []
  })));
  debug.groupEnd();
  
  debug.throttle('filtered-classrooms', 2000, 'InSessionNotification', 'Filtered by classrooms', {
    userClassrooms: userClassroomsCache,
    filteredCount: userSessions.length,
    allSessionsCount: allSessions.length
  });
  
  debug.group('InSessionNotification', 'Session Check');
  debug.log('InSessionNotification', 'Session details', {
    sessionId: latestSession.id,
    className: latestSession.className,
    // ... many fields ...
  });
  
  debug.log('InSessionNotification', '✅ Showing join notification - user not in session', {
    sessionId: latestSession.id,
    userId,
    playerIds: latestSession.players?.map((p: any) => p.userId) || []
  });
  debug.groupEnd();
};

// Polls every 1.5 seconds, but logs are throttled
setInterval(() => {
  checkForActiveSessions(currentUser.uid);
}, 1500);
```

**Result:**
- Session count logs are throttled (max once per 2 seconds)
- All sessions are in a collapsed group
- Session checks are in an expanded group
- Much less console spam during polling

---

## Console Output Comparison

### Before (Chaotic)
```
ChapterTracker: Checking requirement: level {studentData: {...}, ...}
ChapterTracker: Level check - user: 5, required: 3
ChapterTracker: Chapter 3 requirement level: true
ChapterTracker: Chapter 3 requirements met: true
ChapterTracker: Checking requirement: level {studentData: {...}, ...}
ChapterTracker: Level check - user: 5, required: 3
ChapterTracker: Chapter 3 requirement level: true
ChapterTracker: Chapter 3 requirements met: true
[InSessionNotification] Found active sessions: 0
[InSessionNotification] No active sessions found
[InSessionNotification] Found active sessions: 0
[InSessionNotification] No active sessions found
🌊 [WAVE TRANSITION CHECK] Current Wave: 2/4
   Opponents: 7, Processing: false, Locked: false
🌊 [WAVE CHECK] Filtering enemies for Wave 2: {...}
```

### After (Organized)
```
▶ [ChapterTracker] Chapter 3 Requirements Check
  [ChapterTracker] Requirement level: true
  [ChapterTracker] All requirements met: true

▶ [InSessionNotification] Found active sessions: 0 (throttled: 2000ms)
▶ [InSessionNotification] No active sessions found (throttled: 5000ms)

▶ [IslandRaidBattle] Wave Transition Check: Wave 2/4 (throttled: 1000ms)
  Opponents: 7, Processing: false, Locked: false
▶ [IslandRaidBattle] Wave 2 Enemy Filter
  totalOpponents: 7, currentWaveEnemies: 0
```

## Quick Reference

| Use Case | Function | Example |
|----------|----------|---------|
| Frequent logs (loops) | `throttle` | `debug.throttle('key', 1000, 'Component', 'Label', data)` |
| One-time logs | `once` | `debug.once('key', 'Component', 'Label', data)` |
| Related logs | `group` / `groupCollapsed` | `debug.group('Component', 'Label')` ... `debug.groupEnd()` |
| Step debugging | `delay` | `await debug.delay(250)` |
| Standard logs | `log` / `warn` / `error` | `debug.log('Component', 'Label', data)` |






