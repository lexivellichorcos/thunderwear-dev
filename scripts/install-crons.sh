#!/bin/bash
# install-crons.sh
# Install/update launchd cron configuration for ThunderWear
# Usage: bash scripts/install-crons.sh

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( dirname "$SCRIPT_DIR" )"
PLIST_SOURCE="$PROJECT_DIR/launchd/com.thunderwear.crons.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.thunderwear.crons.plist"
LOG_DIR="$PROJECT_DIR/logs"

echo "🔧 ThunderWear Cron Installer"
echo "=============================="
echo ""

# Verify source plist exists
if [ ! -f "$PLIST_SOURCE" ]; then
  echo "❌ ERROR: Source plist not found: $PLIST_SOURCE"
  exit 1
fi

echo "📋 Configuration:"
echo "   Source: $PLIST_SOURCE"
echo "   Destination: $PLIST_DEST"
echo "   Project: $PROJECT_DIR"
echo ""

# Create logs directory if needed
if [ ! -d "$LOG_DIR" ]; then
  echo "📁 Creating logs directory..."
  mkdir -p "$LOG_DIR"
fi

# Create LaunchAgents directory if needed
if [ ! -d "$HOME/Library/LaunchAgents" ]; then
  echo "📁 Creating LaunchAgents directory..."
  mkdir -p "$HOME/Library/LaunchAgents"
fi

# Unload existing agent if running
if launchctl list | grep -q "com.thunderwear.crons" > /dev/null 2>&1; then
  echo "⏹️  Unloading existing agent..."
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  sleep 1
fi

# Copy plist
echo "📝 Installing plist..."
cp "$PLIST_SOURCE" "$PLIST_DEST"
chmod 644 "$PLIST_DEST"

# Load agent
echo "▶️  Loading agent..."
launchctl load "$PLIST_DEST"

# Verify
echo ""
echo "✅ Installation complete!"
echo ""
echo "📊 Status:"

if launchctl list | grep -q "com.thunderwear.crons" > /dev/null 2>&1; then
  echo "   ✅ Agent running"
  launchctl list | grep "com.thunderwear.crons" || true
else
  echo "   ⚠️  Agent not found — may not have started yet"
fi

echo ""
echo "📝 View logs:"
echo "   tail -f $LOG_DIR/crons.log"
echo "   tail -f $LOG_DIR/crons-error.log"
echo ""
echo "⚙️  Manage agent:"
echo "   launchctl unload $PLIST_DEST     (stop)"
echo "   launchctl load $PLIST_DEST       (start)"
echo "   launchctl list | grep thunderwear (status)"
echo ""
