import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';

interface BannerMessage {
  id: string;
  message: string;
  order: number;
  isActive: boolean;
  createdAt: any;
}

const BannerManager: React.FC = () => {
  const [messages, setMessages] = useState<BannerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'bannerMessages'), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      const loadedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BannerMessage[];

      setMessages(loadedMessages);
    } catch (error) {
      console.error('Error loading banner messages:', error);
      setError('Failed to load banner messages');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMessage = async () => {
    if (!newMessage.trim()) {
      setError('Message cannot be empty');
      return;
    }

    try {
      setError('');
      setSuccess('');

      // Get the highest order number and add 1
      const maxOrder = messages.length > 0 
        ? Math.max(...messages.map(m => m.order || 0)) 
        : 0;

      await addDoc(collection(db, 'bannerMessages'), {
        message: newMessage.trim(),
        order: maxOrder + 1,
        isActive: true,
        createdAt: serverTimestamp()
      });

      setNewMessage('');
      setSuccess('Banner message added successfully!');
      await loadMessages();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error adding banner message:', error);
      setError('Failed to add banner message');
    }
  };

  const handleUpdateMessage = async (id: string) => {
    if (!editMessage.trim()) {
      setError('Message cannot be empty');
      return;
    }

    try {
      setError('');
      setSuccess('');

      await updateDoc(doc(db, 'bannerMessages', id), {
        message: editMessage.trim()
      });

      setEditingId(null);
      setEditMessage('');
      setSuccess('Banner message updated successfully!');
      await loadMessages();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error updating banner message:', error);
      setError('Failed to update banner message');
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this banner message?')) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      await deleteDoc(doc(db, 'bannerMessages', id));
      setSuccess('Banner message deleted successfully!');
      await loadMessages();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error deleting banner message:', error);
      setError('Failed to delete banner message');
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      setError('');
      await updateDoc(doc(db, 'bannerMessages', id), {
        isActive: !currentStatus
      });
      await loadMessages();
    } catch (error) {
      console.error('Error toggling banner message status:', error);
      setError('Failed to update banner message status');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;

    try {
      const currentMessage = messages[index];
      const previousMessage = messages[index - 1];

      await updateDoc(doc(db, 'bannerMessages', currentMessage.id), {
        order: previousMessage.order
      });

      await updateDoc(doc(db, 'bannerMessages', previousMessage.id), {
        order: currentMessage.order
      });

      await loadMessages();
    } catch (error) {
      console.error('Error moving message:', error);
      setError('Failed to reorder message');
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === messages.length - 1) return;

    try {
      const currentMessage = messages[index];
      const nextMessage = messages[index + 1];

      await updateDoc(doc(db, 'bannerMessages', currentMessage.id), {
        order: nextMessage.order
      });

      await updateDoc(doc(db, 'bannerMessages', nextMessage.id), {
        order: currentMessage.order
      });

      await loadMessages();
    } catch (error) {
      console.error('Error moving message:', error);
      setError('Failed to reorder message');
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh',
        fontSize: '1.2rem',
        color: '#6b7280'
      }}>
        Loading banner messages...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 'bold', 
          color: '#1f2937',
          margin: 0,
          marginBottom: '0.5rem'
        }}>
          📢 Banner Message Manager
        </h2>
        <p style={{ 
          fontSize: '1rem', 
          color: '#6b7280',
          margin: 0
        }}>
          Manage scrolling banner messages that appear below the navigation bar.
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div style={{
          backgroundColor: '#d1fae5',
          color: '#065f46',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          border: '1px solid #10b981'
        }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          border: '1px solid #ef4444'
        }}>
          {error}
        </div>
      )}

      {/* Add New Message */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        marginBottom: '2rem',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          color: '#1f2937',
          margin: 0,
          marginBottom: '1rem'
        }}>
          Add New Message
        </h3>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleAddMessage();
              }
            }}
            placeholder="Enter banner message..."
            style={{
              flex: 1,
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              outline: 'none'
            }}
          />
          <button
            onClick={handleAddMessage}
            style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Add Message
          </button>
        </div>
      </div>

      {/* Messages List */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          color: '#1f2937',
          margin: 0,
          marginBottom: '1rem'
        }}>
          Banner Messages ({messages.length})
        </h3>

        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📢</div>
            <p style={{ margin: 0 }}>No banner messages yet. Add one above to get started!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {messages.map((message, index) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '1rem',
                  backgroundColor: message.isActive ? '#f9fafb' : '#fef2f2',
                  border: `1px solid ${message.isActive ? '#e5e7eb' : '#fecaca'}`,
                  borderRadius: '0.5rem'
                }}
              >
                {/* Order Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    style={{
                      backgroundColor: index === 0 ? '#e5e7eb' : '#f3f4f6',
                      color: index === 0 ? '#9ca3af' : '#374151',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      cursor: index === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === messages.length - 1}
                    style={{
                      backgroundColor: index === messages.length - 1 ? '#e5e7eb' : '#f3f4f6',
                      color: index === messages.length - 1 ? '#9ca3af' : '#374151',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      cursor: index === messages.length - 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    ↓
                  </button>
                </div>

                {/* Message Content */}
                {editingId === message.id ? (
                  <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleUpdateMessage(message.id);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                          setEditMessage('');
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        outline: 'none'
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateMessage(message.id)}
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer'
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditMessage('');
                      }}
                      style={{
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        fontWeight: '500',
                        color: message.isActive ? '#1f2937' : '#6b7280',
                        textDecoration: message.isActive ? 'none' : 'line-through',
                        marginBottom: '0.25rem'
                      }}>
                        {message.message}
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#9ca3af' 
                      }}>
                        Order: {message.order} • {message.isActive ? 'Active' : 'Inactive'}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          setEditingId(message.id);
                          setEditMessage(message.message);
                        }}
                        style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          padding: '0.5rem 1rem',
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(message.id, message.isActive)}
                        style={{
                          backgroundColor: message.isActive ? '#f59e0b' : '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          padding: '0.5rem 1rem',
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}
                      >
                        {message.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteMessage(message.id)}
                        style={{
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          padding: '0.5rem 1rem',
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BannerManager;

