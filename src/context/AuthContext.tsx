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
  testAccountData: any | null;
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
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType>({ 
  currentUser: null, 
  userProfile: null,
  loading: true,
  currentRole: 'user',
  testAccountData: null,
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
  isAdmin: () => false
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<'admin' | 'test' | 'user'>('user');
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

  // Fetch user profile from Firestore
  const fetchUserProfile = useCallback(async (user: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserProfile;
        setUserProfile(userData);
        
        // Update lastLoginAt
        await updateDoc(doc(db, 'users', user.uid), {
          lastLoginAt: serverTimestamp()
        });
        
        // Migrate existing user to chapter system if needed
        await migrateExistingUserToChapters(user.uid);
      } else {
        // Create new user profile
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
          lastLoginAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        setUserProfile(newProfile);
        
        // Initialize chapter progress for new user
        await initializeChapterProgress(user.uid);
      }
    } catch (error) {
      console.error('AuthContext: Error fetching user profile:', error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Don't override current user if we're in test mode (test account switching)
      if (isTestMode && currentRole === 'test') {
        console.log('🔄 [onAuthStateChanged] Skipping update - in test mode');
        setLoading(false);
        return;
      }
      
      console.log('🔄 [onAuthStateChanged] Auth state changed:', user?.uid, user?.email);
      setCurrentUser(user);
      if (user) {
        await fetchUserProfile(user);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [isTestMode, currentRole, fetchUserProfile]);

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
      // Check if domain is allowed
      if (!isAllowedDomain(email)) {
        throw new Error('This email domain is not currently supported. Please use a different email address or contact support.');
      }
      
      const result = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName && result.user) {
        await updateProfile(result.user, { displayName });
      }
      
      // Also create a record in the 'students' collection for admin panel consistency
      const studentData = {
        displayName: displayName || (email ? email.split('@')[0] : 'Student'),
        email: email,
        xp: 0,
        powerPoints: 0,
        challenges: {},
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
    const result = await signInWithEmailAndPassword(auth, email, password);
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
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const updateUserProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!currentUser) throw new Error('No user logged in');
    
    // Update Firebase Auth profile if displayName or photoURL changed
    if (updates.displayName || updates.photoURL) {
      await updateProfile(currentUser, {
        displayName: updates.displayName,
        photoURL: updates.photoURL
      });
    }

    // Update Firestore profile
    await updateDoc(doc(db, 'users', currentUser.uid), updates);
    
    // Update local state
    setUserProfile(prev => prev ? { ...prev, ...updates } : null);
  }, [currentUser]);

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

  // Check if current user is admin
  const isAdmin = useCallback((): boolean => {
    if (!currentUser) return false;
    return currentUser.email === 'eddymosley@compscihigh.org' || 
           currentUser.email === 'admin@mstgames.net' ||
           currentUser.email === 'edm21179@gmail.com' ||
           (currentUser.email?.includes('eddymosley') ?? false) ||
           (currentUser.email?.includes('admin') ?? false) ||
           (currentUser.email?.includes('mstgames') ?? false);
  }, [currentUser]);

  // Switch to test account
  const switchToTestAccount = useCallback(async (testAccountId: string) => {
    if (!isAdmin()) {
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

      // Fetch test account data
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

      // Set test account as current user
      setIsTestMode(true); // Enable test mode to prevent onAuthStateChanged from overriding
      setCurrentUser(mockTestUser);
      setUserProfile(testUserData as UserProfile);
      setTestAccountData(testStudentData);
      setCurrentRole('test');
    } catch (error) {
      console.error('Error switching to test account:', error);
      throw error;
    }
  }, [isAdmin, currentUser, userProfile]);

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

    // Disable test mode first so onAuthStateChanged can work normally
    setIsTestMode(false);

    // Restore original user data
    setCurrentUser(userToRestore);
    setUserProfile(profileToRestore);
    setTestAccountData(null);
    setCurrentRole('admin');
    
    // Fetch the profile from Firestore to ensure we have the latest data
    if (userToRestore) {
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
    }
    
    // Clear localStorage after successful restore
    localStorage.removeItem('originalUserData');
    localStorage.removeItem('originalProfileData');
    
    console.log('✅ [switchToAdmin] Successfully restored to admin account');
  }, [originalUser, originalProfile]);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    currentUser,
    userProfile,
    loading,
    currentRole,
    testAccountData,
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
    isAdmin
  }), [
    currentUser,
    userProfile,
    loading,
    currentRole,
    testAccountData,
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
    isAdmin
  ]);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 