import React, { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface Badge {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  criteria?: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  category: 'challenge' | 'achievement' | 'special' | 'admin';
  xpReward?: number;
  ppReward?: number;
  artifactRewards?: string[]; // Array of artifact IDs
}

interface Student {
  id: string;
  displayName: string;
  email?: string;
  badges?: Array<{ id: string; name: string; imageUrl: string; description: string; earnedAt: Date; xpReward?: number; ppReward?: number }>;
  xp?: number;
  powerPoints?: number;
}

interface Classroom {
  id: string;
  name: string;
  students?: string[];
}

const BadgeManager: React.FC = () => {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [classroomsLoading, setClassroomsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [classSearchQuery, setClassSearchQuery] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [editingBadgeId, setEditingBadgeId] = useState<string | null>(null);
  const [availableArtifacts, setAvailableArtifacts] = useState<Array<{ id: string; name: string; icon: string }>>([]);

  // Form state for creating new badges
  const [newBadge, setNewBadge] = useState({
    name: '',
    description: '',
    criteria: '',
    rarity: 'common' as const,
    category: 'achievement' as const,
    imageFile: null as File | null,
    xpReward: 0,
    ppReward: 0,
    artifactRewards: [] as string[]
  });

  // Form state for editing badges
  const [editBadge, setEditBadge] = useState<{
    name: string;
    description: string;
    criteria: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    category: 'challenge' | 'achievement' | 'special' | 'admin';
    imageFile: File | null;
    imageUrl: string;
    xpReward: number;
    ppReward: number;
    artifactRewards: string[];
  }>({
    name: '',
    description: '',
    criteria: '',
    rarity: 'common',
    category: 'achievement',
    imageFile: null,
    imageUrl: '',
    xpReward: 0,
    ppReward: 0,
    artifactRewards: []
  });

  useEffect(() => {
    fetchBadges();
    fetchStudents();
    fetchClassrooms();
    fetchArtifacts();
  }, []);

  // Debug: Log when classrooms state changes
  useEffect(() => {
    console.log('[BadgeManager] Classrooms state updated:', {
      count: classrooms.length,
      classrooms: classrooms.map(c => ({ id: c.id, name: c.name, studentCount: c.students?.length || 0 }))
    });
  }, [classrooms]);

  const fetchClassrooms = async () => {
    setClassroomsLoading(true);
    try {
      console.log('[BadgeManager] Fetching classrooms...');
      const classroomsSnapshot = await getDocs(collection(db, 'classrooms'));
      console.log('[BadgeManager] Classrooms snapshot size:', classroomsSnapshot.size);
      
      const classroomsList = classroomsSnapshot.docs.map(doc => {
        const data = doc.data();
        const classroomName = data.name || data.className || doc.id; // Try multiple name fields
        console.log('[BadgeManager] Classroom:', { 
          id: doc.id, 
          name: classroomName, 
          students: data.students?.length || 0,
          allFields: Object.keys(data)
        });
        return {
          id: doc.id,
          name: classroomName, // Fallback to doc.id if name is missing
          students: data.students || [] // Ensure students is always an array
        };
      }) as Classroom[];
      
      console.log('[BadgeManager] Classrooms list:', classroomsList);
      setClassrooms(classroomsList);
      
      if (classroomsList.length === 0) {
        console.warn('[BadgeManager] No classrooms found in database. Check if classrooms collection exists and has documents.');
      } else {
        console.log(`[BadgeManager] Successfully loaded ${classroomsList.length} classroom(s)`);
      }
    } catch (error) {
      console.error('[BadgeManager] Error fetching classrooms:', error);
      // Set empty array on error to prevent UI issues
      setClassrooms([]);
    } finally {
      setClassroomsLoading(false);
    }
  };

  const fetchArtifacts = () => {
    // Artifacts are defined in Marketplace.tsx - using the same list
    const artifacts = [
      { id: 'checkin-free', name: 'Get Out of Check-in Free', icon: '🎫' },
      { id: 'shield', name: 'Shield', icon: '🛡️' },
      { id: 'health-potion-25', name: 'Health Potion (25)', icon: '🧪' },
      { id: 'lunch-mosley', name: 'Lunch on Mosley', icon: '🍽️' },
      { id: 'forge-token', name: 'Forge Token', icon: '🛠️' },
      { id: 'uxp-credit-1', name: '+1 UXP Credit', icon: '📕' },
      { id: 'uxp-credit', name: '+2 UXP Credit', icon: '📚' },
      { id: 'uxp-credit-4', name: '+4 UXP Credit', icon: '📖' },
      { id: 'double-pp', name: 'Double PP Boost', icon: '⚡' },
      { id: 'skip-the-line', name: 'Skip the Line', icon: '🚀' },
      { id: 'work-extension', name: 'Work Extension', icon: '📝' },
      { id: 'instant-a', name: 'Instant A', icon: '⭐' },
      { id: 'blaze-ring', name: 'Blaze Ring', icon: '🔥' },
      { id: 'terra-ring', name: 'Terra Ring', icon: '🌍' },
      { id: 'aqua-ring', name: 'Aqua Ring', icon: '💧' },
      { id: 'air-ring', name: 'Air Ring', icon: '💨' }
    ];
    setAvailableArtifacts(artifacts);
  };

  const fetchBadges = async () => {
    try {
      const badgesSnapshot = await getDocs(collection(db, 'badges'));
      const badgesList = badgesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Badge[];
      setBadges(badgesList);
    } catch (error) {
      console.error('Error fetching badges:', error);
    }
  };

  const fetchStudents = async () => {
    try {
      const studentsSnapshot = await getDocs(collection(db, 'students'));
      const studentsList = studentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Student[];
      setStudents(studentsList);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching students:', error);
      setLoading(false);
    }
  };

  const handleCreateBadge = async () => {
    if (!newBadge.name || !newBadge.description || !newBadge.imageFile) {
      alert('Please fill in all required fields and select an image.');
      return;
    }

    const xpReward = Number(newBadge.xpReward) || 0;
    const ppReward = Number(newBadge.ppReward) || 0;

    setUploading(true);
    try {
      // Upload image to Firebase Storage
      const imageRef = ref(storage, `badges/${Date.now()}_${newBadge.imageFile.name}`);
      await uploadBytes(imageRef, newBadge.imageFile);
      const imageUrl = await getDownloadURL(imageRef);

      // Create badge document
      const badgeData = {
        name: newBadge.name,
        description: newBadge.description,
        criteria: newBadge.criteria,
        rarity: newBadge.rarity,
        category: newBadge.category,
        imageUrl,
        xpReward,
        ppReward,
        artifactRewards: newBadge.artifactRewards || [],
        createdAt: new Date()
      };

      await addDoc(collection(db, 'badges'), badgeData);
      
      // Reset form and refresh badges
      setNewBadge({
        name: '',
        description: '',
        criteria: '',
        rarity: 'common',
        category: 'achievement',
        imageFile: null,
        xpReward: 0,
        ppReward: 0,
        artifactRewards: []
      });
      setShowCreateForm(false);
      await fetchBadges();
      alert('Badge created successfully!');
    } catch (error) {
      console.error('Error creating badge:', error);
      alert('Failed to create badge. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudents(prev => 
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAll = () => {
    // Filter students based on search query for "Select All"
    const filteredStudents = students.filter(student => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase().trim();
      const name = (student.displayName || '').toLowerCase();
      const email = (student.email || '').toLowerCase();
      return name.includes(query) || email.includes(query);
    });

    const filteredStudentIds = filteredStudents.map(s => s.id);
    const allFilteredSelected = filteredStudentIds.length > 0 && 
      filteredStudentIds.every(id => selectedStudents.includes(id));
    
    if (allFilteredSelected) {
      // Deselect all filtered students
      setSelectedStudents(prev => prev.filter(id => !filteredStudentIds.includes(id)));
    } else {
      // Select all filtered students (merge with existing selections)
      setSelectedStudents(prev => {
        const newSelection = [...prev];
        filteredStudentIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  const handleClassSelect = (classId: string) => {
    if (!classId) {
      setSelectedClassId('');
      return;
    }

    const classroom = classrooms.find(c => c.id === classId);
    if (!classroom) return;

    setSelectedClassId(classId);

    // Get all student IDs from the selected class
    const classStudentIds = classroom.students || [];

    // Add all class students to selected students (merge with existing)
    setSelectedStudents(prev => {
      const newSelection = [...prev];
      classStudentIds.forEach(studentId => {
        if (!newSelection.includes(studentId)) {
          newSelection.push(studentId);
        }
      });
      return newSelection;
    });
  };

  const handleClassDeselect = () => {
    if (!selectedClassId) return;

    const classroom = classrooms.find(c => c.id === selectedClassId);
    if (!classroom) return;

    const classStudentIds = classroom.students || [];

    // Remove all class students from selected students
    setSelectedStudents(prev => prev.filter(id => !classStudentIds.includes(id)));
    setSelectedClassId('');
  };

  const issueBadgeToStudent = async () => {
    if (selectedStudents.length === 0 || !selectedBadge) {
      alert('Please select at least one student and a badge.');
      return;
    }

    setIssuing(true);
    try {
      const badge = badges.find(b => b.id === selectedBadge);
      if (!badge) {
        alert('Badge not found.');
        setIssuing(false);
        return;
      }

      const xpReward = badge.xpReward ?? 0;
      const ppReward = badge.ppReward ?? 0;

      const newBadgeEntry = {
        id: badge.id,
        name: badge.name,
        imageUrl: badge.imageUrl,
        description: badge.description,
        earnedAt: new Date(),
        xpReward,
        ppReward
      };

      let successCount = 0;
      let skippedCount = 0;
      let totalXpAwarded = 0;
      let totalPPAwarded = 0;
      const errors: string[] = [];

      // Issue badge to all selected students
      for (const studentId of selectedStudents) {
        try {
          const student = students.find(s => s.id === studentId);
          if (!student) {
            errors.push(`Student ${studentId} not found`);
            continue;
          }

          const currentBadges = student.badges || [];
          const badgeAlreadyEarned = currentBadges.some(b => b.id === selectedBadge);
          
          if (badgeAlreadyEarned) {
            skippedCount++;
            continue;
          }

          const studentRef = doc(db, 'students', studentId);
          const userRef = doc(db, 'users', studentId);

          // Get current artifacts
          const studentDoc = await getDoc(studentRef);
          const studentData = studentDoc.exists() ? studentDoc.data() : {};
          const currentStudentArtifacts = studentData.artifacts || {};
          const updatedStudentArtifacts = { ...currentStudentArtifacts };

          // Grant artifact rewards if any
          const artifactRewards = badge.artifactRewards || [];
          if (artifactRewards.length > 0) {
            artifactRewards.forEach((artifactId: string) => {
              const artifact = availableArtifacts.find(a => a.id === artifactId);
              if (artifact) {
                updatedStudentArtifacts[artifactId] = true;
                updatedStudentArtifacts[`${artifactId}_purchase`] = {
                  id: artifactId,
                  name: artifact.name,
                  obtainedAt: serverTimestamp(),
                  fromBadge: badge.id,
                  quantity: 1
                };
              }
            });
          }

          await updateDoc(studentRef, {
            badges: [...currentBadges, newBadgeEntry],
            xp: increment(xpReward),
            powerPoints: increment(ppReward),
            ...(artifactRewards.length > 0 && { artifacts: updatedStudentArtifacts })
          });

          try {
            const userDoc = await getDoc(userRef);
            const userData = userDoc.exists() ? userDoc.data() : {};
            const currentUserArtifacts = Array.isArray(userData.artifacts) ? userData.artifacts : [];
            const newUserArtifacts: any[] = [];

            // Add artifact rewards to users collection
            if (artifactRewards.length > 0) {
              artifactRewards.forEach((artifactId: string) => {
                const artifact = availableArtifacts.find(a => a.id === artifactId);
                if (artifact && !currentUserArtifacts.find((art: any) => 
                  (typeof art === 'string' && art === artifactId) ||
                  (typeof art === 'object' && (art.id === artifactId || art.name === artifact.name))
                )) {
                  newUserArtifacts.push({
                    id: artifactId,
                    name: artifact.name,
                    icon: artifact.icon,
                    category: 'special',
                    rarity: 'common',
                    purchasedAt: new Date(),
                    used: false,
                    fromBadge: badge.id
                  });
                }
              });
            }

            const userUpdates: any = {
              xp: increment(xpReward),
              powerPoints: increment(ppReward)
            };

            if (newUserArtifacts.length > 0) {
              userUpdates.artifacts = [...currentUserArtifacts, ...newUserArtifacts];
            }

            await updateDoc(userRef, userUpdates);
          } catch (userUpdateError) {
            console.warn(`BadgeManager: Unable to update user doc for ${studentId}`, userUpdateError);
          }

          // Get current student data for accurate PP tracking
          const currentStudentPP = studentData.powerPoints || 0;
          const newStudentPP = currentStudentPP + ppReward;
          
          // Create milestone event for badge earning
          try {
            const { createLiveFeedMilestone } = await import('../services/liveFeed');
            const { getLevelFromXP } = await import('../utils/leveling');
            const studentData = await getDoc(doc(db, 'students', studentId));
            const userData = await getDoc(doc(db, 'users', studentId));
            
            if (studentData.exists() && userData.exists()) {
              const student = studentData.data();
              const user = userData.data();
              const xp = student.xp || 0;
              const level = getLevelFromXP(xp);
              
              await createLiveFeedMilestone(
                studentId,
                user.displayName || 'Unknown',
                user.photoURL || undefined,
                user.role || undefined,
                level,
                'badge_earned',
                {
                  badgeName: badge.name,
                  badgeId: badge.id,
                  xpReward,
                  ppReward
                },
                badge.id // Use badge ID as refId for deduplication
              );
            }
          } catch (milestoneError) {
            console.error('Error creating badge milestone:', milestoneError);
            // Don't fail badge award if milestone creation fails
          }

          await addDoc(collection(db, 'students', studentId, 'badgeNotifications'), {
            badgeId: badge.id,
            badgeName: badge.name,
            description: badge.description,
            imageUrl: badge.imageUrl,
            xpReward,
            ppReward,
            originalPP: currentStudentPP,
            newPP: newStudentPP,
            awardedAt: serverTimestamp(),
            read: false,
            // Include artifact rewards info if any
            artifactRewards: artifactRewards.length > 0 ? artifactRewards.map((artifactId: string) => {
              const artifact = availableArtifacts.find(a => a.id === artifactId);
              return artifact ? {
                id: artifactId,
                name: artifact.name,
                icon: artifact.icon
              } : null;
            }).filter(Boolean) : []
          });

          // Update local state
          setStudents(prev => prev.map(s => 
            s.id === studentId 
              ? { 
                  ...s, 
                  badges: [...(s.badges || []), newBadgeEntry],
                  xp: (s.xp || 0) + xpReward,
                  powerPoints: (s.powerPoints || 0) + ppReward
                }
              : s
          ));

          successCount++;
          totalXpAwarded += xpReward;
          totalPPAwarded += ppReward;
        } catch (error) {
          console.error(`Error issuing badge to student ${studentId}:`, error);
          const studentName = students.find(s => s.id === studentId)?.displayName || studentId;
          errors.push(`Failed to issue badge to ${studentName}`);
        }
      }

      // Show results
      let message = '';
      if (successCount > 0) {
        message = `Badge issued successfully to ${successCount} student${successCount > 1 ? 's' : ''}.`;
      }
      if (skippedCount > 0) {
        message += ` ${skippedCount} student${skippedCount > 1 ? 's' : ''} already had this badge.`;
      }
      const totalArtifactsAwarded = (badge.artifactRewards || []).length * successCount;
      if (totalXpAwarded > 0 || totalPPAwarded > 0 || totalArtifactsAwarded > 0) {
        const rewardsParts = [] as string[];
        if (totalXpAwarded > 0) rewardsParts.push(`${totalXpAwarded} XP`);
        if (totalPPAwarded > 0) rewardsParts.push(`${totalPPAwarded} PP`);
        if (totalArtifactsAwarded > 0) rewardsParts.push(`${totalArtifactsAwarded} artifact${totalArtifactsAwarded > 1 ? 's' : ''}`);
        message += ` Awarded ${rewardsParts.join(', ')} in total.`;
      }
      if (errors.length > 0) {
        message += ` ${errors.length} error${errors.length > 1 ? 's' : ''} occurred.`;
        console.error('Errors:', errors);
      }
      
      if (message) {
        alert(message.trim());
      }

      // Clear selections
      setSelectedStudents([]);
      setSelectedBadge('');
    } catch (error) {
      console.error('Error issuing badge:', error);
      alert('Failed to issue badge. Please try again.');
    } finally {
      setIssuing(false);
    }
  };

  const handleEditBadge = (badge: Badge) => {
    setEditingBadgeId(badge.id);
    setEditBadge({
      name: badge.name,
      description: badge.description,
      criteria: badge.criteria || '',
      rarity: badge.rarity,
      category: badge.category,
      imageFile: null,
      imageUrl: badge.imageUrl,
      xpReward: badge.xpReward || 0,
      ppReward: badge.ppReward || 0,
      artifactRewards: badge.artifactRewards || []
    });
  };

  const handleCancelEdit = () => {
    setEditingBadgeId(null);
    setEditBadge({
      name: '',
      description: '',
      criteria: '',
      rarity: 'common',
      category: 'achievement',
      imageFile: null,
      imageUrl: '',
      xpReward: 0,
      ppReward: 0,
      artifactRewards: []
    });
  };

  const handleUpdateBadge = async () => {
    if (!editingBadgeId || !editBadge.name || !editBadge.description) {
      alert('Please fill in all required fields.');
      return;
    }

    setUploading(true);
    try {
      const badgeRef = doc(db, 'badges', editingBadgeId);
      let imageUrl = editBadge.imageUrl;

      // Upload new image if one was selected
      if (editBadge.imageFile) {
        const imageRef = ref(storage, `badges/${Date.now()}_${editBadge.imageFile.name}`);
        await uploadBytes(imageRef, editBadge.imageFile);
        imageUrl = await getDownloadURL(imageRef);
      }

      const xpReward = Number(editBadge.xpReward) || 0;
      const ppReward = Number(editBadge.ppReward) || 0;

      await updateDoc(badgeRef, {
        name: editBadge.name,
        description: editBadge.description,
        criteria: editBadge.criteria,
        rarity: editBadge.rarity,
        category: editBadge.category,
        imageUrl,
        xpReward,
        ppReward,
        artifactRewards: editBadge.artifactRewards || [],
        updatedAt: serverTimestamp()
      });

      handleCancelEdit();
      await fetchBadges();
      alert('Badge updated successfully!');
    } catch (error) {
      console.error('Error updating badge:', error);
      alert('Failed to update badge. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return '#6b7280';
      case 'rare': return '#3b82f6';
      case 'epic': return '#8b5cf6';
      case 'legendary': return '#fbbf24';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return <div style={{ padding: '1rem', textAlign: 'center' }}>Loading badge manager...</div>;
  }

  const selectedBadgeDetails = badges.find(badge => badge.id === selectedBadge);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem', color: '#1f2937' }}>
        Badge Manager
      </h1>

      {/* Create Badge Section */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', marginBottom: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>Create New Badge</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              backgroundColor: showCreateForm ? '#6b7280' : '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {showCreateForm ? 'Cancel' : 'Create Badge'}
          </button>
        </div>

        {showCreateForm && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Badge Name *</label>
                <input
                  type="text"
                  value={newBadge.name}
                  onChange={(e) => setNewBadge(prev => ({ ...prev, name: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  placeholder="Enter badge name"
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Description *</label>
                <textarea
                  value={newBadge.description}
                  onChange={(e) => setNewBadge(prev => ({ ...prev, description: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', minHeight: '80px' }}
                  placeholder="Enter badge description"
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Criteria (Optional)</label>
                <input
                  type="text"
                  value={newBadge.criteria}
                  onChange={(e) => setNewBadge(prev => ({ ...prev, criteria: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  placeholder="e.g., Complete 5 challenges"
                />
              </div>
            </div>
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Rarity</label>
                <select
                  value={newBadge.rarity}
                  onChange={(e) => setNewBadge(prev => ({ ...prev, rarity: e.target.value as any }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                >
                  <option value="common">Common</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Category</label>
                <select
                  value={newBadge.category}
                  onChange={(e) => setNewBadge(prev => ({ ...prev, category: e.target.value as any }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                >
                  <option value="achievement">Achievement</option>
                  <option value="challenge">Challenge</option>
                  <option value="special">Special</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>XP Reward</label>
                  <input
                    type="number"
                    min={0}
                    value={newBadge.xpReward}
                    onChange={(e) => setNewBadge(prev => ({ ...prev, xpReward: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>PP Reward</label>
                  <input
                    type="number"
                    min={0}
                    value={newBadge.ppReward}
                    onChange={(e) => setNewBadge(prev => ({ ...prev, ppReward: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                    placeholder="0"
                  />
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Artifact Rewards (Optional)</label>
                <div style={{ 
                  maxHeight: '150px', 
                  overflowY: 'auto', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '0.375rem', 
                  padding: '0.5rem',
                  backgroundColor: '#f9fafb'
                }}>
                  {availableArtifacts.map(artifact => (
                    <label
                      key={artifact.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '0.25rem',
                        marginBottom: '0.25rem'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={newBadge.artifactRewards.includes(artifact.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewBadge(prev => ({
                              ...prev,
                              artifactRewards: [...prev.artifactRewards, artifact.id]
                            }));
                          } else {
                            setNewBadge(prev => ({
                              ...prev,
                              artifactRewards: prev.artifactRewards.filter(id => id !== artifact.id)
                            }));
                          }
                        }}
                        style={{ marginRight: '0.5rem', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>{artifact.icon}</span>
                      <span style={{ fontSize: '0.875rem' }}>{artifact.name}</span>
                    </label>
                  ))}
                </div>
                {newBadge.artifactRewards.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    {newBadge.artifactRewards.length} artifact{newBadge.artifactRewards.length > 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Badge Image *</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewBadge(prev => ({ ...prev, imageFile: e.target.files?.[0] || null }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                />
              </div>
              <button
                onClick={handleCreateBadge}
                disabled={uploading}
                style={{
                  backgroundColor: uploading ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  fontWeight: 'bold',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  width: '100%'
                }}
              >
                {uploading ? 'Creating...' : 'Create Badge'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Issue Badge Section */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', marginBottom: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#4f46e5' }}>Issue Badge to Students</h2>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Select Badge</label>
          <select
            value={selectedBadge}
            onChange={(e) => setSelectedBadge(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', marginBottom: '1rem' }}
          >
            <option value="">Choose a badge...</option>
            {badges.map(badge => (
              <option key={badge.id} value={badge.id}>
                {badge.name} ({badge.rarity})
              </option>
            ))}
          </select>
          {selectedBadgeDetails && (
            <div style={{
              backgroundColor: '#eef2ff',
              border: '1px solid #c7d2fe',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              color: '#312e81'
            }}>
              <strong>Rewards:</strong>{' '}
              {(() => {
                const rewards = [] as string[];
                if ((selectedBadgeDetails.xpReward ?? 0) > 0) rewards.push(`+${selectedBadgeDetails.xpReward} XP`);
                if ((selectedBadgeDetails.ppReward ?? 0) > 0) rewards.push(`+${selectedBadgeDetails.ppReward} PP`);
                if (selectedBadgeDetails.artifactRewards && selectedBadgeDetails.artifactRewards.length > 0) {
                  const artifactNames = selectedBadgeDetails.artifactRewards.map(artifactId => {
                    const artifact = availableArtifacts.find(a => a.id === artifactId);
                    return artifact ? `${artifact.icon} ${artifact.name}` : artifactId;
                  }).join(', ');
                  rewards.push(`${artifactNames}`);
                }
                return rewards.length > 0 ? rewards.join(' • ') : 'No rewards';
              })()}
            </div>
          )}
        </div>

        {/* Class Selection Section */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>Select by Class (Optional)</label>
            <button
              onClick={fetchClassrooms}
              disabled={classroomsLoading}
              style={{
                backgroundColor: classroomsLoading ? '#9ca3af' : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                padding: '0.375rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                cursor: classroomsLoading ? 'not-allowed' : 'pointer'
              }}
              title="Refresh classes list"
            >
              {classroomsLoading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="🔍 Search by class name..."
              value={classSearchQuery}
              onChange={(e) => setClassSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#4f46e5';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>
          <div style={{ 
            maxHeight: '150px', 
            overflowY: 'auto', 
            border: '1px solid #d1d5db', 
            borderRadius: '0.375rem', 
            padding: '0.5rem',
            backgroundColor: 'white'
          }}>
            {(() => {
              if (classroomsLoading) {
                return (
                  <div style={{ padding: '0.5rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                    Loading classes...
                  </div>
                );
              }

              const filteredClassrooms = classrooms.filter(classroom => {
                if (!classSearchQuery.trim()) return true;
                const query = classSearchQuery.toLowerCase().trim();
                const name = (classroom.name || '').toLowerCase();
                return name.includes(query);
              });

              if (filteredClassrooms.length === 0) {
                return (
                  <div style={{ padding: '0.5rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                    {classSearchQuery.trim() 
                      ? 'No classes found matching your search' 
                      : classrooms.length === 0 
                        ? 'No classes available. Create classes in Classroom Management first.' 
                        : 'No classes match your search'}
                  </div>
                );
              }

              return filteredClassrooms.map(classroom => {
                const isSelected = selectedClassId === classroom.id;
                const studentCount = (classroom.students || []).length;
                return (
                  <div
                    key={classroom.id}
                    onClick={() => isSelected ? handleClassDeselect() : handleClassSelect(classroom.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem',
                      marginBottom: '0.25rem',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#eef2ff' : 'white',
                      border: isSelected ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                        {classroom.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        {studentCount} student{studentCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {isSelected && (
                      <div style={{ 
                        color: '#4f46e5', 
                        fontWeight: 'bold',
                        fontSize: '0.875rem',
                        marginLeft: '0.5rem'
                      }}>
                        ✓ Selected
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          {selectedClassId && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#4f46e5', fontWeight: 'bold' }}>
              ✓ Class selected: {classrooms.find(c => c.id === selectedClassId)?.name}
              {' '}
              <button
                onClick={handleClassDeselect}
                style={{
                  color: '#ef4444',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.875rem',
                  marginLeft: '0.5rem'
                }}
              >
                (Deselect)
              </button>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>Select Students</label>
            <button
              onClick={handleSelectAll}
              style={{
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                padding: '0.375rem 0.75rem',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              {(() => {
                const filteredStudents = students.filter(student => {
                  if (!searchQuery.trim()) return true;
                  const query = searchQuery.toLowerCase().trim();
                  const name = (student.displayName || '').toLowerCase();
                  const email = (student.email || '').toLowerCase();
                  return name.includes(query) || email.includes(query);
                });
                const filteredStudentIds = filteredStudents.map(s => s.id);
                const allFilteredSelected = filteredStudentIds.length > 0 && 
                  filteredStudentIds.every(id => selectedStudents.includes(id));
                return allFilteredSelected ? 'Deselect All' : 'Select All';
              })()}
            </button>
          </div>
          
          {/* Search Bar */}
          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="🔍 Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#4f46e5';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {selectedStudents.length > 0 && (
            <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: '#4f46e5', fontWeight: 'bold' }}>
              {selectedStudents.length} student{selectedStudents.length > 1 ? 's' : ''} selected
            </div>
          )}
          <div style={{ 
            maxHeight: '300px', 
            overflowY: 'auto', 
            border: '1px solid #d1d5db', 
            borderRadius: '0.375rem', 
            padding: '0.5rem',
            backgroundColor: '#f9fafb'
          }}>
            {(() => {
              // Filter students based on search query
              const filteredStudents = students.filter(student => {
                if (!searchQuery.trim()) return true;
                const query = searchQuery.toLowerCase().trim();
                const name = (student.displayName || '').toLowerCase();
                const email = (student.email || '').toLowerCase();
                return name.includes(query) || email.includes(query);
              });

              if (filteredStudents.length === 0) {
                return (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                    {searchQuery.trim() ? 'No students found matching your search' : 'No students found'}
                  </div>
                );
              }

              return filteredStudents.map(student => {
                const isSelected = selectedStudents.includes(student.id);
                const hasBadge = selectedBadge && student.badges?.some(b => b.id === selectedBadge);
                return (
                  <div
                    key={student.id}
                    onClick={() => handleStudentToggle(student.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem',
                      marginBottom: '0.25rem',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#eef2ff' : 'white',
                      border: isSelected ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                      transition: 'all 0.2s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleStudentToggle(student.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ marginRight: '0.75rem', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                        {student.displayName || 'Unnamed Student'}
                        {hasBadge && (
                          <span style={{ 
                            marginLeft: '0.5rem', 
                            fontSize: '0.75rem', 
                            color: '#10b981',
                            fontWeight: 'normal'
                          }}>
                            (Already has this badge)
                          </span>
                        )}
                      </div>
                      {student.email && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {student.email}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        <button
          onClick={issueBadgeToStudent}
          disabled={selectedStudents.length === 0 || !selectedBadge || issuing}
          style={{
            backgroundColor: (selectedStudents.length === 0 || !selectedBadge || issuing) ? '#9ca3af' : '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: (selectedStudents.length === 0 || !selectedBadge || issuing) ? 'not-allowed' : 'pointer',
            width: '100%'
          }}
        >
          {issuing ? 'Issuing Badge...' : `Issue Badge to ${selectedStudents.length} Student${selectedStudents.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Existing Badges Display */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', marginBottom: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#4f46e5' }}>Existing Badges</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {badges.map(badge => (
            <div key={badge.id} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <img
                  src={badge.imageUrl}
                  alt={badge.name}
                  style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div>
                  <h3 style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{badge.name}</h3>
                  <span style={{ 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '0.25rem', 
                    fontSize: '0.75rem', 
                    fontWeight: 'bold',
                    backgroundColor: getRarityColor(badge.rarity),
                    color: 'white'
                  }}>
                    {badge.rarity.toUpperCase()}
                  </span>
                </div>
              </div>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{badge.description}</p>
              <div style={{ marginBottom: '0.5rem' }}>
                {(badge.xpReward ?? 0) > 0 || (badge.ppReward ?? 0) > 0 || (badge.artifactRewards && badge.artifactRewards.length > 0) ? (
                  <div>
                    {(badge.xpReward ?? 0) > 0 || (badge.ppReward ?? 0) > 0 ? (
                      <p style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        Rewards: +{badge.xpReward ?? 0} XP • +{badge.ppReward ?? 0} PP
                      </p>
                    ) : null}
                    {badge.artifactRewards && badge.artifactRewards.length > 0 && (
                      <p style={{ color: '#4b5563', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                        Artifacts: {badge.artifactRewards.map(artifactId => {
                          const artifact = availableArtifacts.find(a => a.id === artifactId);
                          return artifact ? `${artifact.icon} ${artifact.name}` : artifactId;
                        }).join(', ')}
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    Rewards: None
                  </p>
                )}
              </div>
              {badge.criteria && (
                <p style={{ color: '#9ca3af', fontSize: '0.75rem', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                  Criteria: {badge.criteria}
                </p>
              )}
              <button
                onClick={() => handleEditBadge(badge)}
                style={{
                  width: '100%',
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  marginTop: '0.5rem'
                }}
              >
                ✏️ Edit Badge
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Badge Modal */}
      {editingBadgeId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={handleCancelEdit}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '2rem',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#4f46e5' }}>
              Edit Badge
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Badge Name *</label>
                  <input
                    type="text"
                    value={editBadge.name}
                    onChange={(e) => setEditBadge(prev => ({ ...prev, name: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                    placeholder="Enter badge name"
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Description *</label>
                  <textarea
                    value={editBadge.description}
                    onChange={(e) => setEditBadge(prev => ({ ...prev, description: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', minHeight: '80px' }}
                    placeholder="Enter badge description"
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Criteria (Optional)</label>
                  <input
                    type="text"
                    value={editBadge.criteria}
                    onChange={(e) => setEditBadge(prev => ({ ...prev, criteria: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                    placeholder="e.g., Complete 5 challenges"
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Current Image</label>
                  {editBadge.imageUrl && (
                    <img
                      src={editBadge.imageUrl}
                      alt="Current badge"
                      style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '1px solid #d1d5db' }}
                    />
                  )}
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>New Image (Optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEditBadge(prev => ({ ...prev, imageFile: e.target.files?.[0] || null }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Leave empty to keep current image
                  </p>
                </div>
              </div>
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Rarity</label>
                  <select
                    value={editBadge.rarity}
                    onChange={(e) => setEditBadge(prev => ({ ...prev, rarity: e.target.value as any }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  >
                    <option value="common">Common</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                  </select>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Category</label>
                  <select
                    value={editBadge.category}
                    onChange={(e) => setEditBadge(prev => ({ ...prev, category: e.target.value as any }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  >
                    <option value="achievement">Achievement</option>
                    <option value="challenge">Challenge</option>
                    <option value="special">Special</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>XP Reward</label>
                    <input
                      type="number"
                      min={0}
                      value={editBadge.xpReward}
                      onChange={(e) => setEditBadge(prev => ({ ...prev, xpReward: Number(e.target.value) }))}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>PP Reward</label>
                    <input
                      type="number"
                      min={0}
                      value={editBadge.ppReward}
                      onChange={(e) => setEditBadge(prev => ({ ...prev, ppReward: Number(e.target.value) }))}
                      style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Artifact Rewards (Optional)</label>
                  <div style={{ 
                    maxHeight: '150px', 
                    overflowY: 'auto', 
                    border: '1px solid #d1d5db', 
                    borderRadius: '0.375rem', 
                    padding: '0.5rem',
                    backgroundColor: '#f9fafb'
                  }}>
                    {availableArtifacts.map(artifact => (
                      <label
                        key={artifact.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.5rem',
                          cursor: 'pointer',
                          borderRadius: '0.25rem',
                          marginBottom: '0.25rem'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <input
                          type="checkbox"
                          checked={editBadge.artifactRewards.includes(artifact.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditBadge(prev => ({
                                ...prev,
                                artifactRewards: [...prev.artifactRewards, artifact.id]
                              }));
                            } else {
                              setEditBadge(prev => ({
                                ...prev,
                                artifactRewards: prev.artifactRewards.filter(id => id !== artifact.id)
                              }));
                            }
                          }}
                          style={{ marginRight: '0.5rem', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>{artifact.icon}</span>
                        <span style={{ fontSize: '0.875rem' }}>{artifact.name}</span>
                      </label>
                    ))}
                  </div>
                  {editBadge.artifactRewards.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                      {editBadge.artifactRewards.length} artifact{editBadge.artifactRewards.length > 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleUpdateBadge}
                    disabled={uploading}
                    style={{
                      flex: 1,
                      backgroundColor: uploading ? '#9ca3af' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.75rem 1.5rem',
                      fontWeight: 'bold',
                      cursor: uploading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {uploading ? 'Updating...' : 'Update Badge'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={uploading}
                    style={{
                      flex: 1,
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.75rem 1.5rem',
                      fontWeight: 'bold',
                      cursor: uploading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BadgeManager; 