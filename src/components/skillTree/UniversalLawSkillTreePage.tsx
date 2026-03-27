/**
 * Universal Law Skill Tree Page
 * Ghost-of-Yotei-style layout with left nav, center node cluster, right detail panel
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  UniversalLawId,
  getAllLawTrees,
  getLawTreeById,
  getBoonNodesByLaw,
  type UniversalLawBoonNode,
} from '../../data/universalLawTrees';
import { getAllLawTreeAccess, canLearnNode } from '../../utils/universalLawGating';
import { HoldToUnlockButton } from './HoldToUnlockButton';
import {
  computeNodeEligibility,
  getPlayerUniversalLawProgress,
  type PlayerUniversalLawProgress,
  type UniversalLawCurrencySnapshot,
  unlockUniversalLawBoonNode,
} from '../../utils/universalLawBoons';

interface UniversalLawSkillTreePageProps {
  userId: string;
}

export const UniversalLawSkillTreePage: React.FC<UniversalLawSkillTreePageProps> = ({
  userId
}) => {
  const { currentUser } = useAuth();
  const [selectedLawId, setSelectedLawId] = useState<UniversalLawId | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [progress, setProgress] = useState<PlayerUniversalLawProgress>({
    unlockedNodeIds: [],
    unlockedByLaw: {
      divine_oneness: [],
      vibration: [],
      attraction: [],
      rhythm: [],
    },
    totalSpentPP: 0,
    totalSpentTruthMetalShards: 0,
  });
  const [userData, setUserData] = useState<any>(null);
  const [currency, setCurrency] = useState<UniversalLawCurrencySnapshot>({
    powerPoints: 0,
    truthMetalShards: 0,
  });
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockFeedback, setUnlockFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user data and learned nodes
  useEffect(() => {
    if (!userId) return;

    const userRef = doc(db, 'users', userId);
    const studentRef = doc(db, 'students', userId);
    const unsubscribeUser = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        setUserData(doc.data());
      }
    });
    const unsubscribeStudent = onSnapshot(studentRef, (docSnap) => {
      if (!docSnap.exists()) {
        setCurrency((prev) => ({ ...prev, powerPoints: 0, truthMetalShards: 0 }));
        return;
      }
      const data = docSnap.data() as Record<string, unknown>;
      setCurrency({
        powerPoints: Math.max(0, Math.floor(Number(data.powerPoints) || 0)),
        truthMetalShards: Math.max(0, Math.floor(Number(data.truthMetal) || 0)),
      });
    });

    const loadProgress = async () => {
      try {
        const nextProgress = await getPlayerUniversalLawProgress(userId);
        setProgress(nextProgress);
        setLoading(false);
      } catch (error) {
        console.error('Error loading universal law progress:', error);
        setLoading(false);
      }
    };

    loadProgress();

    return () => {
      unsubscribeUser();
      unsubscribeStudent();
    };
  }, [userId]);

  // Get access status for all trees
  const treeAccess = useMemo(() => {
    if (!userData) return {};
    return getAllLawTreeAccess(userData, progress.unlockedNodeIds);
  }, [userData, progress.unlockedNodeIds]);

  // Get selected tree
  const selectedTree = useMemo(() => {
    if (!selectedLawId) return null;
    return getLawTreeById(selectedLawId);
  }, [selectedLawId]);

  // Get selected node
  const selectedNode = useMemo(() => {
    if (!selectedLawId || !selectedNodeId) return null;
    return getBoonNodesByLaw(selectedLawId).find((n) => n.id === selectedNodeId) || null;
  }, [selectedLawId, selectedNodeId]);

  // Check if selected node is learned
  const isNodeLearned = useMemo(() => {
    return selectedNodeId ? progress.unlockedNodeIds.includes(selectedNodeId) : false;
  }, [selectedNodeId, progress.unlockedNodeIds]);

  // Check if selected node can be learned
  const canLearn = useMemo(() => {
    if (!selectedNode || !userData || isNodeLearned) return false;
    const result = canLearnNode(
      selectedNode.id,
      userData,
      progress.unlockedNodeIds,
      progress,
      currency
    );
    return result.canLearn;
  }, [selectedNode, userData, progress, currency, isNodeLearned]);

  const selectedEligibility = useMemo(() => {
    if (!selectedNode) return null;
    return computeNodeEligibility(selectedNode, progress, currency);
  }, [selectedNode, progress, currency]);

  // Auto-select first available tree
  useEffect(() => {
    if (!selectedLawId && !loading && userData) {
      const trees = getAllLawTrees();
      const firstAvailable = trees.find(tree => {
        const access = treeAccess[tree.id];
        return access?.status === 'available' || access?.status === 'learned';
      });
      if (firstAvailable) {
        setSelectedLawId(firstAvailable.id);
        // Auto-select first node in tree
        const nodes = getBoonNodesByLaw(firstAvailable.id);
        if (nodes.length > 0) {
          setSelectedNodeId(nodes[0].id);
        }
      } else {
        // Select first tree even if locked (to show locked state)
        setSelectedLawId(trees[0]?.id || null);
      }
    }
  }, [selectedLawId, loading, userData, treeAccess]);

  // Auto-select first node when tree changes
  useEffect(() => {
    if (selectedLawId && !selectedNodeId) {
      const nodes = getBoonNodesByLaw(selectedLawId);
      if (nodes.length > 0) setSelectedNodeId(nodes[0].id);
    }
  }, [selectedLawId, selectedNodeId]);

  // Handle learn
  const handleLearn = async () => {
    if (!selectedNode || !canLearn || unlockBusy) return;
    
    try {
      setUnlockBusy(true);
      setUnlockFeedback(null);
      const res = await unlockUniversalLawBoonNode(userId, selectedNode.id);
      if (res.ok && res.progress) {
        setProgress(res.progress);
        setUnlockFeedback(`Unlocked ${selectedNode.title}!`);
      } else {
        setUnlockFeedback(res.reason || 'Failed to unlock boon node');
      }
    } catch (error) {
      console.error('Error unlocking node:', error);
      setUnlockFeedback('Error unlocking node');
    } finally {
      setUnlockBusy(false);
    }
  };

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

  const allTrees = getAllLawTrees();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr 350px',
      gap: '1.5rem',
      height: '100%',
      minHeight: '600px',
      maxHeight: 'calc(100vh - 300px)',
      overflow: 'hidden'
    }}>
      {/* Left: Law Selector */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.1) 100%)',
        borderRadius: '0.75rem',
        padding: '1rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        overflowY: 'auto'
      }}>
        <h3 style={{
          fontSize: '0.875rem',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'rgba(255, 255, 255, 0.6)',
          marginBottom: '1rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          Universal Laws
        </h3>
        <div
          style={{
            marginBottom: '0.85rem',
            fontSize: '0.75rem',
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.5,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '0.5rem',
            padding: '0.6rem',
          }}
        >
          <div>⚡ PP: {currency.powerPoints.toLocaleString()}</div>
          <div>🔩 Truth Metal: {currency.truthMetalShards.toLocaleString()}</div>
        </div>
        
        {allTrees.map((tree) => {
          const access = treeAccess[tree.id];
          const isSelected = selectedLawId === tree.id;
          const isLocked = access?.status === 'locked';
          const isAvailable = access?.status === 'available';
          const isLearned = access?.status === 'learned';
          
          return (
            <button
              key={tree.id}
              onClick={() => {
                setSelectedLawId(tree.id);
                const nodes = getBoonNodesByLaw(tree.id);
                if (nodes.length > 0) {
                  setSelectedNodeId(nodes[0].id);
                }
              }}
              disabled={isLocked}
              style={{
                padding: '0.75rem',
                marginBottom: '0.5rem',
                background: isSelected 
                  ? 'rgba(234, 179, 8, 0.2)' 
                  : 'transparent',
                border: 'none',
                borderLeft: isSelected 
                  ? '3px solid #eab308' 
                  : '3px solid transparent',
                borderRadius: '0.25rem',
                color: isLocked 
                  ? 'rgba(255, 255, 255, 0.4)' 
                  : isSelected 
                    ? '#fff' 
                    : 'rgba(255, 255, 255, 0.7)',
                textAlign: 'left',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              <div style={{
                fontSize: '0.875rem',
                fontWeight: isSelected ? 'bold' : 'normal',
                marginBottom: '0.25rem'
              }}>
                {tree.title}
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: isLocked 
                  ? 'rgba(255, 255, 255, 0.3)' 
                  : 'rgba(255, 255, 255, 0.5)',
                fontStyle: 'italic'
              }}>
                {tree.subtitle}
              </div>
              {isLocked && access?.reason && (
                <div style={{
                  fontSize: '0.625rem',
                  color: 'rgba(255, 255, 255, 0.4)',
                  marginTop: '0.25rem'
                }}>
                  {access.reason}
                </div>
              )}
              {isLearned && (
                <div style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  fontSize: '0.75rem',
                  color: '#10b981'
                }}>
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Middle: Node Cluster */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.1) 100%)',
        borderRadius: '0.75rem',
        padding: '2rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'relative',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0
      }}>
        {selectedTree ? (
          getBoonNodesByLaw(selectedTree.id).length > 0 ? (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '2rem',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              height: '100%'
            }}>
              {getBoonNodesByLaw(selectedTree.id).map((node) => {
                const isLearned = progress.unlockedNodeIds.includes(node.id);
                const isSelected = selectedNodeId === node.id;
                const access = treeAccess[selectedTree.id];
                const isLocked = access?.status === 'locked';
                const eligibility = computeNodeEligibility(node, progress, currency);
                const isUnlockable = !isLearned && eligibility.canUnlock && !isLocked;
                const isBlockedByCost =
                  !isLearned &&
                  (eligibility.insufficientPP || eligibility.insufficientTruthMetal);
                
                return (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    disabled={isLocked}
                    title={
                      isLearned
                        ? 'Unlocked'
                        : eligibility.reason || (isUnlockable ? 'Unlockable' : 'Locked')
                    }
                    style={{
                      width: '80px',
                      height: '80px',
                      transform: 'rotate(45deg)',
                      background: isLearned
                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.1) 100%)'
                        : isUnlockable
                          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.1) 100%)'
                          : isBlockedByCost
                            ? 'linear-gradient(135deg, rgba(217, 119, 6, 0.2) 0%, rgba(217, 119, 6, 0.08) 100%)'
                        : isSelected
                          ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.3) 0%, rgba(234, 179, 8, 0.1) 100%)'
                          : isLocked
                            ? 'rgba(107, 114, 128, 0.2)'
                            : 'rgba(255, 255, 255, 0.1)',
                      border: isSelected
                        ? '2px solid #eab308'
                        : isLearned
                          ? '2px solid #10b981'
                          : isUnlockable
                            ? '2px solid #3b82f6'
                          : isLocked
                            ? '2px solid rgba(107, 114, 128, 0.5)'
                            : '2px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: '0.5rem',
                      cursor: isLocked ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      opacity: isLocked ? 0.5 : 1
                    }}
                  >
                    <div style={{
                      transform: 'rotate(-45deg)',
                      fontSize: '1.65rem',
                      color: isLocked 
                        ? 'rgba(255, 255, 255, 0.3)' 
                        : '#fff'
                    }}>
                      {node.icon || '◇'}
                    </div>
                    {isLearned && (
                      <div style={{
                        position: 'absolute',
                        top: '-0.5rem',
                        right: '-0.5rem',
                        width: '1.5rem',
                        height: '1.5rem',
                        borderRadius: '50%',
                        background: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.875rem',
                        color: '#fff',
                        fontWeight: 'bold',
                        transform: 'rotate(-45deg)'
                      }}>
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{
              color: 'rgba(255, 255, 255, 0.5)',
              textAlign: 'center',
              fontSize: '0.875rem'
            }}>
              No nodes available
            </div>
          )
        ) : (
          <div style={{
            color: 'rgba(255, 255, 255, 0.5)',
            textAlign: 'center',
            fontSize: '0.875rem'
          }}>
            Select a Universal Law
          </div>
        )}
      </div>

      {/* Right: Detail Panel */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%)',
        borderRadius: '0.75rem',
        border: '2px solid rgba(234, 179, 8, 0.3)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {selectedNode ? (
          <div style={{
            padding: '1.5rem',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            color: '#fff',
            overflowY: 'auto'
          }}>
            {/* Skill Title */}
            <div style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <span>{selectedNode.icon || '◇'}</span>
              <span>{selectedNode.title}</span>
            </div>

            {/* Law Info */}
            {selectedTree && (
              <div style={{
                marginBottom: '1.5rem',
                padding: '0.75rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(255, 255, 255, 0.6)',
                  marginBottom: '0.25rem'
                }}>
                  {selectedTree.title}
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontStyle: 'italic'
                }}>
                  {selectedTree.description}
                </div>
              </div>
            )}

            {/* Node Details */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{
                fontSize: '0.875rem',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: '0.75rem'
              }}>
                Boon Effect
              </h3>
              <p style={{
                fontSize: '1rem',
                lineHeight: '1.6',
                color: 'rgba(255, 255, 255, 0.9)'
              }}>
                {selectedNode.description}
              </p>
            </div>

            {/* Requirements */}
            {!isNodeLearned && (
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <h4 style={{
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(255, 255, 255, 0.6)',
                  marginBottom: '0.5rem'
                }}>
                  Requirements
                </h4>
                <ul style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0
                }}>
                  <li style={{
                    fontSize: '0.875rem',
                    color: selectedEligibility?.insufficientPP ? '#fca5a5' : 'rgba(255, 255, 255, 0.8)',
                    marginBottom: '0.25rem',
                    paddingLeft: '1rem',
                    position: 'relative'
                  }}>
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      color: 'rgba(255, 255, 255, 0.5)'
                    }}>•</span>
                    Cost: ⚡ {selectedNode.costPP.toLocaleString()} PP
                  </li>
                  <li style={{
                    fontSize: '0.875rem',
                    color: selectedEligibility?.insufficientTruthMetal ? '#fca5a5' : 'rgba(255, 255, 255, 0.8)',
                    marginBottom: '0.25rem',
                    paddingLeft: '1rem',
                    position: 'relative'
                  }}>
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      color: 'rgba(255, 255, 255, 0.5)'
                    }}>•</span>
                    Cost: 🔩 {selectedNode.costTruthMetalShards.toLocaleString()} Truth Metal
                  </li>
                  {selectedNode.prerequisites.length > 0 && (
                    <li style={{
                      fontSize: '0.875rem',
                      color: (selectedEligibility?.missingPrerequisites.length || 0) > 0
                        ? '#fca5a5'
                        : 'rgba(255, 255, 255, 0.8)',
                      marginBottom: '0.25rem',
                      paddingLeft: '1rem',
                      position: 'relative'
                    }}>
                      <span style={{
                        position: 'absolute',
                        left: 0,
                        color: 'rgba(255, 255, 255, 0.5)'
                      }}>•</span>
                      Prerequisites: {selectedNode.prerequisites.length} node(s)
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Learn Status */}
            {isNodeLearned ? (
              <div style={{
                padding: '1rem',
                background: 'rgba(16, 185, 129, 0.2)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                textAlign: 'center',
                color: '#10b981',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontSize: '0.875rem'
              }}>
                ✓ Learned
              </div>
            ) : (
              <HoldToUnlockButton
                onUnlock={handleLearn}
                disabled={!canLearn || unlockBusy}
              />
            )}
            {unlockFeedback && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)' }}>
                {unlockFeedback}
              </div>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />
          </div>
        ) : (
          <div style={{
            padding: '2rem',
            color: 'rgba(255, 255, 255, 0.7)',
            textAlign: 'center',
            fontSize: '0.875rem'
          }}>
            Select a skill to view details
          </div>
        )}
      </div>
    </div>
  );
};

