import React, { useState, useEffect, useRef, CSSProperties, MouseEvent, memo, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, DocumentReference, DocumentData, doc, getDoc, addDoc, query, where, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserRole } from '../types/roles';
import { logger } from '../utils/debugLogger';
import { useAriaLive, ariaUtils, generateId } from '../utils/accessibility';
import { getNavConfig, filterNavItemsByRole, flattenNavConfig } from '../config/navConfig';
import type { NavItem } from '../config/navConfig';
import {
  getClassesByStudent,
  getAssessmentsByClass,
  getAssessmentGoal
} from '../utils/assessmentGoalsFirestore';

const tooltipStyle: CSSProperties = {
  position: 'absolute',
  bottom: '-2.5rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.9)',
  color: 'white',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.25rem',
  fontSize: '0.75rem',
  whiteSpace: 'nowrap',
  opacity: 0,
  pointerEvents: 'none' as CSSProperties['pointerEvents'],
  transition: 'opacity 0.2s',
  zIndex: 1000,
};

// Responsive nav item style function
const getNavItemStyle = (screenSize: 'mobile' | 'tablet' | 'desktop'): CSSProperties => {
  const baseStyle: CSSProperties = {
    color: 'white',
    textDecoration: 'none',
    borderRadius: '0.25rem',
    transition: 'background-color 0.2s ease',
    position: 'relative' as CSSProperties['position'],
    display: 'inline-block',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as CSSProperties['whiteSpace'],
    backgroundColor: 'transparent',
  };

  switch (screenSize) {
    case 'mobile':
      return { ...baseStyle, padding: '0.25rem 0.5rem', fontSize: '0.75rem' };
    case 'tablet':
      return { ...baseStyle, padding: '0.375rem 0.5rem', fontSize: '0.8125rem' };
    case 'desktop':
      return { ...baseStyle, padding: '0.5rem 0.625rem', fontSize: '0.875rem' };
    default:
      return baseStyle;
  }
};

interface Notification {
  id: string;
  _ref: DocumentReference<DocumentData, DocumentData>;
  type: string;
  message: string;
  challengeId?: string;
  challengeName?: string;
  timestamp?: any;
  createdAt?: any;
  read?: boolean;
  deleted?: boolean;
  data?: any;
}

const NavBar = memo(() => {
  const { currentUser, logout, currentRole, userProfile, role, isAdmin: isAdminUser } = useAuth();
  const navigate = useNavigate();
  console.log('🎯 NavBar component rendered - currentUser:', currentUser?.email, 'currentRole:', currentRole, 'role:', role, 'isAdmin:', isAdminUser);
  
  // Function to grant admin access
  const grantAdminAccess = async () => {
    if (!currentUser) {
      alert('You must be logged in to grant admin access.');
      return;
    }
    
    // Check if user email matches admin criteria
    const isAdminEmail = currentUser.email === 'eddymosley@compscihigh.org' || 
                        currentUser.email === 'admin@mstgames.net' ||
                        currentUser.email === 'edm21179@gmail.com' ||
                        currentUser.email?.includes('eddymosley') ||
                        currentUser.email?.includes('admin') ||
                        currentUser.email?.includes('mstgames');
    
    if (!isAdminEmail) {
      alert('Your email does not match admin criteria. Contact an administrator for access.');
      return;
    }
    
    try {
      // Create or update userRoles document to grant admin access
      const roleRef = doc(db, 'userRoles', currentUser.uid);
      const roleDoc = await getDoc(roleRef);
      
      if (roleDoc.exists()) {
        // Update existing role document
        await updateDoc(roleRef, {
          role: 'admin',
          updatedAt: serverTimestamp()
        });
        console.log('✅ Admin role updated in userRoles collection');
      } else {
        // Create new role document
        await setDoc(roleRef, {
          role: 'admin',
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        console.log('✅ Admin role created in userRoles collection');
      }
      
      // Also update users collection role field as fallback
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        await updateDoc(userRef, {
          role: 'admin'
        });
        console.log('✅ Admin role updated in users collection');
      }
      
      alert('✅ Admin access granted! Navigating to admin panel...');
      // Navigate to admin panel and then refresh to ensure role is loaded
      navigate('/admin');
      // Small delay before refresh to ensure navigation happens
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Error granting admin access:', error);
      alert('Error granting admin access. Please try again or contact support.');
    }
  };
  
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('student');
  // Track which dropdown is open (by item path)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [pendingAssessmentGoals, setPendingAssessmentGoals] = useState(0);
  const [activeLiveEventsCount, setActiveLiveEventsCount] = useState(0);
  
  // Accessibility features
  const { announce } = useAriaLive();
  const notificationsId = generateId('notifications');
  const mobileMenuId = generateId('mobile-menu');

  // Check screen size with responsive breakpoints
  const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const checkScreenSize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const width = window.innerWidth;
        if (width <= 768) {
          setIsMobile(true);
          setScreenSize('mobile');
        } else if (width <= 1024) {
          setIsMobile(false);
          setScreenSize('tablet');
        } else {
          setIsMobile(false);
          setScreenSize('desktop');
        }
      }, 100);
    };
    
    // Initial check
    const width = window.innerWidth;
    if (width <= 768) {
      setIsMobile(true);
      setScreenSize('mobile');
    } else if (width <= 1024) {
      setIsMobile(false);
      setScreenSize('tablet');
    } else {
      setIsMobile(false);
      setScreenSize('desktop');
    }
    
    window.addEventListener('resize', checkScreenSize);
    
    return () => {
      window.removeEventListener('resize', checkScreenSize);
      clearTimeout(timeoutId);
    };
  }, []);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    } finally {
      setIsLoggingOut(false);
    }
  }, [logout, navigate]);

  // Memoize expensive computations
  const displayName = useMemo(() => 
    userProfile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Student',
    [userProfile?.displayName, currentUser?.displayName, currentUser?.email]
  );
  
  const roleIndicator = useMemo(() => 
    currentRole === 'admin' ? '👑' : currentRole === 'test' ? '🧪' : '',
    [currentRole]
  );
  
  const displayNameWithRole = useMemo(() => 
    roleIndicator ? `${roleIndicator} ${displayName}` : displayName,
    [roleIndicator, displayName]
  );

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!currentUser) return;
      
      setNotificationsLoading(true);
      try {
        // Fetch student notifications
        const notifSnap = await getDocs(collection(db, 'students', currentUser.uid, 'notifications'));
        const studentNotifList: Notification[] = notifSnap.docs
          .map(docSnap => {
            const data = docSnap.data() as Notification;
            return { ...data, id: docSnap.id, _ref: docSnap.ref };
          })
          .filter(notif => !notif.deleted); // Filter out deleted notifications

        // If user is admin, also fetch admin notifications
        let adminNotifList: Notification[] = [];
        const isAdmin = currentUser.email === 'eddymosley@compscihigh.org' || 
                       currentUser.email === 'admin@mstgames.net' ||
                       currentUser.email === 'edm21179@gmail.com' ||
                       currentUser.email?.includes('eddymosley') ||
                       currentUser.email?.includes('admin') ||
                       currentUser.email?.includes('mstgames');

        if (isAdmin) {
          try {
            const adminNotifSnap = await getDocs(collection(db, 'adminNotifications'));
            adminNotifList = adminNotifSnap.docs
              .map(docSnap => {
                const data = docSnap.data() as any;
                return { 
                  ...data, 
                  id: docSnap.id, 
                  _ref: docSnap.ref,
                  timestamp: data.createdAt || data.timestamp // Handle different timestamp field names
                };
              })
              .filter(notif => !notif.read); // Filter out read admin notifications
          } catch (adminErr) {
            console.error('Error fetching admin notifications:', adminErr);
          }
        }

        // Combine and sort all notifications
        const allNotifications = [...studentNotifList, ...adminNotifList];
        setNotifications(allNotifications.sort((a, b) => {
          const aTime = a.timestamp?.seconds || (a.createdAt?.getTime ? a.createdAt.getTime() / 1000 : 0);
          const bTime = b.timestamp?.seconds || (b.createdAt?.getTime ? b.createdAt.getTime() / 1000 : 0);
          return bTime - aTime;
        }));
      } catch (err) {
        setNotifications([]);
      } finally {
        setNotificationsLoading(false);
      }
    };

    fetchNotifications();
  }, [currentUser]);

  // Check for pending assessment goals
  useEffect(() => {
    const checkPendingAssessmentGoals = async () => {
      if (!currentUser) {
        setPendingAssessmentGoals(0);
        return;
      }

      try {
        // Get all classes the student is enrolled in
        const classes = await getClassesByStudent(currentUser.uid);
        
        // Get all assessments for these classes
        let pendingCount = 0;
        for (const classItem of classes) {
          const assessments = await getAssessmentsByClass(classItem.id);
          
          // Check each assessment
          for (const assessment of assessments) {
            // Only count assessments that are open and not locked
            if (!assessment.isLocked && assessment.gradingStatus === 'open') {
              const goal = await getAssessmentGoal(assessment.id, currentUser.uid);
              if (!goal) {
                pendingCount++;
              }
            }
          }
        }

        setPendingAssessmentGoals(pendingCount);
      } catch (error) {
        console.error('Error checking pending assessment goals:', error);
        setPendingAssessmentGoals(0);
      }
    };

    checkPendingAssessmentGoals();
    
    // Recheck every 30 seconds
    const interval = setInterval(checkPendingAssessmentGoals, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Check user role for scorekeeper navigation
  useEffect(() => {
    const checkUserRole = async () => {
      if (!currentUser) {
        setUserRole('student');
        return;
      }
      
      try {
        logger.roles.debug('NavBar: Checking user role for:', currentUser.uid);
        const roleDoc = await getDoc(doc(db, 'userRoles', currentUser.uid));
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          const detectedRole = roleData.role || 'student';
          logger.roles.info('NavBar: User role detected:', { 
            userId: currentUser.uid, 
            email: currentUser.email,
            role: detectedRole,
            classId: roleData.classId 
          });
          console.log(`🔍 Role detection - Found role document:`, roleData);
          setUserRole(detectedRole);
        } else {
          logger.roles.warn('NavBar: No role document found for user:', currentUser.uid);
          console.log(`🔍 Role detection - No role document found for user:`, currentUser.uid);
          setUserRole('student');
        }
      } catch (error) {
        logger.roles.error('NavBar: Error checking user role:', error);
        setUserRole('student');
      }
    };

    checkUserRole();
  }, [currentUser]);

  // Check if user has scorekeeper role (including multiple roles)
  const [hasScorekeeperRole, setHasScorekeeperRole] = useState(false);
  
  useEffect(() => {
    const checkScorekeeperRole = async () => {
      if (!currentUser) {
        console.log('🔍 Scorekeeper role check - No current user');
        setHasScorekeeperRole(false);
        return;
      }
      
      try {
        console.log(`🔍 Scorekeeper role check - Checking user: ${currentUser.uid}`);
        // Check if user has scorekeeper role in userRoles collection
        const roleDoc = await getDoc(doc(db, 'userRoles', currentUser.uid));
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          const isScorekeeper = roleData.role === 'scorekeeper' || 
                               (roleData.roles && Array.isArray(roleData.roles) && roleData.roles.includes('scorekeeper'));
          console.log(`🔍 Scorekeeper role check - role: ${roleData.role}, roles: ${roleData.roles}, isScorekeeper: ${isScorekeeper}`);
          console.log(`🔍 Full role data:`, roleData);
          setHasScorekeeperRole(isScorekeeper);
        } else {
          console.log('🔍 Scorekeeper role check - No role document found');
          setHasScorekeeperRole(false);
        }
      } catch (error) {
        console.error('Error checking scorekeeper role:', error);
        setHasScorekeeperRole(false);
      }
    };

    checkScorekeeperRole();
  }, [currentUser]);

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('[data-notifications]')) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showNotifications]);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openDropdown) {
        setOpenDropdown(null);
        if (dropdownTimeoutRef.current) {
          clearTimeout(dropdownTimeoutRef.current);
          dropdownTimeoutRef.current = null;
        }
      }
    };

    if (openDropdown) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [openDropdown]);

  const handleNotificationClick = useCallback(async (notif: Notification) => {
    if (notif.challengeId) {
      navigate(`/chapters?challenge=${notif.challengeId}`);
    }
    
    // Mark as read
    if (!notif.read) {
      try {
        await updateDoc(notif._ref, { read: true });
        setNotifications(prev => prev.map(n => 
          n.id === notif.id ? { ...n, read: true } : n
        ));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    
    setShowNotifications(false);
  }, [navigate]);

  const handleDeleteNotification = useCallback(async (notifId: string, notifRef: DocumentReference<DocumentData, DocumentData>) => {
    try {
      await updateDoc(notifRef, { deleted: true });
      setNotifications(prev => prev.filter(n => n.id !== notifId));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, []);

  const handleClearAllNotifications = useCallback(async () => {
    if (!currentUser || notifications.length === 0) return;
    
    try {
      // Mark all notifications as deleted
      const updatePromises = notifications.map(notif => 
        updateDoc(notif._ref, { deleted: true })
      );
      
      await Promise.all(updatePromises);
      setNotifications([]);
      setShowNotifications(false);
    } catch (err) {
      console.error('Failed to clear all notifications:', err);
    }
  }, [currentUser, notifications]);

  const handleApproveArtifactUsage = async (notif: Notification) => {
    try {
      // Mark notification as read and approved
      await updateDoc(notif._ref, { 
        read: true, 
        status: 'approved',
        approvedAt: new Date()
      });
      
      // Remove from notifications list
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
      
      // Remove the artifact from student's inventory
      if (notif.data?.userId && notif.data?.artifactName) {
        const studentRef = doc(db, 'students', notif.data.userId);
        const studentSnap = await getDoc(studentRef);
        
        if (studentSnap.exists()) {
          const studentData = studentSnap.data();
          const currentInventory = studentData.inventory || [];
          
          // Remove one instance of the artifact from inventory
          const updatedInventory = [...currentInventory];
          const artifactIndex = updatedInventory.indexOf(notif.data.artifactName);
          if (artifactIndex > -1) {
            updatedInventory.splice(artifactIndex, 1);
          }
          
          // Update student's inventory
          await updateDoc(studentRef, {
            inventory: updatedInventory
          });
          
          // Also remove from artifacts array if it exists
          if (studentData.artifacts) {
            const updatedArtifacts = studentData.artifacts.filter((artifact: any) => {
              // Handle both legacy artifacts (strings) and new artifacts (objects)
              if (typeof artifact === 'string') {
                return artifact !== notif.data.artifactName;
              } else {
                return artifact.name !== notif.data.artifactName;
              }
            });
            await updateDoc(studentRef, {
              artifacts: updatedArtifacts
            });
          }
        }
        
        // Create a success notification for the student
        await addDoc(collection(db, 'students', notif.data.userId, 'notifications'), {
          type: 'artifact_approved',
          message: `Your request to use ${notif.data.artifactName} has been approved! The artifact has been removed from your inventory.`,
          timestamp: new Date(),
          read: false
        });
      }
      
      alert(`Approved ${notif.data?.artifactName} usage for ${notif.data?.userName}. Artifact removed from inventory.`);
    } catch (err) {
      console.error('Failed to approve artifact usage:', err);
      alert('Failed to approve artifact usage. Please try again.');
    }
  };

  const handleDenyArtifactUsage = async (notif: Notification) => {
    try {
      // Mark notification as read and denied
      await updateDoc(notif._ref, { 
        read: true, 
        status: 'denied',
        deniedAt: new Date()
      });
      
      // Remove from notifications list
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
      
      // Create a denial notification for the student
      if (notif.data?.userId) {
        await addDoc(collection(db, 'students', notif.data.userId, 'notifications'), {
          type: 'artifact_denied',
          message: `Your request to use ${notif.data.artifactName} has been denied.`,
          timestamp: new Date(),
          read: false
        });
      }
      
      alert(`Denied ${notif.data?.artifactName} usage for ${notif.data?.userName}`);
    } catch (err) {
      console.error('Failed to deny artifact usage:', err);
      alert('Failed to deny artifact usage. Please try again.');
    }
  };

  const showTooltip = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const tooltip = e.currentTarget.querySelector('.tooltip') as HTMLElement;
    if (tooltip) tooltip.style.opacity = '1';
  }, []);

  const hideTooltip = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const tooltip = e.currentTarget.querySelector('.tooltip') as HTMLElement;
    if (tooltip) tooltip.style.opacity = '0';
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(prev => {
      const newState = !prev;
      announce(newState ? 'Mobile menu opened' : 'Mobile menu closed');
      return newState;
    });
  }, [announce]);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
    announce('Mobile menu closed');
  }, [announce]);

  // Removed battleSubItems - now using item.children from navConfig

  // Track active live events count
  useEffect(() => {
    if (!currentUser) {
      setActiveLiveEventsCount(0);
      return;
    }

    // Get user's classrooms
    let userClassrooms: string[] = [];
    const getClassrooms = async () => {
      try {
        const classroomsSnapshot = await getDocs(collection(db, 'classrooms'));
        userClassrooms = classroomsSnapshot.docs
          .filter(doc => {
            const classData = doc.data();
            return (classData.students || []).includes(currentUser.uid);
          })
          .map(doc => doc.id);
      } catch (error) {
        console.error('Error fetching classrooms for live events badge:', error);
      }
    };

    getClassrooms().then(() => {
      if (userClassrooms.length === 0) {
        setActiveLiveEventsCount(0);
        return;
      }

      // Subscribe to active live events in user's classrooms
      const eventsRef = collection(db, 'inSessionRooms');
      const q = query(eventsRef, where('status', 'in', ['open', 'active', 'live']));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const activeCount = snapshot.docs.filter(doc => {
          const data = doc.data();
          return userClassrooms.includes(data.classId);
        }).length;
        setActiveLiveEventsCount(activeCount);
      }, (error) => {
        console.error('Error listening to live events for badge:', error);
        setActiveLiveEventsCount(0);
      });

      return () => unsubscribe();
    });
  }, [currentUser]);

  // Get nav config and filter by role
  const navConfig = useMemo(() => getNavConfig(activeLiveEventsCount, pendingAssessmentGoals), [activeLiveEventsCount, pendingAssessmentGoals]);
  
  // Flatten and filter nav items based on role
  const allNavItems = useMemo(() => {
    if (!currentUser) return [];
    // Determine effective role - if user has scorekeeper role, use 'scorekeeper', otherwise use the role from auth
    const effectiveRole = (userRole === 'scorekeeper' || hasScorekeeperRole) ? 'scorekeeper' : role;
    const filtered = flattenNavConfig(navConfig, effectiveRole, hasScorekeeperRole);
    
    // Debug logging for scorekeeper tab
    if (process.env.NODE_ENV === 'development') {
      const scorekeeperTab = filtered.find(item => item.label === 'Scorekeepers');
      console.log(`🔍 NavBar allNavItems - effectiveRole: ${effectiveRole}, hasScorekeeperRole: ${hasScorekeeperRole}, scorekeeperTab found: ${!!scorekeeperTab}`);
      if (scorekeeperTab) {
        console.log(`✅ Scorekeepers tab found in allNavItems:`, scorekeeperTab);
      } else {
        console.log(`❌ Scorekeepers tab NOT found in allNavItems. Total items: ${filtered.length}`);
        console.log(`   Available items:`, filtered.map(item => `${item.label} (${item.visibility})`));
      }
    }
    
    return filtered;
  }, [navConfig, currentUser, role, userRole, hasScorekeeperRole]);

  // Separate primary (priority 1) and secondary (priority 2) items
  const primaryNavItems = useMemo(() => {
    // Filter for priority 1 items (default to 1 if not specified)
    return allNavItems.filter(item => (item.priority ?? 1) === 1);
  }, [allNavItems]);

  // Secondary items no longer needed - all items are now priority 1 in the new structure

  // Legacy support - use primary items for main nav
  const navItems = primaryNavItems;

  // User nav items (for mobile menu and legacy code)
  const userNavItems = useMemo(() => {
    // Second section items (user nav) - now used for mobile menu
    const effectiveRole = (userRole === 'scorekeeper' || hasScorekeeperRole) ? 'scorekeeper' : role;
    return navConfig[1]?.items ? filterNavItemsByRole(navConfig[1].items, effectiveRole, hasScorekeeperRole) : [];
  }, [navConfig, role, userRole, hasScorekeeperRole]);

  // Admin nav items (third section)
  const adminNavItems = useMemo(() => {
    if (!isAdminUser) return [];
    const effectiveRole = (userRole === 'scorekeeper' || hasScorekeeperRole) ? 'scorekeeper' : role;
    return navConfig[2]?.items ? filterNavItemsByRole(navConfig[2].items, effectiveRole, hasScorekeeperRole) : [];
  }, [navConfig, role, userRole, hasScorekeeperRole, isAdminUser]);

  // Profile sub-menu items (from user nav items)
  const profileSubItems = useMemo(() => {
    const profileItem = userNavItems.find(item => item.path === '/profile');
    return profileItem?.children || [];
  }, [userNavItems]);

  // Scorekeeper nav items (filtered from main nav items based on scorekeeper role)
  const scorekeeperNavItems = useMemo(() => {
    if (userRole !== 'scorekeeper' && !hasScorekeeperRole) return [];
    // Filter nav items that are visible to scorekeepers
    return allNavItems.filter(item => {
      // Scorekeeper can see their specific items (handled by navConfig filtering)
      return true;
    });
  }, [allNavItems, userRole, hasScorekeeperRole]);

  // Calculate effective role for debugging
  const effectiveRole = useMemo(() => {
    return (userRole === 'scorekeeper' || hasScorekeeperRole) ? 'scorekeeper' : role;
  }, [userRole, hasScorekeeperRole, role]);

  // Debug navigation items generation
  logger.roles.debug('NavBar: Navigation items generated:', {
    currentUser: !!currentUser,
    userEmail: currentUser?.email,
    userRole,
    role,
    effectiveRole,
    hasScorekeeperRole,
    scorekeeperNavItems: scorekeeperNavItems.length,
    userNavItems: userNavItems.length,
    adminNavItems: adminNavItems.length,
    allNavItems: allNavItems.length,
    primaryNavItems: primaryNavItems.length,
    navItems: navItems.length
  });

  // Temporary debug indicator for role detection
  if (currentUser && process.env.NODE_ENV === 'development') {
    console.log(`🎯 NavBar Debug - User: ${currentUser.email}, Role: ${userRole}, Auth Role: ${role}, Effective Role: ${effectiveRole}`);
    console.log(`🔍 Scorekeeper check - userRole: ${userRole}, hasScorekeeperRole: ${hasScorekeeperRole}, effectiveRole: ${effectiveRole}`);
    console.log(`🔍 Navigation items - allNavItems: ${allNavItems.length}, primaryNavItems: ${primaryNavItems.length}, navItems: ${navItems.length}`);
    console.log(`🔍 navItems labels:`, navItems.map(item => item.label));
    console.log(`🔍 scorekeeperNavItems:`, scorekeeperNavItems);
  }

  return (
    <>
      {/* Temporary debug badge for development (disabled to prevent interference with constellation tree) */}
      {false && currentUser && process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          backgroundColor: userRole === 'scorekeeper' ? '#059669' : '#ef4444',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 9999,
          fontFamily: 'monospace',
          minWidth: '80px',
          textAlign: 'center'
        }}>
          Role: {userRole || 'loading...'}
        </div>
      )}
      <nav className="nav" style={{
        backgroundColor: '#1f2937',
        padding: screenSize === 'mobile' ? '0.75rem 1rem' : screenSize === 'tablet' ? '0.875rem 1rem' : '0.875rem 1.25rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: screenSize === 'tablet' ? '0.375rem' : '0.5rem',
        flexWrap: 'nowrap', // NEVER wrap - single row always
        width: '100%',
        minWidth: 0, // Allow container to shrink if needed
        overflow: 'visible' // Allow dropdowns to show
      }}>
        {/* Logo/Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: screenSize === 'tablet' ? '0.5rem' : '0.75rem', flexShrink: 0 }}>
          <div style={{
            width: screenSize === 'mobile' ? '32px' : screenSize === 'tablet' ? '36px' : '40px',
            height: screenSize === 'mobile' ? '32px' : screenSize === 'tablet' ? '36px' : '40px',
            backgroundColor: '#4f46e5',
            borderRadius: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: screenSize === 'mobile' ? '1rem' : screenSize === 'tablet' ? '1.125rem' : '1.25rem',
            fontWeight: 'bold'
          }}>
            X
          </div>
          {screenSize === 'desktop' && (
            <span style={{
              fontSize: '1.125rem',
              fontWeight: 'bold',
              color: 'white',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}>
              Xiotein School
            </span>
          )}
        </div>

        {/* Desktop Navigation */}
        {!isMobile && (
          <div style={{
            display: 'flex',
            gap: screenSize === 'tablet' ? '0.25rem' : '0.375rem',
            alignItems: 'center',
            flexWrap: 'nowrap', // NO WRAPPING - single row only
            justifyContent: 'center',
            flex: '1 1 auto',
            minWidth: 0,
            maxWidth: '100%',
            overflow: 'visible', // Allow dropdowns to show
            flexShrink: 1 // Allow shrinking if needed
          }}>
            {navItems.map((item) => (
              <div 
                key={item.to || item.path} 
                style={{ 
                  ...getNavItemStyle(screenSize), 
                  position: 'relative', 
                  flexShrink: 0,
                  flexGrow: 0,
                  pointerEvents: 'auto' // Ensure hover events work
                }} 
                onMouseEnter={(e) => {
                  showTooltip(e);
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.setProperty('background-color', 'rgba(255,255,255,0.2)', 'important');
                  if (item.hasDropdown && item.children && item.children.length > 0) {
                    // Clear any pending timeout
                    if (dropdownTimeoutRef.current) {
                      clearTimeout(dropdownTimeoutRef.current);
                      dropdownTimeoutRef.current = null;
                    }
                    // Show dropdown immediately on hover
                    console.log('[NavBar] Hover detected, opening dropdown:', item.label, item.path);
                    setOpenDropdown(item.path);
                  }
                }}
                onMouseLeave={(e) => {
                  hideTooltip(e);
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.setProperty('background-color', 'transparent', 'important');
                  if (item.hasDropdown && item.children && item.children.length > 0) {
                    // Add delay before hiding dropdown (300ms gives time to move to dropdown)
                    dropdownTimeoutRef.current = setTimeout(() => {
                      setOpenDropdown(null);
                      dropdownTimeoutRef.current = null;
                    }, 300);
                  }
                }}
              >
                <Link 
                  to={item.to || item.path || '#'} 
                  style={{ 
                    color: 'inherit', 
                    textDecoration: 'none',
                    display: 'block',
                    width: '100%',
                    height: '100%'
                  }}
                >
                  {item.label}{item.hasDropdown && item.children && item.children.length > 0 ? ' ▼' : ''}
                </Link>
                <span className="tooltip" style={tooltipStyle}>{item.tooltip}</span>
                
                {/* Dropdown Menu (Play, Learn, Community, Profile) */}
                {item.hasDropdown && item.children && item.children.length > 0 && openDropdown === item.path && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '0',
                    marginTop: '0.5rem',
                    backgroundColor: '#1f2937',
                    borderRadius: '0.5rem',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                    border: '1px solid #374151',
                    zIndex: 1001,
                    minWidth: '220px',
                    maxWidth: '280px',
                    padding: '0.5rem 0'
                  }}
                  onMouseEnter={() => {
                    // Clear any pending timeout when mouse enters dropdown
                    if (dropdownTimeoutRef.current) {
                      clearTimeout(dropdownTimeoutRef.current);
                      dropdownTimeoutRef.current = null;
                    }
                    setOpenDropdown(item.path);
                  }}
                  onMouseLeave={() => {
                    // Add delay before hiding dropdown (300ms gives time to move back)
                    dropdownTimeoutRef.current = setTimeout(() => {
                      setOpenDropdown(null);
                      dropdownTimeoutRef.current = null;
                    }, 300);
                  }}
                  >
                    {item.children.map((subItem) => {
                      // Filter children by role
                      const effectiveRole = (userRole === 'scorekeeper' || hasScorekeeperRole) ? 'scorekeeper' : role;
                      if (subItem.visibility === 'admin' && effectiveRole !== 'admin') return null;
                      if (subItem.visibility === 'scorekeeper' && effectiveRole !== 'scorekeeper' && !hasScorekeeperRole) return null;
                      
                      return subItem.isButton ? (
                        <button
                          key={subItem.path || subItem.label}
                          onClick={() => {
                            if (subItem.onClick) subItem.onClick();
                            setOpenDropdown(null);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            textDecoration: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontFamily: 'inherit',
                            padding: '0.75rem 1rem',
                            width: '100%',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          {subItem.icon && <span>{subItem.icon}</span>}
                          <span>{subItem.label}</span>
                          {/* Notification Badge */}
                          {subItem.hasNotification && subItem.notificationCount && subItem.notificationCount > 0 && (
                            <span
                              style={{
                                marginLeft: 'auto',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                borderRadius: '50%',
                                minWidth: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                padding: '0 6px'
                              }}
                            >
                              {subItem.notificationCount > 9 ? '9+' : subItem.notificationCount}
                            </span>
                          )}
                        </button>
                      ) : (
                        <Link
                          key={subItem.path || subItem.label}
                          to={subItem.to || subItem.path || '#'}
                          onClick={() => setOpenDropdown(null)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            color: 'white',
                            textDecoration: 'none',
                            padding: '0.75rem 1rem',
                            transition: 'background-color 0.2s',
                            position: 'relative'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          {subItem.icon && <span>{subItem.icon}</span>}
                          <span>{subItem.label}</span>
                          {/* Notification Badge */}
                          {subItem.hasNotification && subItem.notificationCount && subItem.notificationCount > 0 && (
                            <span
                              style={{
                                marginLeft: 'auto',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                borderRadius: '50%',
                                minWidth: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                padding: '0 6px'
                              }}
                            >
                              {subItem.notificationCount > 9 ? '9+' : subItem.notificationCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* User Section */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: screenSize === 'mobile' ? '0.5rem' : screenSize === 'tablet' ? '0.5rem' : '1rem',
          flexShrink: 0
        }}>
          {currentUser && (
            <>
              {/* Admin Mode Indicator / Grant Access Button */}
              {(() => {
                // Check if user email matches admin criteria (even if role isn't set yet)
                const isAdminEmail = currentUser?.email === 'eddymosley@compscihigh.org' || 
                                    currentUser?.email === 'admin@mstgames.net' ||
                                    currentUser?.email === 'edm21179@gmail.com' ||
                                    currentUser?.email?.includes('eddymosley') ||
                                    currentUser?.email?.includes('admin') ||
                                    currentUser?.email?.includes('mstgames');
                
                if (isAdminEmail) {
                  // Show clickable button for all admin-eligible users (whether role is set or not)
                  // This allows re-granting access if role gets lost
                  return (
                    <button
                      onClick={() => {
                        // If already admin, navigate to admin panel
                        // Otherwise, grant admin access
                        if (isAdminUser) {
                          navigate('/admin');
                        } else {
                          grantAdminAccess();
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: screenSize === 'mobile' ? '0.25rem 0.5rem' : screenSize === 'tablet' ? '0.25rem 0.5rem' : '0.375rem 0.625rem',
                        backgroundColor: isAdminUser ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.3)',
                        border: isAdminUser ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(139, 92, 246, 0.6)',
                        borderRadius: '0.375rem',
                        fontSize: screenSize === 'mobile' ? '0.75rem' : screenSize === 'tablet' ? '0.75rem' : '0.8125rem',
                        color: '#c4b5fd',
                        fontWeight: '500',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.5)';
                        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.8)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isAdminUser ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.3)';
                        e.currentTarget.style.borderColor = isAdminUser ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.6)';
                      }}
                      title={isAdminUser ? "Click to open Admin Panel" : "Click to grant admin access"}
                    >
                      <span>👑</span>
                      {screenSize === 'desktop' && <span>Admin</span>}
                    </button>
                  );
                }
                return null;
              })()}
              
              {/* Notifications Bell */}
              <div style={{ position: 'relative' }} data-notifications onMouseEnter={!isMobile ? showTooltip : undefined} onMouseLeave={!isMobile ? hideTooltip : undefined}>
                <button
                  onClick={() => {
                    const newState = !showNotifications;
                    setShowNotifications(newState);
                    announce(newState ? 'Notifications opened' : 'Notifications closed');
                  }}
                  {...ariaUtils.button({
                    expanded: showNotifications,
                    controls: notificationsId,
                    label: `Notifications${notifications.filter(n => !n.read).length > 0 ? `, ${notifications.filter(n => !n.read).length} unread` : ''}`
                  })}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'white',
                    fontSize: screenSize === 'mobile' ? '1rem' : screenSize === 'tablet' ? '1.125rem' : '1.25rem',
                    cursor: 'pointer',
                    padding: screenSize === 'mobile' ? '0.75rem' : screenSize === 'tablet' ? '0.5rem' : '0.5rem',
                    borderRadius: '0.25rem',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    minWidth: screenSize === 'mobile' ? '44px' : 'auto',
                    minHeight: screenSize === 'mobile' ? '44px' : 'auto'
                  }}
                  onMouseEnter={e => screenSize !== 'mobile' && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => screenSize !== 'mobile' && (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  🔔
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span 
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: '0',
                        right: '0',
                        background: '#ef4444',
                        color: 'white',
                        borderRadius: '50%',
                        width: screenSize === 'mobile' ? '20px' : screenSize === 'tablet' ? '19px' : '18px',
                        height: screenSize === 'mobile' ? '20px' : screenSize === 'tablet' ? '19px' : '18px',
                        fontSize: screenSize === 'mobile' ? '0.875rem' : screenSize === 'tablet' ? '0.8125rem' : '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold'
                      }}
                    >
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                  {screenSize !== 'mobile' && <span className="tooltip" style={tooltipStyle}>Notifications</span>}
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div 
                    id={notificationsId}
                    role="region"
                    aria-label="Notifications"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: '0',
                      width: screenSize === 'mobile' ? '280px' : screenSize === 'tablet' ? '320px' : '350px',
                      maxHeight: '400px',
                      backgroundColor: 'white',
                      borderRadius: '0.5rem',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                      border: '1px solid #e5e7eb',
                      zIndex: 1000,
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{
                      padding: '1rem',
                      borderBottom: 'none',
                      backgroundColor: '#f8fafc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <h3 style={{ 
                        margin: 0, 
                        fontSize: '1rem', 
                        fontWeight: 'bold',
                        color: '#374151'
                      }}>
                        🔔 Notifications
                      </h3>
                      {notifications.length > 0 && (
                        <button
                          onClick={handleClearAllNotifications}
                          style={{
                            background: 'none',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            color: '#6b7280',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = '#ef4444';
                            e.currentTarget.style.color = 'white';
                            e.currentTarget.style.borderColor = '#ef4444';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = '#6b7280';
                            e.currentTarget.style.borderColor = '#d1d5db';
                          }}
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {notificationsLoading ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                          Loading notifications...
                        </div>
                      ) : notifications.length === 0 ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontStyle: 'italic' }}>
                          No notifications yet.
                        </div>
                      ) : (
                        notifications.map(notif => {
                          // Get notification styling based on type
                          const getNotificationStyle = () => {
                            switch (notif.type) {
                              case 'challenge_complete':
                                return { backgroundColor: '#dcfce7', borderColor: '#22c55e' };
                              case 'level_up':
                                return { backgroundColor: '#fef3c7', borderColor: '#fbbf24' };
                              case 'artifact_purchase':
                                return { backgroundColor: '#e0e7ff', borderColor: '#6366f1' };
                              case 'artifact_usage':
                                return { backgroundColor: '#fce7f3', borderColor: '#ec4899' };
                              case 'artifact_approved':
                                return { backgroundColor: '#dcfce7', borderColor: '#22c55e' };
                              case 'artifact_denied':
                                return { backgroundColor: '#fee2e2', borderColor: '#ef4444' };
                              case 'challenge_approved':
                                return { backgroundColor: '#dcfce7', borderColor: '#22c55e' };
                              case 'challenge_denied':
                                return { backgroundColor: '#fee2e2', borderColor: '#ef4444' };
                              case 'chapter_unlocked':
                                return { backgroundColor: '#e0e7ff', borderColor: '#6366f1' };
                              default:
                                return { backgroundColor: '#f3f4f6', borderColor: '#9ca3af' };
                            }
                          };

                          const style = getNotificationStyle();

                          return (
                            <div key={notif.id} style={{
                              padding: '1rem',
                              borderBottom: 'none',
                              borderLeft: `3px solid ${style.borderColor}`,
                              backgroundColor: style.backgroundColor,
                              cursor: notif.type === 'artifact_usage' ? 'default' : 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onClick={notif.type === 'artifact_usage' ? undefined : () => handleNotificationClick(notif)}
                            onMouseEnter={e => notif.type !== 'artifact_usage' && (e.currentTarget.style.backgroundColor = '#f9fafb')}
                            onMouseLeave={e => notif.type !== 'artifact_usage' && (e.currentTarget.style.backgroundColor = style.backgroundColor)}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                  <p style={{ 
                                    margin: '0 0 0.5rem 0', 
                                    fontSize: '0.875rem',
                                    color: '#374151',
                                    fontWeight: notif.read ? 'normal' : 'bold'
                                  }}>
                                    {notif.message}
                                  </p>
                                  <span style={{ 
                                    fontSize: '0.75rem', 
                                    color: '#6b7280' 
                                  }}>
                                    {notif.timestamp?.toDate ? 
                                      notif.timestamp.toDate().toLocaleDateString() : 
                                      notif.createdAt?.toDate ? 
                                        notif.createdAt.toDate().toLocaleDateString() :
                                        'Recently'
                                    }
                                  </span>
                                  
                                  {/* Action buttons for artifact usage notifications */}
                                  {notif.type === 'artifact_usage' && (
                                    <div style={{ 
                                      display: 'flex', 
                                      gap: '0.5rem', 
                                      marginTop: '0.75rem' 
                                    }}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleApproveArtifactUsage(notif);
                                        }}
                                        style={{
                                          backgroundColor: '#22c55e',
                                          color: 'white',
                                          border: 'none',
                                          padding: '0.375rem 0.75rem',
                                          borderRadius: '0.375rem',
                                          fontSize: '0.75rem',
                                          fontWeight: '500',
                                          cursor: 'pointer',
                                          transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#16a34a'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#22c55e'}
                                      >
                                        ✓ Approve
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDenyArtifactUsage(notif);
                                        }}
                                        style={{
                                          backgroundColor: '#ef4444',
                                          color: 'white',
                                          border: 'none',
                                          padding: '0.375rem 0.75rem',
                                          borderRadius: '0.375rem',
                                          fontSize: '0.75rem',
                                          fontWeight: '500',
                                          cursor: 'pointer',
                                          transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#dc2626'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ef4444'}
                                      >
                                        ✗ Deny
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteNotification(notif.id, notif._ref);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#6b7280',
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    fontSize: '0.75rem'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                  onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Mobile Menu Button */}
          {isMobile && (
            <button
              onClick={toggleMobileMenu}
              {...ariaUtils.button({
                expanded: isMobileMenuOpen,
                controls: mobileMenuId,
                label: isMobileMenuOpen ? 'Close mobile menu' : 'Open mobile menu'
              })}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                minWidth: '44px',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span aria-hidden="true">{isMobileMenuOpen ? '✕' : '☰'}</span>
            </button>
          )}

          {/* User Info & Logout */}
          {currentUser ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ 
                fontSize: isMobile ? '0.875rem' : '1rem',
                fontWeight: '500',
                color: 'white'
              }}>
                {screenSize === 'mobile' 
                  ? displayNameWithRole.substring(0, 8) + '...' 
                  : screenSize === 'tablet' 
                    ? displayNameWithRole.substring(0, 12) + (displayNameWithRole.length > 12 ? '...' : '')
                    : displayNameWithRole}
              </span>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white',
                  padding: screenSize === 'mobile' ? '0.5rem 0.75rem' : screenSize === 'tablet' ? '0.5rem 0.875rem' : '0.5rem 1rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: screenSize === 'mobile' ? '0.75rem' : screenSize === 'tablet' ? '0.8125rem' : '0.875rem',
                  transition: 'all 0.2s',
                  minWidth: screenSize === 'mobile' ? '60px' : 'auto',
                  minHeight: screenSize === 'mobile' ? '36px' : 'auto'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              >
                {isLoggingOut ? '...' : 'Logout'}
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Link
                to="/login"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white',
                  padding: screenSize === 'mobile' ? '0.5rem 0.75rem' : screenSize === 'tablet' ? '0.5rem 0.875rem' : '0.5rem 1rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: screenSize === 'mobile' ? '0.75rem' : screenSize === 'tablet' ? '0.8125rem' : '0.875rem',
                  transition: 'all 0.2s',
                  textDecoration: 'none',
                  minWidth: screenSize === 'mobile' ? '60px' : 'auto',
                  minHeight: screenSize === 'mobile' ? '36px' : 'auto'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              >
                Login
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobile && isMobileMenuOpen && (
        <div 
          id={mobileMenuId}
          role="navigation"
          aria-label="Mobile navigation menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            right: '0',
            backgroundColor: '#1e293b',
            borderTop: 'none',
            zIndex: 1000,
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}
        >
          <div style={{ padding: '1rem' }}>
            {/* Primary Navigation Items */}
            {primaryNavItems.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af',
                  fontWeight: '600',
                  marginBottom: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Main Navigation
                </div>
                {primaryNavItems.map((item) => (
                  <Link
                    key={item.to || item.path || '#'}
                    to={item.to || item.path || '#'}
                    onClick={closeMobileMenu}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      color: 'white',
                      textDecoration: 'none',
                      padding: '0.875rem 1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '0.25rem',
                      transition: 'all 0.2s ease',
                      fontSize: '1rem',
                      fontWeight: '500',
                      minHeight: '48px',
                      position: 'relative'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {item.label}
                    {/* Notification Badge */}
                    {item.hasNotification && item.notificationCount && item.notificationCount > 0 && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          borderRadius: '50%',
                          minWidth: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          padding: '0 6px'
                        }}
                      >
                        {item.notificationCount > 9 ? '9+' : item.notificationCount}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}

            {/* Secondary Navigation Items removed - all items are now in primary nav */}

            {/* Scorekeeper Navigation Items */}
            {scorekeeperNavItems.length > 0 && (
              <div style={{ 
                borderTop: 'none', 
                paddingTop: '1.5rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af',
                  fontWeight: '600',
                  marginBottom: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Scorekeeper Tools
                </div>
                {scorekeeperNavItems.map((item) => (
                  <Link
                    key={item.to || item.path || '#'}
                    to={item.to || item.path || '#'}
                    onClick={closeMobileMenu}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      color: 'white',
                      textDecoration: 'none',
                      padding: '0.875rem 1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '0.25rem',
                      transition: 'all 0.2s ease',
                      fontSize: '1rem',
                      fontWeight: '500',
                      minHeight: '48px',
                      backgroundColor: '#059669'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#047857'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#059669'}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            {/* Admin Navigation Items */}
            {adminNavItems.length > 0 && (
              <div style={{ 
                borderTop: 'none', 
                paddingTop: '1.5rem' 
              }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af',
                  fontWeight: '600',
                  marginBottom: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Administration
                </div>
                {adminNavItems.map((item) => (
                  <Link
                    key={item.to || item.path || '#'}
                    to={item.to || item.path || '#'}
                    onClick={closeMobileMenu}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      color: 'white',
                      textDecoration: 'none',
                      padding: '0.875rem 1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '0.25rem',
                      transition: 'all 0.2s ease',
                      fontSize: '1rem',
                      fontWeight: '500',
                      backgroundColor: '#dc2626',
                      minHeight: '48px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#b91c1c'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#dc2626'}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            {/* Login Section for Unauthenticated Users */}
            {!currentUser && (
              <div style={{ 
                borderTop: 'none', 
                paddingTop: '1.5rem' 
              }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af',
                  fontWeight: '600',
                  marginBottom: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Account
                </div>
                <Link
                  to="/login"
                  onClick={closeMobileMenu}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    color: 'white',
                    textDecoration: 'none',
                    padding: '0.875rem 1rem',
                    borderRadius: '0.5rem',
                    marginBottom: '0.25rem',
                    transition: 'all 0.2s ease',
                    fontSize: '1rem',
                    fontWeight: '500',
                    backgroundColor: '#4f46e5',
                    minHeight: '48px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#4338ca'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#4f46e5'}
                >
                  Login / Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
    </>
  );
});

NavBar.displayName = 'NavBar';

export default NavBar; 