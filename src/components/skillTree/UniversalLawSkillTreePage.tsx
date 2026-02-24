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
  UNIVERSAL_LAW_TREES, 
  getAllLawTrees,
  getLawTreeById,
  getSkillById
} from '../../data/universalLawTrees';
import { 
  getAllLawTreeAccess, 
  LawTreeAccess,
  canLearnNode 
} from '../../utils/universalLawGating';
import { 
  getLearnedNodeIds, 
  learnUniversalLawNode 
} from '../../utils/skillStateService';
import { HoldToUnlockButton } from './HoldToUnlockButton';

interface UniversalLawSkillTreePageProps {
  userId: string;
}

export const UniversalLawSkillTreePage: React.FC<UniversalLawSkillTreePageProps> = ({
  userId
}) => {
  const { currentUser } = useAuth();
  const [selectedLawId, setSelectedLawId] = useState<UniversalLawId | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [learnedNodeIds, setLearnedNodeIds] = useState<string[]>([]);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Load user data and learned nodes
  useEffect(() => {
    if (!userId) return;

    const userRef = doc(db, 'users', userId);
    const unsubscribeUser = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        setUserData(doc.data());
      }
    });

    const loadLearnedNodes = async () => {
      try {
        const learned = await getLearnedNodeIds(userId);
        setLearnedNodeIds(learned);
        setLoading(false);
      } catch (error) {
        console.error('Error loading learned nodes:', error);
        setLoading(false);
      }
    };

    loadLearnedNodes();

    return () => {
      unsubscribeUser();
    };
  }, [userId]);

  // Get access status for all trees
  const treeAccess = useMemo(() => {
    if (!userData) return {};
    return getAllLawTreeAccess(userData, learnedNodeIds);
  }, [userData, learnedNodeIds]);

  // Get selected tree
  const selectedTree = useMemo(() => {
    if (!selectedLawId) return null;
    return getLawTreeById(selectedLawId);
  }, [selectedLawId]);

  // Get selected node
  const selectedNode = useMemo(() => {
    if (!selectedTree || !selectedNodeId) return null;
    return selectedTree.nodes.find(n => n.nodeId === selectedNodeId) || null;
  }, [selectedTree, selectedNodeId]);

  // Get selected skill
  const selectedSkill = useMemo(() => {
    if (!selectedNode) return null;
    return getSkillById(selectedNode.skillId);
  }, [selectedNode]);

  // Check if selected node is learned
  const isNodeLearned = useMemo(() => {
    return selectedNodeId ? learnedNodeIds.includes(selectedNodeId) : false;
  }, [selectedNodeId, learnedNodeIds]);

  // Check if selected node can be learned
  const canLearn = useMemo(() => {
    if (!selectedNode || !userData || isNodeLearned) return false;
    const result = canLearnNode(selectedNode.nodeId, userData, learnedNodeIds);
    return result.canLearn;
  }, [selectedNode, userData, learnedNodeIds, isNodeLearned]);

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
        if (firstAvailable.nodes.length > 0) {
          setSelectedNodeId(firstAvailable.nodes[0].nodeId);
        }
      } else {
        // Select first tree even if locked (to show locked state)
        setSelectedLawId(trees[0]?.id || null);
      }
    }
  }, [selectedLawId, loading, userData, treeAccess]);

  // Auto-select first node when tree changes
  useEffect(() => {
    if (selectedTree && selectedTree.nodes.length > 0 && !selectedNodeId) {
      setSelectedNodeId(selectedTree.nodes[0].nodeId);
    }
  }, [selectedTree, selectedNodeId]);

  // Handle learn
  const handleLearn = async () => {
    if (!selectedNode || !canLearn) return;
    
    try {
      const success = await learnUniversalLawNode(userId, selectedNode.nodeId, learnedNodeIds);
      if (success) {
        setLearnedNodeIds([...learnedNodeIds, selectedNode.nodeId]);
      } else {
        console.error('Failed to learn node');
      }
    } catch (error) {
      console.error('Error learning node:', error);
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
                if (tree.nodes.length > 0) {
                  setSelectedNodeId(tree.nodes[0].nodeId);
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
          selectedTree.nodes.length > 0 ? (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '2rem',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              height: '100%'
            }}>
              {selectedTree.nodes.map((node) => {
                const skill = getSkillById(node.skillId);
                const isLearned = learnedNodeIds.includes(node.nodeId);
                const isSelected = selectedNodeId === node.nodeId;
                const access = treeAccess[selectedTree.id];
                const isLocked = access?.status === 'locked';
                
                return (
                  <button
                    key={node.nodeId}
                    onClick={() => setSelectedNodeId(node.nodeId)}
                    disabled={isLocked}
                    style={{
                      width: '80px',
                      height: '80px',
                      transform: 'rotate(45deg)',
                      background: isLearned
                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.1) 100%)'
                        : isSelected
                          ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.3) 0%, rgba(234, 179, 8, 0.1) 100%)'
                          : isLocked
                            ? 'rgba(107, 114, 128, 0.2)'
                            : 'rgba(255, 255, 255, 0.1)',
                      border: isSelected
                        ? '2px solid #eab308'
                        : isLearned
                          ? '2px solid #10b981'
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
                      fontSize: '2rem',
                      color: isLocked 
                        ? 'rgba(255, 255, 255, 0.3)' 
                        : '#fff'
                    }}>
                      {skill?.icon.value || '?'}
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
              {selectedTree.id === 'divine_oneness' 
                ? 'Coming soon'
                : 'No nodes available'}
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
        {selectedSkill && selectedNode ? (
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
              <span style={{ fontSize: '2rem' }}>{selectedSkill.icon.value}</span>
              <span>{selectedSkill.name}</span>
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

            {/* In-Game Section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{
                fontSize: '0.875rem',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: '0.75rem'
              }}>
                In-Game Effect
              </h3>
              <p style={{
                fontSize: '1rem',
                lineHeight: '1.6',
                color: 'rgba(255, 255, 255, 0.9)'
              }}>
                {selectedSkill.inGame.summary}
              </p>
            </div>

            {/* IRL Section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{
                fontSize: '0.875rem',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: '0.75rem'
              }}>
                Real-World Application
              </h3>
              <p style={{
                fontSize: '1rem',
                lineHeight: '1.6',
                marginBottom: '0.5rem',
                color: 'rgba(255, 255, 255, 0.9)'
              }}>
                {selectedSkill.irl.summary}
              </p>
              <p style={{
                fontSize: '0.875rem',
                lineHeight: '1.5',
                color: 'rgba(255, 255, 255, 0.7)',
                fontStyle: 'italic'
              }}>
                {selectedSkill.irl.exampleUse}
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
                  {selectedTree?.rrCandyRequired && (
                    <li style={{
                      fontSize: '0.875rem',
                      color: 'rgba(255, 255, 255, 0.8)',
                      marginBottom: '0.25rem',
                      paddingLeft: '1rem',
                      position: 'relative'
                    }}>
                      <span style={{
                        position: 'absolute',
                        left: 0,
                        color: 'rgba(255, 255, 255, 0.5)'
                      }}>•</span>
                      RR Candy: {selectedTree.rrCandyRequired === 'config' ? 'Config (Kon)' :
                                 selectedTree.rrCandyRequired === 'on_off' ? 'On/Off (Luz)' :
                                 selectedTree.rrCandyRequired === 'up_down' ? 'Up/Down (Brinx)' : selectedTree.rrCandyRequired}
                    </li>
                  )}
                  {selectedTree?.availableAfterChapter && (
                    <li style={{
                      fontSize: '0.875rem',
                      color: 'rgba(255, 255, 255, 0.8)',
                      marginBottom: '0.25rem',
                      paddingLeft: '1rem',
                      position: 'relative'
                    }}>
                      <span style={{
                        position: 'absolute',
                        left: 0,
                        color: 'rgba(255, 255, 255, 0.5)'
                      }}>•</span>
                      Complete Chapter {selectedTree.availableAfterChapter}
                    </li>
                  )}
                  {selectedNode.requiresNodeIds.length > 0 && (
                    <li style={{
                      fontSize: '0.875rem',
                      color: 'rgba(255, 255, 255, 0.8)',
                      marginBottom: '0.25rem',
                      paddingLeft: '1rem',
                      position: 'relative'
                    }}>
                      <span style={{
                        position: 'absolute',
                        left: 0,
                        color: 'rgba(255, 255, 255, 0.5)'
                      }}>•</span>
                      Learn prerequisite nodes
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
                disabled={!canLearn}
              />
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

