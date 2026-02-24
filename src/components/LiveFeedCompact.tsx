/**
 * Live Feed Compact Component
 * 
 * Compact version of Live Feed for Power Card Overlay
 * Shows latest ~8 events with scroll
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore';
import { createPost, toggleReaction, getReactionCounts, getUserReactions, LiveFeedPost } from '../services/liveFeed';
import { getLevelFromXP } from '../utils/leveling';

interface PostWithReactions extends LiveFeedPost {
  reactionCounts: { [emoji: string]: number };
  userReactions: string[];
}

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

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

const COMMON_EMOJIS = ['🔥', '👍', '😂', '✅', '⭐'];

const LiveFeedCompact: React.FC = () => {
  const { currentUser } = useAuth();
  const [posts, setPosts] = useState<PostWithReactions[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Subscribe to live feed posts (latest 8)
  useEffect(() => {
    if (!currentUser) return;

    const postsRef = collection(db, 'liveFeedPosts');
    const q = query(
      postsRef,
      orderBy('createdAt', 'desc'),
      limit(5) // Reduced from 8 to 5 to take up less space
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const newPosts: PostWithReactions[] = [];

        for (const docSnapshot of snapshot.docs) {
          const data = docSnapshot.data();
          const post: LiveFeedPost = {
            id: docSnapshot.id,
            type: data.type || 'post',
            createdAt: data.createdAt,
            createdBy: data.createdBy,
            text: data.text || '',
            milestone: data.milestone,
            visibility: data.visibility || 'global',
            reactionsCount: data.reactionsCount || {},
            eventKey: data.eventKey
          };

          const [reactionCounts, userReactions] = await Promise.all([
            getReactionCounts(post.id),
            getUserReactions(post.id, currentUser.uid)
          ]);

          newPosts.push({
            ...post,
            reactionCounts,
            userReactions
          });
        }

        const reversedPosts = newPosts.reverse();
        setPosts(reversedPosts);
        setLoading(false);

        // Auto-scroll to bottom
        if (feedRef.current) {
          setTimeout(() => {
            if (feedRef.current) {
              feedRef.current.scrollTop = feedRef.current.scrollHeight;
            }
          }, 100);
        }
      },
      (error) => {
        console.error('Error subscribing to live feed:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !message.trim() || sending) return;

    setSending(true);
    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const studentData = studentDoc.exists() ? studentDoc.data() : null;
      const userLevel = studentData ? getLevelFromXP(studentData.xp || 0) : undefined;

      await createPost(
        currentUser.uid,
        currentUser.displayName || 'Unknown',
        currentUser.photoURL || undefined,
        studentData?.role || undefined,
        userLevel,
        message.trim()
      );
      setMessage('');
    } catch (error: any) {
      console.error('Error creating post:', error);
      alert(error.message || 'Failed to post');
    } finally {
      setSending(false);
    }
  };

  const handleReaction = async (postId: string, emoji: string) => {
    if (!currentUser) return;

    try {
      await toggleReaction(postId, currentUser.uid, currentUser.displayName || 'Unknown', emoji);
      
      setPosts(prevPosts =>
        prevPosts.map(post => {
          if (post.id === postId) {
            const hasEmoji = post.userReactions.includes(emoji);
            const newUserReactions = hasEmoji
              ? post.userReactions.filter(e => e !== emoji)
              : [...post.userReactions, emoji];
            const currentCount = post.reactionCounts[emoji] || 0;
            const newCounts = {
              ...post.reactionCounts,
              [emoji]: hasEmoji ? Math.max(0, currentCount - 1) : currentCount + 1
            };
            return {
              ...post,
              userReactions: newUserReactions,
              reactionCounts: newCounts
            };
          }
          return post;
        })
      );
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  const formatTimestamp = (timestamp: Timestamp): string => {
    try {
      const date = timestamp.toDate();
      return formatDistanceToNow(date);
    } catch (error) {
      return 'just now';
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        color: 'rgba(255, 255, 255, 0.7)'
      }}>
        Loading feed...
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0
    }}>
      {/* Feed Items - Scrollable */}
      <div
        ref={feedRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          paddingRight: '0.5rem',
          minHeight: 0
        }}
      >
        {posts.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255, 255, 255, 0.7)',
            padding: '2rem'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💬</div>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>No posts yet</p>
          </div>
        ) : (
          posts.map((post) => {
            const isMilestone = post.type === 'milestone';

            return (
              <div
                key={post.id}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  padding: '0.5rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: post.createdBy.photoURL ? 'transparent' : 'rgba(139, 92, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  color: 'white',
                  flexShrink: 0,
                  backgroundImage: post.createdBy.photoURL ? `url(${post.createdBy.photoURL})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}>
                  {!post.createdBy.photoURL && getInitials(post.createdBy.displayName)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.25rem',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      color: 'white'
                    }}>
                      {post.createdBy.displayName}
                    </span>
                    {isMilestone && post.milestone && (
                      <span style={{ fontSize: '0.625rem' }}>
                        {post.milestone.kind === 'mission_accept' ? '📜' :
                         post.milestone.kind === 'mission_complete' ? '✅' :
                         post.milestone.kind === 'chapter_complete' ? '📖' :
                         '📢'}
                      </span>
                    )}
                    {post.createdBy.level && (
                      <span style={{
                        fontSize: '0.625rem',
                        color: 'rgba(255, 255, 255, 0.6)'
                      }}>
                        Lv.{post.createdBy.level}
                      </span>
                    )}
                    <span style={{
                      fontSize: '0.625rem',
                      color: 'rgba(255, 255, 255, 0.5)',
                      marginLeft: 'auto'
                    }}>
                      {formatTimestamp(post.createdAt)}
                    </span>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: '0.75rem',
                    color: 'rgba(255, 255, 255, 0.9)',
                    marginBottom: '0.25rem',
                    wordWrap: 'break-word',
                    lineHeight: '1.4'
                  }}>
                    {post.text}
                  </p>

                  {/* Reactions */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap'
                  }}>
                    {COMMON_EMOJIS.map((emoji) => {
                      const count = post.reactionCounts[emoji] || 0;
                      const hasReacted = post.userReactions.includes(emoji);
                      if (count === 0 && !hasReacted) return null;

                      return (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(post.id, emoji)}
                          style={{
                            background: hasReacted
                              ? 'rgba(139, 92, 246, 0.3)'
                              : 'rgba(255, 255, 255, 0.1)',
                            border: `1px solid ${hasReacted ? '#8b5cf6' : 'rgba(255, 255, 255, 0.2)'}`,
                            borderRadius: '0.75rem',
                            padding: '0.125rem 0.5rem',
                            fontSize: '0.75rem',
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.4)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = hasReacted
                              ? 'rgba(139, 92, 246, 0.3)'
                              : 'rgba(255, 255, 255, 0.1)';
                          }}
                        >
                          <span>{emoji}</span>
                          {count > 0 && <span>{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Post Input */}
      <form onSubmit={handleSend} style={{
        marginTop: '0.75rem',
        display: 'flex',
        gap: '0.5rem'
      }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Share something..."
          maxLength={240}
          style={{
            flex: 1,
            padding: '0.5rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '0.5rem',
            color: 'white',
            fontSize: '0.875rem',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={sending || !message.trim()}
          style={{
            padding: '0.5rem 1rem',
            background: sending || !message.trim()
              ? 'rgba(59, 130, 246, 0.3)'
              : '#3b82f6',
            border: 'none',
            borderRadius: '0.5rem',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: sending || !message.trim() ? 'not-allowed' : 'pointer',
            opacity: sending || !message.trim() ? 0.5 : 1
          }}
        >
          {sending ? '...' : 'Post'}
        </button>
      </form>
    </div>
  );
};

export default LiveFeedCompact;

