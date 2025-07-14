import React, { useState, CSSProperties, MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

const NavBar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
          {/* Hall of Fame (Leaderboard) */}
          <div style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
            <Link to="/leaderboard" style={{ color: 'inherit', textDecoration: 'none' }}>Hall of Fame</Link>
            <span className="tooltip" style={tooltipStyle}>Leaderboard</span>
          </div>
          {currentUser && (
            <>
              {/* My Manifestation (Profile) */}
              <div style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                <Link to="/profile" style={{ color: 'inherit', textDecoration: 'none' }}>My Manifestation</Link>
                <span className="tooltip" style={tooltipStyle}>Profile</span>
              </div>
              {/* Artifact Shop (Marketplace) */}
              <div style={navItemStyle} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
                <Link to="/marketplace" style={{ color: 'inherit', textDecoration: 'none' }}>Artifact Shop</Link>
                <span className="tooltip" style={tooltipStyle}>Marketplace</span>
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