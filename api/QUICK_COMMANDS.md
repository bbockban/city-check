# Quick Database Commands

Copy and paste these commands directly into your terminal.

## Using Python Scripts

### Test Connection
```bash
poetry run python scripts/test_connection.py
```

### Check Database Health
```bash
poetry run python scripts/check_db_health.py
```

### List All Regulations
```bash
poetry run python scripts/db_cli.py list
```

### Get Specific Regulation
```bash
poetry run python scripts/db_cli.py get 1
```

### Show Statistics
```bash
poetry run python scripts/db_cli.py stats
```

## Using PostgreSQL Directly (psql)

### Connect to Database
```bash
psql -d proyecto_grado_db
```

### One-liner Commands (copy these exactly)

**List all regulations:**
```bash
psql -d proyecto_grado_db -c "SELECT * FROM regulations;"
```

**Count regulations:**
```bash
psql -d proyecto_grado_db -c "SELECT COUNT(*) FROM regulations;"
```

**View formatted output:**
```bash
psql -d proyecto_grado_db -c "SELECT id, zone, description FROM regulations ORDER BY id;"
```

**View table structure:**
```bash
psql -d proyecto_grado_db -c "\d regulations"
```

**List all tables:**
```bash
psql -d proyecto_grado_db -c "\dt"
```

## Interactive psql Session

If you want to run multiple queries:

```bash
# 1. Connect
psql -d proyecto_grado_db

# 2. Inside psql, run these commands:
SELECT * FROM regulations;
SELECT COUNT(*) FROM regulations;
SELECT id, zone, description FROM regulations ORDER BY id;
\d regulations  # Show table structure
\q  # Exit psql
```

## Troubleshooting

If you get connection errors:
```bash
# Check if PostgreSQL is running
pg_isready

# Check if database exists
psql -l | grep proyecto_grado_db
```
