#!/bin/bash
# commit-phase4.sh — Commit Phase 4 (Steps 10-12)

cd /Users/openclawadmin/thunderwear-dev

echo "📝 Committing Phase 4 changes..."
echo ""

git add scripts/execute-trade.ts && git commit -m "feat(execution): Step 10 — dry-run execution pipeline with risk limits"
echo ""

git add launchd/com.thunderwear.crons.plist scripts/install-crons.sh && git commit -m "feat(crons): Step 11 — launchd cron config for all TW jobs"
echo ""

git add scripts/test-e2e.ts && git commit -m "fix(tests): Step 12 — rewrite test suite, 5/5 threshold, correct edge formula"
echo ""

echo "✅ Done. Recent commits:"
git log --oneline -3
