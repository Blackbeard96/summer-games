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
  badges?: Array<{ id: string; name: string; imageUrl: string; description: string; earnedAt: Date }>;
}

const BadgeManager: React.FC = () => {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [selectedBadge, setSelectedBadge] = useState<string>('');
  const [uploading, setUploading] = useState(false);

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

  const issueBadgeToStudent = async () => {
    if (!selectedStudent || !selectedBadge) {
      alert('Please select both a student and a badge.');
      return;
    }

    try {
      const badge = badges.find(b => b.id === selectedBadge);
      if (!badge) return;

      const studentRef = doc(db, 'students', selectedStudent);
      const student = students.find(s => s.id === selectedStudent);
      
      if (!student) return;

      const currentBadges = student.badges || [];
      const badgeAlreadyEarned = currentBadges.some(b => b.id === selectedBadge);
      
      if (badgeAlreadyEarned) {
        alert('This student already has this badge!');
        return;
      }

      const newBadgeEntry = {
        id: badge.id,
        name: badge.name,
        imageUrl: badge.imageUrl,
        description: badge.description,
        earnedAt: new Date()
      };

      await updateDoc(studentRef, {
        badges: [...currentBadges, newBadgeEntry]
      });

      // Update local state
      setStudents(prev => prev.map(s => 
        s.id === selectedStudent 
          ? { ...s, badges: [...(s.badges || []), newBadgeEntry] }
          : s
      ));

      setSelectedStudent('');
      setSelectedBadge('');
      alert('Badge issued successfully!');
    } catch (error) {
      console.error('Error issuing badge:', error);
      alert('Failed to issue badge. Please try again.');
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
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#4f46e5' }}>Issue Badge to Student</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Select Student</label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            >
              <option value="">Choose a student...</option>
              {students.map(student => (
                <option key={student.id} value={student.id}>
                  {student.displayName || 'Unnamed Student'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Select Badge</label>
            <select
              value={selectedBadge}
              onChange={(e) => setSelectedBadge(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            >
              <option value="">Choose a badge...</option>
              {badges.map(badge => (
                <option key={badge.id} value={badge.id}>
                  {badge.name} ({badge.rarity})
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={issueBadgeToStudent}
          disabled={!selectedStudent || !selectedBadge}
          style={{
            backgroundColor: (!selectedStudent || !selectedBadge) ? '#9ca3af' : '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: (!selectedStudent || !selectedBadge) ? 'not-allowed' : 'pointer'
          }}
        >
          Issue Badge
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