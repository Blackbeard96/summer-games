import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';

interface Artifact {
  id: string;
  name: string;
  slot: 'head' | 'chest' | 'ring1' | 'ring2' | 'ring3' | 'ring4' | 'legs' | 'shoes' | 'jacket';
  stats?: {
    [key: string]: number;
  };
  level?: number;
  image?: string;
}

interface EquippedArtifacts {
  head?: Artifact | null;
  chest?: Artifact | null;
  ring1?: Artifact | null;
  ring2?: Artifact | null;
  ring3?: Artifact | null;
  ring4?: Artifact | null;
  legs?: Artifact | null;
  shoes?: Artifact | null;
  jacket?: Artifact | null;
}

const Artifacts: React.FC = () => {
  const { currentUser } = useAuth();
  const { unlockElementalMoves } = useBattle();
  const [equippedArtifacts, setEquippedArtifacts] = useState<EquippedArtifacts>({});
  const [availableArtifacts, setAvailableArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [artifactsUnlocked, setArtifactsUnlocked] = useState(false);
  const [showElementalRingModal, setShowElementalRingModal] = useState(false);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    const checkArtifactsUnlocked = async () => {
      try {
        // Check if Chapter 8 is completed
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const challenge8Completed = userData.chapters?.[1]?.challenges?.['ep1-view-power-card']?.isCompleted;
          
          // Also check if artifacts_unlocked artifact exists
          const studentRef = doc(db, 'students', currentUser.uid);
          const studentDoc = await getDoc(studentRef);
          const studentData = studentDoc.exists() ? studentDoc.data() : {};
          const hasArtifactsUnlocked = studentData?.artifacts?.artifacts_unlocked === true;
          
          setArtifactsUnlocked(challenge8Completed || hasArtifactsUnlocked);
        }

        // Load equipped artifacts
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          let loadedEquipped = studentData.equippedArtifacts || {};
          
          // If player has chosen an element and has the ring artifact but it's not equipped, auto-equip it
          const hasElementalRing = studentData.artifacts?.elemental_ring_level_1 === true;
          const chosenElement = studentData.artifacts?.chosen_element || studentData.elementalAffinity;
          
          if (hasElementalRing && chosenElement && !loadedEquipped.ring1) {
            // Auto-equip the Elemental Ring to Ring 1 slot
            const elementName = chosenElement.charAt(0).toUpperCase() + chosenElement.slice(1);
            const elementalRing: Artifact = {
              id: 'elemental-ring-level-1',
              name: `Elemental Ring: ${elementName} (Level 1)`,
              slot: 'ring1',
              level: 1,
              image: '/images/Elemental Ring.png',
              stats: {}
            };
            
            loadedEquipped = {
              ...loadedEquipped,
              ring1: elementalRing
            };
            
            // Save the equipped ring to the database
            await updateDoc(studentRef, {
              equippedArtifacts: loadedEquipped
            });
          }
          
          setEquippedArtifacts(loadedEquipped);
          // Available artifacts will be loaded from a separate collection or computed from owned artifacts
          // For now, initialize as empty array
          setAvailableArtifacts([]);
          
          // Check if player has Elemental Ring and hasn't chosen an element yet
          const hasSeenModal = studentData.artifacts?.elemental_ring_modal_seen === true;
          
          // Show modal if they have the ring but haven't chosen an element
          if (hasElementalRing && !chosenElement && !hasSeenModal) {
            setShowElementalRingModal(true);
          }
        }
      } catch (error) {
        console.error('Error checking artifacts unlock status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkArtifactsUnlocked();
  }, [currentUser]);

  const slotConfig = [
    { key: 'head' as const, label: 'Head', icon: '👑' },
    { key: 'chest' as const, label: 'Chest/Top', icon: '🦺' },
    { key: 'ring1' as const, label: 'Ring 1', icon: '💍' },
    { key: 'ring2' as const, label: 'Ring 2', icon: '💍' },
    { key: 'ring3' as const, label: 'Ring 3', icon: '💍' },
    { key: 'ring4' as const, label: 'Ring 4', icon: '💍' },
    { key: 'legs' as const, label: 'Legs/Bottom', icon: '👖' },
    { key: 'shoes' as const, label: 'Shoes', icon: '👟' },
    { key: 'jacket' as const, label: 'Jacket', icon: '🧥' },
  ];

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!artifactsUnlocked) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '2rem',
          borderRadius: '1rem',
          marginBottom: '2rem'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒 Artifacts System Locked</h1>
          <p style={{ fontSize: '1.125rem', opacity: 0.9 }}>
            Complete Chapter 1 - Challenge 8: "Artifacts and Elements" to unlock the Artifacts System.
          </p>
        </div>
      </div>
    );
  }

  // Calculate total stats from equipped artifacts
  const calculateTotalStats = () => {
    const totalStats: { [key: string]: number } = {};
    Object.values(equippedArtifacts).forEach((artifact) => {
      if (artifact && artifact.stats) {
        Object.entries(artifact.stats).forEach(([stat, value]) => {
          const numValue = typeof value === 'number' ? value : 0;
          totalStats[stat] = (totalStats[stat] || 0) + numValue;
        });
      }
    });
    return totalStats;
  };

  const totalStats = calculateTotalStats();
  const hasEquippedArtifacts = Object.values(equippedArtifacts).some(artifact => artifact !== null && artifact !== undefined);

  const handleElementSelection = async (element: string) => {
    if (!currentUser || selectedElement) return; // Prevent multiple selections
    
    setSelectedElement(element);
    
    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        const elementLower = element.toLowerCase();
        
        // Create the Elemental Ring artifact object
        const elementalRing: Artifact = {
          id: 'elemental-ring-level-1',
          name: `Elemental Ring: ${element} (Level 1)`,
          slot: 'ring1',
          level: 1,
          image: '/images/Elemental Ring.png',
          stats: {} // No stat bonuses, just the perk
        };
        
        // Update equipped artifacts - equip to Ring 1 slot
        const currentEquipped = studentData.equippedArtifacts || {};
        const updatedEquippedArtifacts = {
          ...currentEquipped,
          ring1: elementalRing
        };
        
        // Update student data with chosen element and equipped ring
        const updatedArtifacts = {
          ...(studentData.artifacts || {}),
          elemental_ring_level_1: true,
          elemental_ring_modal_seen: true,
          chosen_element: elementLower
        };
        
        // Update elementalAffinity if not already set
        const updateData: any = {
          artifacts: updatedArtifacts,
          equippedArtifacts: updatedEquippedArtifacts
        };
        
        if (!studentData.elementalAffinity) {
          updateData.elementalAffinity = elementLower;
        }
        
        await updateDoc(studentRef, updateData);
        
        // Update local state
        setEquippedArtifacts(updatedEquippedArtifacts);
        
        // Unlock elemental moves for the chosen element
        await unlockElementalMoves(elementLower);
        
        // Close modal after a brief delay to show success
        setTimeout(() => {
          setShowElementalRingModal(false);
          alert(`🔥 ${element} elemental moves unlocked! You can now use ${element} moves in battle!`);
        }, 500);
      }
    } catch (error) {
      console.error('Error selecting element:', error);
      alert('Failed to select element. Please try again.');
      setSelectedElement(null);
    }
  };

  const handleCloseElementalRingModal = async () => {
    if (!currentUser || selectedElement) return; // Don't allow closing if element is already selected
    
    try {
      // Mark modal as seen (but element not chosen yet)
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        const updatedArtifacts = {
          ...(studentData.artifacts || {}),
          elemental_ring_modal_seen: true
        };
        
        await updateDoc(studentRef, {
          artifacts: updatedArtifacts
        });
      }
    } catch (error) {
      console.error('Error marking Elemental Ring modal as seen:', error);
    }
    
    setShowElementalRingModal(false);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Elemental Ring Reward Modal */}
      {showElementalRingModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '2rem',
          animation: 'fadeIn 0.3s ease-in-out'
        }}>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { transform: translateY(30px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            @keyframes pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.05); }
            }
            @keyframes glow {
              0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.5); }
              50% { box-shadow: 0 0 30px rgba(102, 126, 234, 0.8); }
            }
          `}</style>
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '1.5rem',
            padding: '2.5rem',
            maxWidth: '600px',
            width: '100%',
            color: 'white',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            textAlign: 'center',
            animation: 'slideUp 0.4s ease-out',
            position: 'relative'
          }}>
            {/* Close button - only show if element not selected */}
            {!selectedElement && (
              <button
                onClick={handleCloseElementalRingModal}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '2rem',
                  height: '2rem',
                  color: 'white',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ×
              </button>
            )}
            
            {/* Elemental Ring Image */}
            <div style={{
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'center',
              animation: selectedElement ? 'pulse 1s ease-in-out infinite' : 'glow 2s ease-in-out infinite'
            }}>
              <img
                src="/images/Elemental Ring.png"
                alt="Elemental Ring"
                style={{
                  width: '200px',
                  height: 'auto',
                  borderRadius: '0.5rem',
                  border: '3px solid rgba(255, 255, 255, 0.3)'
                }}
              />
            </div>
            
            {/* Title */}
            <h2 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
            }}>
              Elemental Ring: Level 1
            </h2>
            
            {/* Question */}
            <p style={{
              fontSize: '1.25rem',
              lineHeight: 1.6,
              opacity: 0.95,
              marginBottom: '2rem',
              fontWeight: '500'
            }}>
              Which element most aligns with your nature?
            </p>
            
            {/* Element Selection Buttons */}
            {!selectedElement ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                {['Fire', 'Water', 'Earth', 'Air'].map((element) => {
                  const elementColors: { [key: string]: { bg: string; hover: string; icon: string } } = {
                    Fire: { bg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', hover: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)', icon: '🔥' },
                    Water: { bg: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', hover: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)', icon: '💧' },
                    Earth: { bg: 'linear-gradient(135deg, #84cc16 0%, #65a30d 100%)', hover: 'linear-gradient(135deg, #a3e635 0%, #84cc16 100%)', icon: '🌍' },
                    Air: { bg: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)', hover: 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)', icon: '💨' }
                  };
                  
                  const colors = elementColors[element] || elementColors.Fire;
                  
                  return (
                    <button
                      key={element}
                      onClick={() => handleElementSelection(element)}
                      style={{
                        background: colors.bg,
                        border: 'none',
                        borderRadius: '0.75rem',
                        padding: '1.25rem',
                        color: 'white',
                        fontSize: '1.125rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = colors.hover;
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = colors.bg;
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                      }}
                    >
                      <span style={{ fontSize: '2rem' }}>{colors.icon}</span>
                      <span>{element}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  {selectedElement === 'Fire' && '🔥'} 
                  {selectedElement === 'Water' && '💧'} 
                  {selectedElement === 'Earth' && '🌍'} 
                  {selectedElement === 'Air' && '💨'} 
                  {' '}{selectedElement} Element Selected!
                </div>
                <p style={{
                  fontSize: '1rem',
                  opacity: 0.95,
                  marginTop: '0.5rem'
                }}>
                  Unlocking {selectedElement.toLowerCase()} elemental moves...
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          fontWeight: 'bold',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.5rem'
        }}>
          💎 Artifacts System
        </h1>
        <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
          Equip artifacts to enhance your character's stats and abilities.
        </p>
      </div>

      {/* Split Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        minHeight: '600px'
      }}>
        {/* Left Side: Equipment Slots */}
        <div style={{
          background: '#f9fafb',
          borderRadius: '1rem',
          padding: '1.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            color: '#374151'
          }}>
            Equipment Slots
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '1rem'
          }}>
            {slotConfig.map((slot) => {
              const equipped = equippedArtifacts[slot.key];
              return (
                <div
                  key={slot.key}
                  style={{
                    background: equipped ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' : 'white',
                    border: `2px solid ${equipped ? '#3b82f6' : '#d1d5db'}`,
                    borderRadius: '0.75rem',
                    padding: '1.25rem',
                    textAlign: 'center',
                    minHeight: '150px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {equipped && equipped.image ? (
                    <div style={{ 
                      marginBottom: '0.5rem',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      width: '100%',
                      height: '80px'
                    }}>
                      <img
                        src={equipped.image}
                        alt={equipped.name}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '80px',
                          objectFit: 'contain',
                          borderRadius: '0.25rem'
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                      {slot.icon}
                    </div>
                  )}
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: 'bold',
                    marginBottom: '0.5rem',
                    color: equipped ? '#1e40af' : '#6b7280'
                  }}>
                    {slot.label}
                  </div>
                  {equipped ? (
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#1e40af',
                      fontWeight: '600',
                      textAlign: 'center'
                    }}>
                      {equipped.name}
                    </div>
                  ) : (
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      fontStyle: 'italic'
                    }}>
                      Empty Slot
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Stats and Perks */}
        <div style={{
          background: '#f9fafb',
          borderRadius: '1rem',
          padding: '1.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            color: '#374151'
          }}>
            Stat Changes & Perks
          </h2>
          
          {!hasEquippedArtifacts ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>
                💎
              </div>
              <p style={{ fontSize: '1rem', fontStyle: 'italic' }}>
                No artifacts equipped. Equip artifacts to see stat changes and perks here.
              </p>
            </div>
          ) : (
            <div>
              {/* Total Stats */}
              {Object.keys(totalStats).length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    marginBottom: '1rem',
                    color: '#374151'
                  }}>
                    Total Stat Bonuses
                  </h3>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    {Object.entries(totalStats).map(([stat, value]) => (
                      <div
                        key={stat}
                        style={{
                          background: 'white',
                          padding: '0.75rem 1rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span style={{
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          color: '#374151',
                          textTransform: 'capitalize'
                        }}>
                          {stat.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span style={{
                          fontSize: '0.875rem',
                          fontWeight: 'bold',
                          color: '#10b981'
                        }}>
                          +{value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Equipped Artifacts Details */}
              <div>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                  color: '#374151'
                }}>
                  Equipped Artifacts
                </h3>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}>
                  {slotConfig.map((slot) => {
                    const equipped = equippedArtifacts[slot.key];
                    if (!equipped) return null;

                    return (
                      <div
                        key={slot.key}
                        style={{
                          background: 'white',
                          border: '1px solid #3b82f6',
                          borderRadius: '0.75rem',
                          padding: '1rem'
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginBottom: '0.75rem'
                        }}>
                          <div style={{ fontSize: '1.5rem' }}>
                            {slot.icon}
                          </div>
                          <div>
                            <div style={{
                              fontSize: '0.875rem',
                              fontWeight: 'bold',
                              color: '#1e40af'
                            }}>
                              {equipped.name}
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280'
                            }}>
                              {slot.label}
                            </div>
                          </div>
                        </div>
                        {equipped.stats && Object.keys(equipped.stats).length > 0 && (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid #e5e7eb'
                          }}>
                            {Object.entries(equipped.stats).map(([stat, value]) => (
                              <div
                                key={stat}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  fontSize: '0.75rem'
                                }}
                              >
                                <span style={{ color: '#6b7280', textTransform: 'capitalize' }}>
                                  {stat.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                                <span style={{ color: '#10b981', fontWeight: '600' }}>
                                  +{value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Show perk for Elemental Ring */}
                        {equipped.id === 'elemental-ring-level-1' && (
                          <div style={{
                            marginTop: '0.75rem',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid #e5e7eb'
                          }}>
                            <div style={{
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              color: '#9333ea',
                              marginBottom: '0.25rem'
                            }}>
                              Perk:
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              fontStyle: 'italic'
                            }}>
                              {(() => {
                                // Extract element from name (e.g., "Elemental Ring: Fire (Level 1)" -> "Fire")
                                const elementMatch = equipped.name.match(/Elemental Ring: (\w+)/);
                                const element = elementMatch ? elementMatch[1] : 'Element';
                                return `Grants access to ${element} element moves`;
                              })()}
                            </div>
                          </div>
                        )}
                        {equipped.level && (
                          <div style={{
                            marginTop: '0.5rem',
                            fontSize: '0.75rem',
                            color: '#6b7280'
                          }}>
                            Level: {equipped.level}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Perks Section */}
              {(() => {
                // Check if Elemental Ring is equipped
                const elementalRing = equippedArtifacts.ring1;
                if (elementalRing && elementalRing.id === 'elemental-ring-level-1') {
                  const elementMatch = elementalRing.name.match(/Elemental Ring: (\w+)/);
                  const element = elementMatch ? elementMatch[1] : 'Element';
                  
                  return (
                    <div style={{ marginTop: '2rem' }}>
                      <h3 style={{
                        fontSize: '1.125rem',
                        fontWeight: 'bold',
                        marginBottom: '1rem',
                        color: '#374151'
                      }}>
                        Active Perks
                      </h3>
                      <div style={{
                        background: 'white',
                        border: '1px solid #9333ea',
                        borderRadius: '0.75rem',
                        padding: '1rem'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginBottom: '0.5rem'
                        }}>
                          <div style={{ fontSize: '1.5rem' }}>💍</div>
                          <div>
                            <div style={{
                              fontSize: '0.875rem',
                              fontWeight: 'bold',
                              color: '#9333ea'
                            }}>
                              {elementalRing.name}
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              marginTop: '0.25rem'
                            }}>
                              Grants access to {element} element moves
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Artifacts;

