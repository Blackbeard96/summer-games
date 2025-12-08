import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  type: 'defeat_enemies' | 'use_elemental_move' | 'attack_vault' | 'use_action_card' | 'win_battle' | 'earn_pp' | 'custom';
  target: number; // Target count/amount
  rewardPP: number;
  rewardXP: number;
  rewardTruthMetal?: number;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

const DailyChallengesAdmin: React.FC = () => {
  const [challenges, setChallenges] = useState<DailyChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChallenge, setEditingChallenge] = useState<DailyChallenge | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<DailyChallenge>>({
    title: '',
    description: '',
    type: 'defeat_enemies',
    target: 1,
    rewardPP: 50,
    rewardXP: 25,
    rewardTruthMetal: 0,
    isActive: true
  });

  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    try {
      setLoading(true);
      const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
      const snapshot = await getDocs(challengesRef);
      const challengesList: DailyChallenge[] = [];
      
      snapshot.forEach((doc) => {
        challengesList.push({ id: doc.id, ...doc.data() } as DailyChallenge);
      });
      
      // Sort by creation date (newest first)
      challengesList.sort((a, b) => {
        const aTime = a.createdAt?.toMillis() || 0;
        const bTime = b.createdAt?.toMillis() || 0;
        return bTime - aTime;
      });
      
      setChallenges(challengesList);
    } catch (error) {
      console.error('Error loading challenges:', error);
      alert('Failed to load challenges');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.description || !formData.type || !formData.target) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
      
      if (editingChallenge) {
        // Update existing challenge
        const challengeDoc = doc(challengesRef, editingChallenge.id);
        await updateDoc(challengeDoc, {
          ...formData,
          updatedAt: new Date()
        });
      } else {
        // Create new challenge
        const newChallenge: Omit<DailyChallenge, 'id'> = {
          title: formData.title!,
          description: formData.description!,
          type: formData.type!,
          target: formData.target!,
          rewardPP: formData.rewardPP || 50,
          rewardXP: formData.rewardXP || 25,
          rewardTruthMetal: formData.rewardTruthMetal || 0,
          isActive: formData.isActive !== undefined ? formData.isActive : true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await setDoc(doc(challengesRef), newChallenge);
      }
      
      await loadChallenges();
      setShowForm(false);
      setEditingChallenge(null);
      setFormData({
        title: '',
        description: '',
        type: 'defeat_enemies',
        target: 1,
        rewardPP: 50,
        rewardXP: 25,
        rewardTruthMetal: 0,
        isActive: true
      });
    } catch (error) {
      console.error('Error saving challenge:', error);
      alert('Failed to save challenge');
    }
  };

  const handleEdit = (challenge: DailyChallenge) => {
    setEditingChallenge(challenge);
    setFormData({
      title: challenge.title,
      description: challenge.description,
      type: challenge.type,
      target: challenge.target,
      rewardPP: challenge.rewardPP,
      rewardXP: challenge.rewardXP,
      rewardTruthMetal: challenge.rewardTruthMetal || 0,
      isActive: challenge.isActive
    });
    setShowForm(true);
  };

  const handleDelete = async (challengeId: string) => {
    if (!window.confirm('Are you sure you want to delete this challenge?')) {
      return;
    }

    try {
      const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
      await deleteDoc(doc(challengesRef, challengeId));
      await loadChallenges();
    } catch (error) {
      console.error('Error deleting challenge:', error);
      alert('Failed to delete challenge');
    }
  };

  const toggleActive = async (challenge: DailyChallenge) => {
    try {
      const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
      const challengeDoc = doc(challengesRef, challenge.id);
      await updateDoc(challengeDoc, {
        isActive: !challenge.isActive,
        updatedAt: new Date()
      });
      await loadChallenges();
    } catch (error) {
      console.error('Error toggling challenge status:', error);
      alert('Failed to update challenge status');
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      defeat_enemies: 'Defeat Enemies',
      use_elemental_move: 'Use Elemental Move',
      attack_vault: 'Attack Vault',
      use_action_card: 'Use Action Card',
      win_battle: 'Win Battle',
      earn_pp: 'Earn PP',
      custom: 'Custom'
    };
    return labels[type] || type;
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading challenges...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 'bold' }}>Daily Challenges Admin</h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingChallenge(null);
            setFormData({
              title: '',
              description: '',
              type: 'defeat_enemies',
              target: 1,
              rewardPP: 50,
              rewardXP: 25,
              rewardTruthMetal: 0,
              isActive: true
            });
          }}
          style={{
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          + Add Challenge
        </button>
      </div>

      {showForm && (
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '0.75rem',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            {editingChallenge ? 'Edit Challenge' : 'Create New Challenge'}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Title *
              </label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem'
                }}
                placeholder="e.g., Defeat 5 Enemies Today"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Description *
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  minHeight: '100px',
                  resize: 'vertical'
                }}
                placeholder="Describe what the player needs to do..."
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Challenge Type *
              </label>
              <select
                value={formData.type || 'defeat_enemies'}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as DailyChallenge['type'] })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem'
                }}
              >
                <option value="defeat_enemies">Defeat Enemies</option>
                <option value="use_elemental_move">Use Elemental Move</option>
                <option value="attack_vault">Attack Vault</option>
                <option value="use_action_card">Use Action Card</option>
                <option value="win_battle">Win Battle</option>
                <option value="earn_pp">Earn PP</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Target Count/Amount *
              </label>
              <input
                type="number"
                value={formData.target || 1}
                onChange={(e) => setFormData({ ...formData, target: parseInt(e.target.value) || 1 })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem'
                }}
                min="1"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Reward PP
                </label>
                <input
                  type="number"
                  value={formData.rewardPP || 50}
                  onChange={(e) => setFormData({ ...formData, rewardPP: parseInt(e.target.value) || 50 })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '1rem'
                  }}
                  min="0"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Reward XP
                </label>
                <input
                  type="number"
                  value={formData.rewardXP || 25}
                  onChange={(e) => setFormData({ ...formData, rewardXP: parseInt(e.target.value) || 25 })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '1rem'
                  }}
                  min="0"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Reward Truth Metal
                </label>
                <input
                  type="number"
                  value={formData.rewardTruthMetal || 0}
                  onChange={(e) => setFormData({ ...formData, rewardTruthMetal: parseInt(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '1rem'
                  }}
                  min="0"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive !== undefined ? formData.isActive : true}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <span style={{ fontWeight: 'bold' }}>Active (available for random selection)</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button
                onClick={handleSave}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                {editingChallenge ? 'Update Challenge' : 'Create Challenge'}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingChallenge(null);
                  setFormData({
                    title: '',
                    description: '',
                    type: 'defeat_enemies',
                    target: 1,
                    rewardPP: 50,
                    rewardXP: 25,
                    rewardTruthMetal: 0,
                    isActive: true
                  });
                }}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        background: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '0.75rem',
        padding: '1.5rem'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>
          All Challenges ({challenges.length})
        </h3>
        
        {challenges.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            No challenges created yet. Click "Add Challenge" to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {challenges.map((challenge) => (
              <div
                key={challenge.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  background: challenge.isActive ? 'white' : '#f9fafb'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1.25rem' }}>{challenge.title}</h4>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: challenge.isActive ? '#d1fae5' : '#fee2e2',
                        color: challenge.isActive ? '#065f46' : '#991b1b'
                      }}>
                        {challenge.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p style={{ margin: '0.5rem 0', color: '#6b7280' }}>{challenge.description}</p>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        <strong>Type:</strong> {getTypeLabel(challenge.type)}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        <strong>Target:</strong> {challenge.target}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        <strong>Rewards:</strong> {challenge.rewardPP} PP, {challenge.rewardXP} XP
                        {challenge.rewardTruthMetal ? `, ${challenge.rewardTruthMetal} Truth Metal` : ''}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => toggleActive(challenge)}
                      style={{
                        background: challenge.isActive ? '#f59e0b' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      {challenge.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleEdit(challenge)}
                      style={{
                        background: '#4f46e5',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(challenge.id)}
                      style={{
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyChallengesAdmin;


