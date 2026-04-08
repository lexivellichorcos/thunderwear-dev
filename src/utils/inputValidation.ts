// Input validation utilities for security
export const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  
  // Remove potentially dangerous characters but preserve location-safe chars
  return input
    .trim()
    .replace(/[<>"&]/g, '') // Remove HTML/script chars but keep apostrophes and commas
    .replace(/[;|$`]/g, '') // Remove command injection chars but keep safe punctuation
    .slice(0, 100); // Limit length
};

export const validateLocation = (location: string): { isValid: boolean; sanitized: string; error?: string } => {
  const sanitized = sanitizeInput(location);
  
  if (!sanitized) {
    return { isValid: false, sanitized: '', error: 'Location is required' };
  }
  
  if (sanitized.length < 2) {
    return { isValid: false, sanitized, error: 'Location must be at least 2 characters' };
  }
  
  // Check for coordinate format
  const coordPattern = /^-?\d+\.?\d*,-?\d+\.?\d*$/;
  if (coordPattern.test(sanitized)) {
    const [lat, lon] = sanitized.split(',').map(Number);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return { isValid: false, sanitized, error: 'Invalid coordinates' };
    }
    return { isValid: true, sanitized };
  }
  
  // Check for ZIP code format (US/international)
  const zipPattern = /^\d{5}(-\d{4})?$|^[A-Z]\d[A-Z] \d[A-Z]\d$/;
  if (zipPattern.test(sanitized.toUpperCase())) {
    return { isValid: true, sanitized: sanitized.toUpperCase() };
  }
  
  // Check for address/city format (letters, numbers, spaces, commas, periods, apostrophes)
  const addressPattern = /^[a-zA-Z0-9\s,.'()-]+$/;
  if (!addressPattern.test(sanitized)) {
    return { isValid: false, sanitized, error: 'Location contains invalid characters' };
  }
  
  return { isValid: true, sanitized };
};

export const validatePreferenceValue = (value: any, type: 'string' | 'number' | 'boolean'): boolean => {
  switch (type) {
    case 'string':
      return typeof value === 'string' && value.length <= 50;
    case 'number':
      return typeof value === 'number' && value >= 0 && value <= 100;
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
};

// Rate limiting utility
interface RateLimitEntry {
  count: number;
  lastReset: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly timeWindow: number;

  constructor(maxRequests = 10, timeWindowMs = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (!entry || now - entry.lastReset > this.timeWindow) {
      this.limits.set(identifier, { count: 1, lastReset: now });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }
}

export const createRateLimiter = (maxRequests = 10, timeWindowMs = 60000) => 
  new RateLimiter(maxRequests, timeWindowMs);