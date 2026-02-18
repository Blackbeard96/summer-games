import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp, getDocs, startAfter, doc, getDoc } from 'firebase/firestore';
import { createPost, toggleReaction, deletePost, getReactionCounts, getUserReactions, LiveFeedPost } from '../services/liveFeed';
import { getLevelFromXP } from '../utils/leveling';

// Simple time formatter
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

interface PostWithReactions extends LiveFeedPost {
  reactionCounts: { [emoji: string]: number };
  userReactions: string[];
}

const LiveFeedCard: React.FC = () => {
  const { currentUser } = useAuth();
  const [posts, setPosts] = useState<PostWithReactions[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [userLevel, setUserLevel] = useState<number | undefined>(undefined);
  const feedRef = useRef<HTMLDivElement>(null);

  // Fetch user level
  useEffect(() => {
    if (!currentUser) return;

    const fetchUserLevel = async () => {
      try {
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const xp = studentDoc.data().xp || 0;
          setUserLevel(getLevelFromXP(xp));
        }
      } catch (error) {
        console.error('Error fetching user level:', error);
      }
    };

    fetchUserLevel();
  }, [currentUser]);

  // Subscribe to live feed posts
  useEffect(() => {
    if (!currentUser) return;

    const postsRef = collection(db, 'liveFeedPosts');
    // Query newest 25 messages, then reverse to show oldest first
    const q = query(
      postsRef,
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const newPosts: PostWithReactions[] = [];
        const oldestDoc = snapshot.docs[snapshot.docs.length - 1]; // Oldest doc is last in desc order
        setLastDoc(oldestDoc); // Store oldest doc for loading older messages
        setHasMore(snapshot.docs.length === 25);

        // Fetch reactions for each post
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

          // Get actual reaction counts and user reactions
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

        // Reverse to show oldest first, newest last
        const reversedPosts = newPosts.reverse();
        setPosts(reversedPosts);
        setLoading(false);

        // Auto-scroll to bottom when new posts arrive
        if (feedRef.current && reversedPosts.length > 0) {
          setTimeout(() => {
            if (feedRef.current) {
              feedRef.current.scrollTop = feedRef.current.scrollHeight;
            }
          }, 100);
        }
      },
      (error) => {
        console.error('Error listening to live feed:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleSend = async () => {
    if (!message.trim() || !currentUser || sending || message.length > 240) return;

    const messageText = message.trim();
    setMessage('');
    setSending(true);

    try {
      // Fetch user data
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      const [userDoc, studentDoc] = await Promise.all([
        getDoc(userRef),
        getDoc(studentRef)
      ]);

      const userData = userDoc.exists() ? userDoc.data() : null;
      const studentData = studentDoc.exists() ? studentDoc.data() : null;
      const displayName = userData?.displayName || currentUser.displayName || 'Unknown';
      const photoURL = userData?.photoURL || currentUser.photoURL || undefined;
      const role = userData?.role || undefined;
      const xp = studentData?.xp || 0;
      const level = getLevelFromXP(xp);

      await createPost(
        currentUser.uid,
        displayName,
        photoURL,
        role,
        level,
        messageText
      );
    } catch (error) {
      console.error('Error sending post:', error);
      alert('Failed to send post. Please try again.');
      setMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  const handleReaction = async (postId: string, emoji: string) => {
    if (!currentUser) return;

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.exists() ? userDoc.data() : null;
      const displayName = userData?.displayName || currentUser.displayName || 'Unknown';

      await toggleReaction(postId, currentUser.uid, displayName, emoji);

      // Update local state
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

  const handleDelete = async (postId: string) => {
    if (!currentUser) return;
    if (!window.confirm('Are you sure you want to delete this post?')) return;

    try {
      await deletePost(postId, currentUser.uid);
      setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
    } catch (error: any) {
      console.error('Error deleting post:', error);
      alert(error.message || 'Failed to delete post');
    }
  };

  const loadMore = async () => {
    if (!currentUser || !lastDoc || !hasMore || loadingMore) return;

    setLoadingMore(true);
    try {
      const postsRef = collection(db, 'liveFeedPosts');
      // Load older messages (before the oldest message we have)
      // Since we're ordering by desc, endBefore will get messages older than lastDoc
      const { endBefore } = await import('firebase/firestore');
      const q = query(
        postsRef,
        orderBy('createdAt', 'desc'),
        endBefore(lastDoc),
        limit(25)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      const newOldestDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastDoc(newOldestDoc);
      setHasMore(snapshot.docs.length === 25);

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

      // Reverse to show oldest first, then prepend to existing posts
      const reversedNewPosts = newPosts.reverse();
      setPosts(prevPosts => [...reversedNewPosts, ...prevPosts]);
    } catch (error) {
      console.error('Error loading more posts:', error);
    } finally {
      setLoadingMore(false);
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

  const getMilestoneIcon = (kind: string): string => {
    switch (kind) {
      case 'challenge_complete':
        return '✅';
      case 'level_up':
        return '⬆️';
      case 'badge_earned':
        return '🏆';
      case 'vault_upgrade':
        return '⬆️';
      case 'battle_win':
        return '⚔️';
      case 'raid_complete':
        return '🏝️';
      default:
        return '📢';
    }
  };

  if (loading) {
    return (
      <div style={{
        background: 'rgba(31, 41, 55, 0.85)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '1rem',
        padding: '1.5rem',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255, 255, 255, 0.7)'
      }}>
        Loading feed...
      </div>
    );
  }

  return (
    <div style={{
      background: 'rgba(31, 41, 55, 0.85)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '1rem',
      padding: '1.5rem',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: 'white'
          }}>
            Live Feed
          </h2>
          <span style={{
            width: '8px',
            height: '8px',
            background: '#10b981',
            borderRadius: '50%',
            boxShadow: '0 0 8px #10b981'
          }} />
        </div>
      </div>

      <p style={{
        margin: 0,
        marginBottom: '1rem',
        fontSize: '0.875rem',
        color: 'rgba(255, 255, 255, 0.7)'
      }}>
        Real time updates from across Space & Time
      </p>

      {/* Feed Items - Scrollable */}
      <div
        ref={feedRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          marginBottom: '1rem',
          paddingRight: '0.5rem'
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
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
            <p style={{ margin: 0, fontSize: '1rem' }}>No posts yet</p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>Be the first to post!</p>
          </div>
        ) : (
          <>
            {/* Load More Button - Show at top for loading older messages */}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  padding: '0.75rem',
                  background: 'rgba(139, 92, 246, 0.3)',
                  border: '1px solid rgba(139, 92, 246, 0.5)',
                  borderRadius: '0.5rem',
                  color: 'white',
                  fontSize: '0.875rem',
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: loadingMore ? 0.6 : 1,
                  marginBottom: '0.5rem'
                }}
                onMouseEnter={(e) => {
                  if (!loadingMore) {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loadingMore) {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
                  }
                }}
              >
                {loadingMore ? 'Loading...' : 'Load Older Messages'}
              </button>
            )}
            {posts.map((post) => {
              const isOwnPost = post.createdBy.uid === currentUser?.uid;
              const isMilestone = post.type === 'milestone';

              return (
                <div
                  key={post.id}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    position: 'relative'
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: post.createdBy.photoURL ? 'transparent' : 'rgba(139, 92, 246, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
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
                      marginBottom: '0.25rem'
                    }}>
                      <span style={{
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        color: 'white'
                      }}>
                        {post.createdBy.displayName}
                      </span>
                      {isMilestone && post.milestone && (
                        <span style={{ fontSize: '0.75rem' }}>
                          {getMilestoneIcon(post.milestone.kind)}
                        </span>
                      )}
                      {post.createdBy.level && (
                        <span style={{
                          fontSize: '0.75rem',
                          color: 'rgba(255, 255, 255, 0.6)'
                        }}>
                          Lv.{post.createdBy.level}
                        </span>
                      )}
                      {isOwnPost && !isMilestone && (
                        <button
                          onClick={() => handleDelete(post.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(255, 255, 255, 0.5)',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            padding: '0.25rem',
                            marginLeft: 'auto'
                          }}
                          title="Delete post"
                        >
                          ⋮
                        </button>
                      )}
                    </div>
                    <p style={{
                      margin: 0,
                      fontSize: '0.875rem',
                      color: 'rgba(255, 255, 255, 0.9)',
                      marginBottom: '0.5rem',
                      wordWrap: 'break-word'
                    }}>
                      {post.text}
                    </p>

                    {/* Reactions */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                      marginTop: '0.5rem'
                    }}>
                      {COMMON_EMOJIS.map(emoji => {
                        const count = post.reactionCounts[emoji] || 0;
                        const isActive = post.userReactions.includes(emoji);
                        if (count === 0 && !isActive) return null;

                        return (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(post.id, emoji)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              background: isActive ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                              border: `1px solid ${isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
                              borderRadius: '0.375rem',
                              color: 'white',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = isActive ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255, 255, 255, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isActive ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)';
                            }}
                          >
                            <span>{emoji}</span>
                            {count > 0 && <span>{count}</span>}
                          </button>
                        );
                      })}
                      {/* Add reaction button */}
                      <button
                        onClick={() => {
                          const emoji = prompt('Enter an emoji:');
                          if (emoji && emoji.trim()) {
                            handleReaction(post.id, emoji.trim());
                          }
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '0.375rem',
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }}
                      >
                        +
                      </button>
                    </div>

                    <p style={{
                      margin: 0,
                      marginTop: '0.5rem',
                      fontSize: '0.75rem',
                      color: 'rgba(255, 255, 255, 0.5)'
                    }}>
                      {formatTimestamp(post.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Input Bar */}
      {currentUser && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          padding: '0.75rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '0.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <input
              type="text"
              placeholder="Post a message..."
              value={message}
              onChange={(e) => {
                const newValue = e.target.value;
                if (newValue.length <= 240) {
                  setMessage(newValue);
                }
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '0.875rem',
                outline: 'none',
                padding: '0.5rem'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!message.trim() || sending || message.length > 240}
              style={{
                background: message.trim() && !sending && message.length <= 240 ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.5)',
                borderRadius: '0.375rem',
                padding: '0.5rem 0.75rem',
                color: 'white',
                cursor: message.trim() && !sending && message.length <= 240 ? 'pointer' : 'not-allowed',
                fontSize: '0.875rem',
                transition: 'all 0.2s',
                opacity: message.trim() && !sending && message.length <= 240 ? 1 : 0.6
              }}
              onMouseEnter={(e) => {
                if (message.trim() && !sending && message.length <= 240) {
                  e.currentTarget.style.background = 'rgba(139, 92, 246, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (message.trim() && !sending && message.length <= 240) {
                  e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
                }
              }}
            >
              {sending ? '...' : '➤'}
            </button>
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: message.length > 240 ? '#ef4444' : 'rgba(255, 255, 255, 0.5)',
            textAlign: 'right'
          }}>
            {message.length}/240
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveFeedCard;
