import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import DailyCheckInCard from './DailyCheckInCard';
import StreamFeed from './StreamFeed';
import ChatComposer from './ChatComposer';
import TradeCard from './TradeCard';

interface SquadStreamProps {
  squadId: string;
  currentUserId: string;
  squadMembers?: Array<{ uid: string; displayName: string; photoURL?: string | null }>;
}

const SquadStream: React.FC<SquadStreamProps> = ({ squadId, currentUserId, squadMembers = [] }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#f9fafb',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      gap: '1rem'
    }}>
      {/* Stream Header */}
      <div>
        <h2 style={{
          margin: '0 0 0.25rem 0',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: '#1f2937'
        }}>
          Squad Stream
        </h2>
        <p style={{
          margin: 0,
          fontSize: '0.875rem',
          color: '#6b7280'
        }}>
          Chat • Check-In • Trades
        </p>
      </div>

      {/* Daily Check-In Card (Pinned at top) */}
      <DailyCheckInCard squadId={squadId} currentUserId={currentUserId} squadMembers={squadMembers} />

      {/* Trade Card (Placeholder) */}
      <TradeCard />

      {/* Stream Feed (Chat + System Posts) */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0
      }}>
        <StreamFeed squadId={squadId} currentUserId={currentUserId} />
      </div>

      {/* Chat Composer (Fixed at bottom) */}
      <ChatComposer squadId={squadId} currentUserId={currentUserId} />
    </div>
  );
};

export default SquadStream;

