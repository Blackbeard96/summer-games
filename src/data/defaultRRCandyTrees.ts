/**
 * Default RR Candy trees (fallback when Firestore system_config/rr_candy_trees_v1 is missing).
 *
 * HOW TO ADD NODES LATER
 * ----------------------
 * 1. Add a RRCandyNodeDefinition to the candy’s `nodes` array in this file (or edit via Admin → RR Candies).
 * 2. Set requiresNodeIds for dependencies; position { col, row } for grid layout in UI.
 * 3. Set isEnabled false for work-in-progress nodes; starterNode + include id in starterNodeIds for free unlocks.
 * 4. Deploy: save from admin writes Firestore; clients merge remote over these defaults.
 * 5. Grant flow: new “starter” nodes are NOT auto-granted to existing players unless you add a new migration
 *    (see migrations.rrCandyStarterNodesV1 in rrCandyPlayerStateService).
 */

import type { RRCandyConfig } from '../types/rrCandyConfig';

export const DEFAULT_RR_CANDY_CONFIG_VERSION = 1;

export const DEFAULT_RR_CANDY_TREES: RRCandyConfig = {
  version: DEFAULT_RR_CANDY_CONFIG_VERSION,
  candies: [
    {
      id: 'konfig',
      title: 'Konfig',
      subtitle: 'Reality Configuration',
      description:
        'Reconfigure how the system behaves by altering positioning, rules, and interactions.',
      themeColor: 'cyan',
      isActive: true,
      starterNodeIds: ['konfig_node_01', 'konfig_node_02'],
      nodes: [
        {
          nodeId: 'konfig_node_01',
          skillId: 'konfig_evasive_calibration',
          name: 'Evasive Calibration',
          icon: '⚙️',
          summary:
            'Automatically dodge the next attack that would damage shields or health.',
          category: 'Defense',
          requiresNodeIds: [],
          isEnabled: true,
          starterNode: true,
          position: { col: 0, row: 0 },
          effectKey: 'AUTO_DODGE_NEXT_DAMAGE',
        },
        {
          nodeId: 'konfig_node_02',
          skillId: 'konfig_system_redirect',
          name: 'System Redirect',
          icon: '🔄',
          summary: 'Redirect part of incoming damage to another enemy.',
          category: 'Control',
          requiresNodeIds: [],
          isEnabled: true,
          starterNode: true,
          position: { col: 1, row: 0 },
          effectKey: 'REDIRECT_PARTIAL_INCOMING_DAMAGE',
        },
        {
          nodeId: 'konfig_node_placeholder_rule_override',
          skillId: 'konfig_rule_override',
          name: 'Rule Override',
          icon: '⚡',
          summary: 'Placeholder — coming later.',
          category: 'Control',
          requiresNodeIds: ['konfig_node_01'],
          isEnabled: false,
          starterNode: false,
          position: { col: 0, row: 1 },
        },
        {
          nodeId: 'konfig_node_placeholder_target_reconfiguration',
          skillId: 'konfig_target_reconfiguration',
          name: 'Target Reconfiguration',
          icon: '🎯',
          summary: 'Placeholder — coming later.',
          category: 'Control',
          requiresNodeIds: ['konfig_node_02'],
          isEnabled: false,
          starterNode: false,
          position: { col: 1, row: 1 },
        },
        {
          nodeId: 'konfig_node_placeholder_predictive_config',
          skillId: 'konfig_predictive_config',
          name: 'Predictive Config',
          icon: '🔮',
          summary: 'Placeholder — coming later.',
          category: 'Utility',
          requiresNodeIds: ['konfig_node_01'],
          isEnabled: false,
          starterNode: false,
          position: { col: 2, row: 1 },
        },
        {
          nodeId: 'konfig_node_placeholder_priority_rewire',
          skillId: 'konfig_priority_rewire',
          name: 'Priority Rewire',
          icon: '🔀',
          summary: 'Placeholder — coming later.',
          category: 'Control',
          requiresNodeIds: ['konfig_node_02'],
          isEnabled: false,
          starterNode: false,
          position: { col: 0, row: 2 },
        },
        {
          nodeId: 'konfig_node_placeholder_skill_modification',
          skillId: 'konfig_skill_modification',
          name: 'Skill Modification',
          icon: '🛠️',
          summary: 'Placeholder — coming later.',
          category: 'Utility',
          requiresNodeIds: ['konfig_node_01', 'konfig_node_02'],
          isEnabled: false,
          starterNode: false,
          position: { col: 1, row: 2 },
        },
        {
          nodeId: 'konfig_node_placeholder_system_lock',
          skillId: 'konfig_system_lock',
          name: 'System Lock',
          icon: '🔒',
          summary: 'Placeholder — coming later.',
          category: 'Defense',
          requiresNodeIds: ['konfig_node_02'],
          isEnabled: false,
          starterNode: false,
          position: { col: 2, row: 2 },
        },
        {
          nodeId: 'konfig_node_placeholder_reality_override',
          skillId: 'konfig_reality_override',
          name: 'Reality Override',
          icon: '🌌',
          summary: 'Placeholder — coming later.',
          category: 'Control',
          requiresNodeIds: ['konfig_node_01', 'konfig_node_02'],
          isEnabled: false,
          starterNode: false,
          position: { col: 1, row: 3 },
        },
      ],
    },
    {
      id: 'on_off',
      title: 'On/Off',
      subtitle: 'Attraction',
      description: 'Attract priority and chain momentum.',
      themeColor: 'magenta',
      isActive: true,
      starterNodeIds: [],
      nodes: [],
    },
    {
      id: 'up_down',
      title: 'Up/Down',
      subtitle: 'Rhythm',
      description: 'Control flow by increasing or decreasing momentum.',
      themeColor: 'orange',
      isActive: true,
      starterNodeIds: [],
      nodes: [],
    },
  ],
};
