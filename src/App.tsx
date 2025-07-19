
import Chapters from './pages/Chapters'; // Add Chapters import
import { Link } from 'react-router-dom';
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
import { AuthProvider, useAuth } from './context/AuthContext';
// Firebase services are imported but not directly used in this component
// They are used by child components through the firebase.ts file



// Protected Admin Route Component
const ProtectedAdminRoute = () => {
  const { currentUser } = useAuth();
  
  if (!currentUser || currentUser.email !== 'edm21179@gmail.com') {
    return <Navigate to="/" replace />;
  }
  
  return <AdminPanel />;
};

function App() {
  return (
    <AuthProvider>
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
        </Routes>
        {process.env.NODE_ENV === 'development' && <FirebaseStatus />}
      </Router>
    </AuthProvider>
  );
}

export default App;
