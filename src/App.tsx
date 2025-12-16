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
import Banner from './components/Banner';
import ErrorBoundary from './components/ErrorBoundary';
import ScorekeeperInterface from './components/ScorekeeperInterface';
import BadgeRewardNotifier from './components/BadgeRewardNotifier';
import MilestoneModal from './components/MilestoneModal';

// Context providers
import { AuthProvider, useAuth } from './context/AuthContext';
import { LevelUpProvider } from './context/LevelUpContext';
import { BattleProvider } from './context/BattleContext';
import { StoryProvider } from './context/StoryContext';
import { MilestoneProvider, useMilestone } from './context/MilestoneContext';

// Development components
import FirebaseStatus from './components/FirebaseStatus';
import TutorialManager from './components/TutorialManager';
import InvitationManager from './components/InvitationManager';
import NavigationDebugger from './components/NavigationDebugger';
import InSessionNotification from './components/InSessionNotification';

// Load debug commands
import './utils/consoleCommands';

// Suppress Firestore internal assertion errors globally - MUST run after imports
const isFirestoreInternalError = (error: any): boolean => {
  if (!error) return false;
  const errorString = String(error);
  const errorMessage = error?.message || '';
  const errorStack = error?.stack || '';
  const errorCode = error?.code || '';
  
  // Check for nested errors in CONTEXT field
  let contextString = '';
  try {
    if (error?.context) {
      contextString = JSON.stringify(error.context);
    }
    if (error?.hc) {
      contextString += String(error.hc);
    }
  } catch (e) {
    // Ignore JSON stringify errors
  }
  
  const allErrorStrings = [
    errorString,
    errorMessage,
    errorStack,
    contextString,
    JSON.stringify(error)
  ].join(' ');
  
  return (
    allErrorStrings.includes('INTERNAL ASSERTION FAILED') || 
    allErrorStrings.includes('ID: ca9') ||
    allErrorStrings.includes('ID: b815') ||
    (allErrorStrings.includes('FIRESTORE') && allErrorStrings.includes('Unexpected state')) ||
    (allErrorStrings.includes('FIRESTORE') && allErrorStrings.includes('INTERNAL ASSERTION')) ||
    (errorCode === 'failed-precondition' && (allErrorStrings.includes('ID: ca9') || allErrorStrings.includes('ID: b815'))) ||
    // Check for specific Firestore internal patterns
    allErrorStrings.includes('__PRIVATE__fail') ||
    allErrorStrings.includes('__PRIVATE_hardAssert') ||
    allErrorStrings.includes('__PRIVATE_WatchChangeAggregator') ||
    allErrorStrings.includes('__PRIVATE_PersistentListenStream') ||
    allErrorStrings.includes('BrowserConnectivityMonitor') ||
    (allErrorStrings.includes('FIRESTORE') && allErrorStrings.includes('(11.10.0)'))
  );
};

// Override console.error immediately to catch Firestore errors
const originalConsoleError = console.error;
console.error = function(...args: any[]) {
  const message = args.join(' ');
  if (isFirestoreInternalError(message) || args.some(arg => isFirestoreInternalError(arg))) {
    return; // Completely suppress
  }
  originalConsoleError.apply(console, args);
};

// Global error handlers - set up immediately
window.addEventListener('error', (event) => {
  if (isFirestoreInternalError(event.error) || isFirestoreInternalError(event.message)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return false;
  }
}, true);

window.addEventListener('error', (event) => {
  if (isFirestoreInternalError(event.error) || isFirestoreInternalError(event.message)) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
}, false);

window.addEventListener('unhandledrejection', (event) => {
  if (isFirestoreInternalError(event.reason)) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
});

// Lazy load pages for better performance with route splitting
const Dashboard = withRouteSplitting(() => import('./pages/Dashboard'));
const Home = withRouteSplitting(() => import('./pages/Home'));
const Profile = withRouteSplitting(() => import('./pages/Profile'));
const Login = withRouteSplitting(() => import('./pages/Login'));
const PasswordReset = withRouteSplitting(() => import('./pages/PasswordReset'));
const AdminPanel = withRouteSplitting(() => import('./pages/AdminPanel'));
const Marketplace = withRouteSplitting(() => import('./pages/Marketplace'));
const Leaderboard = withRouteSplitting(() => import('./pages/Leaderboard'));
const Chapters = withRouteSplitting(() => import('./pages/Chapters'));
const Squads = withRouteSplitting(() => import('./pages/Squads'));
const Battle = withRouteSplitting(() => import('./pages/Battle'));
const Artifacts = withRouteSplitting(() => import('./pages/Artifacts'));
const Story = withRouteSplitting(() => import('./pages/Story'));
const StoryEpisodeBattle = withRouteSplitting(() => import('./pages/StoryEpisodeBattle'));
const IslandRaid = withRouteSplitting(() => import('./pages/IslandRun'));
const IslandRaidLobby = withRouteSplitting(() => import('./components/IslandRunLobby'));
const IslandRaidGame = withRouteSplitting(() => import('./components/IslandRaidGame'));
const InSession = withRouteSplitting(() => import('./pages/InSession'));
const InSessionRoom = withRouteSplitting(() => import('./components/InSessionRoom'));
const InSessionCreate = withRouteSplitting(() => import('./components/InSessionCreate'));
const InSessionBattleView = withRouteSplitting(() => import('./components/InSessionBattleView'));

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

// Error handlers already set up at the top of the file

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
  const { currentUser, loading } = useAuth();
  const { showMilestone, currentMilestone, isOpen, closeMilestone } = useMilestone();
  const { updateMetadata } = useRouteMetadata();
  useRouteAnalytics();
  useScrollRestoration();

  // Listen for milestone events
  React.useEffect(() => {
    const handleMilestoneReached = (event: CustomEvent) => {
      const { milestone, moveName, rewards } = event.detail;
      showMilestone({
        milestone,
        moveName,
        rewards
      });
    };

    window.addEventListener('milestoneReached', handleMilestoneReached as EventListener);
    
    return () => {
      window.removeEventListener('milestoneReached', handleMilestoneReached as EventListener);
    };
  }, [showMilestone]);

  // Update metadata for different routes
  React.useEffect(() => {
    const path = window.location.pathname;
    const routeMetadata = {
      '/': { title: 'Dashboard', description: 'Your manifestation journey begins here' },
      '/profile': { title: 'My Profile', description: 'View and manage your manifestation profile' },
      '/chapters': { title: "Player's Journey", description: 'Explore your story chapters and challenges' },
      '/story': { title: 'Story Mode', description: 'Your journey through the Nine Knowings Universe' },
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

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="App" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <NavBar />
        <Banner />
        <main style={{ flex: 1 }}>
          <PageLoader />
        </main>
      </div>
    );
  }

  return (
    <div className="App" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <NavBar />
      <Banner />
      <main style={{ flex: 1 }}>
        <RouteTransition>
          <Routes>
            <Route path="/" element={
              currentUser ? <Navigate to="/home" replace /> : <Navigate to="/login" replace />
            } />
            <Route path="/home" element={
              <ProtectedRoute user={true}>
                <Home />
              </ProtectedRoute>
            } />
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
            <Route path="/artifacts" element={
              <ProtectedRoute user={true}>
                <Artifacts />
              </ProtectedRoute>
            } />
            <Route path="/story" element={
              <ProtectedRoute user={true}>
                <Story />
              </ProtectedRoute>
            } />
            <Route path="/story/:episodeId/battle" element={
              <ProtectedRoute user={true}>
                <StoryEpisodeBattle />
              </ProtectedRoute>
            } />
            <Route path="/scorekeeper" element={
              <ProtectedRoute user={true} roles={['scorekeeper', 'admin']}>
                <ScorekeeperInterface />
              </ProtectedRoute>
            } />
            <Route path="/island-raid" element={
              <ProtectedRoute user={true}>
                <IslandRaid />
              </ProtectedRoute>
            } />
            <Route path="/island-raid/lobby/:lobbyId" element={
              <ProtectedRoute user={true}>
                <IslandRaidLobby />
              </ProtectedRoute>
            } />
            <Route path="/island-raid/game/:gameId" element={
              <ProtectedRoute user={true}>
                <IslandRaidGame />
              </ProtectedRoute>
            } />
            {/* Legacy routes for backwards compatibility */}
            <Route path="/island-run" element={
              <ProtectedRoute user={true}>
                <IslandRaid />
              </ProtectedRoute>
            } />
            <Route path="/island-run/lobby/:lobbyId" element={
              <ProtectedRoute user={true}>
                <IslandRaidLobby />
              </ProtectedRoute>
            } />
            <Route path="/island-run/game/:gameId" element={
              <ProtectedRoute user={true}>
                <IslandRaidGame />
              </ProtectedRoute>
            } />
            <Route path="/in-session" element={
              <ProtectedRoute user={true}>
                <InSession />
              </ProtectedRoute>
            } />
            <Route path="/in-session/room/:roomId" element={
              <ProtectedRoute user={true}>
                <InSessionRoom />
              </ProtectedRoute>
            } />
            <Route path="/in-session/create" element={
              <ProtectedRoute user={true}>
                <InSessionCreate />
              </ProtectedRoute>
            } />
            <Route path="/in-session/:sessionId" element={
              <ProtectedRoute user={true}>
                <InSessionBattleView />
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
      <BadgeRewardNotifier />
      <InSessionNotification />
      
      {/* Milestone Modal */}
      {currentMilestone && (
        <MilestoneModal
          isOpen={isOpen}
          onClose={closeMilestone}
          milestone={currentMilestone.milestone}
          moveName={currentMilestone.moveName}
          rewards={currentMilestone.rewards}
        />
      )}
      
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
          <MilestoneProvider>
            <BattleProvider>
              <StoryProvider>
                <Router>
                  <AppContent />
                </Router>
              </StoryProvider>
            </BattleProvider>
          </MilestoneProvider>
        </LevelUpProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
