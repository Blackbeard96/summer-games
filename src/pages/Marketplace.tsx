import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { activatePPBoost } from '../utils/ppBoost';

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
    id: 'checkin-free',
    name: 'Get Out of Check-in Free', 
    description: 'Skip the next check-in requirement', 
    price: 50, 
    icon: '🎫', 
    image: '/images/Get-Out-of-Check-in-Free.png',
    category: 'protection',
    rarity: 'common'
  },
  { 
    id: 'shield',
    name: 'Shield', 
    description: 'Block the next incoming attack on your vault', 
    price: 25, 
    icon: '🛡️', 
    image: '/images/Shield Item.jpeg',
    category: 'protection',
    rarity: 'common'
  },
  { 
    id: 'lunch-mosley',
    name: 'Lunch on Mosley', 
    description: 'Enjoy a special lunch with Mr. Mosley', 
    price: 999, 
    icon: '🍽️', 
    image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'food',
    rarity: 'epic'
  },
  { 
    id: 'uxp-credit',
    name: '+2 UXP Credit', 
    description: 'Credit to be added to any non-assessment assignment', 
    price: 60, 
    icon: '📚', 
    image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'common'
  },
  { 
    id: 'uxp-credit-4',
    name: '+4 UXP Credit', 
    description: 'Enhanced credit to be added to any non-assessment assignment', 
    price: 100, 
    icon: '📖', 
    image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'rare'
  },
  { 
    id: 'double-pp',
    name: 'Double PP Boost', 
    description: 'Double any PP you receive for the next 4 hours', 
    price: 75, 
    icon: '⚡', 
    image: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'epic',
    originalPrice: 100,
    discount: 25
  },
];

const Marketplace = () => {
  const { currentUser } = useAuth();
  const [powerPoints, setPowerPoints] = useState(0);
  const [inventory, setInventory] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRarity, setSelectedRarity] = useState('all');
  const [isMobile, setIsMobile] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Function to create admin notifications
  const createAdminNotification = async (notification: any) => {
    try {
      await addDoc(collection(db, 'adminNotifications'), {
        ...notification,
        createdAt: new Date(),
        read: false
      });
    } catch (error) {
      console.error('Error creating admin notification:', error);
    }
  };

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;

      try {
        // Fetch from both collections to stay in sync
        const studentsRef = doc(db, 'students', currentUser.uid);
        const usersRef = doc(db, 'users', currentUser.uid);
        
        const [studentsSnap, usersSnap] = await Promise.all([
          getDoc(studentsRef),
          getDoc(usersRef)
        ]);
        
        if (studentsSnap.exists()) {
          const studentsData = studentsSnap.data();
          setPowerPoints(studentsData.powerPoints || 0);
          setInventory(studentsData.inventory || []);
        }
        
        // Also fetch user artifacts to check for consistency
        if (usersSnap.exists()) {
          const usersData = usersSnap.data();
          console.log('Users artifacts:', usersData.artifacts);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchData();
  }, [currentUser]);

  // Function to count specific artifacts in inventory
  const getArtifactCount = (artifactName: string) => {
    const count = inventory.filter(item => item === artifactName).length;
    console.log(`Artifact count for "${artifactName}": ${count}`, { inventory, artifactName });
    return count;
  };

  // Debug function to check inventory consistency
  const debugInventoryData = async () => {
    if (!currentUser) return;
    
    console.log('=== INVENTORY DEBUG INFO ===');
    console.log('Current inventory state:', inventory);
    
    try {
      // Check students collection
      const studentsRef = doc(db, 'students', currentUser.uid);
      const studentsSnap = await getDoc(studentsRef);
      if (studentsSnap.exists()) {
        const studentsData = studentsSnap.data();
        console.log('Students collection inventory:', studentsData.inventory);
        console.log('Students collection artifacts:', studentsData.artifacts);
      }
      
      // Check users collection
      const usersRef = doc(db, 'users', currentUser.uid);
      const usersSnap = await getDoc(usersRef);
      if (usersSnap.exists()) {
        const usersData = usersSnap.data();
        console.log('Users collection artifacts:', usersData.artifacts);
        
        // Check for inconsistencies
        const studentsInventory = studentsSnap.exists() ? studentsSnap.data().inventory || [] : [];
        const usersArtifacts = usersData.artifacts || [];
        
        console.log('=== INCONSISTENCY CHECK ===');
        console.log('Students inventory items:', studentsInventory);
        console.log('Users artifacts (not used):', usersArtifacts.filter((a: any) => !a.used && !a.pending));
        
        // Find items that are in students.inventory but marked as used in users.artifacts
        const usedArtifactNames = usersArtifacts
          .filter((a: any) => a.used || a.pending)
          .map((a: any) => a.name);
        
        const inconsistentItems = studentsInventory.filter((item: string) => 
          usedArtifactNames.includes(item)
        );
        
        if (inconsistentItems.length > 0) {
          console.log('🚨 INCONSISTENT ITEMS FOUND:', inconsistentItems);
        } else {
          console.log('✅ No inconsistencies found');
        }
      }
    } catch (error) {
      console.error('Error debugging inventory:', error);
    }
  };

  // Function to clean up inventory inconsistencies
  const cleanupInventoryData = async () => {
    if (!currentUser) return;
    
    try {
      console.log('=== CLEANING UP INVENTORY DATA ===');
      
      // Get data from both collections
      const studentsRef = doc(db, 'students', currentUser.uid);
      const usersRef = doc(db, 'users', currentUser.uid);
      
      const [studentsSnap, usersSnap] = await Promise.all([
        getDoc(studentsRef),
        getDoc(usersRef)
      ]);
      
      if (studentsSnap.exists() && usersSnap.exists()) {
        const studentsData = studentsSnap.data();
        const usersData = usersSnap.data();
        
        // Get used artifacts from users collection
        const usedArtifacts = (usersData.artifacts || [])
          .filter((artifact: any) => artifact.used)
          .map((artifact: any) => artifact.name);
        
        console.log('Used artifacts from users collection:', usedArtifacts);
        
        // Clean up students collection inventory
        const currentInventory = studentsData.inventory || [];
        const cleanedInventory = currentInventory.filter((item: string) => 
          !usedArtifacts.includes(item)
        );
        
        console.log('Original inventory:', currentInventory);
        console.log('Cleaned inventory:', cleanedInventory);
        
        if (cleanedInventory.length !== currentInventory.length) {
          // Update students collection with cleaned inventory
          await updateDoc(studentsRef, {
            inventory: cleanedInventory
          });
          
          // Update local state
          setInventory(cleanedInventory);
          
          console.log('✅ Inventory cleaned up successfully!');
          alert('✅ Inventory data has been cleaned up! The page will refresh.');
          window.location.reload();
        } else {
          console.log('✅ Inventory data is already consistent');
          alert('✅ Inventory data is already consistent');
        }
      }
    } catch (error) {
      console.error('Error cleaning up inventory:', error);
      alert('❌ Error cleaning up inventory. Check console for details.');
    }
  };

  // Function to force sync inventory from users.artifacts to students.inventory
  const forceSyncInventory = async () => {
    if (!currentUser) return;
    
    try {
      console.log('=== FORCE SYNCING INVENTORY ===');
      
      const studentsRef = doc(db, 'students', currentUser.uid);
      const usersRef = doc(db, 'users', currentUser.uid);
      
      const [studentsSnap, usersSnap] = await Promise.all([
        getDoc(studentsRef),
        getDoc(usersRef)
      ]);
      
      if (studentsSnap.exists() && usersSnap.exists()) {
        const usersData = usersSnap.data();
        const usersArtifacts = usersData.artifacts || [];
        
        // Get all available artifacts (not used, not pending)
        const availableArtifacts = usersArtifacts
          .filter((a: any) => !a.used && !a.pending)
          .map((a: any) => a.name);
        
        console.log('Available artifacts from users.artifacts:', availableArtifacts);
        console.log('Current students.inventory:', studentsSnap.data().inventory);
        
        // Update students.inventory to match users.artifacts
        await updateDoc(studentsRef, {
          inventory: availableArtifacts
        });
        
        console.log('✅ Force synced inventory:', availableArtifacts);
        alert('✅ Inventory force synced! The page will refresh.');
        
        // Refresh the page to show updated data
        window.location.reload();
      }
    } catch (error) {
      console.error('Error force syncing inventory:', error);
      alert('❌ Error force syncing inventory. Check console for details.');
    }
  };

  // Function to handle using an artifact
  const handleUseArtifact = async (artifactName: string) => {
    if (!currentUser) return;

    try {
      const userRef = doc(db, 'students', currentUser.uid);
      
      // Get current user data
      const userSnap = await getDoc(userRef);
      const currentUserData = userSnap.exists() ? userSnap.data() : {};
      
      // Remove one instance of the artifact from inventory
      const updatedInventory = [...inventory];
      const artifactIndex = updatedInventory.indexOf(artifactName);
      if (artifactIndex > -1) {
        updatedInventory.splice(artifactIndex, 1);
      }
      
      // Handle special artifacts
      if (artifactName === 'Double PP Boost') {
        // Activate PP boost immediately
        const success = await activatePPBoost(currentUser.uid, artifactName);
        if (success) {
          alert(`⚡ Double PP Boost activated! You'll receive double PP for the next 4 hours!`);
        } else {
          alert('Failed to activate PP boost. Please try again.');
          return;
        }
      } else {
        // Create admin notification for other artifacts
        await createAdminNotification({
          type: 'artifact_usage',
          title: 'Artifact Used',
          message: `${currentUser.displayName || currentUser.email} used ${artifactName}`,
          data: {
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email,
            artifactName: artifactName,
            usageTime: new Date(),
            location: 'Marketplace'
          }
        });
      }
      
      // Update user's inventory in students collection
      await updateDoc(userRef, {
        inventory: updatedInventory
      });

      // Also update the users collection artifacts array to match Profile system
      const usersRef = doc(db, 'users', currentUser.uid);
      const usersSnap = await getDoc(usersRef);
      if (usersSnap.exists()) {
        const usersData = usersSnap.data();
        const currentArtifacts = usersData.artifacts || [];
        
        // Find and mark the artifact as used in the users collection
        const updatedArtifacts = currentArtifacts.map((artifact: any) => {
          if (typeof artifact === 'string') {
            // Legacy artifact stored as string - match by name
            return artifact === artifactName ? { 
              id: artifactName.toLowerCase().replace(/\s+/g, '-'),
              name: artifactName,
              used: true,
              usedAt: new Date(),
              isLegacy: true
            } : artifact;
          } else {
            // New artifact stored as object - match by name
            return artifact.name === artifactName 
              ? { ...artifact, used: true, usedAt: new Date() } 
              : artifact;
          }
        });
        
        await updateDoc(usersRef, {
          artifacts: updatedArtifacts
        });
      }

      // Update local state
      setInventory(updatedInventory);
      
      // Refresh user data to ensure consistency
      const refreshedUserSnap = await getDoc(userRef);
      if (refreshedUserSnap.exists()) {
        const refreshedUserData = refreshedUserSnap.data();
        setInventory(refreshedUserData.inventory || []);
        setPowerPoints(refreshedUserData.powerPoints || 0);
      }
      
      if (artifactName !== 'Double PP Boost') {
        alert(`Used ${artifactName}!`);
      }
    } catch (error) {
      console.error('Error using artifact:', error);
      alert('Failed to use artifact. Please try again.');
    }
  };

  const handlePurchase = async (item: Artifact) => {
    if (!currentUser) return;
    
    if (powerPoints < item.price) {
      alert('Insufficient Power Points!');
      return;
    }

    // Check for artifact limits
    if (item.name === '+2 UXP Credit' && getArtifactCount(item.name) >= 2) {
      alert('You can only own a maximum of 2 +2 UXP Credit artifacts at a time!');
      return;
    }
    
    if (item.name === '+4 UXP Credit' && getArtifactCount(item.name) >= 2) {
      alert('You can only own a maximum of 2 +4 UXP Credit artifacts at a time!');
      return;
    }
    
    if (item.name === 'Get Out of Check-in Free' && getArtifactCount(item.name) >= 2) {
      alert('You can only own a maximum of 2 Get Out of Check-in Free artifacts at a time!');
      return;
    }

    try {
      const userRef = doc(db, 'students', currentUser.uid);
      
      // Create detailed artifact purchase record
      const purchasedArtifact = {
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        icon: item.icon,
        image: item.image,
        category: item.category,
        rarity: item.rarity,
        purchasedAt: new Date(),
        used: false
      };
      
      // Get current user data to access existing artifacts
      const userSnap = await getDoc(userRef);
      const currentUserData = userSnap.exists() ? userSnap.data() : {};
      
      // Update user's power points and add artifact to inventory
      await updateDoc(userRef, {
        powerPoints: powerPoints - item.price,
        inventory: [...inventory, item.name],
        artifacts: [...(currentUserData.artifacts || []), purchasedArtifact]
      });
      
      // Also update the users collection to keep both in sync
      const usersRef = doc(db, 'users', currentUser.uid);
      const usersSnap = await getDoc(usersRef);
      if (usersSnap.exists()) {
        const usersData = usersSnap.data();
        await updateDoc(usersRef, {
          artifacts: [...(usersData.artifacts || []), purchasedArtifact]
        });
      }
      
      // Create admin notification
      await createAdminNotification({
        type: 'artifact_purchase',
        title: 'Artifact Purchase',
        message: `${currentUser.displayName || currentUser.email} purchased ${item.name} for ${item.price} PP`,
        data: {
          userId: currentUser.uid,
          userName: currentUser.displayName || currentUser.email,
          artifactName: item.name,
          artifactPrice: item.price,
          artifactRarity: item.rarity,
          purchaseTime: new Date()
        }
      });
      
      setPowerPoints(prev => prev - item.price);
      setInventory(prev => [...prev, item.name]);
      
      alert(`Successfully purchased ${item.name}!`);
    } catch (error) {
      console.error('Error purchasing item:', error);
      alert('Failed to purchase item. Please try again.');
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
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)',
      position: 'relative'
    }}>
      {/* Mystical background pattern */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'url("data:image/svg+xml,%3Csvg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="%23e0e7ff" fill-opacity="0.3"%3E%3Cpath d="M50 0L60 40L100 50L60 60L50 100L40 60L0 50L40 40Z"/%3E%3C/g%3E%3C/svg%3E")',
        opacity: 0.1,
        pointerEvents: 'none'
      }} />
      {/* Header */}
      <div className="marketplace-header" style={{ 
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
        borderBottom: '2px solid #e0e7ff',
        padding: isMobile ? '0.75rem 0' : '1rem 0',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '0 1rem' : '0 1.5rem' }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center', 
            justifyContent: 'space-between',
            gap: isMobile ? '1rem' : '0'
          }}>
            <div style={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center', 
              gap: isMobile ? '1rem' : '2rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: isMobile ? '1.5rem' : '1.875rem' }}>🔮</span>
                <h1 style={{ 
                  fontSize: isMobile ? '1.5rem' : '1.875rem', 
                  fontWeight: 'bold', 
                  color: '#1f2937',
                  margin: 0
                }}>
                  MST MKT
                </h1>
                <span style={{ 
                  fontSize: isMobile ? '0.75rem' : '0.875rem', 
                  color: '#6b7280',
                  fontWeight: '500'
                }}>
                  Mystical System Technology
                </span>
              </div>
              <div style={{ position: 'relative', width: isMobile ? '100%' : '300px' }}>
                <input
                  type="text"
                  placeholder="What are you looking for?"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
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
              <div className="power-points" style={{ 
                backgroundColor: '#fbbf24', 
                color: '#1f2937', 
                padding: '0.5rem 1rem', 
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                fontSize: '0.875rem',
                whiteSpace: 'nowrap'
              }}>
                ⚡ {powerPoints} Power Points
              </div>
            </div>
          </div>
          
          {/* Debug Section */}
          <div style={{
            backgroundColor: '#f3f4f6',
            borderRadius: '0.5rem',
            padding: '1rem',
            marginBottom: '1rem',
            border: '1px solid #d1d5db'
          }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#374151' }}>
              🔧 Debug Tools
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={debugInventoryData}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '500'
                }}
              >
                🔍 Debug Inventory Data
              </button>
              <button
                onClick={cleanupInventoryData}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '500'
                }}
              >
                🧹 Clean Up Inventory
              </button>
              <button
                onClick={forceSyncInventory}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '500'
                }}
              >
                🔄 Force Sync Inventory
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Banner */}
      <div style={{ 
        background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)', 
        color: 'white', 
        padding: isMobile ? '0.75rem 0' : '1rem 0',
        textAlign: 'center',
        fontWeight: 'bold',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.1"%3E%3Ccircle cx="30" cy="30" r="2"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          opacity: 0.3
        }} />
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '0 1rem' : '0 1.5rem', position: 'relative', zIndex: 1 }}>
          🔮 MYSTICAL SYSTEM TECHNOLOGY - Epic and Legendary artifacts now available! Limited time only.
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '1rem' : '2rem 1.5rem' }}>
        {/* Mobile Filter Toggle */}
        {isMobile && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              <span>🔧 Filters</span>
              <span>{showFilters ? '▲' : '▼'}</span>
            </button>
          </div>
        )}

        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '1rem' : '2rem' 
        }}>
          {/* Sidebar Filters */}
          <div className="category-filters" style={{ 
            width: isMobile ? '100%' : '250px', 
            flexShrink: 0,
            display: isMobile && !showFilters ? 'none' : 'block'
          }}>
            <div style={{ 
              backgroundColor: 'white', 
              borderRadius: '0.75rem', 
              padding: isMobile ? '1rem' : '1.5rem',
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
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', 
              alignItems: isMobile ? 'stretch' : 'center',
              marginBottom: '1.5rem',
              gap: isMobile ? '0.5rem' : '0'
            }}>
              <h2 style={{ 
                fontSize: isMobile ? '1.25rem' : '1.5rem', 
                fontWeight: 'bold', 
                color: '#1f2937',
                margin: 0
              }}>
                Artifacts ({filteredArtifacts.length})
              </h2>
              <div style={{ 
                fontSize: '0.875rem', 
                color: '#6b7280',
                textAlign: isMobile ? 'left' : 'right'
              }}>
                Showing {filteredArtifacts.length} of {artifacts.length} artifacts
              </div>
            </div>

            {/* Product Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: isMobile 
                ? 'repeat(auto-fill, minmax(280px, 1fr))' 
                : 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: isMobile ? '1rem' : '1.5rem' 
            }}>
              {filteredArtifacts.map((artifact) => {
                const artifactCount = getArtifactCount(artifact.name);
                const purchased = artifactCount > 0;
                const isAtLimit = (artifact.name === '+2 UXP Credit' || artifact.name === '+4 UXP Credit' || artifact.name === 'Get Out of Check-in Free') && artifactCount >= 2;
                return (
                  <div key={artifact.id} className="artifact-card" style={{ 
                    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                    borderRadius: '1rem',
                    overflow: 'hidden',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    border: `2px solid ${getRarityColor(artifact.rarity)}20`,
                    transition: 'all 0.3s ease-in-out',
                    cursor: purchased ? 'default' : 'pointer',
                    opacity: purchased ? 0.7 : 1,
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!purchased && !isMobile) {
                      e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                      e.currentTarget.style.boxShadow = `0 10px 25px -3px ${getRarityColor(artifact.rarity)}40, 0 4px 6px -2px rgba(0, 0, 0, 0.05)`;
                      e.currentTarget.style.borderColor = getRarityColor(artifact.rarity);
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isMobile) {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                      e.currentTarget.style.borderColor = `${getRarityColor(artifact.rarity)}20`;
                    }
                  }}
                  >
                    {/* Mystical glow effect */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: `radial-gradient(circle at center, ${getRarityColor(artifact.rarity)}20 0%, transparent 70%)`,
                      opacity: 0.6,
                      pointerEvents: 'none'
                    }} />
                    
                    {/* Product Image */}
                    <div style={{ position: 'relative' }}>
                      <img 
                        src={artifact.image} 
                        alt={artifact.name} 
                        style={{ 
                          width: '100%', 
                          height: isMobile ? '180px' : '200px', 
                          objectFit: 'cover',
                          filter: 'brightness(1.1) contrast(1.1)'
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
                    <div style={{ padding: isMobile ? '0.75rem' : '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: isMobile ? '1.25rem' : '1.5rem' }}>{artifact.icon}</span>
                        <h3 style={{ 
                          fontSize: isMobile ? '1rem' : '1.125rem', 
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
                                fontSize: isMobile ? '1.125rem' : '1.25rem', 
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
                              fontSize: isMobile ? '1.125rem' : '1.25rem', 
                              fontWeight: 'bold',
                              color: '#1f2937'
                            }}>
                              {artifact.price} PP
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                          {purchased && (
                            <div style={{ 
                              fontSize: '0.75rem', 
                              color: '#6b7280',
                              textAlign: 'right'
                            }}>
                              Owned: {artifactCount}
                              {(artifact.name === '+2 UXP Credit' || artifact.name === '+4 UXP Credit' || artifact.name === 'Get Out of Check-in Free') && ` (Max: 2)`}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {purchased && (
                              <button
                                onClick={() => handleUseArtifact(artifact.name)}
                                style={{
                                  backgroundColor: '#f59e0b',
                                  color: 'white',
                                  border: 'none',
                                  padding: isMobile ? '0.375rem 0.5rem' : '0.375rem 0.75rem',
                                  borderRadius: '0.375rem',
                                  fontSize: isMobile ? '0.625rem' : '0.75rem',
                                  fontWeight: '500',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  minWidth: isMobile ? '60px' : 'auto',
                                  minHeight: isMobile ? '28px' : 'auto'
                                }}
                                onMouseEnter={e => {
                                  if (!isMobile) {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.backgroundColor = '#d97706';
                                  }
                                }}
                                onMouseLeave={e => {
                                  if (!isMobile) {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.backgroundColor = '#f59e0b';
                                  }
                                }}
                              >
                                Used
                              </button>
                            )}
                            <button
                              onClick={() => handlePurchase(artifact)}
                              disabled={isAtLimit || powerPoints < artifact.price}
                              style={{
                                backgroundColor: isAtLimit ? '#6b7280' : powerPoints < artifact.price ? '#ef4444' : '#10b981',
                                color: 'white',
                                border: 'none',
                                padding: isMobile ? '0.5rem 0.75rem' : '0.5rem 1rem',
                                borderRadius: '0.375rem',
                                fontSize: isMobile ? '0.75rem' : '0.875rem',
                                fontWeight: '500',
                                cursor: isAtLimit || powerPoints < artifact.price ? 'not-allowed' : 'pointer',
                                opacity: isAtLimit || powerPoints < artifact.price ? 0.6 : 1,
                                transition: 'all 0.2s',
                                minWidth: isMobile ? '80px' : 'auto',
                                minHeight: isMobile ? '36px' : 'auto'
                              }}
                              onMouseEnter={e => {
                                if (!isAtLimit && powerPoints >= artifact.price && !isMobile) {
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                }
                              }}
                              onMouseLeave={e => {
                                if (!isMobile) {
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }
                              }}
                            >
                              {isAtLimit ? 'At Limit' : powerPoints < artifact.price ? 'Insufficient PP' : 'Purchase'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* No Results */}
            {filteredArtifacts.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '3rem 1rem',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No artifacts found</h3>
                <p>Try adjusting your search terms or filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Marketplace; 