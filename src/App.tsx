
import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { 
  withRouteSplitting, 
  ProtectedRoute, 
  RouteTransition,
  useRouteMetadata,
  useRouteAnalytics,
  useScrollRestoration
} from './utils/routing';

// Core components
import NavBar from './components/NavBar';
import ErrorBoundary from './components/ErrorBoundary';
import ScorekeeperInterface from './components/ScorekeeperInterface';

// Context providers
import { AuthProvider, useAuth } from './context/AuthContext';
import { LevelUpProvider } from './context/LevelUpContext';
import { BattleProvider } from './context/BattleContext';
import { StoryProvider } from './context/StoryContext';

// Development components
import FirebaseStatus from './components/FirebaseStatus';
import TutorialManager from './components/TutorialManager';
import InvitationManager from './components/InvitationManager';
import NavigationDebugger from './components/NavigationDebugger';

// Load debug commands
import './utils/consoleCommands';

// Lazy load pages for better performance with route splitting
const Dashboard = withRouteSplitting(() => import('./pages/Dashboard'));
const Profile = withRouteSplitting(() => import('./pages/Profile'));
const Login = withRouteSplitting(() => import('./pages/Login'));
const PasswordReset = withRouteSplitting(() => import('./pages/PasswordReset'));
const AdminPanel = withRouteSplitting(() => import('./pages/AdminPanel'));
const Marketplace = withRouteSplitting(() => import('./pages/Marketplace'));
const Leaderboard = withRouteSplitting(() => import('./pages/Leaderboard'));
const Chapters = withRouteSplitting(() => import('./pages/Chapters'));
const Squads = withRouteSplitting(() => import('./pages/Squads'));
const Battle = withRouteSplitting(() => import('./pages/Battle'));

// Loading component for lazy-loaded routes
const PageLoader = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '50vh',
    gap: '1rem'
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '4px solid #e5e7eb',
      borderTop: '4px solid #4f46e5',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}></div>
    <p style={{ color: '#6b7280', fontSize: '1rem' }}>Loading...</p>
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

// Global error handler for Firestore assertion errors
window.addEventListener('error', (event) => {
  if (event.error && event.error.message && 
      (event.error.message.includes('INTERNAL ASSERTION FAILED') || 
       event.error.message.includes('FIRESTORE') ||
       event.error.message.includes('Unexpected state'))) {
    console.warn('🚨 Caught Firestore Error - preventing crash:', event.error.message);
    event.preventDefault(); // Prevent the error from crashing the app
    return false;
  }
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && 
      (event.reason.message.includes('INTERNAL ASSERTION FAILED') || 
       event.reason.message.includes('FIRESTORE') ||
       event.reason.message.includes('Unexpected state'))) {
    console.warn('🚨 Caught Firestore Error in Promise - preventing crash:', event.reason.message);
    event.preventDefault(); // Prevent the error from crashing the app
    return false;
  }
});

// Additional error handler for console errors
const originalConsoleError = console.error;
console.error = function(...args) {
  const message = args.join(' ');
  if (message.includes('INTERNAL ASSERTION FAILED') || 
      message.includes('FIRESTORE') ||
      message.includes('Unexpected state')) {
    console.warn('🚨 Caught Firestore Error in Console - preventing crash:', message);
    return;
  }
  originalConsoleError.apply(console, args);
};

// Protected Admin Route Component
const ProtectedAdminRoute = () => {
  const { currentUser, loading } = useAuth();
  
  // Show loading while auth is being checked
  if (loading) {
    return <PageLoader />;
  }
  
  // Check if current user is admin (same logic as other components)
  const isAdmin = currentUser?.email === 'eddymosley@compscihigh.org' || 
                  currentUser?.email === 'admin@mstgames.net' ||
                  currentUser?.email === 'edm21179@gmail.com' ||
                  currentUser?.email?.includes('eddymosley') ||
                  currentUser?.email?.includes('admin') ||
                  currentUser?.email?.includes('mstgames');
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  if (!isAdmin) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '4rem' }}>🚫</div>
        <h2 style={{ color: '#ef4444', margin: 0 }}>Access Denied</h2>
        <p style={{ color: '#6b7280', margin: 0 }}>
          You don't have permission to access the admin panel.
        </p>
        <button
          onClick={() => window.history.back()}
          style={{
            backgroundColor: '#4f46e5',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '500',
            marginTop: '1rem'
          }}
        >
          Go Back
        </button>
      </div>
    );
  }
  
  return (
    <Suspense fallback={<PageLoader />}>
      <AdminPanel />
    </Suspense>
  );
};

// App content component with routing utilities
const AppContent = () => {
  const { updateMetadata } = useRouteMetadata();
  useRouteAnalytics();
  useScrollRestoration();

  // Update metadata for different routes
  React.useEffect(() => {
    const path = window.location.pathname;
    const routeMetadata = {
      '/': { title: 'Training Grounds', description: 'Your manifestation journey begins here' },
      '/profile': { title: 'My Profile', description: 'View and manage your manifestation profile' },
      '/chapters': { title: "Player's Journey", description: 'Explore your story chapters and challenges' },
      '/battle': { title: 'Battle Arena', description: 'Engage in MST battles and challenges' },
      '/leaderboard': { title: 'Hall of Fame', description: 'See the top manifesters' },
      '/marketplace': { title: 'MST MKT', description: 'Browse and purchase artifacts' },
      '/squads': { title: 'Squads', description: 'Manage your team and collaborations' },
      '/admin': { title: "Sage's Chamber", description: 'Administrative panel' },
      '/scorekeeper': { title: 'Scorekeeper', description: 'Manage class power points' }
    };

    const metadata = routeMetadata[path as keyof typeof routeMetadata];
    if (metadata) {
      updateMetadata(metadata);
    }
  }, [updateMetadata]);

  return (
    <div className="App" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <NavBar />
      <main style={{ flex: 1 }}>
        <RouteTransition>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/profile" element={
              <ProtectedRoute user={true}>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<PasswordReset />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/admin" element={<ProtectedAdminRoute />} />
            <Route path="/marketplace" element={
              <ProtectedRoute user={true}>
                <Marketplace />
              </ProtectedRoute>
            } />
            <Route path="/chapters" element={
              <ProtectedRoute user={true}>
                <Chapters />
              </ProtectedRoute>
            } />
            <Route path="/squads" element={
              <ProtectedRoute user={true}>
                <Squads />
              </ProtectedRoute>
            } />
            <Route path="/battle" element={
              <ProtectedRoute user={true}>
                <Battle />
              </ProtectedRoute>
            } />
            <Route path="/scorekeeper" element={
              <ProtectedRoute user={true} roles={['scorekeeper', 'admin']}>
                <ScorekeeperInterface />
              </ProtectedRoute>
            } />
            {/* Catch-all route for 404 */}
            <Route path="*" element={
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '50vh',
                gap: '1rem',
                padding: '2rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '4rem' }}>🔍</div>
                <h2 style={{ color: '#374151', margin: 0 }}>Page Not Found</h2>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  The page you're looking for doesn't exist.
                </p>
                <button
                  onClick={() => window.location.href = '/'}
                  style={{
                    backgroundColor: '#4f46e5',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500',
                    marginTop: '1rem'
                  }}
                >
                  Go Home
                </button>
              </div>
            } />
          </Routes>
        </RouteTransition>
      </main>
      
      {/* Global Components */}
      <TutorialManager />
      <InvitationManager />
      
      {/* Development Components */}
      {process.env.NODE_ENV === 'development' && <FirebaseStatus />}
      <NavigationDebugger />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LevelUpProvider>
          <BattleProvider>
            <StoryProvider>
              <Router>
                <AppContent />
              </Router>
            </StoryProvider>
          </BattleProvider>
        </LevelUpProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
