import React, { useState } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const BadgeSetup: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const createDefaultBadges = async () => {
    setLoading(true);
    try {
      // Create some default badge images using placeholder URLs
      const defaultBadges = [
        {
          name: 'Trust +1',
          description: 'Awarded for building trust and collaboration in the community',
          criteria: 'trust collaboration',
          rarity: 'common' as const,
          category: 'special' as const,
          imageUrl: 'https://via.placeholder.com/100x100/0891b2/ffffff?text=Trust+1'
        },
        {
          name: 'First Steps',
          description: 'Complete your first challenge and begin your manifestation journey',
          criteria: 'Reality Shaping 101',
          rarity: 'common' as const,
          category: 'challenge' as const,
          imageUrl: 'https://via.placeholder.com/100x100/4f46e5/ffffff?text=1st'
        },
        {
          name: 'Memory Weaver',
          description: 'Master the art of memory-based manifestation',
          criteria: 'Memory Forge',
          rarity: 'rare' as const,
          category: 'challenge' as const,
          imageUrl: 'https://via.placeholder.com/100x100/8b5cf6/ffffff?text=Mem'
        },
        {
          name: 'AI Pioneer',
          description: 'Create your first intelligent construct',
          criteria: 'Intelligent Constructs',
          rarity: 'epic' as const,
          category: 'challenge' as const,
          imageUrl: 'https://via.placeholder.com/100x100/10b981/ffffff?text=AI'
        },
        {
          name: 'Portal Master',
          description: 'Open your first dimensional portal',
          criteria: 'Dimensional Portal',
          rarity: 'epic' as const,
          category: 'challenge' as const,
          imageUrl: 'https://via.placeholder.com/100x100/f59e0b/ffffff?text=Portal'
        },
        {
          name: 'Truth Seeker',
          description: 'Unlock the power of truth manifestation',
          criteria: 'Truth Manifestation',
          rarity: 'legendary' as const,
          category: 'challenge' as const,
          imageUrl: 'https://via.placeholder.com/100x100/dc2626/ffffff?text=Truth'
        },
        {
          name: 'Reality Bender',
          description: 'Defy the laws of physics with your manifestations',
          criteria: 'Reality Bending',
          rarity: 'legendary' as const,
          category: 'challenge' as const,
          imageUrl: 'https://via.placeholder.com/100x100/7c3aed/ffffff?text=Bend'
        },
        {
          name: 'Neural Architect',
          description: 'Build a machine learning model that learns and adapts',
          criteria: 'Neural Networks',
          rarity: 'legendary' as const,
          category: 'challenge' as const,
          imageUrl: 'https://via.placeholder.com/100x100/059669/ffffff?text=Neural'
        },
        {
          name: 'World Creator',
          description: 'Create a complete interactive world with AI integration',
          criteria: 'Eternal Creation',
          rarity: 'legendary' as const,
          category: 'challenge' as const,
          imageUrl: 'https://via.placeholder.com/100x100/be185d/ffffff?text=World'
        },
        {
          name: 'Element Master',
          description: 'Awarded for selecting your elemental manifestation type',
          criteria: 'element selection',
          rarity: 'common' as const,
          category: 'achievement' as const,
          imageUrl: 'https://via.placeholder.com/100x100/0891b2/ffffff?text=Element'
        },
        {
          name: 'Chapter Pioneer',
          description: 'Complete all challenges in a story chapter',
          criteria: 'chapter completion',
          rarity: 'rare' as const,
          category: 'achievement' as const,
          imageUrl: 'https://via.placeholder.com/100x100/92400e/ffffff?text=Chapter'
        }
      ];

      for (const badge of defaultBadges) {
        await addDoc(collection(db, 'badges'), {
          ...badge,
          createdAt: new Date()
        });
      }

      alert('Default badges created successfully!');
    } catch (error) {
      console.error('Error creating default badges:', error);
      alert('Failed to create default badges. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#1f2937' }}>
        Badge System Setup
      </h2>
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
        <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
          This will create default badges for the badge system. These badges will be automatically awarded to students when they complete specific challenges.
        </p>
        <button
          onClick={createDefaultBadges}
          disabled={loading}
          style={{
            backgroundColor: loading ? '#9ca3af' : '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            width: '100%'
          }}
        >
          {loading ? 'Creating Badges...' : 'Create Default Badges'}
        </button>
      </div>
    </div>
  );
};

export default BadgeSetup; 