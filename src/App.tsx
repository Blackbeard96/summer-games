
import Chapters from './pages/Chapters'; // Add Chapters import
import Squads from './pages/Squads'; // Add Squads import
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Login from './pages/Login';
import PasswordReset from './pages/PasswordReset';
import AdminPanel from './pages/AdminPanel';
import Marketplace from './pages/Marketplace';
import Leaderboard from './pages/Leaderboard';
import NavBar from './components/NavBar';
import FirebaseStatus from './components/FirebaseStatus';
import TutorialManager from './components/TutorialManager';
import InvitationManager from './components/InvitationManager';
import NavigationDebugger from './components/NavigationDebugger';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LevelUpProvider } from './context/LevelUpContext';
import { BattleProvider } from './context/BattleContext';
import { StoryProvider } from './context/StoryContext';
import Battle from './pages/Battle';
// Firebase services are imported but not directly used in this component
// They are used by child components through the firebase.ts file



// Protected Admin Route Component
const ProtectedAdminRoute = () => {
  const { currentUser } = useAuth();
  
  // Check if current user is admin (same logic as other components)
  const isAdmin = currentUser?.email === 'eddymosley@compscihigh.org' || 
                  currentUser?.email === 'admin@mstgames.net' ||
                  currentUser?.email === 'edm21179@gmail.com' ||
                  currentUser?.email?.includes('eddymosley') ||
                  currentUser?.email?.includes('admin') ||
                  currentUser?.email?.includes('mstgames');
  
  if (!currentUser || !isAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return <AdminPanel />;
};

function App() {
  return (
    <AuthProvider>
      <LevelUpProvider>
        <BattleProvider>
          <StoryProvider>
            <Router>
            <NavBar />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<PasswordReset />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/admin" element={<ProtectedAdminRoute />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/chapters" element={<Chapters />} />
              <Route path="/squads" element={<Squads />} />
              <Route path="/battle" element={<Battle />} />
            </Routes>
            <TutorialManager />
            <InvitationManager />
            {process.env.NODE_ENV === 'development' && <FirebaseStatus />}
            <NavigationDebugger />
          </Router>
          </StoryProvider>
        </BattleProvider>
      </LevelUpProvider>
    </AuthProvider>
  );
}

export default App;
