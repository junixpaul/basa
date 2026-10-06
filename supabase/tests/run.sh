#!/bin/bash
# Runs migrations + SQL tests on a throwaway local Postgres database. Usage: PGHOST=... PGPORT=... sh supabase/tests/run.sh
set -eo pipefail; cd "$(dirname "$0")/../.."
psql -U postgres -qc "drop database if exists basa_test" -c "create database basa_test"
psql -U postgres -d basa_test -q -v ON_ERROR_STOP=1 -f supabase/tests/_stub.sql $(for f in supabase/migrations/*.sql; do printf -- '-f %s ' "$f"; done)
psql -U postgres -d basa_test -qAt -f supabase/tests/record_attempt.test.sql 2>&1 | grep -E "ok -|FAIL|ERROR"
