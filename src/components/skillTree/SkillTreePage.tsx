import React, { useState, useEffect, useMemo } from 'react';
import { BranchSelector } from './BranchSelector';
import { CategoryTabs } from './CategoryTabs';
import { SkillTreeCanvas } from './SkillTreeCanvas';
import { SkillDetailPanel } from './SkillDetailPanel';
import { 
  SKILL_TREE_DEFINITION, 
  getCategoriesByBranch, 
  getNodesByBranch 
} from '../../data/skillTreeDefinition';
import { 
  SKILL_DEFINITIONS, 
  getSkillDefinition 
} from '../../data/skillDefinitions';
import { 
  getPlayerSkillState, 
  unlockSkillNode, 
  canUnlockNode 
} from '../../utils/skillStateService';
import { SkillTreeNode, SkillDefinition } from '../../types/skillSystem';

interface SkillTreePageProps {
  userId: string;
  playerLevel?: number;
  totalPPSpent?: number;
}

export const SkillTreePage: React.FC<SkillTreePageProps> = ({
  userId,
  playerLevel = 1,
  totalPPSpent = 0
}) => {
  const [selectedBranchId, setSelectedBranchId] = useState<string>('manifest');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [unlockedNodeIds, setUnlockedNodeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Load player skill state
  useEffect(() => {
    const loadSkillState = async () => {
      try {
        const skillState = await getPlayerSkillState(userId);
        setUnlockedNodeIds(skillState.unlockedNodeIds || []);
        setLoading(false);
      } catch (error) {
        console.error('Error loading skill state:', error);
        setLoading(false);
      }
    };

    loadSkillState();
  }, [userId]);

  // Get current branch data
  const currentBranch = useMemo(() => {
    return SKILL_TREE_DEFINITION.branches.find(b => b.id === selectedBranchId);
  }, [selectedBranchId]);

  const currentCategories = useMemo(() => {
    return getCategoriesByBranch(selectedBranchId);
  }, [selectedBranchId]);

  const currentNodes = useMemo(() => {
    let nodes = getNodesByBranch(selectedBranchId);
    
    // Filter by category if one is selected
    if (selectedCategoryId) {
      nodes = nodes.filter(n => n.categoryId === selectedCategoryId);
    }
    
    return nodes;
  }, [selectedBranchId, selectedCategoryId]);

  // Build skills map for quick lookup
  const skillsMap = useMemo(() => {
    const map: Record<string, SkillDefinition> = {};
    currentNodes.forEach(node => {
      const skill = getSkillDefinition(node.skillId);
      if (skill) {
        map[node.skillId] = skill;
      }
    });
    return map;
  }, [currentNodes]);

  // Get selected node and skill
  const selectedNode = useMemo(() => {
    return selectedNodeId 
      ? currentNodes.find(n => n.id === selectedNodeId) || null
      : null;
  }, [selectedNodeId, currentNodes]);

  const selectedSkill = useMemo(() => {
    return selectedNode 
      ? getSkillDefinition(selectedNode.skillId) || null
      : null;
  }, [selectedNode]);

  // Check if selected node is unlocked and can be unlocked
  const isUnlocked = useMemo(() => {
    return selectedNodeId ? unlockedNodeIds.includes(selectedNodeId) : false;
  }, [selectedNodeId, unlockedNodeIds]);

  const canUnlock = useMemo(() => {
    if (!selectedNode || isUnlocked) return false;
    
    // Check dependencies
    const depsMet = canUnlockNode(selectedNode.id, unlockedNodeIds, selectedNode.requires);
    if (!depsMet) return false;
    
    // Check unlock rules
    const { unlockRules } = selectedNode;
    if (unlockRules.type === 'ppSpent') {
      return totalPPSpent >= (unlockRules.value || 0);
    } else if (unlockRules.type === 'level') {
      return playerLevel >= (unlockRules.value || 0);
    } else if (unlockRules.type === 'challengeComplete') {
      // TODO: Check challenge completion status
      return false;
    } else if (unlockRules.type === 'always') {
      return true;
    }
    
    return false;
  }, [selectedNode, unlockedNodeIds, isUnlocked, totalPPSpent, playerLevel]);

  // Get branch accent color
  const branchAccentColor = useMemo(() => {
    const colors: Record<string, string> = {
      manifest: '#8b5cf6',
      elemental: '#f59e0b',
      system: '#10b981'
    };
    return colors[selectedBranchId] || '#6b7280';
  }, [selectedBranchId]);

  // Handle unlock
  const handleUnlock = async () => {
    if (!selectedNode || !canUnlock) return;
    
    try {
      const success = await unlockSkillNode(userId, selectedNode.id, unlockedNodeIds);
      if (success) {
        setUnlockedNodeIds([...unlockedNodeIds, selectedNode.id]);
      } else {
        console.error('Failed to unlock node');
      }
    } catch (error) {
      console.error('Error unlocking node:', error);
    }
  };

  // Auto-select first node if none selected
  useEffect(() => {
    if (!selectedNodeId && currentNodes.length > 0) {
      setSelectedNodeId(currentNodes[0].id);
    }
  }, [selectedBranchId, selectedCategoryId, currentNodes.length]);

  if (loading) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.7)'
      }}>
        Loading skill tree...
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr minmax(350px, 400px)',
      gap: '1.5rem',
      height: '100%',
      minHeight: '600px',
      maxHeight: 'calc(100vh - 300px)',
      overflow: 'hidden'
    }}>
      {/* Left: Tree Canvas */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.1) 100%)',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        minHeight: 0,
        overflow: 'hidden'
      }}>
        {/* Branch Selector */}
        <BranchSelector
          branches={SKILL_TREE_DEFINITION.branches}
          selectedBranchId={selectedBranchId}
          onSelectBranch={(branchId) => {
            setSelectedBranchId(branchId);
            setSelectedCategoryId(null);
            setSelectedNodeId(null);
          }}
        />

        {/* Category Tabs */}
        {currentCategories.length > 0 && (
          <CategoryTabs
            categories={currentCategories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={(categoryId) => {
              setSelectedCategoryId(categoryId);
              setSelectedNodeId(null);
            }}
          />
        )}

        {/* Tree Canvas */}
        <div style={{ 
          flex: 1, 
          minHeight: '400px',
          maxHeight: '100%',
          overflow: 'auto'
        }}>
          <SkillTreeCanvas
            nodes={currentNodes}
            skills={skillsMap}
            unlockedNodeIds={unlockedNodeIds}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            branchAccentColor={branchAccentColor}
          />
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%)',
        borderRadius: '0.75rem',
        border: `2px solid ${branchAccentColor}`,
        overflow: 'hidden'
      }}>
        <SkillDetailPanel
          selectedNode={selectedNode}
          skill={selectedSkill}
          isUnlocked={isUnlocked}
          canUnlock={canUnlock}
          onUnlock={handleUnlock}
          unlockedNodeIds={unlockedNodeIds}
        />
      </div>
    </div>
  );
};

