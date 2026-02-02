import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';

// Simple time formatter (fallback if date-fns not available)
const formatDistanceToNow = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

interface StreamFeedProps {
  squadId: string;
  currentUserId: string;
}

interface StreamMessage {
  id: string;
  type: 'chat' | 'system';
  text?: string;
  senderId?: string;
  senderName?: string;
  senderAvatarUrl?: string;
  createdAt: Timestamp;
  eventKey?: string;
}

const StreamFeed: React.FC<StreamFeedProps> = ({ squadId, currentUserId }) => {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messagesRef = collection(db, 'squads', squadId, 'streamMessages');
    const q = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    // Helper to check for Firestore internal errors (non-fatal)
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      const errorCode = error?.code || '';
      return (
        errorString.includes('INTERNAL ASSERTION FAILED') ||
        errorMessage.includes('INTERNAL ASSERTION FAILED') ||
        errorCode === 'ca9' ||
        errorString.includes('ID: ca9') ||
        (errorString.includes('FIRESTORE') && errorString.includes('Unexpected state'))
      );
    };

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newMessages: StreamMessage[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          newMessages.push({
            id: doc.id,
            type: data.type || 'chat',
            text: data.text,
            senderId: data.senderId,
            senderName: data.senderName,
            senderAvatarUrl: data.senderAvatarUrl,
            createdAt: data.createdAt,
            eventKey: data.eventKey
          });
        });
        setMessages(newMessages.reverse()); // Reverse to show newest at bottom
        setLoading(false);

        // Auto-scroll to bottom when new messages arrive
        if (feedRef.current) {
          feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
      },
      (error) => {
        // Suppress Firestore internal assertion errors (non-fatal)
        if (isFirestoreInternalError(error)) {
          console.warn('Firestore internal error (non-fatal, suppressing):', error);
          // Try to fetch data once instead of using real-time listener
          getDocs(q).then((querySnapshot) => {
            const newMessages: StreamMessage[] = [];
            querySnapshot.forEach((doc: any) => {
              const data = doc.data();
              newMessages.push({
                id: doc.id,
                type: data.type || 'chat',
                text: data.text,
                senderId: data.senderId,
                senderName: data.senderName,
                senderAvatarUrl: data.senderAvatarUrl,
                createdAt: data.createdAt,
                eventKey: data.eventKey
              });
            });
            setMessages(newMessages.reverse());
            setLoading(false);
          }).catch((fetchError: any) => {
            console.error('Error fetching stream messages:', fetchError);
            setLoading(false);
          });
          return;
        }
        
        console.error('Error listening to stream messages:', error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [squadId]);

  // Auto-scroll on mount
  useEffect(() => {
    if (feedRef.current && messages.length > 0) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages.length]);

  const formatTimestamp = (timestamp: Timestamp): string => {
    try {
      const date = timestamp.toDate();
      return formatDistanceToNow(date);
    } catch (error) {
      return 'just now';
    }
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (loading) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280'
      }}>
        <p>Loading stream...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        padding: '2rem'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
        <p style={{ margin: 0, fontSize: '1rem' }}>No messages yet</p>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>Start the conversation!</p>
      </div>
    );
  }

  return (
    <div
      ref={feedRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '0.5rem 0',
        minHeight: 0
      }}
    >
      {messages.map((message) => {
        if (message.type === 'system') {
          return (
            <div
              key={message.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                backgroundColor: '#f3f4f6',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                color: '#6b7280',
                fontStyle: 'italic'
              }}
            >
              <span>ℹ️</span>
              <span style={{ flex: 1 }}>{message.text}</span>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                {formatTimestamp(message.createdAt)}
              </span>
            </div>
          );
        }

        // Chat message
        const isOwnMessage = message.senderId === currentUserId;
        return (
          <div
            key={message.id}
            style={{
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
              flexDirection: isOwnMessage ? 'row-reverse' : 'row'
            }}
          >
            {/* Avatar */}
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              backgroundColor: isOwnMessage ? '#4f46e5' : '#e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: '0.875rem',
              fontWeight: '600',
              color: isOwnMessage ? 'white' : '#374151',
              backgroundImage: message.senderAvatarUrl ? `url(${message.senderAvatarUrl})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}>
              {!message.senderAvatarUrl && message.senderName && getInitials(message.senderName)}
            </div>

            {/* Message Content */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              alignItems: isOwnMessage ? 'flex-end' : 'flex-start',
              maxWidth: '70%'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.75rem',
                color: '#6b7280'
              }}>
                <span style={{ fontWeight: '500' }}>
                  {isOwnMessage ? 'You' : message.senderName || 'Unknown'}
                </span>
                <span>{formatTimestamp(message.createdAt)}</span>
              </div>
              <div style={{
                backgroundColor: isOwnMessage ? '#4f46e5' : 'white',
                color: isOwnMessage ? 'white' : '#1f2937',
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                border: isOwnMessage ? 'none' : '1px solid #e5e7eb',
                fontSize: '0.875rem',
                lineHeight: '1.5',
                wordWrap: 'break-word',
                boxShadow: isOwnMessage ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}>
                {message.text}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StreamFeed;

