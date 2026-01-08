# Debug Utility Guide

## Overview

A comprehensive debugging utility system has been implemented to control and organize console output in the React + Firebase app. This system helps slow down and organize logs for better debugging.

## Features

### 1. Master Toggle
- Set `DEBUG_ENABLED = false` in `src/utils/debug.ts` to disable ALL debug logs instantly
- Accessible via `window.toggleDebug(true/false)` in browser console

### 2. Component Filters
- Enable/disable logs for specific components
- Configure in `DEBUG_FILTERS` object in `debug.ts`
- Accessible via `window.toggleComponent('ComponentName', true/false)`

### 3. Log Levels
- `info` - Shows all logs (default)
- `warn` - Shows warnings and errors only
- `error` - Shows errors only

### 4. Log Types

#### Standard Logs
```typescript
debug.log('ComponentName', 'Label', data);
debug.warn('ComponentName', 'Label', data);
debug.error('ComponentName', 'Label', data);
```

#### Grouped Logs (Collapsible)
```typescript
debug.group('ComponentName', 'Group Label');
debug.log('ComponentName', 'Item 1', data1);
debug.log('ComponentName', 'Item 2', data2);
debug.groupEnd();

// Or collapsed (starts collapsed)
debug.groupCollapsed('ComponentName', 'Group Label');
```

#### Throttled Logs (Prevent Spam)
```typescript
// Only shows once per 1000ms
debug.throttle('unique-key', 1000, 'ComponentName', 'Label', data);
```

#### Once-Only Logs
```typescript
// Only prints once per session
debug.once('unique-key', 'ComponentName', 'Label', data);
```

#### Delay for Step-by-Step Debugging
```typescript
await debug.delay(250); // Pauses execution for 250ms
```

## Usage Examples

### Before (Noisy)
```typescript
console.log('ChapterTracker: Checking requirement:', requirement.type, {
  studentData,
  userProgress,
  requirement
});
console.log(`ChapterTracker: Level check - user: ${userLevel}, required: ${requiredLevel}`);
console.log(`ChapterTracker: Chapter ${chapter.id} requirement ${req.type}:`, requirementStatus);
console.log(`ChapterTracker: Chapter ${chapter.id} requirements met:`, requirementsMet);
```

### After (Controlled)
```typescript
debug.throttle(
  `requirement-check-${requirement.type}`,
  1000,
  'ChapterTracker',
  `Checking requirement: ${requirement.type}`,
  { requirement }
);

debug.log('ChapterTracker', `Level check - user: ${userLevel}, required: ${requiredLevel}`);

debug.groupCollapsed('ChapterTracker', `Chapter ${chapter.id} Requirements Check`);
debug.log('ChapterTracker', `Requirement ${req.type}`, requirementStatus);
debug.log('ChapterTracker', `All requirements met`, requirementsMet);
debug.groupEnd();
```

### Wave Transitions (Before)
```typescript
console.log(`\n${'='.repeat(60)}`);
console.log(`🌊 [WAVE TRANSITION CHECK] Current Wave: ${waveNumber}/${battleRoom?.maxWaves || 5}`);
console.log(`   Opponents: ${opponents.length}, Processing: ${isProcessingWaveTransitionRef.current}, Locked: ${waveAdvanceLockRef.current}`);
console.log(`${'='.repeat(60)}\n`);
console.log(`✅ [WAVE TRANSITION] ALL ENEMIES DEFEATED IN WAVE ${waveNumber}!`);
console.log(`   Preparing to spawn next wave...`);
```

### Wave Transitions (After)
```typescript
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

debug.group('IslandRaidBattle', `✅ Wave ${waveNumber} Complete - Transitioning`);
debug.log('IslandRaidBattle', 'ALL ENEMIES DEFEATED', { waveNumber, maxWaves: battleRoom.maxWaves || 5 });
```

## Browser Console Commands

Once the app is loaded, you can use these commands in the browser console:

```javascript
// Toggle all debug logs on/off
toggleDebug(true);  // Enable
toggleDebug(false); // Disable

// Toggle specific component
toggleComponent('ChapterTracker', true);  // Enable
toggleComponent('ChapterTracker', false); // Disable

// Access debug utility
debug.clear();        // Clear all debug state
debug.clearOnce();    // Clear once-only logs
debug.clearThrottle(); // Clear throttled logs

// Check current settings
DEBUG_ENABLED;        // Current state
DEBUG_FILTERS;        // Component filters
```

## Files Updated

1. **src/utils/debug.ts** - New debug utility (created)
2. **src/components/ChapterTracker.tsx** - Updated to use debug utility
3. **src/components/InSessionNotification.tsx** - Updated with throttled/once logs
4. **src/components/IslandRaidBattle.tsx** - Updated with grouped logs for wave transitions
5. **src/components/BattleEngine.tsx** - Import added (ready for updates)

## Configuration

Edit `src/utils/debug.ts` to configure:

```typescript
// Master toggle
export const DEBUG_ENABLED = true;

// Delay mode (set to 0 to disable)
export const DEBUG_DELAY_MS = 0; // 250ms when debugging

// Log level
const DEBUG_LEVEL: LogLevel = 'info'; // 'info' | 'warn' | 'error'

// Component filters
export const DEBUG_FILTERS = {
  ChapterTracker: true,
  IslandRaidBattle: true,
  BattleEngine: true,
  InSessionNotification: true,
  // Add more as needed
};
```

## Benefits

1. **Reduced Console Spam** - Throttled and once-only logs prevent repetitive output
2. **Organized Output** - Grouped logs make it easy to follow logical flows
3. **Selective Debugging** - Enable only the components you're debugging
4. **Easy Toggle** - Turn off all logs instantly when done debugging
5. **Step-by-Step Debugging** - Optional delays help follow execution flow

## Next Steps

To complete the migration:
1. Update remaining console.log calls in `BattleEngine.tsx`
2. Update any other noisy components
3. Test with `DEBUG_ENABLED = true` to verify logs are organized
4. Set `DEBUG_ENABLED = false` when done debugging






