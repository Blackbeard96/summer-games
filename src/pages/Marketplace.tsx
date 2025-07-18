import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

interface Artifact {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  image: string;
  category: 'time' | 'protection' | 'food' | 'special';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  originalPrice?: number;
  discount?: number;
}

const artifacts: Artifact[] = [
  { 
    id: 'sleep-30',
    name: 'Sleep - In 30 min', 
    description: 'Come to work 30 minutes later (10 am start)', 
    price: 30, 
    icon: '😴', 
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'time',
    rarity: 'common'
  },
  { 
    id: 'sleep-1hr',
    name: 'Sleep - In 1 hr', 
    description: 'Come to work 1 hour later (10:30 am start)', 
    price: 54, 
    icon: '😴', 
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'time',
    rarity: 'rare'
  },
  { 
    id: 'shield',
    name: 'Shield', 
    description: 'Avoid next penalty for incomplete work', 
    price: 25, 
    icon: '🛡️', 
    image: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'protection',
    rarity: 'common'
  },
  { 
    id: 'lunch-extension',
    name: 'Lunch Extension (+15)', 
    description: 'Extend lunch by 15 minutes (Full Hour)', 
    price: 30, 
    icon: '🍕', 
    image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'food',
    rarity: 'common'
  },
  { 
    id: 'double-xp',
    name: 'Double XP Boost', 
    description: 'Gain double XP for the next 3 challenges', 
    price: 75, 
    icon: '⚡', 
    image: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'epic',
    originalPrice: 100,
    discount: 25
  },
  { 
    id: 'time-freeze',
    name: 'Time Freeze', 
    description: 'Pause time for 1 hour during work', 
    price: 120, 
    icon: '⏰', 
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'time',
    rarity: 'legendary',
    originalPrice: 150,
    discount: 20
  },
  { 
    id: 'invisibility',
    name: 'Invisibility Cloak', 
    description: 'Become invisible for 30 minutes', 
    price: 90, 
    icon: '👻', 
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'epic'
  },
  { 
    id: 'teleport',
    name: 'Teleport Scroll', 
    description: 'Instantly teleport to any location', 
    price: 200, 
    icon: '🌀', 
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'legendary'
  }
];

const Marketplace = () => {
  const { currentUser } = useAuth();
  const [powerPoints, setPowerPoints] = useState(0);
  const [inventory, setInventory] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [showPurchaseSuccess, setShowPurchaseSuccess] = useState(false);
  const [purchasedItem, setPurchasedItem] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;
      
      const userRef = doc(db, 'students', currentUser.uid);
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPowerPoints(data.powerPoints || 0);
        setInventory(data.inventory || []);
      }
    };
    if (currentUser) fetchData();
  }, [currentUser]);

  const handlePurchase = async (item: Artifact) => {
    if (!currentUser || powerPoints < item.price) return;
    
    const newPP = powerPoints - item.price;
    const newInventory = [...inventory, item.name];
    setPowerPoints(newPP);
    setInventory(newInventory);
    setPurchasedItem(item.name);
    setShowPurchaseSuccess(true);
    
    const userRef = doc(db, 'students', currentUser.uid);
    await updateDoc(userRef, { powerPoints: newPP, inventory: newInventory });
    
    // Auto-hide success message
    setTimeout(() => setShowPurchaseSuccess(false), 3000);
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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'time': return '⏰';
      case 'protection': return '🛡️';
      case 'food': return '🍕';
      case 'special': return '✨';
      default: return '📦';
    }
  };

  const filteredArtifacts = artifacts.filter(artifact => {
    const matchesSearch = artifact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         artifact.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || artifact.category === selectedCategory;
    const matchesRarity = selectedRarity === 'all' || artifact.rarity === selectedRarity;
    
    return matchesSearch && matchesCategory && matchesRarity;
  });

  const categories = [
    { id: 'all', name: 'All Categories', icon: '📦' },
    { id: 'time', name: 'Time Artifacts', icon: '⏰' },
    { id: 'protection', name: 'Protection', icon: '🛡️' },
    { id: 'food', name: 'Food & Rest', icon: '🍕' },
    { id: 'special', name: 'Special Powers', icon: '✨' }
  ];

  const rarities = [
    { id: 'all', name: 'All Rarities', color: '#6b7280' },
    { id: 'common', name: 'Common', color: '#6b7280' },
    { id: 'rare', name: 'Rare', color: '#3b82f6' },
    { id: 'epic', name: 'Epic', color: '#8b5cf6' },
    { id: 'legendary', name: 'Legendary', color: '#fbbf24' }
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <div style={{ 
        backgroundColor: 'white', 
        borderBottom: '1px solid #e5e7eb',
        padding: '1rem 0'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1f2937' }}>
                Artifact Shop
              </h1>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="What are you looking for?"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '300px',
                    padding: '0.75rem 1rem 0.75rem 2.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem'
                  }}
                />
                <span style={{ 
                  position: 'absolute', 
                  left: '0.75rem', 
                  top: '50%', 
                  transform: 'translateY(-50%)',
                  color: '#6b7280'
                }}>
                  🔍
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                backgroundColor: '#fbbf24', 
                color: '#1f2937', 
                padding: '0.5rem 1rem', 
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                fontSize: '0.875rem'
              }}>
                ⚡ {powerPoints} Power Points
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Banner */}
      <div style={{ 
        backgroundColor: '#ec4899', 
        color: 'white', 
        padding: '1rem 0',
        textAlign: 'center',
        fontWeight: 'bold'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem' }}>
          🎯 SPECIAL OFFER - Epic and Legendary artifacts now available! Limited time only.
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'flex', gap: '2rem' }}>
          {/* Sidebar Filters */}
          <div style={{ width: '250px', flexShrink: 0 }}>
            <div style={{ 
              backgroundColor: 'white', 
              borderRadius: '0.75rem', 
              padding: '1.5rem',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb'
            }}>
              {/* Category Filter */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ 
                  fontSize: '1.125rem', 
                  fontWeight: 'bold', 
                  marginBottom: '1rem',
                  color: '#374151'
                }}>
                  Category
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {categories.map(category => (
                    <label key={category.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      backgroundColor: selectedCategory === category.id ? '#f3f4f6' : 'transparent'
                    }}>
                      <input
                        type="radio"
                        name="category"
                        value={category.id}
                        checked={selectedCategory === category.id}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        style={{ margin: 0 }}
                      />
                      <span style={{ fontSize: '1rem' }}>{category.icon}</span>
                      <span style={{ fontSize: '0.875rem' }}>{category.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Rarity Filter */}
              <div>
                <h3 style={{ 
                  fontSize: '1.125rem', 
                  fontWeight: 'bold', 
                  marginBottom: '1rem',
                  color: '#374151'
                }}>
                  Rarity
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {rarities.map(rarity => (
                    <label key={rarity.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      backgroundColor: selectedRarity === rarity.id ? '#f3f4f6' : 'transparent'
                    }}>
                      <input
                        type="radio"
                        name="rarity"
                        value={rarity.id}
                        checked={selectedRarity === rarity.id}
                        onChange={(e) => setSelectedRarity(e.target.value)}
                        style={{ margin: 0 }}
                      />
                      <div style={{ 
                        width: '12px', 
                        height: '12px', 
                        borderRadius: '50%', 
                        backgroundColor: rarity.color 
                      }} />
                      <span style={{ fontSize: '0.875rem' }}>{rarity.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div style={{ flex: 1 }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                Artifacts ({filteredArtifacts.length})
              </h2>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Showing {filteredArtifacts.length} of {artifacts.length} artifacts
              </div>
            </div>

            {/* Product Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: '1.5rem' 
            }}>
              {filteredArtifacts.map((artifact) => {
                const purchased = inventory.includes(artifact.name);
                return (
                  <div key={artifact.id} style={{ 
                    backgroundColor: 'white',
                    borderRadius: '0.75rem',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                    border: '1px solid #e5e7eb',
                    transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                    cursor: purchased ? 'default' : 'pointer',
                    opacity: purchased ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!purchased) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                  }}
                  >
                    {/* Product Image */}
                    <div style={{ position: 'relative' }}>
                      <img 
                        src={artifact.image} 
                        alt={artifact.name} 
                        style={{ 
                          width: '100%', 
                          height: '200px', 
                          objectFit: 'cover' 
                        }} 
                      />
                      {artifact.discount && (
                        <div style={{
                          position: 'absolute',
                          top: '0.5rem',
                          left: '0.5rem',
                          backgroundColor: '#ec4899',
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>
                          -{artifact.discount}%
                        </div>
                      )}
                      <div style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        backgroundColor: getRarityColor(artifact.rarity),
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        {artifact.rarity.toUpperCase()}
                      </div>
                    </div>

                    {/* Product Info */}
                    <div style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>{artifact.icon}</span>
                        <h3 style={{ 
                          fontSize: '1.125rem', 
                          fontWeight: 'bold',
                          color: '#1f2937',
                          margin: 0
                        }}>
                          {artifact.name}
                        </h3>
                      </div>
                      
                      <p style={{ 
                        fontSize: '0.875rem', 
                        color: '#6b7280',
                        marginBottom: '1rem',
                        lineHeight: '1.4'
                      }}>
                        {artifact.description}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          {artifact.originalPrice ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ 
                                fontSize: '1.25rem', 
                                fontWeight: 'bold',
                                color: '#1f2937'
                              }}>
                                {artifact.price} PP
                              </span>
                              <span style={{ 
                                fontSize: '0.875rem', 
                                color: '#6b7280',
                                textDecoration: 'line-through'
                              }}>
                                {artifact.originalPrice} PP
                              </span>
                            </div>
                          ) : (
                            <span style={{ 
                              fontSize: '1.25rem', 
                              fontWeight: 'bold',
                              color: '#1f2937'
                            }}>
                              {artifact.price} PP
                            </span>
                          )}
                        </div>

                        {purchased ? (
                          <span style={{ 
                            backgroundColor: '#10b981', 
                            color: 'white', 
                            padding: '0.5rem 1rem', 
                            borderRadius: '0.375rem',
                            fontSize: '0.875rem',
                            fontWeight: 'bold'
                          }}>
                            ✅ Purchased
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePurchase(artifact)}
                            disabled={powerPoints < artifact.price}
                            style={{
                              backgroundColor: powerPoints >= artifact.price ? '#1f2937' : '#9ca3af',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              padding: '0.5rem 1rem',
                              fontSize: '0.875rem',
                              fontWeight: 'bold',
                              cursor: powerPoints >= artifact.price ? 'pointer' : 'not-allowed',
                              transition: 'background-color 0.2s ease-in-out'
                            }}
                          >
                            Buy
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredArtifacts.length === 0 && (
              <div style={{ 
                textAlign: 'center', 
                padding: '3rem',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  No artifacts found
                </h3>
                <p>Try adjusting your filters or search terms.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Purchase Success Notification */}
      {showPurchaseSuccess && (
        <div style={{
          position: 'fixed',
          top: '2rem',
          right: '2rem',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 1001,
          maxWidth: '400px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🎉</span>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Purchase Successful!</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>You now own "{purchasedItem}"</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace; 