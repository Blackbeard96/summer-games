import React, { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, getDocs, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface Badge {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  criteria?: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  category: 'challenge' | 'achievement' | 'special' | 'admin';
}

interface Student {
  id: string;
  displayName: string;
  email?: string;
  badges?: Array<{ id: string; name: string; imageUrl: string; description: string; earnedAt: Date }>;
}

const BadgeManager: React.FC = () => {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Form state for creating new badges
  const [newBadge, setNewBadge] = useState({
    name: '',
    description: '',
    criteria: '',
    rarity: 'common' as const,
    category: 'achievement' as const,
    imageFile: null as File | null
  });

  useEffect(() => {
    fetchBadges();
    fetchStudents();
  }, []);

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
        imageFile: null
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

      const newBadgeEntry = {
        id: badge.id,
        name: badge.name,
        imageUrl: badge.imageUrl,
        description: badge.description,
        earnedAt: new Date()
      };

      let successCount = 0;
      let skippedCount = 0;
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
          await updateDoc(studentRef, {
            badges: [...currentBadges, newBadgeEntry]
          });

          // Update local state
          setStudents(prev => prev.map(s => 
            s.id === studentId 
              ? { ...s, badges: [...(s.badges || []), newBadgeEntry] }
              : s
          ));

          successCount++;
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
      if (errors.length > 0) {
        message += ` ${errors.length} error${errors.length > 1 ? 's' : ''} occurred.`;
        console.error('Errors:', errors);
      }
      
      if (message) {
        alert(message);
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
              {badge.criteria && (
                <p style={{ color: '#9ca3af', fontSize: '0.75rem', fontStyle: 'italic' }}>
                  Criteria: {badge.criteria}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BadgeManager; 