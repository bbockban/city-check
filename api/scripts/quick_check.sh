#!/bin/bash
# Quick database check commands
# Usage: bash scripts/quick_check.sh

echo "🔍 Quick Database Checks"
echo "========================"
echo ""

# Check connection
echo "1. Test Connection:"
echo "   poetry run python scripts/test_connection.py"
echo ""

# Check health
echo "2. Database Health:"
echo "   poetry run python scripts/check_db_health.py"
echo ""

# List regulations
echo "3. List All Regulations:"
echo "   poetry run python scripts/db_cli.py list"
echo ""

# Show stats
echo "4. Database Statistics:"
echo "   poetry run python scripts/db_cli.py stats"
echo ""

# Direct psql commands
echo "5. Direct PostgreSQL Commands:"
echo '   psql -d proyecto_grado_db -c "SELECT * FROM regulations;"'
echo '   psql -d proyecto_grado_db -c "SELECT COUNT(*) FROM regulations;"'
echo '   psql -d proyecto_grado_db -c "SELECT id, zone, description FROM regulations;"'
echo ""
