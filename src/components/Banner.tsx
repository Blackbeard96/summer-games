import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, where, onSnapshot } from 'firebase/firestore';

interface BannerMessage {
  id: string;
  message: string;
  order: number;
  isActive: boolean;
  createdAt: any;
}

const Banner: React.FC = () => {
  const [messages, setMessages] = useState<BannerMessage[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('Banner: Setting up listener for banner messages');
    
    // Try to use indexed query first (with where and orderBy)
    let q;
    try {
      q = query(
        collection(db, 'bannerMessages'),
        where('isActive', '==', true),
        orderBy('order', 'asc')
      );
    } catch (error) {
      console.warn('Banner: Indexed query failed, trying without orderBy:', error);
      // Fallback: query without orderBy if index doesn't exist
      q = query(
        collection(db, 'bannerMessages'),
        where('isActive', '==', true)
      );
    }

    // Set up real-time listener
    let unsubscribe: (() => void) | null = null;
    
    try {
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          console.log('Banner: Received snapshot, docs count:', snapshot.docs.length);
          const activeMessages = (snapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as BannerMessage[])
            .filter(msg => msg.isActive === true) // Double-check isActive
            .sort((a, b) => (a.order || 0) - (b.order || 0)); // Sort by order if available

          console.log('Banner: Active messages after filtering:', activeMessages.length, activeMessages);
          setMessages(activeMessages);
          setLoading(false);
          
          // Reset to first message if current index is out of bounds
          setCurrentMessageIndex(prev => {
            if (activeMessages.length > 0 && prev >= activeMessages.length) {
              return 0;
            }
            return prev;
          });
        },
        (error) => {
          console.error('Banner: Error listening to banner messages:', error);
          setLoading(false);
          
          // If the error is about missing index, try a simpler query
          if (error.code === 'failed-precondition') {
            console.log('Banner: Index error, trying simpler query');
            try {
              const simpleQ = query(
                collection(db, 'bannerMessages'),
                where('isActive', '==', true)
              );
              const unsubscribeSimple = onSnapshot(simpleQ, (snapshot) => {
                const activeMessages = (snapshot.docs
                  .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                  })) as BannerMessage[])
                  .filter(msg => msg.isActive === true)
                  .sort((a, b) => (a.order || 0) - (b.order || 0));
                
                console.log('Banner: Active messages from simple query:', activeMessages.length);
                setMessages(activeMessages);
                setLoading(false);
              }, (simpleError) => {
                console.error('Banner: Simple query also failed:', simpleError);
              });
              
              // Store the simple unsubscribe function
              if (unsubscribe) {
                unsubscribe(); // Clean up the first listener
              }
              unsubscribe = unsubscribeSimple;
            } catch (simpleError) {
              console.error('Banner: Error setting up simple query:', simpleError);
            }
          }
        }
      );
    } catch (error) {
      console.error('Banner: Error setting up listener:', error);
      setLoading(false);
    }

    return () => {
      console.log('Banner: Cleaning up listener');
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Rotate through messages if there are multiple
  useEffect(() => {
    if (messages.length <= 1) {
      setIsScrolling(false);
      return;
    }

    setIsScrolling(true);
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
    }, 5000); // Change message every 5 seconds

    return () => clearInterval(interval);
  }, [messages.length]);

  // If loading, don't render (prevents flash of no banner)
  if (loading) {
    return null;
  }

  // If no messages, don't render banner
  if (messages.length === 0) {
    console.log('Banner: No active messages found');
    return null;
  }

  const currentMessage = messages[currentMessageIndex];
  
  // Safety check
  if (!currentMessage) {
    console.error('Banner: Current message is undefined, messages:', messages);
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: '#1f2937',
        color: '#f9fafb',
        padding: '0.75rem 0',
        overflow: 'hidden',
        position: 'relative',
        borderBottom: '1px solid #374151',
        zIndex: 40,
        height: '40px',
        display: 'flex',
        alignItems: 'center'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          animation: 'scroll 20s linear infinite',
          willChange: 'transform'
        }}
      >
        <span
          style={{
            display: 'inline-block',
            paddingRight: '4rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            paddingLeft: '100%'
          }}
        >
          {currentMessage.message}
        </span>
      </div>
      
      {/* Show multiple messages indicator */}
      {messages.length > 1 && (
        <div
          style={{
            position: 'absolute',
            right: '1rem',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            gap: '0.25rem',
            zIndex: 10,
            backgroundColor: 'rgba(31, 41, 55, 0.8)',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.5rem'
          }}
        >
          {messages.map((_, index) => (
            <div
              key={index}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: index === currentMessageIndex ? '#f9fafb' : '#6b7280',
                transition: 'background-color 0.3s ease',
                cursor: 'pointer'
              }}
              onClick={() => setCurrentMessageIndex(index)}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(calc(-100% - 4rem));
          }
        }
      `}</style>
    </div>
  );
};

export default Banner;

