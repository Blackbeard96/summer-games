import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { login, signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password, displayName);
      }
      navigate('/');
    } catch (error: any) {
      setError(error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await loginWithGoogle();
      navigate('/');
    } catch (error: any) {
      setError(error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f9fafb',
      padding: isMobile ? '1rem' : '3rem 1rem'
    }}>
      <div style={{ 
        maxWidth: isMobile ? '100%' : '28rem', 
        width: '100%',
        padding: isMobile ? '0 1rem' : '0'
      }}>
        <div>
          <h2 style={{
            marginTop: isMobile ? '1rem' : '1.5rem',
            textAlign: 'center',
            fontSize: isMobile ? '1.5rem' : '1.875rem',
            fontWeight: '800',
            color: '#111827',
            lineHeight: 1.2
          }}>
            {isLogin ? 'Sign in to your account' : 'Create your account'}
          </h2>
          <p style={{
            marginTop: '0.5rem',
            textAlign: 'center',
            fontSize: isMobile ? '0.8rem' : '0.875rem',
            color: '#6b7280',
            padding: isMobile ? '0 0.5rem' : '0'
          }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={toggleMode}
              style={{
                fontWeight: '500',
                color: '#4f46e5',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'inherit'
              }}
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
        
        <form onSubmit={handleSubmit} style={{ marginTop: isMobile ? '1.5rem' : '2rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            {!isLogin && (
              <div style={{ marginBottom: '0.5rem' }}>
                <input
                  id="display-name"
                  name="displayName"
                  type="text"
                  required={!isLogin}
                  style={{
                    width: '100%',
                    padding: isMobile ? '0.75rem' : '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: isMobile ? '1rem' : '0.875rem',
                    minHeight: isMobile ? '44px' : 'auto'
                  }}
                  placeholder="Display Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            )}
            <div style={{ marginBottom: '0.5rem' }}>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                style={{
                  width: '100%',
                  padding: isMobile ? '0.75rem' : '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: isMobile ? '1rem' : '0.875rem',
                  minHeight: isMobile ? '44px' : 'auto'
                }}
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {!isLogin && (
                <div style={{
                  fontSize: isMobile ? '0.7rem' : '0.75rem',
                  color: '#6b7280',
                  marginTop: '0.25rem',
                  lineHeight: '1.4'
                }}>
                  Supported domains: compscihigh.org, gmail.com, yahoo.com, outlook.com, hotmail.com
                </div>
              )}
            </div>
            <div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                style={{
                  width: '100%',
                  padding: isMobile ? '0.75rem' : '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: isMobile ? '1rem' : '0.875rem',
                  minHeight: isMobile ? '44px' : 'auto'
                }}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {isLogin && (
                <div style={{
                  textAlign: 'right',
                  marginTop: '0.5rem'
                }}>
                  <Link 
                    to="/reset-password"
                    style={{
                      color: '#4f46e5',
                      textDecoration: 'none',
                      fontSize: isMobile ? '0.8rem' : '0.75rem'
                    }}
                  >
                    Forgot your password?
                  </Link>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '0.375rem',
              padding: isMobile ? '0.75rem' : '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ 
                fontSize: isMobile ? '0.8rem' : '0.875rem', 
                color: '#b91c1c',
                lineHeight: '1.4'
              }}>
                {error}
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: isMobile ? '0.75rem 1rem' : '0.5rem 1rem',
                backgroundColor: loading ? '#9ca3af' : '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: isMobile ? '1rem' : '0.875rem',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                marginBottom: '1rem',
                minHeight: isMobile ? '44px' : 'auto'
              }}
            >
              {loading ? (
                <span>Loading...</span>
              ) : (
                <span>{isLogin ? 'Sign in' : 'Sign up'}</span>
              )}
            </button>
            
            <div style={{
              textAlign: 'center',
              marginBottom: '1rem',
              position: 'relative'
            }}>
              <div style={{
                borderTop: '1px solid #d1d5db',
                marginTop: '1rem',
                marginBottom: '1rem'
              }}></div>
              <span style={{
                backgroundColor: '#f9fafb',
                padding: '0 0.5rem',
                color: '#6b7280',
                fontSize: isMobile ? '0.8rem' : '0.875rem'
              }}>
                or
              </span>
            </div>
            
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{
                width: '100%',
                padding: isMobile ? '0.75rem 1rem' : '0.5rem 1rem',
                backgroundColor: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: isMobile ? '1rem' : '0.875rem',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                minHeight: isMobile ? '44px' : 'auto'
              }}
            >
              <svg width={isMobile ? "20" : "18"} height={isMobile ? "20" : "18"} viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login; 