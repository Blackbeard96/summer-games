/**
 * Debug Overlay for Live Events Skills
 * Shows real-time pipeline state (dev-only)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { isDebugMode } from '../utils/liveEventDebug';

interface LiveEventDebugOverlayProps {
  sessionId?: string;
  classId?: string;
  eventId?: string;
  selectedSkillId?: string;
  selectedTargetUid?: string;
}

interface PipelineState {
  lastActionId?: string;
  lastActionStatus?: 'pending' | 'resolved' | 'rejected' | 'error';
  lastStateUpdateAt?: string;
  lastError?: string;
  subscriptions?: {
    session?: { connected: boolean; lastUpdate?: string };
    players?: { connected: boolean; lastUpdate?: string };
    actions?: { connected: boolean; lastUpdate?: string };
  };
}

const LiveEventDebugOverlay: React.FC<LiveEventDebugOverlayProps> = ({
  sessionId,
  classId,
  eventId,
  selectedSkillId,
  selectedTargetUid
}) => {
  const { currentUser } = useAuth();
  const [pipelineState, setPipelineState] = useState<PipelineState>({});
  const [isMinimized, setIsMinimized] = useState(false);

  // Listen for debug events
  useEffect(() => {
    if (!isDebugMode()) return;

    const handleActionUpdate = (e: CustomEvent) => {
      setPipelineState(prev => ({
        ...prev,
        lastActionId: e.detail.actionId,
        lastActionStatus: e.detail.status
      }));
    };

    const handleStateUpdate = (e: CustomEvent) => {
      setPipelineState(prev => ({
        ...prev,
        lastStateUpdateAt: new Date().toISOString()
      }));
    };

    const handleError = (e: CustomEvent) => {
      setPipelineState(prev => ({
        ...prev,
        lastError: e.detail.error?.message || String(e.detail.error),
        lastActionStatus: 'error'
      }));
    };

    const handleSubscriptionUpdate = (e: CustomEvent) => {
      setPipelineState(prev => ({
        ...prev,
        subscriptions: {
          ...prev.subscriptions,
          [e.detail.type]: {
            connected: e.detail.connected,
            lastUpdate: e.detail.lastUpdate
          }
        }
      }));
    };

    window.addEventListener('liveEventActionUpdate', handleActionUpdate as EventListener);
    window.addEventListener('liveEventStateUpdate', handleStateUpdate as EventListener);
    window.addEventListener('liveEventDebugError', handleError as EventListener);
    window.addEventListener('liveEventSubscriptionUpdate', handleSubscriptionUpdate as EventListener);

    return () => {
      window.removeEventListener('liveEventActionUpdate', handleActionUpdate as EventListener);
      window.removeEventListener('liveEventStateUpdate', handleStateUpdate as EventListener);
      window.removeEventListener('liveEventDebugError', handleError as EventListener);
      window.removeEventListener('liveEventSubscriptionUpdate', handleSubscriptionUpdate as EventListener);
    };
  }, []);

  if (!isDebugMode()) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        width: isMinimized ? '200px' : '350px',
        maxHeight: isMinimized ? '40px' : '600px',
        background: 'rgba(0, 0, 0, 0.9)',
        border: '2px solid #8b5cf6',
        borderRadius: '8px',
        padding: '12px',
        zIndex: 10000,
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#fff',
        overflow: 'auto',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontWeight: 'bold', color: '#8b5cf6' }}>🔍 Live Event Debug</div>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          style={{
            background: 'transparent',
            border: '1px solid #8b5cf6',
            color: '#8b5cf6',
            borderRadius: '4px',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: '10px'
          }}
        >
          {isMinimized ? '▼' : '▲'}
        </button>
      </div>

      {!isMinimized && (
        <>
          <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #333' }}>
            <div><strong>Mode:</strong> live_event</div>
            <div><strong>Event ID:</strong> {eventId || 'N/A'}</div>
            <div><strong>Class ID:</strong> {classId || 'N/A'}</div>
            <div><strong>Session ID:</strong> {sessionId || 'N/A'}</div>
            <div><strong>User UID:</strong> {currentUser?.uid?.substring(0, 8) || 'N/A'}...</div>
          </div>

          <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #333' }}>
            <div><strong>Selected Skill:</strong> {selectedSkillId || 'None'}</div>
            <div><strong>Selected Target:</strong> {selectedTargetUid?.substring(0, 8) || 'None'}...</div>
          </div>

          <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #333' }}>
            <div><strong>Last Action ID:</strong> {pipelineState.lastActionId || 'None'}</div>
            <div><strong>Last Status:</strong> 
              <span style={{
                color: pipelineState.lastActionStatus === 'resolved' ? '#10b981' :
                       pipelineState.lastActionStatus === 'error' ? '#ef4444' :
                       pipelineState.lastActionStatus === 'pending' ? '#fbbf24' : '#6b7280'
              }}>
                {' '}{pipelineState.lastActionStatus || 'None'}
              </span>
            </div>
            <div><strong>Last State Update:</strong> {pipelineState.lastStateUpdateAt ? new Date(pipelineState.lastStateUpdateAt).toLocaleTimeString() : 'Never'}</div>
          </div>

          {pipelineState.subscriptions && (
            <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #333' }}>
              <div><strong>Subscriptions:</strong></div>
              {Object.entries(pipelineState.subscriptions).map(([type, sub]) => (
                <div key={type} style={{ marginLeft: '8px', fontSize: '10px' }}>
                  {type}: <span style={{ color: sub.connected ? '#10b981' : '#ef4444' }}>
                    {sub.connected ? '✓' : '✗'}
                  </span>
                  {sub.lastUpdate && ` (${new Date(sub.lastUpdate).toLocaleTimeString()})`}
                </div>
              ))}
            </div>
          )}

          {pipelineState.lastError && (
            <div style={{ 
              marginTop: '8px', 
              padding: '8px', 
              background: 'rgba(239, 68, 68, 0.2)', 
              border: '1px solid #ef4444',
              borderRadius: '4px',
              color: '#ef4444',
              fontSize: '10px',
              wordBreak: 'break-word'
            }}>
              <strong>Last Error:</strong> {pipelineState.lastError}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LiveEventDebugOverlay;

