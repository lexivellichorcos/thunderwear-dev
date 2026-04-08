/**
 * Verified Kalshi City Registry
 *
 * Sources:
 * - Live Kalshi API verification (2026-04-07): CONFIRMED tickers only
 * - Spec cities NOT found in live API have been REMOVED
 * - New cities found in live API have been ADDED
 *
 * Last full audit: 2026-04-07
 *
 * verificationSource breakdown:
 * - 'Kalshi-API-live'      = confirmed by live Kalshi API response
 * - 'Kalshi-API-live-new'  = confirmed in live API, was missing from original spec
 */

export interface KalshiCity {
  city: string;
  stationId: string;
  kalshiTicker: string;       // Kalshi market ticker PREFIX (e.g., KXHIGHNY)
  location: string;           // For TomorrowIO/simple-forecast API geocoding
  verifiedAt: string;         // Date of last verification (YYYY-MM-DD)
  verificationSource: string; // How it was verified
  auditedAt?: string;         // Date of last live Kalshi API audit (YYYY-MM-DD)
  kalshiApiConfirmed?: boolean; // true = confirmed via live API, false = spec-only
  notes?: string;
}

/**
 * Canonical city list — CONFIRMED via live Kalshi API (2026-04-07).
 *
 * REMOVED (not found in live Kalshi API):
 *   San Diego, Fort Worth, San Jose, Jacksonville, Columbus, Charlotte, Indianapolis, Nashville
 *
 * ADDED (confirmed in live API, missing from original spec):
 *   Miami (KXHIGHMIA), Minneapolis (KXHIGHTMIN), Atlanta (KXHIGHTTATL),
 *   Boston (KXHIGHTBOS), Washington DC (KXHIGHTDC), Las Vegas (KXHIGHTLV),
 *   New Orleans (KXHIGHTNOLA), Oklahoma City (KXHIGHTOKC)
 *
 * TICKER CORRECTIONS vs prior spec:
 *   Chicago:      KXHIGHTCHI → KXHIGHCHI    (no T)
 *   Los Angeles:  KXHIGHTLA  → KXHIGHLAX    (corrected suffix)
 *   Philadelphia: KXHIGHTPHL → KXHIGHPHIL   (corrected suffix)
 *   San Antonio:  KXHIGHTSAT → KXHIGHTSATX  (corrected suffix)
 *   Austin:       KXHIGHTAUS → KXHIGHAUS    (no T)
 *   Denver:       KXHIGHTDEN → KXHIGHDEN    (no T)
 */
export const VERIFIED_KALSHI_CITIES: KalshiCity[] = [
  {
    city: 'New York',
    stationId: 'KNYC',
    kalshiTicker: 'KXHIGHNY',
    location: 'New York, NY',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'Central Park station. Confirmed.',
  },
  {
    city: 'Chicago',
    stationId: 'KMDW',
    kalshiTicker: 'KXHIGHCHI',
    location: 'Chicago, IL',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'CORRECTED: KXHIGHTCHI → KXHIGHCHI (no T). Confirmed via live API.',
  },
  {
    city: 'Los Angeles',
    stationId: 'KLAX',
    kalshiTicker: 'KXHIGHLAX',
    location: 'Los Angeles, CA',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'CORRECTED: KXHIGHTLA → KXHIGHLAX. Confirmed via live API.',
  },
  {
    city: 'Houston',
    stationId: 'KHOU',
    kalshiTicker: 'KXHIGHTHOU',
    location: 'Houston, TX',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'Hobby Airport. Confirmed. Using KXHIGHTHOU (daily market).',
  },
  {
    city: 'Phoenix',
    stationId: 'KPHX',
    kalshiTicker: 'KXHIGHTPHX',
    location: 'Phoenix, AZ',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
  },
  {
    city: 'Philadelphia',
    stationId: 'KPHL',
    kalshiTicker: 'KXHIGHPHIL',
    location: 'Philadelphia, PA',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'CORRECTED: KXHIGHTPHL → KXHIGHPHIL. Confirmed via live API.',
  },
  {
    city: 'San Antonio',
    stationId: 'KSAT',
    kalshiTicker: 'KXHIGHTSATX',
    location: 'San Antonio, TX',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'CORRECTED: KXHIGHTSAT → KXHIGHTSATX. Confirmed via live API.',
  },
  {
    city: 'Dallas',
    stationId: 'KDFW',
    kalshiTicker: 'KXHIGHTDAL',
    location: 'Dallas, TX',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
  },
  {
    city: 'Austin',
    stationId: 'KAUS',
    kalshiTicker: 'KXHIGHAUS',
    location: 'Austin, TX',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'CORRECTED: KXHIGHTAUS → KXHIGHAUS (no T). Confirmed via live API.',
  },
  {
    city: 'San Francisco',
    stationId: 'KSFO',
    kalshiTicker: 'KXHIGHTSFO',
    location: 'San Francisco, CA',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
  },
  {
    city: 'Seattle',
    stationId: 'KSEA',
    kalshiTicker: 'KXHIGHTSEA',
    location: 'Seattle, WA',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'Confirmed via live API as KXHIGHTSEA.',
  },
  {
    city: 'Denver',
    stationId: 'KDEN',
    kalshiTicker: 'KXHIGHDEN',
    location: 'Denver, CO',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'CORRECTED: KXHIGHTDEN → KXHIGHDEN (no T). Confirmed via live API.',
  },
  // ─── Cities confirmed in live API that were missing from original spec ───
  {
    city: 'Miami',
    stationId: 'KMIA',
    kalshiTicker: 'KXHIGHMIA',
    location: 'Miami, FL',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live-new',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'NEW: Found in live Kalshi API. Was missing from original spec.',
  },
  {
    city: 'Minneapolis',
    stationId: 'KMSP',
    kalshiTicker: 'KXHIGHTMIN',
    location: 'Minneapolis, MN',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live-new',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'NEW: Found in live Kalshi API. Was missing from original spec.',
  },
  {
    city: 'Atlanta',
    stationId: 'KATL',
    kalshiTicker: 'KXHIGHTTATL',
    location: 'Atlanta, GA',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live-new',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'NEW: Found in live API. Note double-T in ticker: KXHIGHTTATL.',
  },
  {
    city: 'Boston',
    stationId: 'KBOS',
    kalshiTicker: 'KXHIGHTBOS',
    location: 'Boston, MA',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live-new',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'NEW: Found in live Kalshi API. Was missing from original spec.',
  },
  {
    city: 'Washington DC',
    stationId: 'KDCA',
    kalshiTicker: 'KXHIGHTDC',
    location: 'Washington, DC',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live-new',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'NEW: Found in live Kalshi API. Was missing from original spec.',
  },
  {
    city: 'Las Vegas',
    stationId: 'KLAS',
    kalshiTicker: 'KXHIGHTLV',
    location: 'Las Vegas, NV',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live-new',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'NEW: Found in live Kalshi API. Was missing from original spec.',
  },
  {
    city: 'New Orleans',
    stationId: 'KMSY',
    kalshiTicker: 'KXHIGHTNOLA',
    location: 'New Orleans, LA',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live-new',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'NEW: Found in live Kalshi API. Was missing from original spec.',
  },
  {
    city: 'Oklahoma City',
    stationId: 'KOKC',
    kalshiTicker: 'KXHIGHTOKC',
    location: 'Oklahoma City, OK',
    verifiedAt: '2026-04-07',
    verificationSource: 'Kalshi-API-live-new',
    auditedAt: '2026-04-07',
    kalshiApiConfirmed: true,
    notes: 'NEW: Found in live Kalshi API. Was missing from original spec.',
  },
];

/**
 * Quick lookup by city name (case-insensitive)
 */
export function getCityByName(name: string): KalshiCity | undefined {
  return VERIFIED_KALSHI_CITIES.find(
    c => c.city.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Quick lookup by Kalshi ticker prefix
 */
export function getCityByTicker(ticker: string): KalshiCity | undefined {
  return VERIFIED_KALSHI_CITIES.find(c => c.kalshiTicker === ticker);
}
