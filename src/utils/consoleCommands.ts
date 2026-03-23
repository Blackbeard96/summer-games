// Console Commands for Easy Debugging
// Run these commands in the browser console for quick debugging

import { logger } from './debugLogger';
import { setUserRole, getUserRole, isUserScorekeeper } from './roleManagement';

// Make debugging commands available globally
if (typeof window !== 'undefined') {
  // Clear console and enable roster debugging only
  (window as any).debugRosterOnly = () => {
    console.clear();
    logger.debugRosterOnly();
    console.log('%c🎯 ROSTER DEBUGGING ENABLED', 'color: #10b981; font-size: 16px; font-weight: bold');
    console.log('%c📝 Available commands:', 'color: #6b7280; font-weight: bold');
    console.log('%c  • debugRoster() - Show current roster state', 'color: #6b7280');
    console.log('%c  • debugLogger.enableCategory("BATTLE") - Enable battle logs', 'color: #6b7280');
    console.log('%c  • debugLogger.disableCategory("BATTLE") - Disable battle logs', 'color: #6b7280');
    console.log('%c  • debugLogger.showActiveCategories() - Show active log categories', 'color: #6b7280');
  };

  // Clear console and enable all debugging
  (window as any).debugAll = () => {
    console.clear();
    logger.enableAll();
    console.log('%c🔍 ALL DEBUGGING ENABLED', 'color: #3b82f6; font-size: 16px; font-weight: bold');
  };

  // Clear console completely
  (window as any).clearAll = () => {
    console.clear();
    logger.disableCategory('BATTLE');
    logger.disableCategory('GENERAL');
    console.log('%c🧹 CONSOLE CLEARED - ONLY ERRORS ENABLED', 'color: #ef4444; font-size: 16px; font-weight: bold');
  };

  // Quick roster status check
  (window as any).rosterStatus = () => {
    console.log('%c👥 QUICK ROSTER STATUS', 'color: #10b981; font-size: 14px; font-weight: bold');
    if ((window as any).debugRoster) {
      (window as any).debugRoster();
    } else {
      console.log('%c⚠️ Roster debug function not available. Make sure you\'re on the Role Manager page.', 'color: #f59e0b');
    }
  };

  // Dashboard/Training Grounds debugging
  (window as any).debugDashboard = () => {
    console.log('%c🏟️ TRAINING GROUNDS (DASHBOARD) DEBUG', 'color: #10b981; font-size: 16px; font-weight: bold');
    
    // Enable general logging to see Dashboard issues
    logger.enableCategory('GENERAL');
    logger.enableCategory('ERROR');
    
    // Check current state
    const currentPath = window.location.pathname;
    console.log('Current path:', currentPath);
    console.log('Should be on Dashboard:', currentPath === '/');
    
    // Check for common issues
    console.log('React app mounted:', !!document.querySelector('#root'));
    console.log('Local storage available:', 'localStorage' in window);
    
    console.log('%c💡 Try refreshing the Dashboard page and watch for GENERAL category logs', 'color: #6b7280');
  };

  // Restore Eddie Vasquez's manifest skills (Pattern Break, Strategy Matrix) after mistaken reset
  (window as any).restoreEddieVasquezSkills = async () => {
    try {
      const { restoreEddieVasquezManifestSkills } = await import('./fixPlayerManifestAndSkills');
      const result = await restoreEddieVasquezManifestSkills();
      console.log(result.success ? `%c✅ ${result.message}` : `%c❌ ${result.message}`, result.success ? 'color: #10b981' : 'color: #ef4444');
      return result;
    } catch (e) {
      console.error('restoreEddieVasquezSkills failed:', e);
      throw e;
    }
  };

  // Force refresh role detection in NavBar
  (window as any).refreshRole = () => {
    console.log('%c🔄 FORCING ROLE REFRESH', 'color: #8b5cf6; font-size: 16px; font-weight: bold');
    // Trigger a page refresh to re-run role detection
    window.location.reload();
  };

  // Debug role assignment process
  (window as any).debugRoleAssignment = async () => {
    try {
      const { auth, db } = await import('../firebase');
      const { doc, getDoc, collection, getDocs } = await import('firebase/firestore');
      
      if (!auth.currentUser) {
        console.log('❌ No user logged in');
        return;
      }

      const userId = auth.currentUser.uid;
      const userEmail = auth.currentUser.email;
      
      console.log(`%c🔍 DEBUGGING ROLE ASSIGNMENT`, 'color: #8b5cf6; font-size: 16px; font-weight: bold');
      console.log(`User: ${userEmail} (${userId})`);
      
      // Check if role document exists
      console.log('📋 Checking role document...');
      try {
        const roleDoc = await getDoc(doc(db, 'userRoles', userId));
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          console.log('✅ Role document found:', roleData);
        } else {
          console.log('❌ No role document found');
        }
      } catch (error) {
        console.log('❌ Error reading role document:', error);
      }
      
      // Check all userRoles documents (admin only)
      console.log('📋 Checking all userRoles documents...');
      try {
        const rolesSnapshot = await getDocs(collection(db, 'userRoles'));
        console.log(`Found ${rolesSnapshot.docs.length} role documents:`);
        rolesSnapshot.docs.forEach(doc => {
          const data = doc.data();
          console.log(`- ${doc.id}: role=${data.role}, classId=${data.classId}`);
        });
      } catch (error) {
        console.log('❌ Error reading all roles:', error);
      }
      
    } catch (error) {
      console.error('❌ Error in debugRoleAssignment:', error);
    }
  };

  // Manually assign scorekeeper role to current user
  (window as any).assignScorekeeperRole = async (classId?: string) => {
    try {
      const { auth, db } = await import('../firebase');
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      
      if (!auth.currentUser) {
        console.log('❌ No user logged in');
        return;
      }

      const userId = auth.currentUser.uid;
      const userEmail = auth.currentUser.email;
      
      console.log(`%c👑 ASSIGNING SCOREKEEPER ROLE`, 'color: #059669; font-size: 16px; font-weight: bold');
      console.log(`User: ${userEmail} (${userId})`);
      
      const roleData = {
        userId: userId,
        role: 'scorekeeper',
        assignedBy: userId, // Self-assigned for testing
        assignedAt: serverTimestamp(),
        classId: classId || 'default-class', // Use provided classId or default
        permissions: {
          canModifyPP: false,
          canApproveChanges: false,
          canAssignRoles: false,
          canViewAllStudents: true,
          canSubmitPPChanges: true
        }
      };

      await setDoc(doc(db, 'userRoles', userId), roleData);
      
      console.log('✅ Scorekeeper role assigned successfully!');
      console.log('Role data:', roleData);
      console.log('🔄 Refreshing page to apply changes...');
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error assigning scorekeeper role:', error);
    }
  };

  // Check specific user's role
  (window as any).checkUserRole = async (userEmail?: string) => {
    try {
      const { auth, db } = await import('../firebase');
      const { doc, getDoc, collection, getDocs, query, where } = await import('firebase/firestore');
      
      let targetUserId = auth.currentUser?.uid;
      
      // If email provided, find that user's ID
      if (userEmail) {
        console.log(`🔍 Looking up user role for email: ${userEmail}`);
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const userDoc = usersSnapshot.docs.find(doc => doc.data().email === userEmail);
        if (userDoc) {
          targetUserId = userDoc.id;
          console.log(`✅ Found user ID: ${targetUserId}`);
        } else {
          console.log(`❌ User not found with email: ${userEmail}`);
          return;
        }
      }
      
      if (!targetUserId) {
        console.log('❌ No user ID available');
        return;
      }
      
      console.log(`%c👑 CHECKING ROLE FOR USER: ${targetUserId}`, 'color: #059669; font-size: 16px; font-weight: bold');
      
      const roleDoc = await getDoc(doc(db, 'userRoles', targetUserId));
      if (roleDoc.exists()) {
        const roleData = roleDoc.data();
        console.log('✅ Role document found:', roleData);
        console.log('📊 Role:', roleData.role);
        console.log('🏫 Class ID:', roleData.classId);
        console.log('👤 Assigned by:', roleData.assignedBy);
        console.log('📅 Assigned at:', roleData.assignedAt);
        
        // Also check if class exists
        if (roleData.classId) {
          try {
            const classDoc = await getDoc(doc(db, 'classrooms', roleData.classId));
            if (classDoc.exists()) {
              console.log('🏫 Class details:', classDoc.data());
            } else {
              console.log('⚠️ Assigned class not found:', roleData.classId);
            }
          } catch (classError) {
            console.log('❌ Error checking class:', classError);
          }
        }
      } else {
        console.log('❌ No role document found for user');
      }
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  };

  // Firefox-specific debugging
  (window as any).firefoxDebug = () => {
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    console.log('%c🦊 FIREFOX DEBUG INFO', 'color: #ff7139; font-size: 16px; font-weight: bold');
    console.log('Browser:', isFirefox ? 'Firefox' : 'Other');
    console.log('User Agent:', navigator.userAgent);
    console.log('IndexedDB available:', 'indexedDB' in window);
    console.log('ServiceWorker available:', 'serviceWorker' in navigator);
    console.log('localStorage available:', 'localStorage' in window);
    
    if (isFirefox) {
      console.log('%c🔧 Firefox-specific checks:', 'color: #ff7139; font-weight: bold');
      console.log('Console API styling support:', typeof console.log === 'function');
      console.log('Firebase persistence likely:', 'indexedDB' in window);
      
      // Test basic Firestore connectivity
      try {
        import('../firebase').then(({ db }) => {
          console.log('Firebase db instance:', !!db);
          console.log('Firestore app:', db.app?.name || 'unknown');
        });
      } catch (error) {
        console.error('Firefox: Error accessing Firebase:', error);
      }
    }
  };

  // Show help
  (window as any).debugHelp = () => {
    console.log('%c🔧 DEBUG COMMANDS HELP', 'color: #8b5cf6; font-size: 16px; font-weight: bold');
    console.log('%c📋 Available Commands:', 'color: #6b7280; font-weight: bold');
    console.log('%c  • debugRosterOnly() - Clean console + enable roster debugging', 'color: #10b981');
    console.log('%c  • debugAll() - Enable all debugging categories', 'color: #3b82f6');
    console.log('%c  • clearAll() - Clear console + disable noisy logs', 'color: #ef4444');
    console.log('%c  • rosterStatus() - Quick roster state check', 'color: #10b981');
    console.log('%c  • debugRoster() - Detailed roster debugging (Role Manager page only)', 'color: #10b981');
    console.log('%c  • debugDashboard() - Dashboard debugging', 'color: #10b981');
    console.log('%c  • checkUserRole(email?) - Check current or specific user\'s role', 'color: #059669');
    console.log('%c  • debugRoleAssignment() - Debug role assignment process', 'color: #8b5cf6');
    console.log('%c  • assignScorekeeperRole(classId?) - Manually assign scorekeeper role', 'color: #059669');
    console.log('%c  • refreshRole() - Force refresh role detection', 'color: #8b5cf6');
    console.log('%c  • firefoxDebug() - Firefox-specific debugging info', 'color: #ff7139');
    console.log('%c  • debugLogger.showActiveCategories() - Show active log categories', 'color: #6b7280');
  };

  // Scorekeeper debugging commands
  (window as any).debugScorekeeper = async () => {
    console.log('%c📊 SCOREKEEPER DEBUGGING', 'color: #059669; font-size: 16px; font-weight: bold');
    console.log('%c📝 Available commands:', 'color: #6b7280; font-weight: bold');
    console.log('%c  • checkMyRole() - Check current user role', 'color: #6b7280');
    console.log('%c  • checkMyRoleDocument() - Check full role document', 'color: #6b7280');
    console.log('%c  • setMyRole(role) - Set current user role (student/scorekeeper/admin)', 'color: #6b7280');
    console.log('%c  • addScorekeeperRole() - Add scorekeeper role to current user', 'color: #6b7280');
    console.log('%c  • isScorekeeper(userId) - Check if user is scorekeeper', 'color: #6b7280');
    console.log('%c  • forceScorekeeperCheck() - Force check scorekeeper role', 'color: #6b7280');
  };

  (window as any).checkMyRole = async () => {
    const { auth } = await import('../firebase');
    if (auth.currentUser) {
      const role = await getUserRole(auth.currentUser.uid);
      console.log('🔍 Current user role:', role);
      return role;
    } else {
      console.log('❌ No user logged in');
      return null;
    }
  };

  (window as any).checkMyRoleDocument = async () => {
    const { auth, db } = await import('../firebase');
    const { doc, getDoc } = await import('firebase/firestore');
    if (auth.currentUser) {
      try {
        const roleDoc = await getDoc(doc(db, 'userRoles', auth.currentUser.uid));
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          console.log('🔍 Full role document:', roleData);
          console.log('🔍 Role field:', roleData.role);
          console.log('🔍 Roles array:', roleData.roles);
          console.log('🔍 Is scorekeeper?', roleData.role === 'scorekeeper' || (roleData.roles && roleData.roles.includes('scorekeeper')));
          return roleData;
        } else {
          console.log('❌ No role document found');
          return null;
        }
      } catch (error) {
        console.error('❌ Error fetching role document:', error);
        return null;
      }
    } else {
      console.log('❌ No user logged in');
      return null;
    }
  };

  (window as any).setMyRole = async (role: 'student' | 'scorekeeper' | 'admin') => {
    const { auth } = await import('../firebase');
    if (auth.currentUser) {
      const success = await setUserRole(auth.currentUser.uid, role);
      if (success) {
        console.log(`✅ Role set to '${role}' for user ${auth.currentUser.email}`);
        console.log('🔄 Please refresh the page to see changes');
      }
      return success;
    } else {
      console.log('❌ No user logged in');
      return false;
    }
  };

  (window as any).addScorekeeperRole = async () => {
    const { auth, db } = await import('../firebase');
    const { doc, getDoc, setDoc } = await import('firebase/firestore');
    if (auth.currentUser) {
      try {
        console.log('🔍 Adding scorekeeper role to current user...');
        const roleDoc = await getDoc(doc(db, 'userRoles', auth.currentUser.uid));
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          console.log('🔍 Current role data:', roleData);
          
          // Add scorekeeper to roles array if it doesn't exist
          let roles = roleData.roles || [];
          if (!Array.isArray(roles)) {
            roles = [];
          }
          if (!roles.includes('scorekeeper')) {
            roles.push('scorekeeper');
          }
          
          // Update the role document
          await setDoc(doc(db, 'userRoles', auth.currentUser.uid), {
            ...roleData,
            roles: roles,
            updatedAt: new Date()
          });
          
          console.log('✅ Scorekeeper role added! New roles:', roles);
          console.log('🔄 Please refresh the page to see the Scorekeeper button');
          return true;
        } else {
          console.log('❌ No role document found');
          return false;
        }
      } catch (error) {
        console.error('❌ Error adding scorekeeper role:', error);
        return false;
      }
    } else {
      console.log('❌ No user logged in');
      return false;
    }
  };

  (window as any).isScorekeeper = async (userId: string) => {
    const result = await isUserScorekeeper(userId);
    console.log(`🔍 User ${userId} is scorekeeper:`, result);
    return result;
  };

  (window as any).forceScorekeeperCheck = async () => {
    const { auth, db } = await import('../firebase');
    const { doc, getDoc } = await import('firebase/firestore');
    if (auth.currentUser) {
      try {
        console.log('🔍 Force checking scorekeeper role...');
        const roleDoc = await getDoc(doc(db, 'userRoles', auth.currentUser.uid));
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          console.log('🔍 Role document found:', roleData);
          const isScorekeeper = roleData.role === 'scorekeeper' || 
                               (roleData.roles && Array.isArray(roleData.roles) && roleData.roles.includes('scorekeeper'));
          console.log(`🔍 Role field: ${roleData.role}`);
          console.log(`🔍 Roles array: ${roleData.roles}`);
          console.log(`🔍 Is scorekeeper: ${isScorekeeper}`);
          console.log('🔄 Please refresh the page to see if the Scorekeeper button appears');
          return isScorekeeper;
        } else {
          console.log('❌ No role document found');
          return false;
        }
      } catch (error) {
        console.error('❌ Error checking scorekeeper role:', error);
        return false;
      }
    } else {
      console.log('❌ No user logged in');
      return false;
    }
  };

  // Auto-run on load
  console.log('%c🎮 Summer Games Debug Commands Loaded!', 'color: #8b5cf6; font-size: 14px; font-weight: bold');
  console.log('%c💡 Type debugHelp() for available commands', 'color: #6b7280');
  console.log('%c🎯 For roster issues, type: debugRosterOnly()', 'color: #10b981; font-weight: bold');
  console.log('%c📊 For scorekeeper issues, type: debugScorekeeper()', 'color: #059669; font-weight: bold');
}
