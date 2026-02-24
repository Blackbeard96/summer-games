# Unified Battle System Architecture

## Overview

This document describes the unified battle system that ensures ALL battle modes (Arena, Live Events, Island Raid, Journey, etc.) use the same skill resolution and logging pipeline.

## Core Principles

1. **Single Source of Truth**: `resolveSkillAction()` in `battleSkillResolver.ts` is the ONLY place where damage, healing, shield, and PP calculations happen.

2. **Consistent Logging**: `formatBattleLogEntry()` ensures all battle logs use the same format across all modes.

3. **Mode-Specific Adapters**: Each battle mode implements a `BattleAdapter` that handles storage (local state vs Firestore) but uses the same resolution logic.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Clicks Skill                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         BattleEngine.handleAnimationComplete()               │
│  (Unified entry point for ALL modes)                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         resolveSkillAction(actor, target, skill, context)   │
│  (SINGLE SOURCE OF TRUTH for all calculations)               │
│  - Calculates damage, healing, shield, PP                   │
│  - Returns ResolvedSkillAction with deltas and log messages │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────┴──────────────┐
        │                              │
        ▼                              ▼
┌──────────────────┐        ┌──────────────────┐
│  Live Events     │        │  Other Modes     │
│  (Multiplayer)    │        │  (Local State)   │
│                  │        │                  │
│  applyInSession  │        │  setBattleState  │
│  Move() writes   │        │  updates local   │
│  to Firestore    │        │  React state     │
└──────────────────┘        └──────────────────┘
        │                              │
        ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│         formatBattleLogEntry()                               │
│  (Unified log formatting)                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         UI Updates (via subscriptions or state)              │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Status

### ✅ Completed

1. **Unified Skill Resolver** (`src/utils/battleSkillResolver.ts`)
   - `resolveSkillAction()` - Single source of truth for all calculations
   - `formatBattleLogEntry()` - Unified log formatting
   - Handles all move types: attack, defense, healing, shield, PP steal, RR Candy

2. **Battle Adapter Interface** (`src/utils/battleAdapters.ts`)
   - Defines `BattleAdapter` interface
   - `resolveAndApplyAction()` - Canonical function for all modes

3. **Pipeline Analysis** (`docs/BATTLE_PIPELINE_ANALYSIS.md`)
   - Documented all battle modes and their pipelines
   - Identified canonical implementation (Battle Arena CPU)

### 🚧 In Progress

1. **Refactor BattleEngine.handleAnimationComplete()**
   - Replace inline calculation with `resolveSkillAction()` call
   - Use resolved action for both local state and Firestore updates

2. **Refactor applyInSessionMove()**
   - Accept `ResolvedSkillAction` instead of individual values
   - Use resolved deltas to apply state changes

3. **Update all battle modes**
   - Ensure all modes use unified resolver
   - Remove duplicate calculation logic

### 📋 TODO

1. Test all battle modes to ensure no regressions
2. Verify Live Events skills register correctly
3. Verify battle logs appear consistently
4. Performance testing for unified resolver

## Migration Guide

### For New Battle Modes

1. Import `resolveSkillAction` from `battleSkillResolver.ts`
2. Get actor and target state
3. Call `resolveSkillAction(actor, target, skill, context)`
4. Apply resolved deltas to your storage (local state or Firestore)
5. Write log entries using `formatBattleLogEntry()`

### For Existing Battle Modes

1. Identify where damage/healing/shield calculations happen
2. Replace with `resolveSkillAction()` call
3. Use resolved deltas instead of calculating manually
4. Use `formatBattleLogEntry()` for log messages

## Benefits

1. **Consistency**: All modes use the same calculation logic
2. **Maintainability**: Changes to skill calculations only need to be made in one place
3. **Debugging**: Unified logging makes it easier to trace issues
4. **Testing**: Can test skill resolution independently of battle mode
5. **Reliability**: Reduces bugs from duplicate/inconsistent logic

## Example Usage

```typescript
// Get actor and target state
const actor: ActorState = {
  uid: currentUser.uid,
  name: playerName,
  level: playerLevel,
  hp: vault.vaultHealth,
  maxHp: vault.maxVaultHealth,
  shield: vault.shieldStrength,
  maxShield: vault.maxShieldStrength,
  powerPoints: vault.currentPP,
  equippedArtifacts: equippedArtifacts
};

const target: TargetState = {
  uid: targetOpponent.id,
  name: targetOpponent.name,
  level: targetOpponent.level || 1,
  hp: targetOpponent.vaultHealth,
  maxHp: targetOpponent.maxVaultHealth,
  shield: targetOpponent.shieldStrength,
  maxShield: targetOpponent.maxShieldStrength,
  powerPoints: targetOpponent.currentPP,
  isCPU: checkIsCPUOpponent(targetOpponent)
};

const context: BattleContext = {
  mode: isInSession ? 'live_event' : 'arena',
  playerLevel: playerLevel,
  mindforgeMode: false
};

// Resolve the skill action
const resolved = await resolveSkillAction(actor, target, move, context);

// Apply to state (mode-specific)
if (isInSession) {
  await applyInSessionMove({
    sessionId,
    actorUid: actor.uid,
    targetUid: target.uid,
    resolvedAction: resolved, // Pass resolved action
    // ... other params
  });
} else {
  // Apply to local state
  setBattleState(prev => ({
    ...prev,
    vault: {
      ...prev.vault,
      vaultHealth: Math.max(0, (prev.vault.vaultHealth || 0) + (resolved.actorDelta.hp || 0)),
      shieldStrength: Math.max(0, (prev.vault.shieldStrength || 0) + (resolved.actorDelta.shield || 0)),
      currentPP: Math.max(0, (prev.vault.currentPP || 0) + (resolved.actorDelta.powerPoints || 0))
    },
    // ... update opponent state
    battleLog: [...prev.battleLog, ...resolved.logMessages]
  }));
}
```


