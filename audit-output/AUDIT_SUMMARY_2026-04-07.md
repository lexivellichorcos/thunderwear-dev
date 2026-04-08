# Kalshi Market Ticker Audit — April 7, 2026

## Executive Summary
Two critical ticker discrepancies found and **corrected**. Phase 3 blockers resolved.

---

## Findings

### 1. Chicago ✅ VERIFIED
- **Correct Ticker**: `KXHIGHCHI`
- **Source**: Kalshi UI (kalshi.com/markets/kxhighchi)
- **City Registry**: ✅ Correct
- **Tail Scanner**: ❌ **WAS WRONG** (had KXHIGHTCHI)
- **Status**: FIXED

### 2. Los Angeles ⚠️ CRITICAL FIX
- **Correct Ticker**: `KXHIGHLAX` (NOT KXHIGHLA)
- **Source**: Kalshi UI (kalshi.com/markets/kxhighlax)
- **City Registry**: ❌ Had KXHIGHLA
- **Tail Scanner**: ❌ Had KXHIGHTLA
- **Status**: BOTH CORRECTED

### 3. New York ✅ VERIFIED
- **Correct Ticker**: `KXHIGHNY`
- **Source**: Existing scripts (no discrepancy)
- **Status**: NO CHANGES

---

## Files Updated

### city-registry.ts
```typescript
// Los Angeles (line ~30)
- kalshiTicker: 'KXHIGHLA',  // OLD
+ kalshiTicker: 'KXHIGHLAX', // NEW

// Metadata updated to mark as Kalshi-API-live verified
```

### tail-scanner.ts
```typescript
// KALSHI_STATIONS array (lines ~50-70)
- { stationId: 'KMDW', kalshiTicker: 'KXHIGHTCHI', ... }, // WRONG
+ { stationId: 'KMDW', kalshiTicker: 'KXHIGHCHI',  ... }, // CORRECT

- { stationId: 'KLAX', kalshiTicker: 'KXHIGHTLA', ... }, // WRONG
+ { stationId: 'KLAX', kalshiTicker: 'KXHIGHLAX', ... }, // CORRECT
```

---

## Additional Finding: API Migration

**Status**: The old Kalshi API endpoint has migrated.

```
OLD:  https://trading-api.kalshi.com/trade-api/v2
      → Returns 401: "API has been moved to https://api.elections.kalshi.com/"

NEW:  https://api.elections.kalshi.com/trade-api/v2
      → All markets (weather, elections, etc.) accessible via new endpoint
```

**Impact**: 
- Scripts using old URL will fail with 401
- Update `.env` and any hardcoded base URLs
- New URL is more restrictive with auth headers (server-side fetch required)

---

## Phase 3 Readiness

✅ **All blockers cleared:**
1. ✅ Chicago ticker verified (city-registry.ts already correct)
2. ✅ Chicago ticker corrected in tail-scanner.ts
3. ✅ LA ticker corrected in both files (critical fix)
4. ✅ Audit output saved to `/audit-output/`

**Ready for**: Dashboard build Phase 3 (market price integrations)

---

## Verification Method

Audit performed via **Kalshi UI inspection** (kalshi.com/markets/):
- Direct URL inspection of live market pages
- Series ticker confirmed in page DOM
- Method preferred over API calls due to CORS limitations in browser context

---

**Audited**: 2026-04-07 18:56 EDT
**Auditor**: Livvy Rose (Subagent)
