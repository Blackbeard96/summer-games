interface SearchableStudent {
  id: string;
  displayName?: string;
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Search students by name or email - generic function that works with any student-like object
 */
export function searchStudents<T extends SearchableStudent>(students: T[], query: string): T[] {
  if (!query.trim()) {
    return students;
  }

  const searchTerm = query.toLowerCase().trim();
  
  return students.filter(student => {
    // Get all searchable text fields
    const searchFields = [
      student.displayName,
      student.name,
      student.email,
      student.firstName,
      student.lastName,
      // Combine first and last name
      student.firstName && student.lastName ? `${student.firstName} ${student.lastName}` : null,
      // Reverse order
      student.lastName && student.firstName ? `${student.lastName} ${student.firstName}` : null
    ].filter(Boolean);

    // Check if any field contains the search term
    return searchFields.some(field => 
      field?.toLowerCase().includes(searchTerm)
    );
  });
}

/**
 * Advanced search with multiple criteria
 */
export function advancedSearchStudents<T extends SearchableStudent>(
  students: T[], 
  searchCriteria: {
    query?: string;
    level?: number;
    minXP?: number;
    maxXP?: number;
    minPP?: number;
    maxPP?: number;
    role?: string;
  }
): T[] {
  let results = students;

  // Text search
  if (searchCriteria.query) {
    results = searchStudents(results, searchCriteria.query);
  }

  // Level filter
  if (searchCriteria.level !== undefined) {
    results = results.filter(student => {
      const studentLevel = (student as any).level;
      return studentLevel === searchCriteria.level;
    });
  }

  // XP range filter
  if (searchCriteria.minXP !== undefined || searchCriteria.maxXP !== undefined) {
    results = results.filter(student => {
      const studentXP = (student as any).xp || 0;
      const minXP = searchCriteria.minXP ?? 0;
      const maxXP = searchCriteria.maxXP ?? Infinity;
      return studentXP >= minXP && studentXP <= maxXP;
    });
  }

  // PP range filter
  if (searchCriteria.minPP !== undefined || searchCriteria.maxPP !== undefined) {
    results = results.filter(student => {
      const studentPP = (student as any).powerPoints || 0;
      const minPP = searchCriteria.minPP ?? -Infinity;
      const maxPP = searchCriteria.maxPP ?? Infinity;
      return studentPP >= minPP && studentPP <= maxPP;
    });
  }

  // Role filter
  if (searchCriteria.role) {
    results = results.filter(student => {
      const studentRole = (student as any).role;
      return studentRole === searchCriteria.role;
    });
  }

  return results;
}

/**
 * Highlight search terms in text
 */
export function highlightSearchTerm(text: string, searchTerm: string): string {
  if (!searchTerm.trim()) {
    return text;
  }

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark style="background-color: #fef08a; padding: 1px 2px; border-radius: 2px;">$1</mark>');
}

/**
 * Get search suggestions based on existing students
 */
export function getSearchSuggestions<T extends SearchableStudent>(students: T[], query: string, maxSuggestions: number = 5): string[] {
  if (!query.trim() || query.length < 2) {
    return [];
  }

  const suggestions = new Set<string>();
  const searchTerm = query.toLowerCase();

  students.forEach(student => {
    // Add name suggestions
    if (student.displayName?.toLowerCase().includes(searchTerm)) {
      suggestions.add(student.displayName);
    }
    if (student.name?.toLowerCase().includes(searchTerm)) {
      suggestions.add(student.name);
    }
    if (student.firstName?.toLowerCase().includes(searchTerm)) {
      suggestions.add(student.firstName);
    }
    if (student.lastName?.toLowerCase().includes(searchTerm)) {
      suggestions.add(student.lastName);
    }

    // Add email suggestions
    if (student.email?.toLowerCase().includes(searchTerm)) {
      suggestions.add(student.email);
    }
  });

  return Array.from(suggestions).slice(0, maxSuggestions);
}

/**
 * Sort search results by relevance
 */
export function sortByRelevance<T extends SearchableStudent>(students: T[], query: string): T[] {
  if (!query.trim()) {
    return students;
  }

  const searchTerm = query.toLowerCase();
  
  return students.sort((a, b) => {
    const getScore = (student: SearchableStudent): number => {
      let score = 0;
      
      // Exact matches get highest score
      if (student.displayName?.toLowerCase() === searchTerm) score += 100;
      if (student.email?.toLowerCase() === searchTerm) score += 100;
      
      // Starts with search term gets high score
      if (student.displayName?.toLowerCase().startsWith(searchTerm)) score += 50;
      if (student.email?.toLowerCase().startsWith(searchTerm)) score += 50;
      
      // Contains search term gets medium score
      if (student.displayName?.toLowerCase().includes(searchTerm)) score += 25;
      if (student.email?.toLowerCase().includes(searchTerm)) score += 25;
      if (student.firstName?.toLowerCase().includes(searchTerm)) score += 20;
      if (student.lastName?.toLowerCase().includes(searchTerm)) score += 20;
      
      return score;
    };

    return getScore(b) - getScore(a);
  });
}
