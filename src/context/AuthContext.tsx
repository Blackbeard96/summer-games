import React, { createContext, useContext, useEffect, useState } from 'react';
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
  deleteUser
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
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
  const [originalUser, setOriginalUser] = useState<User | null>(null);
  const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(null);

  // Fetch user profile from Firestore
  const fetchUserProfile = async (user: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserProfile;
        setUserProfile(userData);
        
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
        await setDoc(doc(db, 'users', user.uid), newProfile);
        setUserProfile(newProfile);
        
        // Initialize chapter progress for new user
        await initializeChapterProgress(user.uid);
      }
    } catch (error) {
      console.error('AuthContext: Error fetching user profile:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserProfile(user);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

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

  const signup = async (email: string, password: string, displayName?: string) => {
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
  };

  const login = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    // Update last login time - use setDoc with merge to create if doesn't exist
    if (result.user) {
      await setDoc(doc(db, 'users', result.user.uid), {
        lastLogin: new Date()
      }, { merge: true });
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    // Update last login time - use setDoc with merge to create if doesn't exist
    if (result.user) {
      await setDoc(doc(db, 'users', result.user.uid), {
        lastLogin: new Date()
      }, { merge: true });
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateUserProfile = async (updates: Partial<UserProfile>) => {
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
  };

  const updateUserPassword = async (newPassword: string) => {
    if (!currentUser) throw new Error('No user logged in');
    await updatePassword(currentUser, newPassword);
  };

  const updateUserEmail = async (newEmail: string) => {
    if (!currentUser) throw new Error('No user logged in');
    await updateEmail(currentUser, newEmail);
    // Update profile in Firestore
    await updateUserProfile({ email: newEmail });
  };

  const deleteUserAccount = async () => {
    if (!currentUser) throw new Error('No user logged in');
    // Delete user document from Firestore
    await setDoc(doc(db, 'users', currentUser.uid), { deleted: true });
    // Delete Firebase Auth account
    await deleteUser(currentUser);
  };

  // Check if current user is admin
  const isAdmin = (): boolean => {
    if (!currentUser) return false;
    return currentUser.email === 'eddymosley@compscihigh.org' || 
           currentUser.email === 'admin@mstgames.net' ||
           currentUser.email === 'edm21179@gmail.com' ||
           (currentUser.email?.includes('eddymosley') ?? false) ||
           (currentUser.email?.includes('admin') ?? false) ||
           (currentUser.email?.includes('mstgames') ?? false);
  };

  // Switch to test account
  const switchToTestAccount = async (testAccountId: string) => {
    if (!isAdmin()) {
      throw new Error('Only admins can switch to test accounts');
    }

    try {
      // Store original user data
      setOriginalUser(currentUser);
      setOriginalProfile(userProfile);

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
      setCurrentUser(mockTestUser);
      setUserProfile(testUserData as UserProfile);
      setTestAccountData(testStudentData);
      setCurrentRole('test');
    } catch (error) {
      console.error('Error switching to test account:', error);
      throw error;
    }
  };

  // Switch back to admin
  const switchToAdmin = () => {
    if (!originalUser) {
      throw new Error('No original user data found');
    }

    // Restore original user data
    setCurrentUser(originalUser);
    setUserProfile(originalProfile);
    setTestAccountData(null);
    setCurrentRole('admin');
  };

  const value = {
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
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 