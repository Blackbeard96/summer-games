// Debug Logger Utility
// Provides organized, filterable console logging for better debugging

export type LogCategory = 
  | 'ROSTER' 
  | 'BATTLE' 
  | 'AUTH' 
  | 'FIREBASE' 
  | 'CLASSROOM' 
  | 'ROLES' 
  | 'GENERAL'
  | 'ERROR';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogConfig {
  enabled: boolean;
  categories: Set<LogCategory>;
  minLevel: LogLevel;
}

// Configuration - easily toggle what logs you want to see
const logConfig: LogConfig = {
  enabled: process.env.NODE_ENV === 'development',
  categories: new Set<LogCategory>([
    'ROSTER',
    'CLASSROOM', 
    'ROLES',
    'ERROR'
    // Comment out 'BATTLE' to reduce noise
    // 'BATTLE',
    // 'AUTH',
    // 'FIREBASE',
    // 'GENERAL'
  ]),
  minLevel: 'DEBUG'
};

const levelPriority: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const categoryColors: Record<LogCategory, string> = {
  ROSTER: '#10b981',     // Green
  BATTLE: '#3b82f6',     // Blue
  AUTH: '#8b5cf6',       // Purple
  FIREBASE: '#f59e0b',   // Orange
  CLASSROOM: '#06b6d4',  // Cyan
  ROLES: '#ec4899',      // Pink
  GENERAL: '#6b7280',    // Gray
  ERROR: '#ef4444'       // Red
};

const categoryIcons: Record<LogCategory, string> = {
  ROSTER: '👥',
  BATTLE: '⚔️',
  AUTH: '🔐',
  FIREBASE: '🔥',
  CLASSROOM: '🏫',
  ROLES: '👑',
  GENERAL: '📝',
  ERROR: '❌'
};

class DebugLogger {
  public shouldLog(category: LogCategory, level: LogLevel): boolean {
    if (!logConfig.enabled) return false;
    if (!logConfig.categories.has(category)) return false;
    if (levelPriority[level] < levelPriority[logConfig.minLevel]) return false;
    return true;
  }

  public formatMessage(category: LogCategory, level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(category, level)) return;

    const timestamp = new Date().toLocaleTimeString();
    const icon = categoryIcons[category];
    const color = categoryColors[category];
    
    const prefix = `${icon} [${category}] ${timestamp}`;
    
    switch (level) {
      case 'DEBUG':
        console.log(`%c${prefix} ${message}`, `color: ${color}; font-weight: bold`, data || '');
        break;
      case 'INFO':
        console.info(`%c${prefix} ${message}`, `color: ${color}; font-weight: bold`, data || '');
        break;
      case 'WARN':
        console.warn(`%c${prefix} ${message}`, `color: ${color}; font-weight: bold`, data || '');
        break;
      case 'ERROR':
        console.error(`%c${prefix} ${message}`, `color: ${color}; font-weight: bold`, data || '');
        break;
    }
  }

  // Roster-specific logging methods
  roster = {
    debug: (message: string, data?: any) => this.formatMessage('ROSTER', 'DEBUG', message, data),
    info: (message: string, data?: any) => this.formatMessage('ROSTER', 'INFO', message, data),
    warn: (message: string, data?: any) => this.formatMessage('ROSTER', 'WARN', message, data),
    error: (message: string, data?: any) => this.formatMessage('ROSTER', 'ERROR', message, data)
  };

  // Classroom-specific logging methods
  classroom = {
    debug: (message: string, data?: any) => this.formatMessage('CLASSROOM', 'DEBUG', message, data),
    info: (message: string, data?: any) => this.formatMessage('CLASSROOM', 'INFO', message, data),
    warn: (message: string, data?: any) => this.formatMessage('CLASSROOM', 'WARN', message, data),
    error: (message: string, data?: any) => this.formatMessage('CLASSROOM', 'ERROR', message, data)
  };

  // Role-specific logging methods
  roles = {
    debug: (message: string, data?: any) => this.formatMessage('ROLES', 'DEBUG', message, data),
    info: (message: string, data?: any) => this.formatMessage('ROLES', 'INFO', message, data),
    warn: (message: string, data?: any) => this.formatMessage('ROLES', 'WARN', message, data),
    error: (message: string, data?: any) => this.formatMessage('ROLES', 'ERROR', message, data)
  };

  // Battle-specific logging methods (currently disabled by default)
  battle = {
    debug: (message: string, data?: any) => this.formatMessage('BATTLE', 'DEBUG', message, data),
    info: (message: string, data?: any) => this.formatMessage('BATTLE', 'INFO', message, data),
    warn: (message: string, data?: any) => this.formatMessage('BATTLE', 'WARN', message, data),
    error: (message: string, data?: any) => this.formatMessage('BATTLE', 'ERROR', message, data)
  };

  // General logging methods
  debug = (message: string, data?: any) => this.formatMessage('GENERAL', 'DEBUG', message, data);
  info = (message: string, data?: any) => this.formatMessage('GENERAL', 'INFO', message, data);
  warn = (message: string, data?: any) => this.formatMessage('GENERAL', 'WARN', message, data);
  error = (message: string, data?: any) => this.formatMessage('GENERAL', 'ERROR', message, data);

  // Utility methods
  enableCategory = (category: LogCategory) => {
    logConfig.categories.add(category);
    console.log(`%c👥 Debug Logger: Enabled category ${category}`, 'color: #10b981; font-weight: bold');
  };

  disableCategory = (category: LogCategory) => {
    logConfig.categories.delete(category);
    console.log(`%c👥 Debug Logger: Disabled category ${category}`, 'color: #ef4444; font-weight: bold');
  };

  showActiveCategories = () => {
    console.log(`%c👥 Debug Logger: Active categories:`, 'color: #10b981; font-weight: bold', Array.from(logConfig.categories));
  };

  // Quick toggle methods for common debugging scenarios
  debugRosterOnly = () => {
    logConfig.categories.clear();
    logConfig.categories.add('ROSTER');
    logConfig.categories.add('CLASSROOM');
    logConfig.categories.add('ROLES');
    logConfig.categories.add('ERROR');
    console.log(`%c👥 Debug Logger: Enabled roster debugging mode`, 'color: #10b981; font-weight: bold');
  };

  debugBattleOnly = () => {
    logConfig.categories.clear();
    logConfig.categories.add('BATTLE');
    logConfig.categories.add('ERROR');
    console.log(`%c⚔️ Debug Logger: Enabled battle debugging mode`, 'color: #3b82f6; font-weight: bold');
  };

  enableAll = () => {
    logConfig.categories = new Set<LogCategory>(['ROSTER', 'BATTLE', 'AUTH', 'FIREBASE', 'CLASSROOM', 'ROLES', 'GENERAL', 'ERROR']);
    console.log(`%c👥 Debug Logger: Enabled all categories`, 'color: #10b981; font-weight: bold');
  };
}

// Export singleton instance
export const logger = new DebugLogger();

// Make it available globally for browser console access
if (typeof window !== 'undefined') {
  (window as any).debugLogger = logger;
  
  // Firefox-specific console API compatibility
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
  if (isFirefox) {
    console.log('%c🦊 Firefox detected - ensuring console API compatibility', 'color: #ff7139; font-weight: bold');
    
    // Firefox sometimes has issues with console.log styling, provide fallback
    const originalFormatMessage = DebugLogger.prototype.formatMessage;
    DebugLogger.prototype.formatMessage = function(category: LogCategory, level: LogLevel, message: string, data?: any) {
      if (!this.shouldLog(category, level)) return;

      const timestamp = new Date().toLocaleTimeString();
      const icon = categoryIcons[category];
      const prefix = `${icon} [${category}] ${timestamp}`;
      
      try {
        // Try styled logging first
        switch (level) {
          case 'DEBUG':
            console.log(`%c${prefix} ${message}`, `color: ${categoryColors[category]}; font-weight: bold`, data || '');
            break;
          case 'INFO':
            console.info(`%c${prefix} ${message}`, `color: ${categoryColors[category]}; font-weight: bold`, data || '');
            break;
          case 'WARN':
            console.warn(`%c${prefix} ${message}`, `color: ${categoryColors[category]}; font-weight: bold`, data || '');
            break;
          case 'ERROR':
            console.error(`%c${prefix} ${message}`, `color: ${categoryColors[category]}; font-weight: bold`, data || '');
            break;
        }
      } catch (styleError) {
        // Fallback to plain logging if styling fails in Firefox
        console.log(`${prefix} ${message}`, data || '');
      }
    };
  }
}

// Usage examples:
// logger.roster.info('Student added to classroom', { studentId: '123', classroomId: 'abc' });
// logger.classroom.error('Failed to fetch students', error);
// logger.debugRosterOnly(); // Enable only roster-related logs
// logger.enableCategory('BATTLE'); // Enable battle logs
// logger.disableCategory('BATTLE'); // Disable battle logs
