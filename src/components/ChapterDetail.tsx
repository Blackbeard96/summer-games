import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, getDoc, collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Chapter, ChapterChallenge, Team, Rival, Veil, ReflectionEcho, EthicsArchetype } from '../types/chapters';
import { getLevelFromXP } from '../utils/leveling';

interface ChapterDetailProps {
  chapter: Chapter;
  onBack: () => void;
}

const ChapterDetail: React.FC<ChapterDetailProps> = ({ chapter, onBack }) => {
  const { currentUser } = useAuth();
  const [userProgress, setUserProgress] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completingChallenge, setCompletingChallenge] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'challenges' | 'team' | 'rival' | 'veil' | 'ethics'>('overview');

  useEffect(() => {
    if (!currentUser) return;

    const fetchUserData = async () => {
      try {
        // Fetch user progress from 'users' collection
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          setUserProgress(userDoc.data());
        }

        // Fetch student data from 'students' collection (for manifest, etc.)
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          setStudentData(studentDoc.data());
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [currentUser]);

  const getRequirementStatus = (requirement: any) => {
    switch (requirement.type) {
      case 'manifest':
        return studentData?.manifest?.manifestId || studentData?.manifestationType;
      case 'artifact':
        return userProgress?.artifact?.identified;
      case 'team':
        return userProgress?.team;
      case 'rival':
        return userProgress?.rival;
      case 'veil':
        return userProgress?.veil?.isConfronted;
      case 'reflection':
        return userProgress?.reflectionEcho;
      case 'wisdom':
        return userProgress?.wisdomPoints && userProgress.wisdomPoints.length > 0;
      case 'ethics':
        return userProgress?.ethics && userProgress.ethics.length >= requirement.value;
      case 'leadership':
        return userProgress?.leadership?.role;
      case 'profile':
        return studentData?.displayName && studentData?.photoURL;
      default:
        return false;
    }
  };

  const getChallengeStatus = (challenge: ChapterChallenge) => {
    if (!userProgress) return 'locked';
    
    const chapterProgress = userProgress.chapters?.[chapter.id];
    if (!chapterProgress) return 'locked';
    
    const challengeProgress = chapterProgress.challenges?.[challenge.id];
    if (challengeProgress?.isCompleted) return 'completed';
    
    // Check if challenge is pending approval
    if (pendingSubmissions[challenge.id]) return 'pending';
    
    // Check if challenge requirements are met
    const requirementsMet = challenge.requirements.every(req => {
      switch (req.type) {
        case 'artifact':
          return userProgress.artifact?.identified;
        case 'team':
          return userProgress.team;
        case 'rival':
          return userProgress.rival;
        case 'veil':
          return userProgress.veil?.isConfronted;
        case 'reflection':
          return userProgress.reflectionEcho;
        case 'wisdom':
          return userProgress.wisdomPoints && userProgress.wisdomPoints.length > 0;
        case 'ethics':
          return userProgress.ethics && userProgress.ethics.length >= req.value;
        case 'manifest':
          // Check if player has chosen a manifest (from students collection)
          return studentData?.manifest?.manifestId || studentData?.manifestationType;
        case 'leadership':
          return userProgress.leadership?.role;
        case 'profile':
          return studentData?.displayName && studentData?.photoURL;
        default:
          return true;
      }
    });
    
    // Ensure chapter is active before allowing challenge completion
    if (!chapterProgress.isActive) {
      return 'locked';
    }
    
    return requirementsMet ? 'available' : 'locked';
  };

  // Add state to track pending submissions
  const [pendingSubmissions, setPendingSubmissions] = useState<{[key: string]: boolean}>({});

  // Fetch pending submissions on component mount
  useEffect(() => {
    if (!currentUser) return;

    const fetchPendingSubmissions = async () => {
      try {
        const submissionsQuery = query(
          collection(db, 'challengeSubmissions'),
          where('userId', '==', currentUser.uid),
          where('chapterId', '==', chapter.id),
          where('status', '==', 'pending')
        );
        const submissionsSnapshot = await getDocs(submissionsQuery);
        
        const pending: {[key: string]: boolean} = {};
        submissionsSnapshot.forEach(doc => {
          const data = doc.data();
          pending[data.challengeId] = true;
        });
        
        setPendingSubmissions(pending);
      } catch (error) {
        console.error('Error fetching pending submissions:', error);
      }
    };

    fetchPendingSubmissions();
  }, [currentUser, chapter.id]);

  const handleChallengeComplete = async (challenge: ChapterChallenge) => {
    if (!currentUser) return;

    // Special handling for profile update challenge
    if (challenge.id === 'ch1-update-profile') {
      const hasDisplayName = studentData?.displayName;
      const hasPhotoURL = studentData?.photoURL;
      
      if (!hasDisplayName || !hasPhotoURL) {
        alert('Please complete your profile first by adding a display name and uploading an avatar image.');
        return;
      }
    }

    // Special handling for manifest declaration challenge
    if (challenge.id === 'ch1-declare-manifest') {
      const hasManifest = studentData?.manifest?.manifestId || studentData?.manifestationType;
      
      if (!hasManifest) {
        alert('Please choose your manifestation type first. You can do this from your profile or dashboard.');
        return;
      }
    }

    setCompletingChallenge(challenge.id);

    try {
      // Check if challenge is already submitted or completed
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      const userProgress = userDoc.exists() ? userDoc.data() : {};
      
      if (userProgress.chapters?.[chapter.id]?.challenges?.[challenge.id]?.isCompleted) {
        alert('This challenge has already been completed!');
        setCompletingChallenge(null);
        return;
      }

      // Check if already submitted for approval
      const submissionsQuery = query(
        collection(db, 'challengeSubmissions'),
        where('userId', '==', currentUser.uid),
        where('chapterId', '==', chapter.id),
        where('challengeId', '==', challenge.id),
        where('status', 'in', ['pending', 'approved'])
      );
      const submissionsSnapshot = await getDocs(submissionsQuery);
      
      if (!submissionsSnapshot.empty) {
        alert('This challenge has already been submitted for approval!');
        setCompletingChallenge(null);
        return;
      }

      // Submit challenge for admin approval
      await addDoc(collection(db, 'challengeSubmissions'), {
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        photoURL: currentUser.photoURL || '',
        chapterId: chapter.id,
        challengeId: challenge.id,
        challengeName: challenge.title,
        challengeDescription: challenge.description,
        submissionType: 'chapter_challenge',
        status: 'pending',
        submittedAt: serverTimestamp(),
        xpReward: challenge.rewards.find(r => r.type === 'xp')?.value || 0,
        ppReward: challenge.rewards.find(r => r.type === 'pp')?.value || 0,
        rewards: challenge.rewards
      });

      alert(`🎉 Challenge "${challenge.title}" submitted for admin approval! You'll be notified when it's reviewed.`);
      
      // Update pending submissions list
      setPendingSubmissions(prev => ({ ...prev, [challenge.id]: true }));
      
    } catch (error) {
      console.error('Error submitting challenge:', error);
      alert('Failed to submit challenge. Please try again.');
    } finally {
      setCompletingChallenge(null);
    }
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Chapter Info Card */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '2rem',
        borderRadius: '1rem',
        color: 'white',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          {chapter.title}
        </h3>
        <p style={{ fontSize: '1.125rem', fontStyle: 'italic', marginBottom: '1rem', opacity: 0.9 }}>
          {chapter.subtitle}
        </p>
        <p style={{ lineHeight: '1.6', marginBottom: '1.5rem' }}>
          {chapter.description}
        </p>
        
        {/* Chapter Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ 
            background: 'rgba(255,255,255,0.1)', 
            padding: '1rem', 
            borderRadius: '0.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.25rem' }}>Story Arc</div>
            <div style={{ fontWeight: 'bold' }}>{chapter.storyArc}</div>
          </div>
          <div style={{ 
            background: 'rgba(255,255,255,0.1)', 
            padding: '1rem', 
            borderRadius: '0.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.25rem' }}>Team Size</div>
            <div style={{ fontWeight: 'bold' }}>{chapter.teamSize} player{chapter.teamSize > 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>

      {/* Requirements & Rewards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {/* Requirements Card */}
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '1rem',
          padding: '1.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
        }}>
          <h4 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            color: '#374151',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.5rem' }}>🔑</span>
            Requirements
          </h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {chapter.requirements.map((req, index) => {
              const isMet = getRequirementStatus(req);
              return (
                <li key={index} style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  background: isMet ? '#f0fdf4' : '#f9fafb',
                  borderRadius: '0.5rem',
                  borderLeft: `4px solid ${isMet ? '#22c55e' : '#3b82f6'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ 
                    color: isMet ? '#22c55e' : '#3b82f6', 
                    fontWeight: 'bold',
                    fontSize: '1.125rem'
                  }}>
                    {isMet ? '✅' : '⏳'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      color: '#374151',
                      fontWeight: isMet ? 'bold' : 'normal'
                    }}>
                      {req.description}
                    </div>
                    {!isMet && (
                      <div style={{ 
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        marginTop: '0.25rem'
                      }}>
                        Requirement not met
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Rewards Card */}
        <div style={{
          background: 'white',
          border: '2px solid #10b981',
          borderRadius: '1rem',
          padding: '1.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
        }}>
          <h4 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            color: '#374151',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.5rem' }}>🏆</span>
            Rewards
          </h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {chapter.rewards.map((reward, index) => (
              <li key={index} style={{
                padding: '0.75rem',
                marginBottom: '0.5rem',
                background: '#f0fdf4',
                borderRadius: '0.5rem',
                borderLeft: '4px solid #10b981',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ color: '#10b981', fontWeight: 'bold' }}>⭐</span>
                {reward.description}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const renderChallenges = () => (
    <div className="space-y-6">
      <h3 style={{ 
        fontSize: '1.5rem', 
        fontWeight: 'bold', 
        color: '#374151',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span style={{ fontSize: '1.75rem' }}>⚔️</span>
        Chapter Challenges
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {chapter.challenges.map((challenge) => {
          const status = getChallengeStatus(challenge);
          
          const getStatusColor = () => {
            switch (status) {
              case 'completed': return { bg: '#dcfce7', border: '#22c55e', text: '#166534' };
              case 'pending': return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' };
              case 'available': return { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' };
              default: return { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' };
            }
          };
          
          const colors = getStatusColor();
          
          return (
            <div
              key={challenge.id}
              style={{
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                borderRadius: '1rem',
                padding: '1.5rem',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: 'bold', 
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    {challenge.title}
                  </h4>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280',
                    lineHeight: '1.5'
                  }}>
                    {challenge.description}
                  </p>
                </div>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  background: colors.border,
                  color: 'white',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}>
                  {status === 'completed' ? '✅ Completed' : 
                   status === 'pending' ? '⏳ Pending' : 
                   status === 'available' ? '🔓 Available' : '🔒 Locked'}
                </span>
              </div>

                          {status === 'available' && (
              <button
                onClick={() => handleChallengeComplete(challenge)}
                disabled={completingChallenge === challenge.id}
                style={{
                  background: completingChallenge === challenge.id 
                    ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                    : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  fontWeight: 'bold',
                  cursor: completingChallenge === challenge.id ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
                  opacity: completingChallenge === challenge.id ? 0.7 : 1
                }}
                onMouseOver={(e) => {
                  if (completingChallenge !== challenge.id) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.4)';
                  }
                }}
                onMouseOut={(e) => {
                  if (completingChallenge !== challenge.id) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(59, 130, 246, 0.3)';
                  }
                }}
              >
                {completingChallenge === challenge.id ? (
                  <>
                    <span style={{ marginRight: '0.5rem' }}>⏳</span>
                    Submitting...
                  </>
                ) : (
                  <>
                    <span style={{ marginRight: '0.5rem' }}>🎯</span>
                    Submit for Approval
                  </>
                )}
              </button>
            )}

            {status === 'pending' && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid #f59e0b',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                color: '#92400e',
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }}>
                ⏳ Submitted for admin approval. You'll be notified when it's reviewed.
              </div>
            )}

              {status === 'completed' && (
                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid #22c55e',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  color: '#166534',
                  fontSize: '0.875rem',
                  fontWeight: 'bold'
                }}>
                  ✅ Completed on {userProgress?.chapters?.[chapter.id]?.challenges?.[challenge.id]?.completionDate?.toDate?.()?.toLocaleDateString() || 'Unknown date'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTeamSection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Team Formation</h3>
      {chapter.teamSize > 1 ? (
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-gray-700 mb-4">
            This chapter requires a team of {chapter.teamSize} players. 
            {!userProgress?.team ? ' You need to form a team to proceed.' : ' Your team is ready.'}
          </p>
          
          {!userProgress?.team ? (
            <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
              Form Team
            </button>
          ) : (
            <div className="text-green-700">
              ✓ Team formed: {userProgress.team.name}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-gray-600">This is a solo chapter. No team formation required.</p>
        </div>
      )}
    </div>
  );

  const renderRivalSection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Rival Selection</h3>
      {!userProgress?.rival ? (
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-gray-700 mb-4">
            Choose your rival - an enemy or internalized foe to overcome in this chapter.
          </p>
          <button className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors">
            Select Rival
          </button>
        </div>
      ) : (
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-gray-700 mb-2">
            <strong>Current Rival:</strong> {userProgress.rival.name}
          </div>
          <p className="text-sm text-gray-600 mb-2">{userProgress.rival.description}</p>
          {userProgress.rival.isDefeated ? (
            <div className="text-green-700">✓ Rival defeated</div>
          ) : (
            <div className="text-red-700">⚠ Rival not yet defeated</div>
          )}
        </div>
      )}
    </div>
  );

  const renderVeilSection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">The Veil</h3>
      {!userProgress?.veil ? (
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-gray-700 mb-4">
            Enter the inmost cave to confront your greatest fear or internal block.
          </p>
          <button className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 transition-colors">
            Confront the Veil
          </button>
        </div>
      ) : (
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-gray-700 mb-2">
            <strong>Your Veil:</strong> {userProgress.veil.name}
          </div>
          <p className="text-sm text-gray-600 mb-2">{userProgress.veil.description}</p>
          {userProgress.veil.isConfronted ? (
            <div className="text-green-700">✓ Veil confronted</div>
          ) : (
            <div className="text-purple-700">⚠ Veil not yet confronted</div>
          )}
        </div>
      )}
    </div>
  );

  const renderEthicsSection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">The Ethics of Life</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['Believe', 'Listen', 'Speak', 'Grow', 'Let Go', 'Give'].map((ethic) => (
          <div key={ethic} className="bg-white p-4 rounded-lg border">
            <h4 className="font-semibold text-gray-800 mb-2">{ethic}</h4>
            <p className="text-sm text-gray-600 mb-3">
              {ethic === 'Believe' && 'Blind Devotion vs. Discernment'}
              {ethic === 'Listen' && 'Silencing vs. Hearing Truth'}
              {ethic === 'Speak' && 'Lies vs. Responsibility'}
              {ethic === 'Grow' && 'Comfort vs. Discomfort'}
              {ethic === 'Let Go' && 'Grasping vs. Surrender'}
              {ethic === 'Give' && 'Selfishness vs. Service'}
            </p>
            <button className="bg-indigo-500 text-white px-3 py-1 rounded text-sm hover:bg-indigo-600 transition-colors">
              Face {ethic}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-xl p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent"></div>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Loading Chapter Details</h3>
          <p className="text-gray-500 text-center">Preparing your chapter information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-xl p-8">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={onBack}
          style={{
            color: '#3b82f6',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            fontWeight: '500',
            fontSize: '1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'color 0.2s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.color = '#1d4ed8'}
          onMouseOut={(e) => e.currentTarget.style.color = '#3b82f6'}
        >
          <span style={{ marginRight: '0.5rem', fontSize: '1.25rem' }}>←</span>
          Back to Player's Journey
        </button>
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '2rem',
          borderRadius: '1rem',
          color: 'white',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '4rem',
              height: '4rem',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px solid rgba(255,255,255,0.3)'
            }}>
              <span style={{ 
                color: 'white', 
                fontSize: '1.5rem', 
                fontWeight: 'bold' 
              }}>
                {chapter.id}
              </span>
            </div>
            <div>
              <h2 style={{ 
                fontSize: '2rem', 
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                textShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                Chapter {chapter.id}: {chapter.title}
              </h2>
              <p style={{ 
                fontSize: '1.125rem', 
                fontStyle: 'italic',
                opacity: 0.9
              }}>
                {chapter.subtitle}
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ 
              fontSize: '0.875rem', 
              opacity: 0.8, 
              marginBottom: '0.25rem' 
            }}>
              Story Arc
            </div>
            <div style={{
              fontWeight: 'bold',
              background: 'rgba(255,255,255,0.2)',
              padding: '0.5rem 1rem',
              borderRadius: '9999px',
              border: '1px solid rgba(255,255,255,0.3)'
            }}>
              {chapter.storyArc}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ 
        borderBottom: '2px solid #e5e7eb', 
        marginBottom: '2rem',
        background: '#f9fafb',
        borderRadius: '0.75rem 0.75rem 0 0',
        padding: '0.5rem 0.5rem 0 0.5rem'
      }}>
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { id: 'overview', label: 'Overview', icon: '📋' },
            { id: 'challenges', label: 'Challenges', icon: '⚔️' },
            ...(chapter.teamSize > 1 ? [{ id: 'team', label: 'Team', icon: '👥' }] : []),
            { id: 'rival', label: 'Rival', icon: '⚡' },
            { id: 'veil', label: 'Veil', icon: '🕯️' },
            ...(chapter.id === 8 ? [{ id: 'ethics', label: 'Ethics', icon: '⚖️' }] : [])
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '0.75rem 1rem',
                borderBottom: `3px solid ${activeTab === tab.id ? '#3b82f6' : 'transparent'}`,
                fontWeight: '500',
                fontSize: '0.875rem',
                borderRadius: '0.5rem 0.5rem 0 0',
                transition: 'all 0.2s ease',
                background: activeTab === tab.id ? 'white' : 'transparent',
                color: activeTab === tab.id ? '#3b82f6' : '#6b7280',
                border: 'none',
                cursor: 'pointer',
                boxShadow: activeTab === tab.id ? '0 -2px 4px rgba(0,0,0,0.1)' : 'none'
              }}
              onMouseOver={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#374151';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
                }
              }}
              onMouseOut={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#6b7280';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{ marginRight: '0.5rem' }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'challenges' && renderChallenges()}
        {activeTab === 'team' && renderTeamSection()}
        {activeTab === 'rival' && renderRivalSection()}
        {activeTab === 'veil' && renderVeilSection()}
        {activeTab === 'ethics' && renderEthicsSection()}
      </div>
    </div>
  );
};

export default ChapterDetail; 