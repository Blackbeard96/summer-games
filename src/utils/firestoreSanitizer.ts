/**
 * Firestore Data Sanitizer
 * 
 * Removes undefined values from objects before writing to Firestore.
 * Firestore does not accept undefined values, even nested ones.
 */

/**
 * Recursively removes all undefined values from an object
 * @param obj - The object to sanitize
 * @returns A new object with all undefined values removed
 */
export function sanitizeFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeFirestoreData(item)) as unknown as T;
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip undefined values
      if (value !== undefined) {
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeFirestoreData(value);
      }
    }
    return sanitized as T;
  }

  // Primitive values (string, number, boolean, etc.) are returned as-is
  return obj;
}

/**
 * Sanitizes a value, converting undefined to null for optional fields
 * Use this when you want to explicitly set a field to null instead of omitting it
 */
export function sanitizeValue<T>(value: T | undefined, defaultValue: T): T {
  return value !== undefined ? value : defaultValue;
}










