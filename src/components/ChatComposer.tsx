import React, { useState, KeyboardEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { sendChatMessage } from '../utils/squadStreamService';

interface ChatComposerProps {
  squadId: string;
  currentUserId: string;
}

const ChatComposer: React.FC<ChatComposerProps> = ({ squadId, currentUserId }) => {
  const { currentUser } = useAuth();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim() || !currentUser || sending) return;

    const messageText = message.trim();
    setMessage('');
    setSending(true);

    try {
      // Fetch the user's displayName from Firestore to ensure we have the correct name
      const { getDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.exists() ? userDoc.data() : null;
      const displayName = userData?.displayName || currentUser.displayName || 'Unknown';
      const photoURL = userData?.photoURL || currentUser.photoURL || undefined;

      console.log('[ChatComposer] Sending message:', {
        uid: currentUser.uid,
        displayName: displayName,
        currentUserDisplayName: currentUser.displayName,
        userDataDisplayName: userData?.displayName
      });

      await sendChatMessage(
        squadId,
        currentUser.uid,
        displayName,
        photoURL,
        messageText
      );
    } catch (error) {
      console.error('Error sending message:', error);
      // Restore message on error
      setMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      padding: '1rem',
      backgroundColor: 'white',
      borderRadius: '0.5rem',
      border: '1px solid #e5e7eb',
      alignItems: 'flex-end'
    }}>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Type a message... (Press Enter to send)"
        style={{
          flex: 1,
          minHeight: '2.5rem',
          maxHeight: '6rem',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid #d1d5db',
          fontSize: '0.875rem',
          fontFamily: 'inherit',
          resize: 'none',
          outline: 'none'
        }}
        rows={1}
      />
      <button
        onClick={handleSend}
        disabled={!message.trim() || sending}
        style={{
          backgroundColor: message.trim() && !sending ? '#4f46e5' : '#d1d5db',
          color: 'white',
          border: 'none',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          fontWeight: '600',
          cursor: message.trim() && !sending ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
          flexShrink: 0
        }}
        onMouseOver={(e) => {
          if (message.trim() && !sending) {
            e.currentTarget.style.backgroundColor = '#4338ca';
          }
        }}
        onMouseOut={(e) => {
          if (message.trim() && !sending) {
            e.currentTarget.style.backgroundColor = '#4f46e5';
          }
        }}
      >
        {sending ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
};

export default ChatComposer;

