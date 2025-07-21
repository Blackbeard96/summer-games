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
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotifications]);

  // Mark notification as read
  const handleNotificationClick = async (notif: Notification) => {
    if (notif.read === false) {
      try {
        await updateDoc(notif._ref, { read: true });
        setNotifications(prev => prev.map(n => 
          n.id === notif.id ? { ...n, read: true } : n
        ));
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    setShowNotifications(false);
  };

  // Delete notification
  const handleDeleteNotification = async (notifId: string, notifRef: DocumentReference<DocumentData, DocumentData>) => {
    try {
      // Note: We'll need to import deleteDoc if we want to actually delete
      // For now, just mark as read
      await updateDoc(notifRef, { read: true });
      setNotifications(prev => prev.filter(n => n.id !== notifId));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Helper to handle tooltip show/hide
  const showTooltip = (e: MouseEvent<HTMLDivElement>) => {
    const tooltip = (e.currentTarget.querySelector('.tooltip') as HTMLElement | null);
    if (tooltip) tooltip.style.opacity = '1';
  };
  const hideTooltip = (e: MouseEvent<HTMLDivElement>) => {
    const tooltip = (e.currentTarget.querySelector('.tooltip') as HTMLElement | null);
    if (tooltip) tooltip.style.opacity = '0';
  };

  return (
    <nav style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
      color: 'white',
      padding: '1rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Link to="/" style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: 'white',
          textDecoration: 'none',
          background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          🏛️ Xiotein School
        </Link>
        <div style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center'
        }}>
          {/* Training Grounds (Dashboard) */}
          <div style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Training Grounds</Link>
            <span className="tooltip" style={tooltipStyle}>Dashboard</span>
          </div>
          {/* Player's Journey (Chapters) */}
          <div style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
            <Link to="/chapters" style={{ color: 'inherit', textDecoration: 'none' }}>Player's Journey</Link>
            <span className="tooltip" style={tooltipStyle}>Chapter System</span>
          </div>
          {/* Hall of Fame (Leaderboard) */}
          <div style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
            <Link to="/leaderboard" style={{ color: 'inherit', textDecoration: 'none' }}>Hall of Fame</Link>
            <span className="tooltip" style={tooltipStyle}>Leaderboard</span>
          </div>

          {currentUser && (
            <>
              {/* My Profile */}
              <div style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                <Link to="/profile" style={{ color: 'inherit', textDecoration: 'none' }}>My Profile</Link>
                <span className="tooltip" style={tooltipStyle}>My Manifestation</span>
              </div>
              {/* MST MKT (Marketplace) */}
              <div style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                <Link to="/marketplace" style={{ color: 'inherit', textDecoration: 'none' }}>MST MKT</Link>
                <span className="tooltip" style={tooltipStyle}>Artifact Marketplace</span>
              </div>
              {/* Sage's Chamber (Admin Panel) */}
              {currentUser.email === 'edm21179@gmail.com' && (
                <div style={{ ...navItemStyle, backgroundColor: '#dc2626' }} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                  <Link to="/admin" style={{ color: 'inherit', textDecoration: 'none' }}>Sage's Chamber</Link>
                  <span className="tooltip" style={tooltipStyle}>Admin Panel</span>
                </div>
              )}
            </>
          )}
          {currentUser ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}>
              {/* Notifications Bell */}
              <div style={{ position: 'relative' }} data-notifications onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'white',
                    fontSize: '1.25rem',
                    cursor: 'pointer',
                    padding: '0.5rem',
                    borderRadius: '0.25rem',
                    position: 'relative',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
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
                      width: '18px',
                      height: '18px',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold'
                    }}>
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                  <span className="tooltip" style={tooltipStyle}>Notifications</span>
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: '0',
                    width: '350px',
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
                            if (notif.read) return { bg: 'white', border: '#f3f4f6' };
                            
                            switch (notif.type) {
                              case 'challenge_approved':
                                return { bg: '#dcfce7', border: '#22c55e' };
                              case 'challenge_denied':
                                return { bg: '#fee2e2', border: '#ef4444' };
                              case 'challenge_auto_completed':
                                return { bg: '#dbeafe', border: '#3b82f6' };
                              case 'challenge_submitted':
                                return { bg: '#fef3c7', border: '#f59e0b' };
                              default:
                                return { bg: '#fef3c7', border: '#f59e0b' };
                            }
                          };
                          
                          const style = getNotificationStyle();
                          
                          return (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              style={{
                                padding: '1rem',
                                borderBottom: `1px solid ${style.border}`,
                                cursor: 'pointer',
                                backgroundColor: style.bg,
                                transition: 'background-color 0.2s'
                              }}
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = notif.read ? '#f9fafb' : style.bg}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = notif.read ? 'white' : style.bg}
                            >
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'flex-start',
                              marginBottom: '0.5rem'
                            }}>
                              <div style={{ 
                                fontWeight: 'bold', 
                                color: '#374151',
                                fontSize: '0.875rem'
                              }}>
                                {notif.challengeName || 'Notification'}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNotification(notif.id, notif._ref);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  fontSize: '1rem',
                                  padding: '0',
                                  marginLeft: '0.5rem'
                                }}
                                title="Delete notification"
                              >
                                ×
                              </button>
                            </div>
                            <div style={{ 
                              color: '#6b7280', 
                              fontSize: '0.875rem',
                              marginBottom: '0.5rem'
                            }}>
                              {notif.message}
                            </div>
                            {notif.timestamp && (
                              <div style={{ 
                                fontSize: '0.75rem', 
                                color: '#9ca3af'
                              }}>
                                {notif.timestamp.toDate ? 
                                  notif.timestamp.toDate().toLocaleString() : 
                                  new Date(notif.timestamp).toLocaleString()
                                }
                              </div>
                            )}
                          </div>
                        );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <img
                src={currentUser.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=4f46e5&color=fff&size=32`}
                alt="Avatar"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
              <span style={{ fontSize: '0.875rem' }}>
                Welcome, {displayName}
              </span>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: isLoggingOut ? 'not-allowed' : 'pointer',
                  opacity: isLoggingOut ? 0.5 : 1,
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={e => !isLoggingOut && (e.currentTarget.style.backgroundColor = '#b91c1c')}
                onMouseLeave={e => !isLoggingOut && (e.currentTarget.style.backgroundColor = '#dc2626')}
              >
                {isLoggingOut ? 'Departing...' : 'Depart'}
              </button>
            </div>
          ) : (
            <Link to="/login" style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              textDecoration: 'none',
              transition: 'background-color 0.2s'
            }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#3730a3'}
               onMouseLeave={e => e.currentTarget.style.backgroundColor = '#4f46e5'}>
              Begin Manifestation
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default NavBar; 