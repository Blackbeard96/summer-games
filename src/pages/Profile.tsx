import React from 'react';
import ChallengeTracker from '../components/ChallengeTracker';

const Profile = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Your Profile</h1>
      <ChallengeTracker />
    </div>
  );
};

export default Profile; 