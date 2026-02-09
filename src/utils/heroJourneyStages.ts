/**
 * Hero's Journey Stages Constants
 * 
 * Canonical mapping of Hero's Journey stages with IDs and labels.
 * Used for Story Goal assessments to map to journey progress.
 */

export interface HeroJourneyStage {
  id: string;
  label: string;
}

export const HERO_JOURNEY_STAGES: HeroJourneyStage[] = [
  { id: 'ordinary-world', label: 'Ordinary World' },
  { id: 'call-to-adventure', label: 'Call to Adventure' },
  { id: 'meeting-mentor', label: 'Meeting the Mentor' },
  { id: 'tests-allies-enemies', label: 'Tests, Allies, Enemies' },
  { id: 'approaching-cave', label: 'Approaching the Cave' },
  { id: 'ordeal', label: 'The Ordeal' },
  { id: 'road-back', label: 'The Road Back' },
  { id: 'resurrection', label: 'Resurrection' },
  { id: 'return-elixir', label: 'Return with Elixir' }
];

/**
 * Get a stage by ID
 */
export function getJourneyStageById(stageId: string): HeroJourneyStage | undefined {
  return HERO_JOURNEY_STAGES.find(stage => stage.id === stageId);
}

/**
 * Get a stage by label (case-insensitive)
 */
export function getJourneyStageByLabel(label: string): HeroJourneyStage | undefined {
  return HERO_JOURNEY_STAGES.find(stage => 
    stage.label.toLowerCase() === label.toLowerCase()
  );
}

