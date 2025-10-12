import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { useNavigate } from 'react-router-dom';
import { db, storage } from '../firebase';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import PlayerCard from '../components/PlayerCard';
import ManifestProgress from '../components/ManifestProgress';
import ManifestSelection from '../components/ManifestSelection';
import { SketchPicker } from 'react-color';
import { getLevelFromXP } from '../utils/leveling';
import { PlayerManifest, MANIFESTS } from '../types/manifest';

// Import marketplace items to match legacy items
const marketplaceItems = [
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
  }
  // Add more items as needed
];

// Function to enhance legacy items with marketplace data
const enhanceLegacyItem = (item: any) => {
  if (typeof item === 'string') {
    const marketplaceItem = marketplaceItems.find(mi => mi.name === item);
    if (marketplaceItem) {
      return {
        id: marketplaceItem.id,
        name: marketplaceItem.name,
        description: marketplaceItem.description,
        icon: marketplaceItem.icon,
        image: marketplaceItem.image,
        category: marketplaceItem.category,
        rarity: marketplaceItem.rarity,
        purchasedAt: null,
        used: false,
        isLegacy: true
      };
    }
  }
  return item;
};



const Profile = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  // Add state for manifest, style, and rarity
  const [manifest, setManifest] = useState(userData?.manifest || 'None');
  const [style, setStyle] = useState(userData?.manifestationType || 'Fire');
  const [rarity, setRarity] = useState(userData?.rarity || 1);
  const [cardBgColor, setCardBgColor] = useState(userData?.cardBgColor || '#e0e7ff');
  const [moves, setMoves] = useState(userData?.moves || []);
  const [newMove, setNewMove] = useState({ name: '', description: '', icon: '' });
  const [badges, setBadges] = useState(userData?.badges || []);
  const [playerManifest, setPlayerManifest] = useState<PlayerManifest | null>(null);
  const [showManifestSelection, setShowManifestSelection] = useState(false);

  // Function to get manifest color
  const getManifestColor = (manifestName: string) => {
    const manifest = MANIFESTS.find(m => m.name === manifestName);
    return manifest ? manifest.color : '#6b7280'; // Default gray if not found
  };

  // Function to get element color
  const getElementColor = (elementName: string) => {
    const elementColors: { [key: string]: string } = {
      'Fire': '#EF4444',
      'Water': '#3B82F6', 
      'Air': '#10B981',
      'Earth': '#F59E0B',
      'Lightning': '#8B5CF6',
      'Light': '#FBBF24',
      'Shadow': '#6B7280',
      'Metal': '#9CA3AF'
    };
    return elementColors[elementName] || '#6b7280'; // Default gray if not found
  };

  const fetchUserData = async () => {
    if (!currentUser) return;
    
    try {
      // Fetch from both collections
      const studentsRef = doc(db, 'students', currentUser.uid);
      const usersRef = doc(db, 'users', currentUser.uid);
      
      const [studentsSnap, usersSnap] = await Promise.all([
        getDoc(studentsRef),
        getDoc(usersRef)
      ]);
      
      if (studentsSnap.exists()) {
        const userDataFromDB = studentsSnap.data();
        
        // Migrate rarity from old default (3) to new default (1)
        let rarityValue = userDataFromDB.rarity;
        if (rarityValue === 3 || rarityValue === undefined) {
          rarityValue = 1;
          // Update the database with the new rarity value
          const userRef = doc(db, 'students', currentUser.uid);
          updateDoc(userRef, { rarity: 1 }).catch(error => {
            console.error('Error updating rarity:', error);
          });
        }
        
        // Get artifacts from users collection
        let artifacts = [];
        if (usersSnap.exists()) {
          const usersData = usersSnap.data();
          artifacts = usersData.artifacts || [];
          console.log('Profile: Loaded artifacts from users collection:', artifacts);
        }
        
        // Merge students data with users artifacts
        const mergedUserData = {
          ...userDataFromDB,
          artifacts: artifacts
        };
        
        setUserData(mergedUserData);
        setDisplayName(userDataFromDB.displayName || currentUser.displayName || '');
        setBio(userDataFromDB.bio || '');
        setManifest(userDataFromDB.manifest || 'None');
        setStyle(userDataFromDB.manifestationType || 'Fire');
        setRarity(rarityValue);
        setCardBgColor(userDataFromDB.cardBgColor || '#e0e7ff');
        setMoves(userDataFromDB.moves || []);
        setBadges(userDataFromDB.badges || []);
        
        // Load manifest data
        const manifestData = studentsSnap.data().manifest;
        if (manifestData) {
          // Convert Firestore timestamp to Date if needed
          const processedManifest = {
            ...manifestData,
            lastAscension: manifestData.lastAscension?.toDate ? 
              manifestData.lastAscension.toDate() : 
              new Date(manifestData.lastAscension)
          };
          setPlayerManifest(processedManifest);
        } else {
          // No manifest found - automatically show selection
          setShowManifestSelection(true);
        }
      } else {
        // Create user document if it doesn't exist
        setUserData({ xp: 0, powerPoints: 0, challenges: {}, level: 1, rarity: 1, artifacts: [] });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    fetchUserData();
  }, [currentUser, navigate]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) {
      console.log('No file selected or no user');
      return;
    }

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size too large. Please select an image smaller than 5MB.');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, GIF, etc.)');
      return;
    }

    console.log('Starting upload for file:', file.name, 'Size:', file.size, 'Type:', file.type);
    setUploading(true);
    
    try {
      // Add timestamp to filename to avoid conflicts
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const fileName = `avatar_${timestamp}.${fileExtension}`;
      
      const storageRef = ref(storage, `profile_pictures/${currentUser.uid}/${fileName}`);
      console.log('Uploading to storage reference:', storageRef.fullPath);
      
      // Upload with metadata
      const uploadResult = await uploadBytes(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          uploadedBy: currentUser.uid,
          uploadedAt: new Date().toISOString()
        }
      });
      console.log('Upload successful:', uploadResult);
      
      const downloadURL = await getDownloadURL(storageRef);
      console.log('Download URL:', downloadURL);
      
      // Update Firebase Auth profile
      await updateProfile(currentUser, { photoURL: downloadURL });
      console.log('Firebase Auth profile updated');
      
      // Update Firestore
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { photoURL: downloadURL });
      console.log('Firestore updated');
      
      // Update local state instead of reloading
      setUserData((prev: any) => ({ ...prev, photoURL: downloadURL }));
      
      // Force a small delay to ensure state updates, then show success
      setTimeout(() => {
        alert('Avatar updated successfully! If you have a display name set, the "Update Your Profile" challenge will be automatically completed.');
      }, 100);
      
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      console.error('Error code:', error.code);
      console.error('Error details:', error.details);
      
      let errorMessage = 'Upload failed: ';
      if (error.code === 'storage/unauthorized') {
        errorMessage += 'You are not authorized to upload files. Please make sure you are logged in.';
      } else if (error.code === 'storage/canceled') {
        errorMessage += 'Upload was canceled.';
      } else if (error.code === 'storage/unknown') {
        errorMessage += 'An unknown error occurred. This might be a network issue or server problem. Please try again.';
      } else if (error.code === 'storage/invalid-format') {
        errorMessage += 'Invalid file format. Please select a valid image file.';
      } else if (error.code === 'storage/invalid-checksum') {
        errorMessage += 'File corruption detected. Please try uploading the file again.';
      } else {
        errorMessage += error.message || 'Unknown error occurred';
      }
      
      alert(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;

    try {
      // Update Firebase Auth profile
      await updateProfile(currentUser, { displayName });
      
      // Update Firestore
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { 
        displayName,
        bio,
        manifest,
        manifestationType: style, // Save style as manifestationType to keep it consistent
        rarity,
        cardBgColor,
        moves,
        updatedAt: new Date()
      });
      
      setEditing(false);
      setUserData((prev: any) => ({ ...prev, displayName, bio, manifest, manifestationType: style, rarity, cardBgColor, moves }));
      
      // Check if profile is now complete for auto-completion
      const hasDisplayName = displayName && displayName.trim() !== '';
      const hasAvatar = userData?.photoURL && userData.photoURL.trim() !== '';
      
      if (hasDisplayName && hasAvatar) {
        alert('✅ Profile updated successfully! If you have Chapter 1 active, the "Update Your Profile" challenge will be automatically completed.');
      } else {
        alert('✅ Profile updated successfully! Complete your profile with a display name and avatar to auto-complete the profile challenge.');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };



  const handleManifestSelect = async (manifestId: string) => {
    if (!currentUser) return;

    const manifest = MANIFESTS.find(m => m.id === manifestId);
    if (!manifest) return;

    const newPlayerManifest: PlayerManifest = {
      manifestId,
      currentLevel: 1,
      xp: 0,
      catalyst: manifest.catalyst,
      veil: 'Fear of inadequacy', // Default veil
      signatureMove: manifest.signatureMove,
      unlockedLevels: [1],
      lastAscension: serverTimestamp()
    };

    try {
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { manifest: newPlayerManifest });
      setPlayerManifest(newPlayerManifest);
      setUserData((prev: any) => ({ ...prev, manifest: newPlayerManifest }));
      setShowManifestSelection(false);
    } catch (error) {
      console.error('Error setting manifest:', error);
      alert('Failed to set manifest. Please try again.');
    }
  };

  const handleVeilBreak = async (veilId: string) => {
    if (!currentUser || !playerManifest) return;

    // Simple veil breaking logic - could be expanded
    const newVeil = 'Need for validation'; // Next veil
    const updatedManifest = {
      ...playerManifest,
      veil: newVeil
    };

    try {
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { manifest: updatedManifest });
      setPlayerManifest(updatedManifest);
      alert('Veil broken! New challenge awaits.');
    } catch (error) {
      console.error('Error breaking veil:', error);
      alert('Failed to break veil. Please try again.');
    }
  };

  // Function to handle admin approval/rejection of UXP artifacts
  const handleAdminResponse = async (artifactName: string, approved: boolean) => {
    if (!currentUser) return;
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const updatedArtifacts = userData.artifacts?.map((artifact: any) => {
          if (artifact.name === artifactName && artifact.pending) {
            if (approved) {
              // Mark as used and remove from inventory
              return { ...artifact, used: true, pending: false, approvedAt: new Date() };
            } else {
              // Reject - remove pending status
              return { ...artifact, pending: false, rejectedAt: new Date() };
            }
          }
          return artifact;
        }) || [];
        
        await updateDoc(userRef, {
          artifacts: updatedArtifacts
        });
        
        // If approved, also remove from students inventory
        if (approved) {
          const studentsRef = doc(db, 'students', currentUser.uid);
          const studentsSnap = await getDoc(studentsRef);
          if (studentsSnap.exists()) {
            const studentsData = studentsSnap.data();
            const currentInventory = studentsData.inventory || [];
            const updatedInventory = currentInventory.filter((item: string) => item !== artifactName);
            
            await updateDoc(studentsRef, {
              inventory: updatedInventory
            });
          }
        }
        
        // Refresh user data
        const updatedUserSnap = await getDoc(userRef);
        if (updatedUserSnap.exists()) {
          const updatedUserData = updatedUserSnap.data();
          setUserData(updatedUserData);
        }
        
        console.log(`✅ UXP artifact ${approved ? 'approved' : 'rejected'}:`, artifactName);
      }
    } catch (error) {
      console.error('Error handling admin response:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const level = userData ? getLevelFromXP(userData.xp || 0) : 1;
  const avatarUrl = userData?.photoURL || currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName || currentUser.email}&background=4f46e5&color=fff&size=128`;
  
  // Debug logging for avatar URL
  console.log('Profile: Avatar URL debug:', {
    userDataPhotoURL: userData?.photoURL,
    currentUserPhotoURL: currentUser.photoURL,
    finalAvatarUrl: avatarUrl,
    displayName: displayName || currentUser.displayName,
    email: currentUser.email
  });

  // Get the current manifest name from playerManifest state
  const currentManifest = playerManifest ? 
    MANIFESTS.find(m => m.id === playerManifest.manifestId)?.name || 'None' : 
    'None';

  // Helper function to convert rarity number to stars
  const getRarityStars = (rarityLevel: number) => {
    return Array.from({ length: rarityLevel }, (_, i) => (
      <span key={i} style={{ color: '#fbbf24', fontSize: '16px' }}>★</span>
    ));
  };

  // Add the same items array as in Marketplace for reference
  const items = [
    { name: 'Sleep - In 30 min', image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Sleep - In 1 hr', image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Shield', image: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Lunch Extension (+15)', image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=facearea&w=256&h=256&facepad=2' },
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{
        fontSize: '1.875rem',
        fontWeight: 'bold',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        Your Profile
      </h1>
      
      {/* Two-column layout: Left (Player Card + Journey) and Right (Profile Settings) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        {/* Left Column - Player Card + Player's Journey */}
        <div>
          {/* Player Card on top */}
          <div style={{ marginBottom: '2rem' }}>
            <PlayerCard
              key={`${userData?.photoURL}-${displayName}`} // Force re-render when avatar or name changes
              name={displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User'}
              photoURL={userData?.photoURL || currentUser.photoURL || avatarUrl}
              powerPoints={userData?.powerPoints || 0}
              manifest={currentManifest}
              level={level}
              rarity={rarity}
              style={style}
              description={bio}
              cardBgColor={cardBgColor}
              moves={moves}
              badges={badges}
              xp={userData?.xp || 0}
              userId={currentUser?.uid}
              onManifestReselect={() => setShowManifestSelection(true)}
              ordinaryWorld={userData?.ordinaryWorld}
            />
          </div>
          
        </div>

        {/* Right Column - Profile Settings only */}
        <div>
          {/* Profile Settings */}
          <div className="profile-settings" style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#4f46e5' }}>
              👤 Profile Settings
            </h2>
            <div className="profile-card" style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '2rem' }}>
              {/* Avatar Section */}
              <div style={{ position: 'relative' }}>
                <img
                  key={avatarUrl} // Force re-render when avatar changes
                  src={avatarUrl}
                  alt="Profile"
                  style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #4f46e5' }}
                />
                <label style={{ position: 'absolute', bottom: '0', right: '0', backgroundColor: uploading ? '#9ca3af' : '#4f46e5', color: 'white', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '14px', opacity: uploading ? 0.7 : 1 }}>
                  {uploading ? '⏳' : '📷'}
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} disabled={uploading} />
                </label>
              </div>
              {/* User Info Edit Controls */}
              <div style={{ flex: 1 }}>
                {editing ? (
                  <div>
                    <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} style={{ fontSize: '1.5rem', fontWeight: 'bold', border: '1px solid #d1d5db', borderRadius: '0.375rem', padding: '0.5rem', marginBottom: '0.5rem', width: '100%' }} placeholder="Display Name" />
                    <textarea value={bio} onChange={e => setBio(e.target.value)} style={{ border: '1px solid #d1d5db', borderRadius: '0.375rem', padding: '0.5rem', width: '100%', minHeight: '80px', resize: 'vertical' }} placeholder="Tell us about yourself..." />
                    <div style={{ margin: '0.5rem 0' }}>
                      <span style={{ marginRight: 16 }}><b>Manifest:</b> <span style={{ color: getManifestColor(currentManifest), fontWeight: 'bold' }}>{currentManifest}</span></span>
                      <span style={{ marginRight: 16 }}><b>Element:</b> <span style={{ color: getElementColor(style), fontWeight: 'bold' }}>{style || 'None'}</span></span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <b>Rarity:</b> {getRarityStars(rarity)}
                      </span>
                    </div>
                    <div style={{ margin: '1rem 0' }}>
                      <label><b>Card Background Color:</b></label>
                      <div style={{ marginTop: 8 }}>
                        <SketchPicker color={cardBgColor} onChange={(color: any) => setCardBgColor(color.hex)} />
                      </div>
                    </div>
                    {level >= 3 && (
                      <div style={{ margin: '1.5rem 0' }}>
                        <label><b>Design Your Moves</b></label>
                        <div style={{ margin: '0.5rem 0' }}>
                          {moves.map((move: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 20 }}>{move.icon}</span>
                              <span style={{ fontWeight: 'bold' }}>{move.name}</span>
                              <span style={{ color: '#6b7280' }}>{move.description}</span>
                              <button onClick={() => setMoves(moves.filter((_: any, i: number) => i !== idx))} style={{ marginLeft: 8, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input type="text" value={newMove.icon} onChange={e => setNewMove({ ...newMove, icon: e.target.value })} placeholder="Icon (e.g. ⚡)" style={{ width: 50 }} />
                          <input type="text" value={newMove.name} onChange={e => setNewMove({ ...newMove, name: e.target.value })} placeholder="Move Name" style={{ flex: 1 }} />
                          <input type="text" value={newMove.description} onChange={e => setNewMove({ ...newMove, description: e.target.value })} placeholder="Description" style={{ flex: 2 }} />
                          <button onClick={() => {
                            if (newMove.name && newMove.icon) {
                              setMoves([...moves, newMove]);
                              setNewMove({ name: '', description: '', icon: '' });
                            }
                          }} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: 4, padding: '0.5rem 1rem', cursor: 'pointer' }}>Add</button>
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: '1rem' }}>
                      <button onClick={handleSaveProfile} style={{ backgroundColor: '#10b981', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', marginRight: '0.5rem', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditing(false)} style={{ backgroundColor: '#6b7280', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User'}</h2>
                    <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{bio || 'No bio yet. Click edit to add one!'}</p>
                    <div style={{ margin: '0.5rem 0' }}>
                      <span style={{ marginRight: 16 }}><b>Manifest:</b> <span style={{ color: getManifestColor(currentManifest), fontWeight: 'bold' }}>{currentManifest}</span></span>
                      <span style={{ marginRight: 16 }}><b>Element:</b> <span style={{ color: getElementColor(style), fontWeight: 'bold' }}>{style || 'None'}</span></span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <b>Rarity:</b> {getRarityStars(rarity)}
                      </span>
                    </div>
                    {currentManifest !== 'None' && (
                      <div style={{ margin: '0.5rem 0' }}>
                        <button
                          onClick={() => setShowManifestSelection(true)}
                          style={{
                            backgroundColor: '#8b5cf6',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          🔄 Re-select Manifest
                        </button>
                      </div>
                    )}
                    {userData?.rival && (
                      <div style={{ 
                        margin: '0.5rem 0', 
                        padding: '0.75rem', 
                        backgroundColor: '#fef2f2', 
                        border: '1px solid #fecaca', 
                        borderRadius: '0.5rem',
                        borderLeft: '4px solid #dc2626'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '1.25rem' }}>⚔️</span>
                          <span style={{ fontWeight: 'bold', color: '#dc2626' }}>Rival:</span>
                          <span style={{ fontWeight: 'bold' }}>{userData.rival.name}</span>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          {userData.rival.description}
                        </div>
                        {userData.rival.isDefeated && (
                          <div style={{ 
                            marginTop: '0.5rem', 
                            padding: '0.25rem 0.5rem', 
                            backgroundColor: '#dcfce7', 
                            color: '#166534', 
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            ✅ Rival Defeated
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={() => setEditing(true)} style={{ backgroundColor: '#4f46e5', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}>Edit Profile</button>
                  </div>
                )}
              </div>
            </div>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              <div style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>{userData?.xp || 0}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total XP</div>
              </div>
              <div style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>{level}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Level</div>
              </div>
              <div style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>{userData?.powerPoints || 0}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Power Points</div>
              </div>
              <div style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>{Object.values(userData?.challenges || {}).filter(Boolean).length}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Challenges Completed</div>
              </div>
            </div>
          </div>


        </div>
      </div>
      
      {/* Manifest Progress Section - Aligned to left edge of Power Card */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', marginBottom: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#4f46e5' }}>
          ⚡ Manifest Progress
        </h2>
        {playerManifest ? (
          <ManifestProgress 
            playerManifest={playerManifest} 
            onVeilBreak={handleVeilBreak}
            userId={currentUser?.uid}
            onAbilityUsed={() => {
              // Refresh user data to show updated usage counts
              if (currentUser?.uid) {
                fetchUserData();
              }
            }}
          />
        ) : (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            borderRadius: '0.5rem',
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#4f46e5' }}>
              Choose Your Manifest
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will.
            </p>
            <button
              onClick={() => setShowManifestSelection(true)}
              style={{
                backgroundColor: '#4f46e5',
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              Select Your Manifest
            </button>
          </div>
        )}
      </div>
      
      {/* Purchased Artifacts Section */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', marginBottom: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5', margin: 0 }}>🛒 Purchased Artifacts</h2>
          {userData?.artifacts && userData.artifacts.length > 0 && (
            <div style={{ 
              background: '#f3f4f6', 
              padding: '0.5rem 1rem', 
              borderRadius: '1rem', 
              fontSize: '0.875rem',
              color: '#6b7280'
            }}>
              {userData.artifacts.filter((a: any) => !a.used && !a.pending).length} Available • {userData.artifacts.filter((a: any) => a.pending).length} In Use • {userData.artifacts.filter((a: any) => a.used).length} Used
            </div>
          )}
        </div>
        
        {userData?.artifacts && userData.artifacts.length > 0 ? (
          <div>
            {/* Available Artifacts */}
            {userData.artifacts.filter((artifact: any) => !artifact.used).length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
                  Available Artifacts ({userData.artifacts.filter((a: any) => !a.used).length})
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                  {userData.artifacts.filter((artifact: any) => !artifact.used).map((artifact: any) => {
                    const enhancedArtifact = enhanceLegacyItem(artifact);
                    const getRarityColor = (rarity: string) => {
                      switch (rarity) {
                        case 'common': return '#6b7280';
                        case 'rare': return '#3b82f6';
                        case 'epic': return '#8b5cf6';
                        case 'legendary': return '#f59e0b';
                        default: return '#6b7280';
                      }
                    };

                    return (
                      <div key={enhancedArtifact.id || artifact} style={{ 
                        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
                        borderRadius: '0.75rem', 
                        padding: '1rem', 
                        textAlign: 'center', 
                        boxShadow: '0 2px 4px 0 rgba(0,0,0,0.1)', 
                        border: `2px solid ${getRarityColor(enhancedArtifact.rarity || 'common')}`,
                        transition: 'all 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 8px 0 rgba(0,0,0,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px 0 rgba(0,0,0,0.1)';
                      }}>
                        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                          {enhancedArtifact.image ? (
                            <img 
                              src={enhancedArtifact.image} 
                              alt={enhancedArtifact.name || 'Artifact'} 
                              style={{ 
                                width: '100%', 
                                height: '100px', 
                                objectFit: 'cover', 
                                borderRadius: '0.5rem',
                                border: `1px solid ${getRarityColor(enhancedArtifact.rarity || 'common')}20`
                              }} 
                            />
                          ) : (
                            <div style={{ 
                              width: '100%', 
                              height: '100px', 
                              background: '#f3f4f6', 
                              borderRadius: '0.5rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '2rem',
                              color: '#9ca3af'
                            }}>
                              {enhancedArtifact.icon || '📦'}
                            </div>
                          )}
                          {enhancedArtifact.rarity && (
                            <div style={{ 
                              position: 'absolute',
                              top: '0.5rem',
                              right: '0.5rem',
                              background: getRarityColor(enhancedArtifact.rarity),
                              color: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }}>
                              {enhancedArtifact.rarity}
                            </div>
                          )}
                        </div>
                        
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#1f2937', marginBottom: '0.25rem', lineHeight: '1.2' }}>
                          {enhancedArtifact.name || 'Unknown Item'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem', lineHeight: '1.3' }}>
                          {enhancedArtifact.description || 'No description available'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                          {enhancedArtifact.purchasedAt ? new Date(enhancedArtifact.purchasedAt.seconds * 1000).toLocaleDateString() : (enhancedArtifact.isLegacy ? 'Legacy Item' : 'Unknown')}
                        </div>
                        
                        <button 
                          style={{ 
                            backgroundColor: artifact.pending ? '#f59e0b' : '#4f46e5', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '0.375rem', 
                            padding: '0.5rem 0.75rem', 
                            cursor: artifact.pending ? 'not-allowed' : 'pointer', 
                            fontWeight: 'bold',
                            fontSize: '0.8rem',
                            width: '100%',
                            transition: 'background-color 0.2s ease',
                            opacity: artifact.pending ? 0.7 : 1
                          }} 
                          onMouseEnter={(e) => {
                            if (!artifact.pending) {
                              e.currentTarget.style.backgroundColor = '#3730a3';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!artifact.pending) {
                              e.currentTarget.style.backgroundColor = '#4f46e5';
                            }
                          }}
                          disabled={artifact.pending}
                          onClick={async () => {
                            if (!currentUser) return;
                            
                            // Handle Shield artifact specifically
                            if (enhancedArtifact.name === 'Shield') {
                              try {
                                // Get current vault data
                                const vaultRef = doc(db, 'vaults', currentUser.uid);
                                const vaultSnap = await getDoc(vaultRef);
                                
                                if (vaultSnap.exists()) {
                                  const vaultData = vaultSnap.data();
                                  
                                  // Add overshield (absorbs next attack)
                                  await updateDoc(vaultRef, {
                                    overshield: (vaultData.overshield || 0) + 1
                                  });
                                  
                                  // Mark artifact as used
                                  const userRef = doc(db, 'users', currentUser.uid);
                                  const userSnap = await getDoc(userRef);
                                  if (userSnap.exists()) {
                                    const userData = userSnap.data();
                                    const updatedArtifacts = userData.artifacts?.map((artifact: any) => {
                                      // Handle both legacy artifacts (strings) and new artifacts (objects)
                                      if (typeof artifact === 'string') {
                                        // Legacy artifact stored as string - match by name
                                        return artifact === enhancedArtifact.name ? { 
                                          id: enhancedArtifact.id,
                                          name: enhancedArtifact.name,
                                          description: enhancedArtifact.description,
                                          icon: enhancedArtifact.icon,
                                          image: enhancedArtifact.image,
                                          category: enhancedArtifact.category,
                                          rarity: enhancedArtifact.rarity,
                                          purchasedAt: null,
                                          used: true,
                                          isLegacy: true
                                        } : artifact;
                                      } else {
                                        // New artifact stored as object - match by ID or name
                                        return (artifact.id === enhancedArtifact.id || artifact.name === enhancedArtifact.name) 
                                          ? { ...artifact, used: true } 
                                          : artifact;
                                      }
                                    }) || [];
                                    
                                    await updateDoc(userRef, {
                                      artifacts: updatedArtifacts
                                    });
                                    
                                    // Also update the students collection inventory to keep both in sync
                                    const studentsRef = doc(db, 'students', currentUser.uid);
                                    const studentsSnap = await getDoc(studentsRef);
                                    if (studentsSnap.exists()) {
                                      const studentsData = studentsSnap.data();
                                      const currentInventory = studentsData.inventory || [];
                                      // Remove the used artifact from inventory
                                      const updatedInventory = currentInventory.filter((item: string) => item !== enhancedArtifact.name);
                                      
                                      await updateDoc(studentsRef, {
                                        inventory: updatedInventory
                                      });
                                      
                                      console.log('✅ Students inventory updated:', updatedInventory);
                                    }
                                    
                                    console.log('✅ Shield artifact marked as used:', updatedArtifacts);
                                  }
                                  
                                  // Force a refresh of the user data to update the UI
                                  // Trigger a re-fetch of user data
                                  const updatedUserSnap = await getDoc(userRef);
                                  if (updatedUserSnap.exists()) {
                                    const updatedUserData = updatedUserSnap.data();
                                    setUserData(updatedUserData);
                                  }
                                  
                                  alert('🛡️ Shield artifact activated! Your vault now has an overshield that will absorb the next attack.');
                                } else {
                                  alert('Error: Vault not found. Please try again.');
                                }
                              } catch (error) {
                                console.error('Error using Shield artifact:', error);
                                alert('Error using Shield artifact. Please try again.');
                              }
                            } else {
                              // Handle other artifacts (send to admin)
                              await addDoc(collection(db, 'usedItems'), {
                                userId: currentUser.uid,
                                userEmail: currentUser.email,
                                itemName: enhancedArtifact.name,
                                artifactId: enhancedArtifact.id,
                                timestamp: serverTimestamp()
                              });
                              
                              // Create admin notification for artifact usage
                              await addDoc(collection(db, 'adminNotifications'), {
                                type: 'artifact_usage',
                                title: 'Artifact Usage Request',
                                message: `${currentUser.displayName || currentUser.email} wants to use ${enhancedArtifact.name}`,
                                data: {
                                  userId: currentUser.uid,
                                  userName: currentUser.displayName || currentUser.email,
                                  artifactName: enhancedArtifact.name,
                                  artifactId: enhancedArtifact.id,
                                  usageTime: new Date(),
                                  location: 'Profile'
                                },
                                createdAt: new Date(),
                                read: false
                              });
                              
                              // Also update both collections to mark artifact as used
                              const userRef = doc(db, 'users', currentUser.uid);
                              const userSnap = await getDoc(userRef);
                              if (userSnap.exists()) {
                                const userData = userSnap.data();
                                const updatedArtifacts = userData.artifacts?.map((artifact: any) => {
                                  if (typeof artifact === 'string') {
                                    return artifact === enhancedArtifact.name ? { 
                                      id: enhancedArtifact.id,
                                      name: enhancedArtifact.name,
                                      description: enhancedArtifact.description,
                                      icon: enhancedArtifact.icon,
                                      image: enhancedArtifact.image,
                                      category: enhancedArtifact.category,
                                      rarity: enhancedArtifact.rarity,
                                      purchasedAt: null,
                                      used: true,
                                      isLegacy: true
                                    } : artifact;
                                  } else {
                                    return (artifact.id === enhancedArtifact.id || artifact.name === enhancedArtifact.name) 
                                      ? { ...artifact, used: true, usedAt: new Date() } 
                                      : artifact;
                                  }
                                }) || [];
                                
                                // For UXP artifacts, mark as "pending" instead of "used"
                                const isUXPArtifact = enhancedArtifact.name.includes('UXP');
                                const artifactStatus = isUXPArtifact ? 'pending' : 'used';
                                
                                const finalUpdatedArtifacts = updatedArtifacts.map((artifact: any) => {
                                  // Handle both legacy artifacts (strings) and new artifacts (objects)
                                  if (typeof artifact === 'string') {
                                    // Legacy artifact stored as string - match by name
                                    if (artifact === enhancedArtifact.name) {
                                      return { 
                                        id: enhancedArtifact.id,
                                        name: enhancedArtifact.name,
                                        description: enhancedArtifact.description,
                                        icon: enhancedArtifact.icon,
                                        image: enhancedArtifact.image,
                                        category: enhancedArtifact.category,
                                        rarity: enhancedArtifact.rarity,
                                        purchasedAt: null,
                                        used: artifactStatus === 'used',
                                        pending: artifactStatus === 'pending',
                                        submittedAt: new Date(),
                                        isLegacy: true
                                      };
                                    }
                                    return artifact;
                                  } else {
                                    // New artifact stored as object - match by ID or name
                                    if (artifact.id === enhancedArtifact.id || artifact.name === enhancedArtifact.name) {
                                      return { 
                                        ...artifact, 
                                        used: artifactStatus === 'used',
                                        pending: artifactStatus === 'pending',
                                        submittedAt: new Date()
                                      };
                                    }
                                    return artifact;
                                  }
                                });
                                
                                await updateDoc(userRef, {
                                  artifacts: finalUpdatedArtifacts
                                });
                                
                                // For UXP artifacts, don't remove from students inventory yet (wait for admin approval)
                                if (!isUXPArtifact) {
                                  // Also update the students collection inventory for non-UXP artifacts
                                  const studentsRef = doc(db, 'students', currentUser.uid);
                                  const studentsSnap = await getDoc(studentsRef);
                                  if (studentsSnap.exists()) {
                                    const studentsData = studentsSnap.data();
                                    const currentInventory = studentsData.inventory || [];
                                    const updatedInventory = currentInventory.filter((item: string) => item !== enhancedArtifact.name);
                                    
                                    await updateDoc(studentsRef, {
                                      inventory: updatedInventory
                                    });
                                    
                                    console.log('✅ Students inventory updated for non-UXP artifact:', updatedInventory);
                                  }
                                }
                                
                                console.log(`✅ Artifact marked as ${artifactStatus} for admin request:`, finalUpdatedArtifacts);
                              }
                              
                              alert('Your request to use this artifact has been sent to the admin!');
                            }
                          }}
                        >
                          {artifact.pending ? 'In Use' : 'Use Artifact'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Used Artifacts */}
            {userData.artifacts.filter((artifact: any) => artifact.used).length > 0 && (
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
                  Used Artifacts ({userData.artifacts.filter((a: any) => a.used).length})
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
                  {userData.artifacts.filter((artifact: any) => artifact.used).map((artifact: any) => {
                    const getRarityColor = (rarity: string) => {
                      switch (rarity) {
                        case 'common': return '#6b7280';
                        case 'rare': return '#3b82f6';
                        case 'epic': return '#8b5cf6';
                        case 'legendary': return '#f59e0b';
                        default: return '#6b7280';
                      }
                    };

                    return (
                      <div key={artifact.id} style={{ 
                        background: '#f9fafb', 
                        borderRadius: '0.5rem', 
                        padding: '0.75rem', 
                        textAlign: 'center', 
                        border: '1px solid #e5e7eb',
                        opacity: 0.7
                      }}>
                        <div style={{ marginBottom: '0.5rem' }}>
                          {typeof artifact === 'object' && artifact.image ? (
                            <img 
                              src={artifact.image} 
                              alt={artifact.name || 'Artifact'} 
                              style={{ 
                                width: '100%', 
                                height: '60px', 
                                objectFit: 'cover', 
                                borderRadius: '0.25rem',
                                filter: 'grayscale(100%)'
                              }} 
                            />
                          ) : (
                            <div style={{ 
                              width: '100%', 
                              height: '60px', 
                              background: '#e5e7eb', 
                              borderRadius: '0.25rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.5rem',
                              color: '#9ca3af'
                            }}>
                              {typeof artifact === 'object' ? (artifact.icon || '📦') : '📦'}
                            </div>
                          )}
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                          {typeof artifact === 'string' ? artifact : artifact.name || 'Unknown Item'}
                        </div>
                        {typeof artifact === 'object' && artifact.rarity && (
                          <div style={{ 
                            fontSize: '0.7rem', 
                            color: getRarityColor(artifact.rarity), 
                            fontWeight: 'bold',
                            textTransform: 'uppercase'
                          }}>
                            {artifact.rarity}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem 1rem',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛒</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              No Artifacts Yet
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              Visit the MST MKT to purchase your first artifact!
            </div>
          </div>
        )}
      </div>

      {/* Admin Debug Section for UXP Artifact Management */}
      {userData?.artifacts?.some((artifact: any) => artifact.pending) && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#92400e' }}>
            🔧 Admin Debug: Pending UXP Artifacts
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {userData.artifacts.filter((artifact: any) => artifact.pending).map((artifact: any) => (
              <div key={artifact.name} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem',
                backgroundColor: 'white',
                borderRadius: '0.25rem',
                border: '1px solid #d1d5db'
              }}>
                <span style={{ fontWeight: 'bold', color: '#374151' }}>
                  {artifact.name} (Submitted: {artifact.submittedAt ? new Date(artifact.submittedAt).toLocaleString() : 'Unknown'})
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleAdminResponse(artifact.name, true)}
                    style={{
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => handleAdminResponse(artifact.name, false)}
                    style={{
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manifest Selection Modal */}
      {showManifestSelection && (
        <ManifestSelection
          onManifestSelect={handleManifestSelect}
          onClose={() => setShowManifestSelection(false)}
        />
      )}
    </div>
  );
};

export default Profile; 