/**
 * Centralized Daily Challenge Date Utilities
 * 
 * IMPORTANT: Daily challenges reset at 8am Eastern Time.
 * All date keys should use Eastern Time to ensure consistency.
 */

/**
 * Get today's date string in Eastern Time (YYYY-MM-DD format)
 * This ensures the date key matches the reset time logic (8am Eastern)
 */
export const getTodayDateStringEastern = (): string => {
  const now = new Date();
  
  // Get current date/time in Eastern Time
  const easternDateStr = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Parse and format as YYYY-MM-DD
  const [month, day, year] = easternDateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

/**
 * Get the date string for a specific date in Eastern Time
 */
export const getDateStringEastern = (date: Date): string => {
  const easternDateStr = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const [month, day, year] = easternDateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

/**
 * Get "day" start time (8am Eastern Time) for a given date
 * Properly handles EST (UTC-5) and EDT (UTC-4) automatically using America/New_York timezone
 */
export const getDayStartForDateEastern = (date: Date): Date => {
  // Get current date/time in Eastern Time
  const easternNow = date.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse the Eastern Time string
  const parts = easternNow.split(', ');
  const datePart = parts[0];
  const timePart = parts[1];
  const [month, day, year] = datePart.split('/');
  const [hour] = timePart.split(':');
  
  const yearNum = parseInt(year);
  const monthNum = parseInt(month) - 1; // JS months are 0-indexed
  const dayNum = parseInt(day);
  const currentHour = parseInt(hour);
  
  // Determine which day's 8am to use
  let targetYear = yearNum;
  let targetMonth = monthNum;
  let targetDay = dayNum;
  
  // If current Eastern time is before 8am, use previous day's 8am
  if (currentHour < 8) {
    const prevDate = new Date(yearNum, monthNum, dayNum - 1);
    targetYear = prevDate.getFullYear();
    targetMonth = prevDate.getMonth();
    targetDay = prevDate.getDate();
  }
  
  // Find what UTC time corresponds to 8am Eastern on the target date
  // Test both EST (13:00 UTC) and EDT (12:00 UTC) possibilities
  // EST: 8am Eastern = 13:00 UTC (UTC-5)
  // EDT: 8am Eastern = 12:00 UTC (UTC-4)
  
  // Try 13:00 UTC first (EST)
  let testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, 13, 0, 0));
  let easternTimeStr = testUTC.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false
  });
  let easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
  
  if (easternHour === 8) {
    // EST: 8am Eastern = 13:00 UTC
    return testUTC;
  }
  
  // Try 12:00 UTC (EDT)
  testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, 12, 0, 0));
  easternTimeStr = testUTC.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false
  });
  easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
  
  if (easternHour === 8) {
    // EDT: 8am Eastern = 12:00 UTC
    return testUTC;
  }
  
  // Fallback: if neither works, calculate dynamically
  // Find the UTC hour that gives us 8am Eastern
  for (let utcHour = 11; utcHour <= 14; utcHour++) {
    testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, utcHour, 0, 0));
    easternTimeStr = testUTC.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    });
    easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
    if (easternHour === 8) {
      return testUTC;
    }
  }
  
  // Ultimate fallback: use 13:00 UTC (EST)
  return new Date(Date.UTC(targetYear, targetMonth, targetDay, 13, 0, 0));
};

/**
 * Calculate next reset time (8am Eastern Time each day)
 */
export const getNextResetTimeEastern = (): Date => {
  const now = new Date();
  
  // Get today's 8am Eastern Time
  const today8amEastern = getDayStartForDateEastern(now);
  
  // If current time is already past today's 8am Eastern, get tomorrow's 8am Eastern
  if (now >= today8amEastern) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getDayStartForDateEastern(tomorrow);
  }
  
  return today8amEastern;
};

