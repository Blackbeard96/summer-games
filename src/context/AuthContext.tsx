import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { auth, db } from '../firebase';
import { 
  User, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updatePassword,
  updateEmail,
  deleteUser,
  getAuth
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { initializeChapterProgress, migrateExistingUserToChapters } from '../utils/chapterInit';
import { ensurePlayerPowerLevel } from '../utils/powerLevelMigration';

interface UserProfile {
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: Date;
  lastLogin: Date;
  preferences?: {
    theme?: 'light' | 'dark';
    notifications?: boolean;
  };
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  currentRole: 'admin' | 'test' | 'user';
  role: 'student' | 'admin' | null; // Role from Firestore (userRoles or users collection)
  isAdmin: boolean; // Computed boolean for admin role
  loadingRole: boolean; // Loading state for role fetch
  testAccountData: any | null;
  activeTestAccountId: string | null; // Currently active test account ID
  /** True while impersonation is mid-swap — listeners must not remount until this clears */
  isSwitchingIdentity: boolean;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<void>;
  updateUserEmail: (newEmail: string) => Promise<void>;
  deleteUserAccount: () => Promise<void>;
  switchToTestAccount: (testAccountId: string) => Promise<void>;
  switchToAdmin: () => void;
  getActiveUserId: () => string | null; // Returns active test account ID if in test mode, otherwise auth.uid
}

const AuthContext = createContext<AuthContextType>({ 
  currentUser: null, 
  userProfile: null,
  loading: true,
  currentRole: 'user',
  role: null,
  isAdmin: false,
  loadingRole: true,
  testAccountData: null,
  activeTestAccountId: null,
  isSwitchingIdentity: false,
  signup: async () => {},
  login: async () => {},
  loginWithGoogle: async () => {},
  resetPassword: async () => {},
  logout: async () => {},
  updateUserProfile: async () => {},
  updateUserPassword: async () => {},
  updateUserEmail: async () => {},
  deleteUserAccount: async () => {},
  switchToTestAccount: async () => {},
  switchToAdmin: () => {},
  getActiveUserId: () => null
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<'admin' | 'test' | 'user'>('user');
  const [role, setRole] = useState<'student' | 'admin' | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [testAccountData, setTestAccountData] = useState<any | null>(null);
  const [originalUser, setOriginalUser] = useState<User | null>(() => {
    // Try to restore from localStorage on mount
    const stored = localStorage.getItem('originalUserData');
    return stored ? JSON.parse(stored) : null;
  });
  const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(() => {
    // Try to restore from localStorage on mount
    const stored = localStorage.getItem('originalProfileData');
    return stored ? JSON.parse(stored) : null;
  });
  const [isTestMode, setIsTestMode] = useState(false); // Track if we're in test mode to prevent onAuthStateChanged from overriding
  const [isSwitchingIdentity, setIsSwitchingIdentity] = useState(false);
  const [activeTestAccountId, setActiveTestAccountId] = useState<string | null>(() => {
    // Try to restore from localStorage on mount
    return localStorage.getItem('activeTestAccountId');
  });

  /** Let React run onSnapshot cleanups before attaching a new uid (avoids Firestore ca9 / ve:-1). */
  const settleIdentityListeners = () =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 200);
    });

  /** Once role has loaded for a session, avoid flipping loadingRole (that remounts Admin and wipes forms). */
  const roleResolvedRef = React.useRef(false);
  const lastAuthUidRef = React.useRef<string | null>(null);

  // Fetch user role from Firestore (userRoles collection or users.role field)
  const fetchUserRole = useCallback(async (user: User) => {
    try {
      // Only show the role-loading gate on cold start — not on every Auth token refresh
      if (!roleResolvedRef.current) {
        setLoadingRole(true);
      }
      
      // Try userRoles collection first (existing system)
      const roleDoc = await getDoc(doc(db, 'userRoles', user.uid));
      if (roleDoc.exists()) {
        const roleData = roleDoc.data();
        const userRole = roleData.role as string;
        
        // Check if role is 'admin' or if roles array includes 'admin'
        const hasAdminRole = userRole === 'admin' || 
                           (roleData.roles && Array.isArray(roleData.roles) && roleData.roles.includes('admin'));
        
        const finalRole: 'student' | 'admin' = hasAdminRole ? 'admin' : 'student';
        setRole(finalRole);
        roleResolvedRef.current = true;
        setLoadingRole(false);
        return finalRole;
      }
      
      // Fallback: try users/{uid}.role field
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.role === 'admin' || userData.role === 'student') {
          const finalRole = userData.role as 'student' | 'admin';
          setRole(finalRole);
          roleResolvedRef.current = true;
          setLoadingRole(false);
          return finalRole;
        }
      }
      
      // Default to student if no role found
      setRole('student');
      roleResolvedRef.current = true;
      setLoadingRole(false);
      
      // Log warning if role fetch fails but don't break the app
      console.warn('AuthContext: No role found for user, defaulting to "student"');
      return 'student' as const;
    } catch (error) {
      console.error('AuthContext: Error fetching user role:', error);
      // Fallback to student on error
      setRole('student');
      roleResolvedRef.current = true;
      setLoadingRole(false);
      return 'student' as const;
    }
  }, []);

  // Fetch user profile from Firestore
  const fetchUserProfile = useCallback(async (user: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserProfile;
        setUserProfile(userData);

        // Heal Auth displayName if a prior test-account Profile save polluted it
        // (Firestore remains the canonical name shown in NavBar / battles).
        if (
          userData.displayName &&
          userData.displayName.trim() !== '' &&
          userData.displayName !== user.displayName
        ) {
          try {
            await updateProfile(user, { displayName: userData.displayName });
          } catch (syncError) {
            console.warn('AuthContext: Failed to sync Auth displayName from Firestore:', syncError);
          }
        }
        
        // Update lastLoginAt
        await updateDoc(doc(db, 'users', user.uid), {
          lastLoginAt: serverTimestamp()
        });
        
        // Migrate existing user to chapter system if needed
        await migrateExistingUserToChapters(user.uid);
        
        // Ensure Power Level is initialized (migration for existing players)
        await ensurePlayerPowerLevel(user.uid);
      } else {
        // Create new user profile — no Element assigned at signup
        const newProfile: UserProfile = {
          displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Student'),
          email: user.email || '',
          photoURL: user.photoURL || undefined,
          createdAt: new Date(),
          lastLogin: new Date(),
          preferences: {
            theme: 'light',
            notifications: true
          }
        };
        await setDoc(doc(db, 'users', user.uid), {
          ...newProfile,
          elementalAffinity: null,
          lastLoginAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        setUserProfile(newProfile);
        
        // Initialize chapter progress for new user
        await initializeChapterProgress(user.uid);
        
        // Ensure Power Level is initialized for new user
        await ensurePlayerPowerLevel(user.uid);
      }
    } catch (error) {
      console.error('AuthContext: Error fetching user profile:', error);
    }
  }, []);

  // Keep test-mode flags in refs so the auth listener can stay mounted once.
  // Re-subscribing whenever isTestMode/currentRole change was remounting auth
  // state and contributing to route-tree resets (pages flashing back to defaults).
  const isTestModeRef = React.useRef(isTestMode);
  const currentRoleRef = React.useRef(currentRole);
  const isSwitchingIdentityRef = React.useRef(isSwitchingIdentity);
  useEffect(() => {
    isTestModeRef.current = isTestMode;
  }, [isTestMode]);
  useEffect(() => {
    currentRoleRef.current = currentRole;
  }, [currentRole]);
  useEffect(() => {
    isSwitchingIdentityRef.current = isSwitchingIdentity;
  }, [isSwitchingIdentity]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Don't override current user if we're in test mode (test account switching)
      if (isSwitchingIdentityRef.current) {
        console.log('🔄 [onAuthStateChanged] Skipping update - identity switch in progress');
        setLoading(false);
        return;
      }
      if (isTestModeRef.current && currentRoleRef.current === 'test') {
        console.log('🔄 [onAuthStateChanged] Skipping update - in test mode');
        setLoading(false);
        return;
      }
      
      console.log('🔄 [onAuthStateChanged] Auth state changed:', user?.uid, user?.email);
      // Keep the same React user reference on token refresh so Admin forms don't remount
      setCurrentUser((prev) => {
        if (!user) return null;
        if (prev?.uid === user.uid) return prev;
        return user;
      });
      if (user) {
        const uidChanged = lastAuthUidRef.current !== user.uid;
        lastAuthUidRef.current = user.uid;
        // Token refresh re-fires this listener with the same uid. Refetching role/profile
        // every time was flipping loadingRole and remounting Admin (wiping Mission create forms).
        if (uidChanged || !roleResolvedRef.current) {
          await Promise.all([
            fetchUserProfile(user),
            fetchUserRole(user)
          ]);
        }
      } else {
        lastAuthUidRef.current = null;
        roleResolvedRef.current = false;
        setUserProfile(null);
        setRole(null);
        setLoadingRole(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [fetchUserProfile, fetchUserRole]);

  // Helper function to validate allowed domains
  const isAllowedDomain = (email: string): boolean => {
    const allowedDomains = [
      'compscihigh.org',
      'gmail.com',
      'yahoo.com',
      'outlook.com',
      'hotmail.com'
    ];
    const domain = email.split('@')[1]?.toLowerCase();
    return allowedDomains.includes(domain || '');
  };

  const signup = useCallback(async (email: string, password: string, displayName?: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!isAllowedDomain(normalizedEmail)) {
        throw new Error('This email domain is not currently supported. Please use a different email address or contact support.');
      }
      
      const result = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      if (displayName && result.user) {
        await updateProfile(result.user, { displayName });
      }
      
      // Also create a record in the 'students' collection for admin panel consistency
      // New accounts start without an Element — affinity is chosen in Chapter 1.
      const studentData = {
        displayName: displayName || (email ? email.split('@')[0] : 'Student'),
        email: normalizedEmail,
        xp: 0,
        powerPoints: 0,
        challenges: {},
        elementalAffinity: null,
        createdAt: new Date()
      };
      
      await setDoc(doc(db, 'students', result.user.uid), studentData);
      
    } catch (error: any) {
      console.error('Signup error details:', {
        code: error.code,
        message: error.message,
        email: email
      });
      
      // Provide more specific error messages
      let userFriendlyMessage = error.message;
      if (error.code === 'auth/email-already-in-use') {
        userFriendlyMessage = 'An account with this email already exists. Please try signing in instead.';
      } else if (error.code === 'auth/invalid-email') {
        userFriendlyMessage = 'This email domain is not allowed. Please use a different email address.';
      } else if (error.code === 'auth/weak-password') {
        userFriendlyMessage = 'Password should be at least 6 characters long.';
      } else if (error.code === 'auth/operation-not-allowed') {
        userFriendlyMessage = 'Email/password sign up is not enabled. Please contact the administrator.';
      } else if (error.code === 'auth/domain-not-allowed') {
        userFriendlyMessage = 'This email domain is not allowed. Please use a different email address.';
      }
      
      throw new Error(userFriendlyMessage);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    // Update last login time - use setDoc with merge to create if doesn't exist
    if (result.user) {
      await setDoc(doc(db, 'users', result.user.uid), {
        lastLogin: new Date()
      }, { merge: true });
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    // Update last login time - use setDoc with merge to create if doesn't exist
    if (result.user) {
      await setDoc(doc(db, 'users', result.user.uid), {
        lastLogin: new Date()
      }, { merge: true });
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem('activeTestAccountId');
    localStorage.removeItem('originalUserData');
    localStorage.removeItem('originalProfileData');
    setIsTestMode(false);
    setIsSwitchingIdentity(false);
    setActiveTestAccountId(null);
    setOriginalUser(null);
    setOriginalProfile(null);
    setTestAccountData(null);
    setCurrentRole('user');
    await signOut(auth);
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!currentUser) throw new Error('No user logged in');

    const authUser = getAuth().currentUser;
    const isImpersonating =
      isTestMode ||
      currentRole === 'test' ||
      (!!authUser && authUser.uid !== currentUser.uid);
    
    // Update Firebase Auth profile if displayName or photoURL changed (never while impersonating)
    if (!isImpersonating && (updates.displayName || updates.photoURL)) {
      await updateProfile(currentUser, {
        displayName: updates.displayName,
        photoURL: updates.photoURL
      });
    }

    // Update Firestore profile
    await updateDoc(doc(db, 'users', currentUser.uid), updates);
    
    // Update local state
    setUserProfile(prev => prev ? { ...prev, ...updates } : null);
  }, [currentUser, isTestMode, currentRole]);

  const updateUserPassword = useCallback(async (newPassword: string) => {
    if (!currentUser) throw new Error('No user logged in');
    await updatePassword(currentUser, newPassword);
  }, [currentUser]);

  const updateUserEmail = useCallback(async (newEmail: string) => {
    if (!currentUser) throw new Error('No user logged in');
    await updateEmail(currentUser, newEmail);
    // Update profile in Firestore
    await updateUserProfile({ email: newEmail });
  }, [currentUser, updateUserProfile]);

  const deleteUserAccount = useCallback(async () => {
    if (!currentUser) throw new Error('No user logged in');
    // Delete user document from Firestore
    await setDoc(doc(db, 'users', currentUser.uid), { deleted: true });
    // Delete Firebase Auth account
    await deleteUser(currentUser);
  }, [currentUser]);

  // Check if current user is admin - Only Yondaime has access
  const isAdminComputed = useMemo(() => {
    if (role === 'admin') return true;
    // Email fallback must work even while role is loading so admin routes
    // don't briefly resolve as non-admin and Navigate to /home.
    if (!currentUser) return false;
    return currentUser.email === 'edm21179@gmail.com';
  }, [role, currentUser]);

  // Switch to test account
  const switchToTestAccount = useCallback(async (testAccountId: string) => {
    if (!isAdminComputed) {
      throw new Error('Only admins can switch to test accounts');
    }

    try {
      // Store original user data in both state and localStorage
      setOriginalUser(currentUser);
      setOriginalProfile(userProfile);
      
      // Persist to localStorage so it survives page refreshes
      if (currentUser) {
        localStorage.setItem('originalUserData', JSON.stringify({
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL
        }));
      }
      if (userProfile) {
        localStorage.setItem('originalProfileData', JSON.stringify(userProfile));
      }

      // Fetch test account data while admin listeners are still stable
      const testUserRef = doc(db, 'users', testAccountId);
      const testStudentRef = doc(db, 'students', testAccountId);
      
      const [testUserDoc, testStudentDoc] = await Promise.all([
        getDoc(testUserRef),
        getDoc(testStudentRef)
      ]);

      const testUserData = testUserDoc.exists() ? testUserDoc.data() : null;
      const testStudentData = testStudentDoc.exists() ? testStudentDoc.data() : null;

      // Create a mock user object for the test account
      const mockTestUser = {
        uid: testAccountId,
        email: testUserData?.email || 'test@mstgames.net',
        displayName: testUserData?.displayName || 'Test Student',
        photoURL: testUserData?.photoURL || null,
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        providerData: [],
        refreshToken: '',
        tenantId: null,
        phoneNumber: null,
        providerId: 'firebase',
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
        toJSON: () => ({})
      } as unknown as User;

      // Phase 1: pause uid-scoped listeners so they unsubscribe before the uid swap
      // (prevents Firestore watch-stream INTERNAL ASSERTION ca9 / ve:-1).
      setIsSwitchingIdentity(true);
      setIsTestMode(true); // Prevent onAuthStateChanged from overriding mid-switch
      await settleIdentityListeners();

      // Phase 2: attach mock identity
      setCurrentUser(mockTestUser);
      setUserProfile(testUserData as UserProfile);
      setTestAccountData(testStudentData);
      setCurrentRole('test');
      setActiveTestAccountId(testAccountId);
      localStorage.setItem('activeTestAccountId', testAccountId);

      // Phase 3: allow listeners to attach to the new uid after React commits
      await settleIdentityListeners();
      setIsSwitchingIdentity(false);
    } catch (error) {
      setIsSwitchingIdentity(false);
      console.error('Error switching to test account:', error);
      throw error;
    }
  }, [isAdminComputed, currentUser, userProfile]);

  // Switch back to admin
  const switchToAdmin = useCallback(async () => {
    console.log('🔄 [switchToAdmin] Starting admin restoration...');
    console.log('🔄 [switchToAdmin] Current state - originalUser:', originalUser?.uid, originalUser?.email);
    console.log('🔄 [switchToAdmin] Current state - originalProfile:', originalProfile?.email);
    
    // First, try to get the actual Firebase Auth user (should still be logged in as admin)
    const firebaseAuthUser = getAuth().currentUser;
    console.log('🔄 [switchToAdmin] Firebase Auth current user:', firebaseAuthUser?.uid, firebaseAuthUser?.email);
    
    // Get stored original user data
    const storedUser = localStorage.getItem('originalUserData');
    const storedProfile = localStorage.getItem('originalProfileData');
    console.log('🔄 [switchToAdmin] Stored user data exists:', !!storedUser);
    console.log('🔄 [switchToAdmin] Stored profile data exists:', !!storedProfile);
    
    let userToRestore: User | null = null;
    let profileToRestore: UserProfile | null = null;
    
    // Helper function to check if a user is an admin
    const checkIsAdminUser = (user: User | null): boolean => {
      if (!user || !user.email) return false;
      return user.email === 'eddymosley@compscihigh.org' || 
             user.email === 'admin@mstgames.net' ||
             user.email === 'edm21179@gmail.com' ||
             user.email.includes('eddymosley') ||
             user.email.includes('admin') ||
             user.email.includes('mstgames');
    };
    
    // Priority 1: If Firebase Auth user exists and is an admin, use it (most reliable)
    if (firebaseAuthUser && checkIsAdminUser(firebaseAuthUser)) {
      console.log('🔄 [switchToAdmin] Firebase Auth user is an admin, using it');
      userToRestore = firebaseAuthUser;
    }
    
    // Priority 2: Use Firebase Auth user if it matches stored original user
    if (!userToRestore && firebaseAuthUser && storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        if (firebaseAuthUser.uid === userData.uid) {
          console.log('🔄 [switchToAdmin] Using Firebase Auth user (matches stored original)');
          userToRestore = firebaseAuthUser;
        }
      } catch (e) {
        console.error('Error parsing stored user data:', e);
      }
    }
    
    // Priority 3: Use originalUser from state if it matches Firebase Auth
    if (!userToRestore && originalUser && firebaseAuthUser && originalUser.uid === firebaseAuthUser.uid) {
      console.log('🔄 [switchToAdmin] Using Firebase Auth user (matches originalUser state)');
      userToRestore = firebaseAuthUser;
    }
    
    // Priority 4: Use originalUser from state (if it's a real Firebase Auth user, not a mock)
    if (!userToRestore && originalUser && originalUser.uid && originalUser.email) {
      // Check if it's a real Firebase Auth user (has getIdToken method that works)
      try {
        const token = await originalUser.getIdToken().catch(() => null);
        if (token) {
          console.log('🔄 [switchToAdmin] Using originalUser from state (real Firebase Auth user)');
          userToRestore = originalUser;
        }
      } catch (e) {
        console.log('🔄 [switchToAdmin] originalUser is not a real Firebase Auth user, skipping');
      }
    }
    
    // Priority 5: Try to restore from localStorage and match with Firebase Auth
    if (!userToRestore && storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        // If we have a Firebase Auth user with matching UID, use that
        if (firebaseAuthUser && firebaseAuthUser.uid === userData.uid) {
          console.log('🔄 [switchToAdmin] Using Firebase Auth user from stored UID match');
          userToRestore = firebaseAuthUser;
        } else if (firebaseAuthUser && checkIsAdminUser(firebaseAuthUser)) {
          // If Firebase Auth user is an admin (even if UID doesn't match), use it
          console.log('🔄 [switchToAdmin] Using Firebase Auth user (admin, UID mismatch but admin verified)');
          userToRestore = firebaseAuthUser;
        }
      } catch (e) {
        console.error('Error parsing stored user data:', e);
      }
    }
    
    // Final fallback: If we have a Firebase Auth user that's an admin, use it
    if (!userToRestore && firebaseAuthUser && checkIsAdminUser(firebaseAuthUser)) {
      console.log('🔄 [switchToAdmin] Final fallback: Using Firebase Auth user (admin verified)');
      userToRestore = firebaseAuthUser;
    }
    
    if (!userToRestore) {
      console.error('❌ [switchToAdmin] No user data found to restore');
      console.error('❌ [switchToAdmin] Debug info:', {
        hasFirebaseAuthUser: !!firebaseAuthUser,
        firebaseAuthUserEmail: firebaseAuthUser?.email,
        hasOriginalUser: !!originalUser,
        originalUserEmail: originalUser?.email,
        hasStoredUser: !!storedUser
      });
      throw new Error('No original user data found. Please log out and log back in as admin.');
    }

    // Get profile from state or localStorage
    profileToRestore = originalProfile || (storedProfile ? JSON.parse(storedProfile) : null);

    console.log('🔄 [switchToAdmin] Restoring user:', userToRestore.uid, userToRestore.email);

    try {
      // Phase 1: pause listeners while tearing down the mock test identity
      setIsSwitchingIdentity(true);
      await settleIdentityListeners();

      // Phase 2: restore admin identity
      setIsTestMode(false);
      setCurrentUser(userToRestore);
      setUserProfile(profileToRestore);
      setTestAccountData(null);
      setCurrentRole('admin');
      setActiveTestAccountId(null);
      localStorage.removeItem('activeTestAccountId');
      
      // Fetch the profile from Firestore to ensure we have the latest data
      console.log('🔄 [switchToAdmin] Fetching user profile from Firestore...');
      try {
        const userDoc = await getDoc(doc(db, 'users', userToRestore.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserProfile;
          setUserProfile(userData);
          
          // Update Firebase Auth displayName to match Firestore profile
          if (userData.displayName && userData.displayName !== userToRestore.displayName) {
            console.log('🔄 [switchToAdmin] Updating Firebase Auth displayName to:', userData.displayName);
            try {
              await updateProfile(userToRestore, {
                displayName: userData.displayName
              });
              // Update the currentUser state with the new displayName
              setCurrentUser({
                ...userToRestore,
                displayName: userData.displayName
              } as User);
            } catch (updateError) {
              console.error('Error updating Firebase Auth displayName:', updateError);
              // Continue anyway - the profile is still set correctly
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
      
      // Clear localStorage after successful restore
      localStorage.removeItem('originalUserData');
      localStorage.removeItem('originalProfileData');

      // Phase 3: reopen listeners on the restored admin uid
      await settleIdentityListeners();
      setIsSwitchingIdentity(false);
      
      console.log('✅ [switchToAdmin] Successfully restored to admin account');
    } catch (error) {
      setIsSwitchingIdentity(false);
      throw error;
    }
  }, [originalUser, originalProfile]);

  // Get active user ID (returns test account ID if in test mode, otherwise auth.uid)
  const getActiveUserId = useCallback((): string | null => {
    if (activeTestAccountId) {
      return activeTestAccountId;
    }
    return currentUser?.uid || null;
  }, [activeTestAccountId, currentUser]);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    currentUser,
    userProfile,
    loading,
    currentRole,
    role,
    isAdmin: isAdminComputed,
    loadingRole,
    testAccountData,
    activeTestAccountId,
    isSwitchingIdentity,
    signup,
    login,
    loginWithGoogle,
    resetPassword,
    logout,
    updateUserProfile,
    updateUserPassword,
    updateUserEmail,
    deleteUserAccount,
    switchToTestAccount,
    switchToAdmin,
    getActiveUserId
  }), [
    currentUser,
    userProfile,
    loading,
    currentRole,
    role,
    isAdminComputed,
    loadingRole,
    testAccountData,
    activeTestAccountId,
    isSwitchingIdentity,
    signup,
    login,
    loginWithGoogle,
    resetPassword,
    logout,
    updateUserProfile,
    updateUserPassword,
    updateUserEmail,
    deleteUserAccount,
    switchToTestAccount,
    switchToAdmin,
    getActiveUserId
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 