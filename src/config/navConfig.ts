/**
 * Navigation Configuration
 * 
 * Defines the navigation structure with visibility rules for different roles.
 * Items are filtered based on user role at render time.
 */

export type NavItem = {
  label: string;
  path: string;
  to?: string; // Alias for path (for backward compatibility with NavBar)
  icon?: string;
  tooltip?: string;
  hasDropdown?: boolean;
  hasNotification?: boolean;
  notificationCount?: number;
  isButton?: boolean;
  onClick?: () => void;
  children?: NavItem[];
  visibility?: 'all' | 'student' | 'admin' | 'scorekeeper'; // Who can see this item
  priority?: 1 | 2; // 1 = Primary (always visible), 2 = Secondary (in "More" dropdown)
};

export type NavSection = {
  label?: string;
  items: NavItem[];
  visibility?: 'all' | 'student' | 'admin' | 'scorekeeper';
};

/**
 * Main navigation config - organized by sections
 * 
 * Architecture: 7 top-level buckets
 * 1. Home - Orientation + status
 * 2. Journey - Progress + identity
 * 3. Play - Active gameplay (with dropdown)
 * 4. Learn - School + growth systems (with dropdown)
 * 5. Artifacts - Power systems + inventory
 * 6. Community - Social layer
 * 7. Profile - Account + settings (with dropdown)
 */
export const getNavConfig = (activeLiveEventsCount: number, pendingAssessmentGoals: number): NavSection[] => {
  return [
    // Primary navigation items (Priority 1 - Always visible in main nav)
    {
      items: [
        {
          label: 'Home',
          path: '/home',
          tooltip: 'Home Hub',
          visibility: 'all',
          priority: 1
        },
        {
          label: 'Journey',
          path: '/chapters',
          tooltip: 'Player\'s Journey & Progress',
          visibility: 'all',
          priority: 1
        },
        {
          label: 'Play',
          path: '/battle',
          tooltip: 'Active Gameplay',
          hasDropdown: true,
          visibility: 'all',
          priority: 1,
          children: [
            {
              label: 'Battle Arena',
              path: '/battle',
              icon: '⚔️',
              visibility: 'all'
            },
            {
              label: 'Island Raid',
              path: '/island-raid',
              icon: '🏝️',
              visibility: 'all'
            },
            {
              label: 'Live Events',
              path: '/live-events',
              icon: '🎆',
              hasNotification: activeLiveEventsCount > 0,
              notificationCount: activeLiveEventsCount,
              visibility: 'all'
            }
          ]
        },
        {
          label: 'Learn',
          path: '/assessment-goals',
          tooltip: 'School + Growth Systems',
          hasDropdown: true,
          visibility: 'all',
          priority: 1,
          children: [
            {
              label: 'Review Tutorials',
              path: '#',
              icon: '📚',
              isButton: true,
              onClick: () => (window as any).tutorialTriggers?.showReviewModal?.(),
              visibility: 'all'
            },
            {
              label: 'Training Grounds',
              path: '/training-grounds',
              icon: '🎯',
              visibility: 'all'
            },
            {
              label: 'Goals & Habits',
              path: '/assessment-goals',
              icon: '🎯',
              hasNotification: pendingAssessmentGoals > 0,
              notificationCount: pendingAssessmentGoals,
              visibility: 'all'
            },
            {
              label: 'Scorekeeper',
              path: '/scorekeeper',
              icon: '📊',
              visibility: 'admin' // Keep in dropdown for admins
            },
            {
              label: 'Sage\'s Chamber',
              path: '/admin',
              icon: '🏛️',
              visibility: 'admin'
            }
          ]
        },
        {
          label: 'Scorekeepers',
          path: '/scorekeeper',
          tooltip: 'Manage class power points',
          visibility: 'scorekeeper',
          priority: 1
        },
        {
          label: 'Artifacts',
          path: '/artifacts',
          tooltip: 'Power Systems & Inventory',
          hasDropdown: true,
          visibility: 'all',
          priority: 1,
          children: [
            {
              label: 'Artifact Inventory',
              path: '/artifacts',
              icon: '🧿',
              visibility: 'all'
            },
            {
              label: 'MST Market',
              path: '/marketplace',
              icon: '🛒',
              visibility: 'all'
            }
          ]
        },
        {
          label: 'Community',
          path: '/squads',
          tooltip: 'Social Layer',
          hasDropdown: true,
          visibility: 'all',
          priority: 1,
          children: [
            {
              label: 'Squads',
              path: '/squads',
              icon: '👥',
              visibility: 'all'
            },
            {
              label: 'Hall of Fame',
              path: '/leaderboard',
              icon: '🏆',
              visibility: 'all'
            }
          ]
        },
        {
          label: 'Profile',
          path: '/profile',
          tooltip: 'Account & Settings',
          hasDropdown: true,
          visibility: 'all',
          priority: 1,
          children: [
            {
              label: 'My Profile',
              path: '/profile',
              icon: '👤',
              visibility: 'all'
            },
            {
              label: 'In Game Abilities',
              path: '/profile?view=skill-tree&mode=in-game',
              icon: '🎮',
              visibility: 'all'
            },
            {
              label: 'In Real Life Abilities',
              path: '/profile?view=skill-tree&mode=irl',
              icon: '🌍',
              visibility: 'all'
            },
            {
              label: 'Hall of Fame',
              path: '/leaderboard',
              icon: '🏆',
              visibility: 'all'
            }
          ]
        }
      ]
    }
  ];
};

/**
 * Filter nav items based on user role
 */
export const filterNavItemsByRole = (items: NavItem[], role: 'student' | 'admin' | 'scorekeeper' | null, isScorekeeper?: boolean): NavItem[] => {
  return items
    .filter(item => {
      // If visibility not specified, show to all
      if (!item.visibility || item.visibility === 'all') return true;
      
      // Filter by role
      if (item.visibility === 'admin' && role !== 'admin') return false;
      if (item.visibility === 'student' && role === 'admin') return false; // Students-only items hidden from admin
      // Show scorekeeper items if role is 'scorekeeper', isScorekeeper flag is true, OR user is admin
      if (item.visibility === 'scorekeeper') {
        const shouldShow = role === 'scorekeeper' || isScorekeeper === true || role === 'admin';
        if (process.env.NODE_ENV === 'development' && item.label === 'Scorekeepers') {
          console.log(`🔍 Filtering Scorekeepers tab - role: ${role}, isScorekeeper: ${isScorekeeper}, shouldShow: ${shouldShow}`);
        }
        return shouldShow;
      }
      
      return true;
    })
      .map(item => {
        // Add 'to' alias for backward compatibility
        const itemWithTo = {
          ...item,
          to: item.path // Add 'to' as alias for 'path'
        };
        
        // Recursively filter children
        if (item.children) {
          return {
            ...itemWithTo,
            children: filterNavItemsByRole(item.children, role, isScorekeeper).map(child => ({
              ...child,
              to: child.path
            }))
          };
        }
        return itemWithTo;
      });
};

/**
 * Flatten nav sections into a single array of items
 */
export const flattenNavConfig = (sections: NavSection[], role: 'student' | 'admin' | 'scorekeeper' | null, isScorekeeper?: boolean): NavItem[] => {
  const allItems: NavItem[] = [];
  
  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 flattenNavConfig called with role: ${role}, isScorekeeper: ${isScorekeeper}`);
  }
  
  for (const section of sections) {
    // Check section visibility
    if (section.visibility === 'admin' && role !== 'admin') continue;
    if (section.visibility === 'student' && role === 'admin') continue;
    if (section.visibility === 'scorekeeper' && role !== 'scorekeeper' && !isScorekeeper) continue;
    
    // Filter and add items
    const filteredItems = filterNavItemsByRole(section.items, role, isScorekeeper);
    
    // Debug logging for scorekeeper tab
    if (process.env.NODE_ENV === 'development') {
      const scorekeeperTab = filteredItems.find(item => item.label === 'Scorekeepers');
      if (scorekeeperTab) {
        console.log(`✅ Scorekeepers tab found in section, adding to allItems`);
      }
    }
    
    allItems.push(...filteredItems);
  }
  
  if (process.env.NODE_ENV === 'development') {
    const scorekeeperTab = allItems.find(item => item.label === 'Scorekeepers');
    console.log(`🔍 flattenNavConfig result - total items: ${allItems.length}, Scorekeepers tab: ${!!scorekeeperTab}`);
  }
  
  return allItems;
};

