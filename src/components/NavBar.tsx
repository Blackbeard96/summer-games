import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NavBar = () => {
  const { currentUser } = useAuth();

  return (
    <nav className="bg-black text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl font-bold">Summer Games</Link>
        <div className="flex gap-4">
          <Link to="/" className="hover:text-gray-300">Dashboard</Link>
          <Link to="/profile" className="hover:text-gray-300">Profile</Link>
          <Link to="/marketplace" className="hover:text-gray-300">Marketplace</Link>
          {currentUser ? (
            <span>Welcome, {currentUser.email}</span>
          ) : (
            <Link to="/login" className="hover:text-gray-300">Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default NavBar; 