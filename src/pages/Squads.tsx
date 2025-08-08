import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, doc, getDocs, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc } from 'firebase/firestore';
import PlayerCard from '../components/PlayerCard';
import SquadCard from '../components/SquadCard';
import InviteModal from '../components/InviteModal';
import InvitationManager from '../components/InvitationManager';
import { MANIFESTS } from '../types/manifest';

interface SquadMember {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  level: number;
  xp: number;
  powerPoints?: number;
  manifest?: string;
  rarity?: number;
  style?: string;
  description?: string;
  cardBgColor?: string;
  role?: string;
  isLeader?: boolean;
  isAdmin?: boolean;
}

interface Squad {
  id: string;
  name: string;
  members: SquadMember[];
  leader: string;
  createdAt: Date;
  description?: string;
  maxMembers: number;
}

const Squads: React.FC = () => {
  const { currentUser } = useAuth();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<SquadMember[]>([]);
  const [currentSquad, setCurrentSquad] = useState<Squad | null>(null);
  const [isCreatingSquad, setIsCreatingSquad] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newSquadName, setNewSquadName] = useState('');
  const [newSquadDescription, setNewSquadDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my-squad' | 'all-squads' | 'available-players'>('my-squad');

  // Fetch all squads and available players
  useEffect(() => {
    if (!currentUser) return;

    console.log('Squads: Starting to fetch squads and players for user:', currentUser.uid);

    const fetchSquadsAndPlayers = async () => {
      setLoading(true);
      try {
        // Fetch all squads
        console.log('Squads: Fetching squads...');
        const squadsSnapshot = await getDocs(collection(db, 'squads'));
        const squadsData: Squad[] = squadsSnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('Squads: Squad data:', { id: doc.id, ...data });
          return {
            id: doc.id,
            ...data
          } as Squad;
        });

        console.log('Squads: Total squads found:', squadsData.length);

        // Find current user's squad
        const userSquad = squadsData.find(squad => 
          squad.members.some(member => member.uid === currentUser.uid)
        );

        console.log('Squads: User squad found:', userSquad ? userSquad.name : 'None');

        setSquads(squadsData);
        setCurrentSquad(userSquad || null);

        // Fetch all available players (not in any squad)
        console.log('Squads: Fetching users...');
        // Try to get users from both collections to find manifest data
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        
        // Create a map of student data by UID
        const studentDataMap = new Map();
        studentsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          studentDataMap.set(doc.id, data);
        });
        
        const allUsers: SquadMember[] = usersSnapshot.docs.map(doc => {
          const data = doc.data();
          const studentData = studentDataMap.get(doc.id);
          
          console.log('Squads: User data:', { uid: doc.id, ...data });
          if (studentData) {
            console.log('Squads: Student data for', doc.id, ':', studentData);
          }
          
          // Detailed logging for manifest extraction debugging
          console.log('Squads: Manifest extraction debug for', doc.id, ':', {
            userData_manifest: data.manifest,
            userData_manifestType: typeof data.manifest,
            userData_manifestId: data.manifest && typeof data.manifest === 'object' ? (data.manifest as any).manifestId : null,
            userData_playerManifest: data.playerManifest,
            userData_bio: data.bio,
            userData_manifestationType: data.manifestationType,
            userData_style: data.style,
            studentData_manifest: studentData?.manifest,
            studentData_manifestType: typeof studentData?.manifest,
            studentData_manifestId: studentData?.manifest && typeof studentData.manifest === 'object' ? studentData.manifest.manifestId : null,
            studentData_playerManifest: studentData?.playerManifest,
            studentData_bio: studentData?.bio,
            studentData_manifestationType: studentData?.manifestationType,
            studentData_style: studentData?.style
          });
          
          // Try to get manifest from multiple sources
          let manifest = 'Unknown';
          let manifestSource = 'none';
          
          // Priority order: manifest abilities first, then elements
          // 1. Try playerManifest.manifestId (actual chosen manifest)
          if (data.playerManifest && typeof data.playerManifest === 'object' && data.playerManifest.manifestId) {
            manifest = data.playerManifest.manifestId;
            manifestSource = 'userData.playerManifest.manifestId';
          } else if (studentData?.playerManifest && typeof studentData.playerManifest === 'object' && studentData.playerManifest.manifestId) {
            manifest = studentData.playerManifest.manifestId;
            manifestSource = 'studentData.playerManifest.manifestId';
          }
          // 2. Try manifest.manifestId (most specific ability)
          else if (data.manifest && typeof data.manifest === 'object' && (data.manifest as any).manifestId) {
            manifest = (data.manifest as any).manifestId;
            manifestSource = 'userData.manifest.manifestId';
          } else if (studentData?.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
            manifest = studentData.manifest.manifestId;
            manifestSource = 'studentData.manifest.manifestId';
          }
          // 3. Try manifest (string) (e.g., "Imposition", "reading") - but filter out invalid manifests for Level 1
          else if (data.manifest && typeof data.manifest === 'string') {
            const level = data.level || studentData?.level || 1;
            // Filter out advanced manifests for Level 1 players
            if (level <= 1 && ['Imposition', 'Memory', 'Intelligence', 'Dimensional', 'Truth', 'Creation'].includes(data.manifest)) {
              console.log(`Squads: Skipping invalid manifest "${data.manifest}" for Level ${level} player`);
            } else {
              manifest = data.manifest;
              manifestSource = 'userData.manifest (string)';
            }
          } else if (studentData?.manifest && typeof studentData.manifest === 'string') {
            const level = data.level || studentData?.level || 1;
            // Filter out advanced manifests for Level 1 players
            if (level <= 1 && ['Imposition', 'Memory', 'Intelligence', 'Dimensional', 'Truth', 'Creation'].includes(studentData.manifest)) {
              console.log(`Squads: Skipping invalid manifest "${studentData.manifest}" for Level ${level} player`);
            } else {
              manifest = studentData.manifest;
              manifestSource = 'studentData.manifest (string)';
            }
          }
          // 4. Try bio (e.g., "Lightning Style")
          else if (data.bio) {
            manifest = data.bio;
            manifestSource = 'userData.bio';
          } else if (studentData?.bio) {
            manifest = studentData.bio;
            manifestSource = 'studentData.bio';
          }
          // 5. Try manifestationType (elements) - prioritize for Level 1 players with invalid manifests
          else if (data.manifestationType) {
            manifest = data.manifestationType;
            manifestSource = 'userData.manifestationType';
          } else if (studentData?.manifestationType) {
            manifest = studentData.manifestationType;
            manifestSource = 'studentData.manifestationType';
          }
          // 6. Try style (elements) - prioritize for Level 1 players with invalid manifests
          else if (data.style) {
            manifest = data.style;
            manifestSource = 'userData.style';
          } else if (studentData?.style) {
            manifest = studentData.style;
            manifestSource = 'studentData.style';
          }
          // 7. Try manifest.manifestationType (elements within manifest object)
          else if (data.manifest && typeof data.manifest === 'object' && (data.manifest as any).manifestationType) {
            manifest = (data.manifest as any).manifestationType;
            manifestSource = 'userData.manifest.manifestationType';
          } else if (studentData?.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestationType) {
            manifest = studentData.manifest.manifestationType;
            manifestSource = 'studentData.manifest.manifestationType';
          }
          
          console.log('Squads: Extracted manifest for', doc.id, ':', manifest, 'from', manifestSource);
          
          return {
            uid: doc.id,
            displayName: data.displayName || data.email?.split('@')[0] || 'Unknown',
            email: data.email || '',
            photoURL: data.photoURL,
            level: data.level || studentData?.level || 1,
            xp: data.xp || studentData?.xp || 0,
            powerPoints: data.powerPoints || studentData?.powerPoints || 0,
            manifest: manifest,
            rarity: data.rarity || studentData?.rarity || 1,
            style: data.style || studentData?.style || 'Fire',
            description: data.bio || studentData?.bio || `Member of the community`,
            cardBgColor: data.cardBgColor || studentData?.cardBgColor || '#e0e7ff',
            role: data.role || 'Member'
          };
        });

        console.log('Squads: Total users found:', allUsers.length);

        // Filter out players already in squads
        const squadMemberIds = squadsData.flatMap(squad => 
          squad.members.map(member => member.uid)
        );
        console.log('Squads: Squad member IDs:', squadMemberIds);
        
        const available = allUsers.filter(user => 
          !squadMemberIds.includes(user.uid) && user.uid !== currentUser.uid
        );

        console.log('Squads: Available players:', available.length, available.map(u => u.displayName));

        setAvailablePlayers(available);
      } catch (error) {
        console.error('Squads: Error fetching squads and players:', error);
      } finally {
        setLoading(false);
        console.log('Squads: Loading complete');
      }
    };

    fetchSquadsAndPlayers();

    // Set up real-time listener for squads
    const unsubscribe = onSnapshot(collection(db, 'squads'), async (snapshot) => {
      const squadsData: Squad[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Squad));
      setSquads(squadsData);
      
      const userSquad = squadsData.find(squad => 
        squad.members.some(member => member.uid === currentUser.uid)
      );
      setCurrentSquad(userSquad || null);
      
      // Update squad members with current manifest data if needed
      if (userSquad) {
        await updateSquadMembersWithCurrentData(userSquad);
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  const createSquad = async () => {
    if (!currentUser || !newSquadName.trim()) return;

    try {
      const squadData = {
        name: newSquadName.trim(),
        description: newSquadDescription.trim(),
        leader: currentUser.uid,
        members: [{
          uid: currentUser.uid,
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || undefined,
          level: 1, // Will be fetched from user data
          xp: 0,
          manifest: 'Unknown',
          role: 'Leader',
          isLeader: true,
          isAdmin: true
        }],
        createdAt: new Date(),
        maxMembers: 4
      };

      const docRef = await addDoc(collection(db, 'squads'), squadData);
      console.log('Squad created with ID:', docRef.id);
      
      setIsCreatingSquad(false);
      setNewSquadName('');
      setNewSquadDescription('');
    } catch (error) {
      console.error('Error creating squad:', error);
    }
  };

  const joinSquad = async (squadId: string) => {
    if (!currentUser) return;

    try {
      const squad = squads.find(s => s.id === squadId);
      if (!squad || squad.members.length >= squad.maxMembers) return;

      // Fetch user's actual data from both collections to get manifest and level
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
      
      const userData = userDoc.exists() ? userDoc.data() : {};
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      
      // Try to get manifest from multiple sources
      let manifest = 'Unknown';
      if (userData.manifest) {
        if (typeof userData.manifest === 'string') {
          manifest = userData.manifest;
        } else if (typeof userData.manifest === 'object' && userData.manifest.manifestId) {
          manifest = userData.manifest.manifestId;
        } else if (typeof userData.manifest === 'object' && userData.manifest.manifestationType) {
          manifest = userData.manifest.manifestationType;
        }
      } else if (userData.manifestationType) {
        manifest = userData.manifestationType;
      } else if (studentData?.manifest) {
        if (typeof studentData.manifest === 'string') {
          manifest = studentData.manifest;
        } else if (typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
          manifest = studentData.manifest.manifestId;
        } else if (typeof studentData.manifest === 'object' && studentData.manifest.manifestationType) {
          manifest = studentData.manifest.manifestationType;
        }
      } else if (studentData?.manifestationType) {
        manifest = studentData.manifestationType;
      }
      
      const newMember: SquadMember = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || undefined,
        level: userData.level || studentData?.level || 1,
        xp: userData.xp || studentData?.xp || 0,
        manifest: manifest,
        role: 'Member',
        isLeader: false,
        isAdmin: false
      };

      await updateDoc(doc(db, 'squads', squadId), {
        members: [...squad.members, newMember]
      });
    } catch (error) {
      console.error('Error joining squad:', error);
    }
  };

  const leaveSquad = async (squadId: string) => {
    if (!currentUser) return;

    try {
      const squad = squads.find(s => s.id === squadId);
      if (!squad) return;

      const updatedMembers = squad.members.filter(member => member.uid !== currentUser.uid);
      
      if (updatedMembers.length === 0) {
        // Delete squad if no members left
        await deleteDoc(doc(db, 'squads', squadId));
      } else {
        // Update squad with remaining members
        const newLeader = updatedMembers[0];
        newLeader.isLeader = true;
        newLeader.role = 'Leader';
        newLeader.isAdmin = true;
        
        await updateDoc(doc(db, 'squads', squadId), {
          members: updatedMembers,
          leader: newLeader.uid
        });
      }
    } catch (error) {
      console.error('Error leaving squad:', error);
    }
  };

  const promoteToAdmin = async (squadId: string, memberId: string) => {
    if (!currentUser) return;

    try {
      const squad = squads.find(s => s.id === squadId);
      if (!squad) return;

      // Check if current user is leader or admin
      const currentMember = squad.members.find(m => m.uid === currentUser.uid);
      if (!currentMember || (!currentMember.isLeader && !currentMember.isAdmin)) {
        console.error('Only leaders and admins can promote members');
        return;
      }

      const updatedMembers = squad.members.map(member => 
        member.uid === memberId 
          ? { ...member, isAdmin: true, role: 'Admin' }
          : member
      );

      await updateDoc(doc(db, 'squads', squadId), {
        members: updatedMembers
      });
    } catch (error) {
      console.error('Error promoting member:', error);
    }
  };

  const demoteFromAdmin = async (squadId: string, memberId: string) => {
    if (!currentUser) return;

    try {
      const squad = squads.find(s => s.id === squadId);
      if (!squad) return;

      // Check if current user is leader
      const currentMember = squad.members.find(m => m.uid === currentUser.uid);
      if (!currentMember || !currentMember.isLeader) {
        console.error('Only leaders can demote admins');
        return;
      }

      const updatedMembers = squad.members.map(member => 
        member.uid === memberId 
          ? { ...member, isAdmin: false, role: 'Member' }
          : member
      );

      await updateDoc(doc(db, 'squads', squadId), {
        members: updatedMembers
      });
    } catch (error) {
      console.error('Error demoting admin:', error);
    }
  };

  const removeMember = async (squadId: string, memberId: string) => {
    if (!currentUser) return;

    try {
      const squad = squads.find(s => s.id === squadId);
      if (!squad) return;

      // Check if current user is leader or admin
      const currentMember = squad.members.find(m => m.uid === currentUser.uid);
      const targetMember = squad.members.find(m => m.uid === memberId);
      
      if (!currentMember || (!currentMember.isLeader && !currentMember.isAdmin)) {
        console.error('Only leaders and admins can remove members');
        return;
      }

      if (targetMember?.isLeader) {
        console.error('Cannot remove the leader');
        return;
      }

      const updatedMembers = squad.members.filter(member => member.uid !== memberId);

      await updateDoc(doc(db, 'squads', squadId), {
        members: updatedMembers
      });
    } catch (error) {
      console.error('Error removing member:', error);
    }
  };

  const openInviteModal = () => {
    setIsInviteModalOpen(true);
  };

  // Temporary function to fix Eddy Mosley's manifest
  const fixEddyMosleyManifest = async () => {
    if (!currentUser) return;
    
    try {
      const manifest = MANIFESTS.find(m => m.id === 'reading');
      if (!manifest) {
        console.error('Reading manifest not found');
        return;
      }

      const newPlayerManifest = {
        manifestId: 'reading',
        currentLevel: 1,
        xp: 0,
        catalyst: manifest.catalyst,
        veil: 'Fear of inadequacy',
        signatureMove: manifest.signatureMove,
        unlockedLevels: [1],
        lastAscension: new Date()
      };

      // Update both users and students collections
      const userRef = doc(db, 'users', 'LSrHzgFrRpZEGkchHWQR5Fu4GmC3');
      const studentRef = doc(db, 'students', 'LSrHzgFrRpZEGkchHWQR5Fu4GmC3');
      
      await updateDoc(userRef, { playerManifest: newPlayerManifest });
      await updateDoc(studentRef, { 
        manifest: newPlayerManifest
      });

      console.log('Eddy Mosley manifest fixed to Reading');
      
      // Refresh the data by calling the function again
      if (currentUser) {
        const fetchSquadsAndPlayers = async () => {
          setLoading(true);
          try {
            // Fetch all squads
            console.log('Squads: Fetching squads...');
            const squadsSnapshot = await getDocs(collection(db, 'squads'));
            const squadsData: Squad[] = squadsSnapshot.docs.map(doc => {
              const data = doc.data();
              console.log('Squads: Squad data:', { id: doc.id, ...data });
              return {
                id: doc.id,
                ...data
              } as Squad;
            });

            console.log('Squads: Total squads found:', squadsData.length);

            // Find current user's squad
            const userSquad = squadsData.find(squad => 
              squad.members.some(member => member.uid === currentUser.uid)
            );

            console.log('Squads: User squad found:', userSquad ? userSquad.name : 'None');

            setSquads(squadsData);
            setCurrentSquad(userSquad || null);

            // Fetch all available players (not in any squad)
            console.log('Squads: Fetching users...');
            // Try to get users from both collections to find manifest data
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const studentsSnapshot = await getDocs(collection(db, 'students'));
            
            // Create a map of student data by UID
            const studentDataMap = new Map();
            studentsSnapshot.docs.forEach(doc => {
              const data = doc.data();
              studentDataMap.set(doc.id, data);
            });
            
            const allUsers: SquadMember[] = usersSnapshot.docs.map(doc => {
              const data = doc.data();
              const studentData = studentDataMap.get(doc.id);
              
              console.log('Squads: User data:', { uid: doc.id, ...data });
              if (studentData) {
                console.log('Squads: Student data for', doc.id, ':', studentData);
              }
              
              // Detailed logging for manifest extraction debugging
              console.log('Squads: Manifest extraction debug for', doc.id, ':', {
                userData_manifest: data.manifest,
                userData_manifestType: typeof data.manifest,
                userData_manifestId: data.manifest && typeof data.manifest === 'object' ? (data.manifest as any).manifestId : null,
                userData_playerManifest: data.playerManifest,
                userData_bio: data.bio,
                userData_manifestationType: data.manifestationType,
                userData_style: data.style,
                studentData_manifest: studentData?.manifest,
                studentData_manifestType: typeof studentData?.manifest,
                studentData_manifestId: studentData?.manifest && typeof studentData.manifest === 'object' ? studentData.manifest.manifestId : null,
                studentData_playerManifest: studentData?.playerManifest,
                studentData_bio: studentData?.bio,
                studentData_manifestationType: studentData?.manifestationType,
                studentData_style: studentData?.style
              });
              
              // Try to get manifest from multiple sources
              let manifest = 'Unknown';
              let manifestSource = 'none';
              
              // Priority order: manifest abilities first, then elements
              // 1. Try playerManifest.manifestId (actual chosen manifest)
              if (data.playerManifest && typeof data.playerManifest === 'object' && data.playerManifest.manifestId) {
                manifest = data.playerManifest.manifestId;
                manifestSource = 'userData.playerManifest.manifestId';
              } else if (studentData?.playerManifest && typeof studentData.playerManifest === 'object' && studentData.playerManifest.manifestId) {
                manifest = studentData.playerManifest.manifestId;
                manifestSource = 'studentData.playerManifest.manifestId';
              }
              // 2. Try manifest.manifestId (most specific ability)
              else if (data.manifest && typeof data.manifest === 'object' && (data.manifest as any).manifestId) {
                manifest = (data.manifest as any).manifestId;
                manifestSource = 'userData.manifest.manifestId';
              } else if (studentData?.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
                manifest = studentData.manifest.manifestId;
                manifestSource = 'studentData.manifest.manifestId';
              }
              // 3. Try manifest (string) (e.g., "Imposition", "reading") - but filter out invalid manifests for Level 1
              else if (data.manifest && typeof data.manifest === 'string') {
                const level = data.level || studentData?.level || 1;
                // Filter out advanced manifests for Level 1 players
                if (level <= 1 && ['Imposition', 'Memory', 'Intelligence', 'Dimensional', 'Truth', 'Creation'].includes(data.manifest)) {
                  console.log(`Squads: Skipping invalid manifest "${data.manifest}" for Level ${level} player`);
                } else {
                  manifest = data.manifest;
                  manifestSource = 'userData.manifest (string)';
                }
              } else if (studentData?.manifest && typeof studentData.manifest === 'string') {
                const level = data.level || studentData?.level || 1;
                // Filter out advanced manifests for Level 1 players
                if (level <= 1 && ['Imposition', 'Memory', 'Intelligence', 'Dimensional', 'Truth', 'Creation'].includes(studentData.manifest)) {
                  console.log(`Squads: Skipping invalid manifest "${studentData.manifest}" for Level ${level} player`);
                } else {
                  manifest = studentData.manifest;
                  manifestSource = 'studentData.manifest (string)';
                }
              }
              // 4. Try bio (e.g., "Lightning Style")
              else if (data.bio) {
                manifest = data.bio;
                manifestSource = 'userData.bio';
              } else if (studentData?.bio) {
                manifest = studentData.bio;
                manifestSource = 'studentData.bio';
              }
              // 5. Try manifestationType (elements) - prioritize for Level 1 players with invalid manifests
              else if (data.manifestationType) {
                manifest = data.manifestationType;
                manifestSource = 'userData.manifestationType';
              } else if (studentData?.manifestationType) {
                manifest = studentData.manifestationType;
                manifestSource = 'studentData.manifestationType';
              }
              // 6. Try style (elements) - prioritize for Level 1 players with invalid manifests
              else if (data.style) {
                manifest = data.style;
                manifestSource = 'userData.style';
              } else if (studentData?.style) {
                manifest = studentData.style;
                manifestSource = 'studentData.style';
              }
              // 7. Try manifest.manifestationType (elements within manifest object)
              else if (data.manifest && typeof data.manifest === 'object' && (data.manifest as any).manifestationType) {
                manifest = (data.manifest as any).manifestationType;
                manifestSource = 'userData.manifest.manifestationType';
              } else if (studentData?.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestationType) {
                manifest = studentData.manifest.manifestationType;
                manifestSource = 'studentData.manifest.manifestationType';
              }
              
              console.log('Squads: Extracted manifest for', doc.id, ':', manifest, 'from', manifestSource);
              
              // Capitalize the first letter of the manifest
              const capitalizedManifest = manifest === 'Unknown' ? manifest : manifest.charAt(0).toUpperCase() + manifest.slice(1);
              
              return {
                uid: doc.id,
                displayName: data.displayName || data.email?.split('@')[0] || 'Unknown',
                email: data.email || '',
                photoURL: data.photoURL,
                level: data.level || studentData?.level || 1,
                xp: data.xp || studentData?.xp || 0,
                manifest: capitalizedManifest,
                role: data.role || 'Member'
              };
            });

            console.log('Squads: Total users found:', allUsers.length);

            // Filter out players already in squads
            const squadMemberIds = squadsData.flatMap(squad => 
              squad.members.map(member => member.uid)
            );
            console.log('Squads: Squad member IDs:', squadMemberIds);
            
            const available = allUsers.filter(user => 
              !squadMemberIds.includes(user.uid) && user.uid !== currentUser.uid
            );

            console.log('Squads: Available players:', available.length, available.map(u => u.displayName));

            setAvailablePlayers(available);
          } catch (error) {
            console.error('Squads: Error fetching squads and players:', error);
          } finally {
            setLoading(false);
            console.log('Squads: Loading complete');
          }
        };

        fetchSquadsAndPlayers();
      }
    } catch (error) {
      console.error('Error fixing Eddy Mosley manifest:', error);
    }
  };

  // Function to update squad members with current manifest data
  const updateSquadMembersWithCurrentData = async (squad: Squad) => {
    try {
      let hasUpdates = false;
      const updatedMembers = await Promise.all(
        squad.members.map(async (member) => {
          // Always update if the newly extracted manifest is different from the current member's manifest
          // This ensures the latest priority logic is always reflected.

          // Fetch current user data from both collections
          const userDoc = await getDoc(doc(db, 'users', member.uid));
          const studentDoc = await getDoc(doc(db, 'students', member.uid));
          
          const userData = userDoc.exists() ? userDoc.data() : {};
          const studentData = studentDoc.exists() ? studentDoc.data() : {};
          
          // Detailed logging for manifest extraction debugging
          console.log(`Squads: Member ${member.displayName} manifest extraction debug:`, {
            userData_manifest: userData.manifest,
            userData_manifestType: typeof userData.manifest,
            userData_manifestId: userData.manifest && typeof userData.manifest === 'object' ? (userData.manifest as any).manifestId : null,
            userData_playerManifest: userData.playerManifest,
            userData_bio: userData.bio,
            userData_manifestationType: userData.manifestationType,
            userData_style: userData.style,
            studentData_manifest: studentData?.manifest,
            studentData_manifestType: typeof studentData?.manifest,
            studentData_manifestId: studentData?.manifest && typeof studentData.manifest === 'object' ? studentData.manifest.manifestId : null,
            studentData_playerManifest: studentData?.playerManifest,
            studentData_bio: studentData?.bio,
            studentData_manifestationType: studentData?.manifestationType,
            studentData_style: studentData?.style
          });
          
          // Try to get manifest from multiple sources
          let manifest = 'Unknown';
          let manifestSource = 'none';
          
          // Priority order: manifest abilities first, then elements
          // 1. Try playerManifest.manifestId (actual chosen manifest)
          if (userData.playerManifest && typeof userData.playerManifest === 'object' && userData.playerManifest.manifestId) {
            manifest = userData.playerManifest.manifestId;
            manifestSource = 'userData.playerManifest.manifestId';
          } else if (studentData?.playerManifest && typeof studentData.playerManifest === 'object' && studentData.playerManifest.manifestId) {
            manifest = studentData.playerManifest.manifestId;
            manifestSource = 'studentData.playerManifest.manifestId';
          }
          // 2. Try manifest.manifestId (most specific ability)
          else if (userData.manifest && typeof userData.manifest === 'object' && (userData.manifest as any).manifestId) {
            manifest = (userData.manifest as any).manifestId;
            manifestSource = 'userData.manifest.manifestId';
          } else if (studentData?.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
            manifest = studentData.manifest.manifestId;
            manifestSource = 'studentData.manifest.manifestId';
          }
          // 3. Try manifest (string) (e.g., "Imposition", "reading") - but filter out invalid manifests for Level 1
          else if (userData.manifest && typeof userData.manifest === 'string') {
            const level = userData.level || studentData?.level || member.level;
            // Filter out advanced manifests for Level 1 players
            if (level <= 1 && ['Imposition', 'Memory', 'Intelligence', 'Dimensional', 'Truth', 'Creation'].includes(userData.manifest)) {
              console.log(`Squads: Skipping invalid manifest "${userData.manifest}" for Level ${level} player ${member.displayName}`);
            } else {
              manifest = userData.manifest;
              manifestSource = 'userData.manifest (string)';
            }
          } else if (studentData?.manifest && typeof studentData.manifest === 'string') {
            const level = userData.level || studentData?.level || member.level;
            // Filter out advanced manifests for Level 1 players
            if (level <= 1 && ['Imposition', 'Memory', 'Intelligence', 'Dimensional', 'Truth', 'Creation'].includes(studentData.manifest)) {
              console.log(`Squads: Skipping invalid manifest "${studentData.manifest}" for Level ${level} player ${member.displayName}`);
            } else {
              manifest = studentData.manifest;
              manifestSource = 'studentData.manifest (string)';
            }
          }
          // 4. Try bio (e.g., "Lightning Style")
          else if (userData.bio) {
            manifest = userData.bio;
            manifestSource = 'userData.bio';
          } else if (studentData?.bio) {
            manifest = studentData.bio;
            manifestSource = 'studentData.bio';
          }
          // 5. Try manifestationType (elements) - prioritize for Level 1 players with invalid manifests
          else if (userData.manifestationType) {
            manifest = userData.manifestationType;
            manifestSource = 'userData.manifestationType';
          } else if (studentData?.manifestationType) {
            manifest = studentData.manifestationType;
            manifestSource = 'studentData.manifestationType';
          }
          // 6. Try style (elements) - prioritize for Level 1 players with invalid manifests
          else if (userData.style) {
            manifest = userData.style;
            manifestSource = 'userData.style';
          } else if (studentData?.style) {
            manifest = studentData.style;
            manifestSource = 'studentData.style';
          }
          // 7. Try manifest.manifestationType (elements within manifest object)
          else if (userData.manifest && typeof userData.manifest === 'object' && (userData.manifest as any).manifestationType) {
            manifest = (userData.manifest as any).manifestationType;
            manifestSource = 'userData.manifest.manifestationType';
          } else if (studentData?.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestationType) {
            manifest = studentData.manifest.manifestationType;
            manifestSource = 'studentData.manifest.manifestationType';
          }
          
          console.log(`Squads: Member ${member.displayName} manifest extraction:`, manifest, 'from', manifestSource);

          // Capitalize the first letter of the manifest
          const capitalizedManifest = manifest === 'Unknown' ? manifest : manifest.charAt(0).toUpperCase() + manifest.slice(1);

          // Update member data if manifest changed
          if (capitalizedManifest !== member.manifest) {
            hasUpdates = true;
            console.log(`Squads: Updating member ${member.displayName} manifest from "${member.manifest}" to "${capitalizedManifest}"`);
            return {
              ...member,
              manifest: capitalizedManifest,
              level: userData.level || studentData?.level || member.level,
              xp: userData.xp || studentData?.xp || member.xp
            };
          }

          return member;
        })
      );

      // Update squad if any members were updated
      if (hasUpdates) {
        console.log('Squads: Updating squad with current member data');
        await updateDoc(doc(db, 'squads', squad.id), {
          members: updatedMembers
        });
      }
    } catch (error) {
      console.error('Squads: Error updating squad members with current data:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', color: '#6b7280' }}>Loading Squads...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Invitation Manager */}
      <InvitationManager />

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        padding: '1rem',
        backgroundColor: '#f8fafc',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb'
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
            Squad Management
          </h1>
          <p style={{ color: '#6b7280', margin: '0.5rem 0 0 0' }}>
            Form teams, coordinate with allies, and conquer challenges together
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          {/* Temporary button to fix Eddy Mosley's manifest */}
          <button
            onClick={fixEddyMosleyManifest}
            style={{
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Fix Eddy's Manifest
          </button>
          
          {!currentSquad && (
            <button
              onClick={() => setIsCreatingSquad(true)}
              style={{
                backgroundColor: '#4f46e5',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '500'
            }}
          >
            Create Squad
          </button>
          )}
        </div>
      </div>

      {/* Create Squad Modal */}
      {isCreatingSquad && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '0.5rem',
            width: '90%',
            maxWidth: '500px'
          }}>
            <h2 style={{ margin: '0 0 1rem 0' }}>Create New Squad</h2>
            <input
              type="text"
              placeholder="Squad Name"
              value={newSquadName}
              onChange={(e) => setNewSquadName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                marginBottom: '1rem'
              }}
            />
            <textarea
              placeholder="Squad Description (optional)"
              value={newSquadDescription}
              onChange={(e) => setNewSquadDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                marginBottom: '1rem',
                minHeight: '100px',
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={createSquad}
                style={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
              >
                Create Squad
              </button>
              <button
                onClick={() => setIsCreatingSquad(false)}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '2rem',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <button
          onClick={() => setActiveTab('my-squad')}
          style={{
            backgroundColor: activeTab === 'my-squad' ? '#4f46e5' : 'transparent',
            color: activeTab === 'my-squad' ? 'white' : '#6b7280',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.375rem 0.375rem 0 0',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          My Squad
        </button>
        <button
          onClick={() => setActiveTab('all-squads')}
          style={{
            backgroundColor: activeTab === 'all-squads' ? '#4f46e5' : 'transparent',
            color: activeTab === 'all-squads' ? 'white' : '#6b7280',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.375rem 0.375rem 0 0',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          All Squads ({squads.length})
        </button>
        <button
          onClick={() => setActiveTab('available-players')}
          style={{
            backgroundColor: activeTab === 'available-players' ? '#4f46e5' : 'transparent',
            color: activeTab === 'available-players' ? 'white' : '#6b7280',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.375rem 0.375rem 0 0',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          Available Players ({availablePlayers.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'my-squad' && (
        <div>
          {currentSquad ? (
            <SquadCard
              squad={currentSquad}
              onInvite={openInviteModal}
              onLeave={leaveSquad}
              onPromoteToAdmin={promoteToAdmin}
              onDemoteFromAdmin={demoteFromAdmin}
              onRemoveMember={removeMember}
              currentUserId={currentUser?.uid || undefined}
              isCurrentUserInSquad={true}
            />
          ) : (
            <div style={{
              backgroundColor: '#f9fafb',
              border: '2px dashed #d1d5db',
              borderRadius: '0.5rem',
              padding: '3rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>No Squad Yet</h3>
              <p style={{ color: '#6b7280', margin: '0 0 1.5rem 0' }}>
                Create a squad or join an existing one to start your team journey
              </p>
              <button
                onClick={() => setIsCreatingSquad(true)}
                style={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500'
                }}
              >
                Create Squad
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'all-squads' && (
        <div style={{ display: 'grid', gap: '2rem' }}>
          {squads.length > 0 ? (
            squads.map((squad) => (
              <SquadCard
                key={squad.id}
                squad={squad}
                onInvite={openInviteModal}
                onJoin={joinSquad}
                onLeave={leaveSquad}
                onPromoteToAdmin={promoteToAdmin}
                onDemoteFromAdmin={demoteFromAdmin}
                onRemoveMember={removeMember}
                currentUserId={currentUser?.uid || undefined}
                isCurrentUserInSquad={squad.members.some(member => member.uid === currentUser?.uid)}
              />
            ))
          ) : (
            <div style={{
              backgroundColor: '#f9fafb',
              border: '2px dashed #d1d5db',
              borderRadius: '0.5rem',
              padding: '3rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏛️</div>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>No Squads Found</h3>
              <p style={{ color: '#6b7280', margin: 0 }}>
                Be the first to create a squad and start building your team!
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'available-players' && (
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Available Players ({availablePlayers.length})
          </h2>
          
          <div style={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            maxHeight: '600px',
            overflowY: 'auto'
          }}>
            {availablePlayers.length > 0 ? (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {availablePlayers.map((player) => (
                  <div key={player.uid} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem',
                    border: '1px solid #e5e7eb'
                  }}>
                    <img
                      src={player.photoURL || '/default-avatar.png'}
                      alt={player.displayName}
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        objectFit: 'cover'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold' }}>{player.displayName}</div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        Level {player.level} • {player.manifest || 'Unknown Manifest'}
                      </div>
                    </div>
                    {currentSquad && currentSquad.members.length < currentSquad.maxMembers && (
                      <button
                        onClick={openInviteModal}
                        style={{
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Invite
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#6b7280' }}>
                No available players found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {currentSquad && (
        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          squadId={currentSquad.id}
          squadName={currentSquad.name}
          currentMembers={currentSquad.members}
        />
      )}
    </div>
  );
};

export default Squads; 