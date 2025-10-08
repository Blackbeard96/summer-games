import React, { useState, useEffect, CSSProperties, MouseEvent, memo, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, DocumentReference, DocumentData, doc, getDoc, addDoc } from 'firebase/firestore';
import { UserRole } from '../types/roles';
import { logger } from '../utils/debugLogger';
import { useAriaLive, ariaUtils, generateId } from '../utils/accessibility';

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

const navItemStyle: CSSProperties = {
  color: 'white',
  textDecoration: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '0.25rem',
  transition: 'background-color 0.2s',
  position: 'relative' as CSSProperties['position'],
  display: 'inline-block',
  cursor: 'pointer',
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
  const { currentUser, logout, currentRole } = useAuth();
  const navigate = useNavigate();
  console.log('🎯 NavBar component rendered - currentUser:', currentUser?.email, 'currentRole:', currentRole);
  
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('student');
  
  // Accessibility features
  const { announce } = useAriaLive();
  const notificationsId = generateId('notifications');
  const mobileMenuId = generateId('mobile-menu');

  // Check if device is mobile with throttled resize handler
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const checkMobile = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsMobile(window.innerWidth <= 768);
      }, 100);
    };
    
    // Initial check
    setIsMobile(window.innerWidth <= 768);
    
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
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
    currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Student',
    [currentUser?.displayName, currentUser?.email]
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

  // Memoize navigation items to prevent unnecessary re-renders
  const navItems = useMemo(() => [
    { to: '/', label: 'Training Grounds', tooltip: 'Dashboard' },
    { to: '/chapters', label: "Player's Journey", tooltip: 'Chapter System & Story Mode' },
    { to: '/battle', label: 'Battle Arena', tooltip: 'MST Battle System' },
    { to: '/leaderboard', label: 'Hall of Fame', tooltip: 'Leaderboard' },
  ], []);

  const userNavItems = useMemo(() => currentUser ? [
    { to: '/profile', label: 'My Profile', tooltip: 'My Manifestation' },
    { to: '/squads', label: 'Squads', tooltip: 'Team Management' },
    { to: '/marketplace', label: 'MST MKT', tooltip: 'Artifact Marketplace' },
    { to: '#', label: '📚 Review Tutorials', tooltip: 'Review Tutorials', isButton: true, onClick: () => (window as any).tutorialTriggers?.showReviewModal?.() },
  ] : [], [currentUser]);

  // Scorekeeper navigation items (only for scorekeepers)
  // Temporary: Also show for Blackbeard for testing
  const isScorekeeper = useMemo(() => {
    const result = hasScorekeeperRole || 
      userRole === 'scorekeeper' || 
      (currentUser?.email === 'eddymosley9@gmail.com' && process.env.NODE_ENV === 'development');
    console.log(`🔍 Scorekeeper check - hasScorekeeperRole: ${hasScorekeeperRole}, userRole: ${userRole}, email: ${currentUser?.email}, result: ${result}`);
    return result;
  }, [hasScorekeeperRole, userRole, currentUser?.email]);
  
  const scorekeeperNavItems = useMemo(() => (currentUser && isScorekeeper) ? [
    { to: '/scorekeeper', label: '📊 Scorekeeper', tooltip: 'Manage Class Power Points', isScorekeeper: true }
  ] : [], [currentUser, isScorekeeper]);

  const adminNavItems = useMemo(() => currentUser?.email === 'edm21179@gmail.com' ? [
    { to: '/admin', label: "Sage's Chamber", tooltip: 'Admin Panel', isAdmin: true }
  ] : [], [currentUser?.email]);

  // Debug navigation items generation
  logger.roles.debug('NavBar: Navigation items generated:', {
    currentUser: !!currentUser,
    userEmail: currentUser?.email,
    userRole,
    scorekeeperNavItems: scorekeeperNavItems.length,
    userNavItems: userNavItems.length,
    adminNavItems: adminNavItems.length
  });

  // Temporary debug indicator for role detection
  if (currentUser && process.env.NODE_ENV === 'development') {
    console.log(`🎯 NavBar Debug - User: ${currentUser.email}, Role: ${userRole}, Scorekeeper items: ${scorekeeperNavItems.length}`);
    console.log(`🔍 Scorekeeper check - isScorekeeper: ${isScorekeeper}, userRole: ${userRole}, email: ${currentUser.email}`);
    console.log(`🔍 hasScorekeeperRole: ${hasScorekeeperRole}`);
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
        padding: isMobile ? '0.75rem 1rem' : '1rem 1.5rem',
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
        justifyContent: 'space-between'
      }}>
        {/* Logo/Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: isMobile ? '32px' : '40px',
            height: isMobile ? '32px' : '40px',
            backgroundColor: '#4f46e5',
            borderRadius: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: isMobile ? '1rem' : '1.25rem',
            fontWeight: 'bold'
          }}>
            X
          </div>
          <span style={{
            fontSize: isMobile ? '1.125rem' : '1.25rem',
            fontWeight: 'bold',
            color: 'white'
          }}>
            Xiotein School
          </span>
        </div>

        {/* Desktop Navigation */}
        {!isMobile && (
          <div style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center'
          }}>
            {navItems.map((item) => (
              <div key={item.to} style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                <Link to={item.to} style={{ color: 'inherit', textDecoration: 'none' }}>{item.label}</Link>
                <span className="tooltip" style={tooltipStyle}>{item.tooltip}</span>
              </div>
            ))}

            {userNavItems.map((item) => (
              <div key={item.to} style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                {item.isButton ? (
                  <button
                    onClick={item.onClick}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      fontSize: 'inherit',
                      fontFamily: 'inherit'
                    }}
                  >
                    {item.label}
                  </button>
                ) : (
                  <Link to={item.to} style={{ color: 'inherit', textDecoration: 'none' }}>{item.label}</Link>
                )}
                <span className="tooltip" style={tooltipStyle}>{item.tooltip}</span>
              </div>
            ))}

            {scorekeeperNavItems.map((item) => (
              <div key={item.to} style={{ ...navItemStyle, backgroundColor: '#059669' }} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                <Link to={item.to} style={{ color: 'inherit', textDecoration: 'none' }}>{item.label}</Link>
                <span className="tooltip" style={tooltipStyle}>{item.tooltip}</span>
              </div>
            ))}

            {adminNavItems.map((item) => (
              <div key={item.to} style={{ ...navItemStyle, backgroundColor: '#dc2626' }} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                <Link to={item.to} style={{ color: 'inherit', textDecoration: 'none' }}>{item.label}</Link>
                <span className="tooltip" style={tooltipStyle}>{item.tooltip}</span>
              </div>
            ))}
          </div>
        )}

        {/* User Section */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '0.5rem' : '1rem'
        }}>
          {currentUser && (
            <>
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
                    fontSize: isMobile ? '1rem' : '1.25rem',
                    cursor: 'pointer',
                    padding: isMobile ? '0.75rem' : '0.5rem',
                    borderRadius: '0.25rem',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    minWidth: isMobile ? '44px' : 'auto',
                    minHeight: isMobile ? '44px' : 'auto'
                  }}
                  onMouseEnter={e => !isMobile && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => !isMobile && (e.currentTarget.style.backgroundColor = 'transparent')}
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
                        width: isMobile ? '20px' : '18px',
                        height: isMobile ? '20px' : '18px',
                        fontSize: isMobile ? '0.875rem' : '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold'
                      }}
                    >
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                  {!isMobile && <span className="tooltip" style={tooltipStyle}>Notifications</span>}
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
                      width: isMobile ? '280px' : '350px',
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
                {isMobile ? displayNameWithRole.substring(0, 8) + '...' : displayNameWithRole}
              </span>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white',
                  padding: isMobile ? '0.5rem 0.75rem' : '0.5rem 1rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: isMobile ? '0.75rem' : '0.875rem',
                  transition: 'all 0.2s',
                  minWidth: isMobile ? '60px' : 'auto',
                  minHeight: isMobile ? '36px' : 'auto'
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
                  padding: isMobile ? '0.5rem 0.75rem' : '0.5rem 1rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: isMobile ? '0.75rem' : '0.875rem',
                  transition: 'all 0.2s',
                  textDecoration: 'none',
                  minWidth: isMobile ? '60px' : 'auto',
                  minHeight: isMobile ? '36px' : 'auto'
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
            {/* Navigation Items */}
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
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
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
                    minHeight: '48px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* User Navigation Items */}
            {userNavItems.length > 0 && (
              <div style={{ 
                marginBottom: '1.5rem', 
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
                  My Account
                </div>
                {userNavItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
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
                      minHeight: '48px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

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
                    key={item.to}
                    to={item.to}
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
                    key={item.to}
                    to={item.to}
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