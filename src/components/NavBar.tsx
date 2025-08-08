import React, { useState, useEffect, CSSProperties, MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, DocumentReference, DocumentData } from 'firebase/firestore';

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
  read?: boolean;
}

const NavBar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Student';

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!currentUser) return;
      
      setNotificationsLoading(true);
      try {
        const notifSnap = await getDocs(collection(db, 'students', currentUser.uid, 'notifications'));
        const notifList: Notification[] = notifSnap.docs.map(docSnap => {
          const data = docSnap.data() as Notification;
          return { ...data, id: docSnap.id, _ref: docSnap.ref };
        });
        setNotifications(notifList.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
      } catch (err) {
        setNotifications([]);
      } finally {
        setNotificationsLoading(false);
      }
    };

    fetchNotifications();
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

  const handleNotificationClick = async (notif: Notification) => {
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
  };

  const handleDeleteNotification = async (notifId: string, notifRef: DocumentReference<DocumentData, DocumentData>) => {
    try {
      await updateDoc(notifRef, { deleted: true });
      setNotifications(prev => prev.filter(n => n.id !== notifId));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const showTooltip = (e: MouseEvent<HTMLDivElement>) => {
    const tooltip = e.currentTarget.querySelector('.tooltip') as HTMLElement;
    if (tooltip) tooltip.style.opacity = '1';
  };

  const hideTooltip = (e: MouseEvent<HTMLDivElement>) => {
    const tooltip = e.currentTarget.querySelector('.tooltip') as HTMLElement;
    if (tooltip) tooltip.style.opacity = '0';
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Navigation items
  const navItems = [
    { to: '/', label: 'Training Grounds', tooltip: 'Dashboard' },
    { to: '/chapters', label: "Player's Journey", tooltip: 'Chapter System' },
    { to: '/leaderboard', label: 'Hall of Fame', tooltip: 'Leaderboard' },
  ];

  const userNavItems = currentUser ? [
    { to: '/profile', label: 'My Profile', tooltip: 'My Manifestation' },
    { to: '/squads', label: 'Squads', tooltip: 'Team Management' },
    { to: '/marketplace', label: 'MST MKT', tooltip: 'Artifact Marketplace' },
    { to: '#', label: '📚 Review Tutorials', tooltip: 'Review Tutorials', isButton: true, onClick: () => (window as any).tutorialTriggers?.showReviewModal?.() },
  ] : [];

  const adminNavItems = currentUser?.email === 'edm21179@gmail.com' ? [
    { to: '/admin', label: "Sage's Chamber", tooltip: 'Admin Panel', isAdmin: true }
  ] : [];

  return (
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
                  onClick={() => setShowNotifications(!showNotifications)}
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
                    <span style={{
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
                    }}>
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                  {!isMobile && <span className="tooltip" style={tooltipStyle}>Notifications</span>}
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div style={{
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
                  }}>
                    <div style={{
                      padding: '1rem',
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor: '#f8fafc'
                    }}>
                      <h3 style={{ 
                        margin: 0, 
                        fontSize: '1rem', 
                        fontWeight: 'bold',
                        color: '#374151'
                      }}>
                        🔔 Notifications
                      </h3>
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
                              default:
                                return { backgroundColor: '#f3f4f6', borderColor: '#9ca3af' };
                            }
                          };

                          const style = getNotificationStyle();

                          return (
                            <div key={notif.id} style={{
                              padding: '1rem',
                              borderBottom: '1px solid #e5e7eb',
                              borderLeft: `3px solid ${style.borderColor}`,
                              backgroundColor: style.backgroundColor,
                              cursor: 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onClick={() => handleNotificationClick(notif)}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = style.backgroundColor}
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
                                      'Recently'
                                    }
                                  </span>
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
              {isMobileMenuOpen ? '✕' : '☰'}
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
                {isMobile ? displayName.substring(0, 8) + '...' : displayName}
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
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '0',
          right: '0',
          backgroundColor: '#1e293b',
          borderTop: '1px solid #334155',
          zIndex: 1000,
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
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
                borderTop: '1px solid #374151', 
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

            {/* Admin Navigation Items */}
            {adminNavItems.length > 0 && (
              <div style={{ 
                borderTop: '1px solid #374151', 
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
                borderTop: '1px solid #374151', 
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
  );
};

export default NavBar; 