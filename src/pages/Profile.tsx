import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db, storage } from '../firebase';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, getDocs, DocumentReference, DocumentData, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import ChallengeTracker from '../components/ChallengeTracker';
import PlayerCard from '../components/PlayerCard';
import { SketchPicker } from 'react-color';
import { getLevelFromXP } from '../utils/leveling';

interface Notification {
  id: string;
  _ref: DocumentReference<DocumentData, DocumentData>;
  type: string;
  message: string;
  challengeId?: string;
  challengeName?: string;
  timestamp?: any;
  read?: boolean;
}

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
  const [rarity, setRarity] = useState(userData?.rarity || 3);
  const [cardBgColor, setCardBgColor] = useState(userData?.cardBgColor || '#e0e7ff');
  const [moves, setMoves] = useState(userData?.moves || []);
  const [newMove, setNewMove] = useState({ name: '', description: '', icon: '' });
  const [badges, setBadges] = useState(userData?.badges || []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const fetchUserData = async () => {
      try {
        const userRef = doc(db, 'students', currentUser.uid);
        const docSnap = await getDoc(userRef);
        
        if (docSnap.exists()) {
          setUserData(docSnap.data());
          setDisplayName(docSnap.data().displayName || currentUser.displayName || '');
          setBio(docSnap.data().bio || '');
          setManifest(docSnap.data().manifest || 'None');
          setStyle(docSnap.data().manifestationType || 'Fire');
          setRarity(docSnap.data().rarity || 3);
          setCardBgColor(docSnap.data().cardBgColor || '#e0e7ff');
          setMoves(docSnap.data().moves || []);
          setBadges(docSnap.data().badges || []);
        } else {
          // Create user document if it doesn't exist
          setUserData({ xp: 0, powerPoints: 0, challenges: {}, level: 1 });
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchNotifications = async () => {
      setNotificationsLoading(true);
      try {
        const notifSnap = await getDocs(collection(db, 'students', currentUser.uid, 'notifications'));
        const notifList: Notification[] = notifSnap.docs.map(docSnap => {
          const data = docSnap.data() as Notification;
          return { ...data, id: docSnap.id, _ref: docSnap.ref };
        });
        setNotifications(notifList.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
        // Mark all unread notifications as read
        notifList.forEach(async (notif, idx) => {
          if (notif.read === false) {
            await updateDoc(notif._ref, { read: true });
          }
        });
      } catch (err) {
        setNotifications([]);
      } finally {
        setNotificationsLoading(false);
      }
    };

    fetchUserData();
    fetchNotifications();
  }, [currentUser, navigate]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) {
      console.log('No file selected or no user');
      return;
    }

    console.log('Starting upload for file:', file.name, 'Size:', file.size);
    setUploading(true);
    
    try {
      const storageRef = ref(storage, `avatars/${currentUser.uid}`);
      console.log('Uploading to storage reference:', storageRef.fullPath);
      
      const uploadResult = await uploadBytes(storageRef, file);
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
      
      // Show success message
      alert('Avatar updated successfully!');
      
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      alert(`Upload failed: ${error.message}`);
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
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  const handleDeleteNotification = async (notifId: string, notifRef: DocumentReference<DocumentData, DocumentData>) => {
    try {
      await deleteDoc(notifRef);
      setNotifications(prev => prev.filter(n => n.id !== notifId));
    } catch (err) {
      alert('Failed to delete notification.');
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
  const avatarUrl = currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName || currentUser.email}&background=4f46e5&color=fff&size=128`;

  // Check if student has earned Imposition (Level 5+)
  const hasEarnedImposition = level >= 5;
  const currentManifest = hasEarnedImposition ? (userData?.manifest || 'Imposition') : 'None';

  // Add the same items array as in Marketplace for reference
  const items = [
    { name: 'Sleep - In 30 min', image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Sleep - In 1 hr', image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Shield', image: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Lunch Extension (+15)', image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=facearea&w=256&h=256&facepad=2' },
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{
        fontSize: '1.875rem',
        fontWeight: 'bold',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        Your Profile
      </h1>
      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', marginBottom: '2rem' }}>
        {/* PlayerCard on the left */}
        <div style={{ flex: '0 0 340px' }}>
          <PlayerCard
            name={displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User'}
            photoURL={userData?.photoURL || avatarUrl}
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
          />
        </div>
        {/* Edit controls on the right */}
        <div style={{ flex: 1 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '2rem' }}>
              {/* Avatar Section */}
              <div style={{ position: 'relative' }}>
                <img
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
                      <span style={{ marginRight: 16 }}><b>Manifest:</b> {currentManifest}</span>
                      <span style={{ marginRight: 16 }}><b>Element:</b> {style || 'None'}</span>
                      <span><b>Rarity:</b> {rarity}</span>
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
                      <span style={{ marginRight: 16 }}><b>Manifest:</b> {currentManifest}</span>
                      <span style={{ marginRight: 16 }}><b>Element:</b> {style || 'None'}</span>
                      <span><b>Rarity:</b> {rarity}</span>
                    </div>
                    <button onClick={() => setEditing(true)} style={{ backgroundColor: '#4f46e5', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}>Edit Profile</button>
                  </div>
                )}
              </div>
            </div>
            {/* Stats Grid (unchanged) */}
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
      {/* Purchased Items Gallery and Challenge Tracker remain unchanged */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', marginBottom: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb', marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#4f46e5' }}>Purchased Items</h2>
        {userData?.inventory && userData.inventory.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.5rem' }}>
            {userData.inventory.map((itemName: string) => {
              const item = items.find(i => i.name === itemName);
              return (
                <div key={itemName} style={{ background: '#f3f4f6', borderRadius: '0.5rem', padding: '1rem', textAlign: 'center', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                  {item?.image && (
                    <img src={item.image} alt={itemName} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '0.5rem', marginBottom: 12 }} />
                  )}
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#1f2937' }}>{itemName}</div>
                  <button style={{ marginTop: 12, backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 'bold' }} onClick={async () => {
                    if (!currentUser) return;
                    await addDoc(collection(db, 'usedItems'), {
                      userId: currentUser.uid,
                      userEmail: currentUser.email,
                      itemName,
                      timestamp: serverTimestamp()
                    });
                    alert('Your request to use this item has been sent to the admin!');
                  }}>
                    Use
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
            You haven&apos;t purchased any items yet.
          </div>
        )}
      </div>
      {/* Notifications Section */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#4f46e5', marginBottom: '1rem' }}>Notifications</h2>
        {notificationsLoading ? (
          <div style={{ color: '#6b7280' }}>Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No notifications yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {notifications.map(notif => (
              <li key={notif.id} style={{ background: notif.type === 'challenge_denied' ? '#fee2e2' : '#d1fae5', color: '#1f2937', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem', border: notif.type === 'challenge_denied' ? '1px solid #dc2626' : '1px solid #10b981', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)', position: 'relative' }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{notif.challengeName}</div>
                <div>{notif.message}</div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 4 }}>{notif.timestamp && typeof notif.timestamp.toDate === 'function' ? notif.timestamp.toDate().toLocaleString() : ''}</div>
                <button
                  onClick={() => handleDeleteNotification(notif.id, notif._ref)}
                  style={{ position: 'absolute', top: 8, right: 8, background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.25rem 0.75rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
                  title="Delete notification"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ChallengeTracker />
    </div>
  );
};

export default Profile; 