# METAR Station Verification Report
**Generated:** 2026-04-05 08:00 UTC
**Verified by:** Lexi (direct API check)

## Summary
- **Total stations:** 20
- **Active / returning data:** 20 ✅
- **Failed / no data:** 0

## All 20 Stations — Verified Active

| Station | City | Temp (°C) | Kalshi Series |
|---------|------|-----------|---------------|
| KNYC | New York | 5.6 | KXHIGHNY, KXRAINNYC, KXLOWNYC |
| KBOS | Boston | 4.4 | KXHIGHTBOS |
| KPHL | Philadelphia | 9.4 | KXHIGHPHIL, KXRAINPHI, KXLOWPHIL |
| KDCA | Washington DC | 22.8 | KXHIGHTDC, KXRAINTDC |
| KMIA | Miami | 23.3 | KXHIGHMIA, KXLOWTMIA, KXRAINMIA |
| KORD | Chicago | 4.4 | KXHIGHCHI, KXLOWTCHI |
| KDFW | Dallas | 11.7 | KXHIGHTDFW |
| KHOU | Houston | 18.3 | KXHIGHTHOU, KXHIGHHOU |
| KLAX | Los Angeles | 16.7 | KXHIGHLAX |
| KSFO | San Francisco | 16.7 | KXHIGHTSFO |
| KSEA | Seattle | 10.6 | KXHIGHTSEA, KXRAINSEA |
| KDEN | Denver | 1.7 | KXHIGHDEN |
| KPHX | Phoenix | 23.3 | KXHIGHTPHX |
| KMSP | Minneapolis | -0.6 | KXHIGHTMIN |
| KATL | Atlanta | 19.4 | KXHIGHTATL |
| KDTW | Detroit | 5.0 | KXHIGHTDET |
| KLAS | Las Vegas | 16.7 | KXHIGHTLV |
| KPDX | Portland | 11.7 | KXHIGHTPDX |
| KSAN | San Diego | 16.1 | KXHIGHTSAN |
| KCLT | Charlotte | 18.3 | KXHIGHTCLT |

## Notes
- All 20 stations returned live data in a single API call to aviationweather.gov
- Observations current as of ~07:51-07:58 UTC
- KDCA (DC) reading 22.8°C at 4am local — likely a warm air mass, verify vs forecast for divergence signal
- Re-verify after METAR pipeline goes live; run `npm run metar:run` to refresh

## Scheduler Setup
To start the 30-minute pipeline:
```bash
cd /Users/openclawadmin/thunderwear
npx tsx scripts/start-metar-scheduler.ts
```

Or install the launchd plist:
```bash
cp data/config/com.thunderwear.metar-cron.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.thunderwear.metar-cron.plist
```
