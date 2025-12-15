import React, { useState, useEffect, useRef } from 'react';
import PlayerCard from './PlayerCard';

interface SquadMember {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  level: number;
  xp: number;
  powerPoints?: number;
  manifest?: string | { manifestId?: string; manifestationType?: string; [key: string]: any };
  rarity?: number;
  style?: string;
  description?: string;
  cardBgColor?: string;
  role?: string;
  isLeader?: boolean;
  isAdmin?: boolean;
}

interface Squad {
  id: string;
  name: string;
  members: SquadMember[];
  leader: string;
  createdAt: Date;
  description?: string;
  maxMembers: number;
  abbreviation?: string;
}

interface SquadCardProps {
  squad: Squad;
  onInvite?: (squadId: string) => void;
  onJoin?: (squadId: string) => void;
  onLeave?: (squadId: string) => void;
  onPromoteToAdmin?: (squadId: string, memberId: string) => void;
  onDemoteFromAdmin?: (squadId: string, memberId: string) => void;
  onRemoveMember?: (squadId: string, memberId: string) => void;
  onUpdateAbbreviation?: (squadId: string, abbreviation: string) => void;
  currentUserId?: string;
  isCurrentUserInSquad?: boolean;
}

const SquadCard: React.FC<SquadCardProps> = ({
  squad,
  onInvite,
  onJoin,
  onLeave,
  onPromoteToAdmin,
  onDemoteFromAdmin,
  onRemoveMember,
  onUpdateAbbreviation,
  currentUserId,
  isCurrentUserInSquad
}) => {
  const [showMemberActions, setShowMemberActions] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<{ memberId: string; memberName: string } | null>(null);
  const [editingAbbreviation, setEditingAbbreviation] = useState(false);
  const [abbreviationValue, setAbbreviationValue] = useState(squad.abbreviation || '');
  const dropdownRef = useRef<HTMLDivElement>(null);
  

  const currentMember = squad.members.find(m => m.uid === currentUserId);
  const isLeader = currentMember?.isLeader === true;
  const isAdmin = currentMember?.isAdmin === true || isLeader; // Leaders are also admins
  const canJoin = !isCurrentUserInSquad && squad.members.length < squad.maxMembers;
  
  // Debug logging for invite button visibility
  if (process.env.NODE_ENV === 'development') {
    console.log('SquadCard invite check:', {
      currentUserId,
      squadId: squad.id,
      currentMember: currentMember ? { uid: currentMember.uid, isLeader: currentMember.isLeader, isAdmin: currentMember.isAdmin } : null,
      isLeader,
      isAdmin,
      canInvite: (isLeader || isAdmin) && onInvite,
      hasOnInvite: !!onInvite
    });
  }

  // Sync abbreviation value when squad changes
  useEffect(() => {
    setAbbreviationValue(squad.abbreviation || '');
  }, [squad.abbreviation]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMemberActions(null);
      }
    };

    if (showMemberActions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMemberActions]);

  const handleMemberAction = (action: string, memberId: string) => {
    setShowMemberActions(null);
    
    switch (action) {
      case 'promote':
        onPromoteToAdmin?.(squad.id, memberId);
        break;
      case 'demote':
        onDemoteFromAdmin?.(squad.id, memberId);
        break;
      case 'remove':
        onRemoveMember?.(squad.id, memberId);
        break;
    }
  };

  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '0.75rem',
      padding: '1.5rem',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s ease',
      cursor: 'pointer'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
    }}
    >
      {/* Squad Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: '#1f2937',
              margin: 0
            }}>
              {squad.name}
            </h3>
            {squad.abbreviation && (
              <span style={{
                backgroundColor: '#4f46e5',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                letterSpacing: '0.05em'
              }}>
                {squad.abbreviation}
              </span>
            )}
          </div>
          {squad.description && (
            <p style={{
              color: '#6b7280',
              fontSize: '0.875rem',
              margin: 0
            }}>
              {squad.description}
            </p>
          )}
        </div>
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '0.5rem'
        }}>
          <span style={{
            backgroundColor: '#f3f4f6',
            color: '#374151',
            padding: '0.25rem 0.75rem',
            borderRadius: '1rem',
            fontSize: '0.75rem',
            fontWeight: '500'
          }}>
            {squad.members.length}/{squad.maxMembers} Members
          </span>
          
          {isCurrentUserInSquad && (
            <span style={{
              backgroundColor: '#10b981',
              color: 'white',
              padding: '0.25rem 0.75rem',
              borderRadius: '1rem',
              fontSize: '0.75rem',
              fontWeight: '500'
            }}>
              Your Squad
            </span>
          )}
        </div>
      </div>

      {/* Squad Members Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '2rem',
        marginBottom: '1.5rem',
        justifyContent: 'center'
      }}>
        {squad.members.map((member) => {
          // Extract manifest information
          const getManifestInfo = () => {
            if (!member.manifest) return { manifest: 'Unknown', style: 'Fire' };
            
            if (typeof member.manifest === 'string') {
              return { manifest: member.manifest, style: 'Fire' };
            }
            
            if (typeof member.manifest === 'object') {
              const manifestObj = member.manifest as { manifestId?: string; manifestationType?: string; [key: string]: any };
              if (manifestObj.manifestId) {
                return { manifest: manifestObj.manifestId, style: 'Fire' };
              }
              if (manifestObj.manifestationType) {
                return { manifest: manifestObj.manifestationType, style: 'Fire' };
              }
            }
            
            return { manifest: 'Unknown', style: 'Fire' };
          };

          const manifestInfo = getManifestInfo();
          
          return (
            <div key={member.uid} style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              {/* Role Badges */}
              {member.isLeader && (
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  zIndex: 10,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                  👑
                </div>
              )}
              {member.isAdmin && !member.isLeader && (
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  zIndex: 10,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                  ⭐
                </div>
              )}
              
              {/* Player Card */}
              <div style={{
                transform: 'scale(0.8)',
                transformOrigin: 'center top',
                marginBottom: '1rem'
              }}>
                <PlayerCard
                  name={member.displayName}
                  photoURL={member.photoURL || '/default-avatar.png'}
                  powerPoints={member.powerPoints || 0}
                  manifest={manifestInfo.manifest}
                  level={member.level}
                  rarity={member.rarity || 1}
                  style={member.style || manifestInfo.style}
                  description={member.description || `${member.role || 'Member'} of ${squad.name}`}
                  cardBgColor={member.cardBgColor}
                  xp={member.xp}
                  userId={member.uid}
                />
              </div>
              
              {/* Role Label */}
              <div style={{
                fontSize: '0.875rem',
                color: member.isLeader ? '#f59e0b' : member.isAdmin ? '#3b82f6' : '#6b7280',
                fontWeight: '600',
                textAlign: 'center',
                marginTop: '-0.5rem'
              }}>
                {member.isLeader ? 'Leader' : member.isAdmin ? 'Admin' : 'Member'}
              </div>


            </div>
          );
        })}
        
        {/* Empty Slots */}
        {Array.from({ length: squad.maxMembers - squad.members.length }).map((_, index) => {
          const canInvite = (isLeader || isAdmin) && onInvite;
          
          return (
            <div 
              key={`empty-${index}`} 
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backgroundColor: '#f3f4f6',
                borderRadius: '0.5rem',
                border: '2px dashed #d1d5db',
                minHeight: '120px',
                position: 'relative',
                gap: '0.5rem'
              }}
            >
              <div style={{
                fontSize: '2rem',
                color: '#9ca3af',
                marginBottom: '0.25rem'
              }}>
                +
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: '#9ca3af',
                textAlign: 'center',
                marginBottom: canInvite ? '0.5rem' : '0'
              }}>
                Empty Slot
              </div>
              {canInvite && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInvite(squad.id);
                  }}
                  style={{
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#059669';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#10b981';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <span>🤝</span>
                  Invite Player
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Squad Management Section */}
      {isCurrentUserInSquad && (
        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e5e7eb',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          marginTop: '1.5rem'
        }}>
          <h4 style={{
            fontSize: '1.125rem',
            fontWeight: 'bold',
            color: '#1f2937',
            margin: '0 0 1rem 0',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🛠️ Squad Management
          </h4>
          
          {/* Squad Captain Section - Abbreviation Management */}
          {isLeader && (
            <div style={{ 
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem'
            }}>
              <h5 style={{
                fontSize: '1rem',
                fontWeight: '600',
                color: '#374151',
                margin: '0 0 0.75rem 0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                👑 Squad Captain Settings
              </h5>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Squad Abbreviation (up to 4 characters)
                </label>
                {editingAbbreviation ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={abbreviationValue}
                      onChange={(e) => {
                        const value = e.target.value.slice(0, 4);
                        setAbbreviationValue(value);
                      }}
                      maxLength={4}
                      placeholder="ABC1"
                      style={{
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        width: '120px'
                      }}
                    />
                    <button
                      onClick={() => {
                        if (onUpdateAbbreviation) {
                          onUpdateAbbreviation(squad.id, abbreviationValue.trim().toUpperCase());
                        }
                        setEditingAbbreviation(false);
                      }}
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setAbbreviationValue(squad.abbreviation || '');
                        setEditingAbbreviation(false);
                      }}
                      style={{
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{
                      backgroundColor: abbreviationValue ? '#4f46e5' : '#f3f4f6',
                      color: abbreviationValue ? 'white' : '#6b7280',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      letterSpacing: '0.05em',
                      minWidth: '80px',
                      textAlign: 'center'
                    }}>
                      {abbreviationValue || 'Not Set'}
                    </div>
                    <button
                      onClick={() => setEditingAbbreviation(true)}
                      style={{
                        backgroundColor: '#4f46e5',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      {abbreviationValue ? 'Edit' : 'Set Abbreviation'}
                    </button>
                  </div>
                )}
                <p style={{
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  margin: '0.5rem 0 0 0'
                }}>
                  Set a unique abbreviation (up to 4 characters, can include letters, numbers, and symbols) for your squad
                </p>
              </div>
            </div>
          )}

          {/* Member Management */}
          {isAdmin && (
            <div style={{ marginBottom: '1rem' }}>
              <h5 style={{
                fontSize: '1rem',
                fontWeight: '600',
                color: '#374151',
                margin: '0 0 0.75rem 0'
              }}>
                Member Management
              </h5>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem'
              }}>
                {squad.members.map((member) => (
                  <div key={member.uid} style={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <img
                      src={member.photoURL || '/default-avatar.png'}
                      alt={member.displayName}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        objectFit: 'cover'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        color: '#1f2937'
                      }}>
                        {member.displayName}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#6b7280'
                      }}>
                        {member.isLeader ? 'Leader' : member.isAdmin ? 'Admin' : 'Member'}
                      </div>
                    </div>
                    {member.uid !== currentUserId && (
                      <div style={{
                        display: 'flex',
                        gap: '0.25rem'
                      }}>
                        {!member.isAdmin && onPromoteToAdmin && (
                          <button
                            onClick={() => handleMemberAction('promote', member.uid)}
                            style={{
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              fontWeight: '500'
                            }}
                            title="Promote to Admin"
                          >
                            ⭐
                          </button>
                        )}
                        {member.isAdmin && !member.isLeader && onDemoteFromAdmin && (
                          <button
                            onClick={() => handleMemberAction('demote', member.uid)}
                            style={{
                              backgroundColor: '#f59e0b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              fontWeight: '500'
                            }}
                            title="Demote from Admin"
                          >
                            ⬇️
                          </button>
                        )}
                        {onRemoveMember && (
                          <button
                            onClick={() => setShowRemoveConfirm({ memberId: member.uid, memberName: member.displayName })}
                            style={{
                              backgroundColor: '#dc2626',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              fontWeight: '500'
                            }}
                            title="Remove from Squad"
                          >
                            🚫
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Squad Actions */}
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}>
            {isAdmin && onInvite && (
              <button
                onClick={() => onInvite(squad.id)}
                style={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                📨 Invite Players
              </button>
            )}
            {onLeave && (
              <button
                onClick={() => onLeave(squad.id)}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                🚪 Leave Squad
              </button>
            )}
          </div>
        </div>
      )}

      {/* Join Squad Button (for non-members) */}
      {!isCurrentUserInSquad && canJoin && onJoin && (
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          marginTop: '1.5rem',
          textAlign: 'center'
        }}>
          <h4 style={{
            fontSize: '1.125rem',
            fontWeight: 'bold',
            color: '#166534',
            margin: '0 0 1rem 0'
          }}>
            Join This Squad
          </h4>
          <p style={{
            color: '#15803d',
            marginBottom: '1rem'
          }}>
            This squad has {squad.maxMembers - squad.members.length} open slot(s)
          </p>
          <button
            onClick={() => onJoin(squad.id)}
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              margin: '0 auto'
            }}
          >
            🤝 Join Squad
          </button>
                 </div>
       )}

      {/* Remove Confirmation Modal */}
      {showRemoveConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem'
            }}>
              ⚠️
            </div>
            
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: '#1f2937',
              marginBottom: '1rem'
            }}>
              Remove Member
            </h3>
            
            <p style={{
              color: '#6b7280',
              marginBottom: '1.5rem',
              lineHeight: '1.5'
            }}>
              Are you sure you want to remove <strong>{showRemoveConfirm.memberName}</strong> from the squad?
            </p>
            
            <p style={{
              color: '#dc2626',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
              fontStyle: 'italic'
            }}>
              This action cannot be undone. The member will need to be re-invited to rejoin.
            </p>
            
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => setShowRemoveConfirm(null)}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              
              <button
                onClick={() => {
                  handleMemberAction('remove', showRemoveConfirm.memberId);
                  setShowRemoveConfirm(null);
                }}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}
              >
                Remove Member
              </button>
            </div>
          </div>
        </div>
      )}
     </div>
   );
 };

export default SquadCard; 