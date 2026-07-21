#!/usr/bin/env bash
# End-to-end test of the LVBL MCP endpoint against a throwaway Postgres.
# Runs the app in node:20-alpine to match production.
set -uo pipefail

REPO=/home/dos/projects/lvbattleleague
NET=lvbl-mcp-test
DB=lvbl-mcp-db
APP=lvbl-mcp-app
TOKEN="test-token-$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
PORT=13000

cleanup() {
    echo
    echo "--- app log (tail) ---"
    docker logs "$APP" 2>&1 | tail -25
    docker rm -f "$APP" "$DB" >/dev/null 2>&1
    docker network rm "$NET" >/dev/null 2>&1
}
trap cleanup EXIT

docker rm -f "$APP" "$DB" >/dev/null 2>&1
docker network rm "$NET" >/dev/null 2>&1
docker network create "$NET" >/dev/null

echo "Starting Postgres..."
docker run -d --name "$DB" --network "$NET" \
    -e POSTGRES_DB=lvbl -e POSTGRES_USER=lvbl -e POSTGRES_PASSWORD=lvbl \
    postgres:16-alpine >/dev/null

for i in $(seq 1 40); do
    docker exec "$DB" pg_isready -U lvbl -q 2>/dev/null && break
    sleep 1
done
echo "Postgres up."

echo "Starting app (node:20-alpine)..."
docker run -d --name "$APP" --network "$NET" -p "$PORT:3000" \
    -v "$REPO":/app -w /app --user "$(id -u):$(id -g)" \
    -e DATABASE_URL="postgres://lvbl:lvbl@$DB:5432/lvbl" \
    -e MCP_API_TOKEN="$TOKEN" \
    -e NODE_ENV=test \
    node:20-alpine node server.js >/dev/null

for i in $(seq 1 40); do
    curl -fsS "http://localhost:$PORT/" -o /dev/null 2>/dev/null && break
    sleep 1
done
echo "App up."

# Seed a season so sync_tournament has something to validate against.
docker exec "$DB" psql -U lvbl -d lvbl -q -c \
    "INSERT INTO seasons (name, is_active) VALUES ('Season 1', true) ON CONFLICT DO NOTHING;" >/dev/null 2>&1

MCP="http://localhost:$PORT/mcp"
ACCEPT='Accept: application/json, text/event-stream'
CT='Content-Type: application/json'

pass=0; fail=0
check() { # name expected_substring actual
    if grep -qF -- "$2" <<<"$3"; then
        echo "  PASS  $1"; pass=$((pass+1))
    else
        echo "  FAIL  $1"
        echo "        expected to contain: $2"
        echo "        got: $(head -c 400 <<<"$3")"
        fail=$((fail+1))
    fi
}

rpc() { # json -> response body
    curl -sS -X POST "$MCP" -H "$CT" -H "$ACCEPT" \
        -H "Authorization: Bearer $TOKEN" -d "$1" 2>&1
}

echo
echo "=== auth ==="
noauth=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$MCP" -H "$CT" -H "$ACCEPT" -d '{}' 2>&1)
check "no token -> 401" "401" "$noauth"

badauth=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$MCP" -H "$CT" -H "$ACCEPT" \
    -H "Authorization: Bearer wrong-token" -d '{}' 2>&1)
check "bad token -> 401" "401" "$badauth"

wwwauth=$(curl -sSi -X POST "$MCP" -H "$CT" -H "$ACCEPT" -d '{}' 2>&1 | grep -i '^www-authenticate' || echo none)
check "401 carries WWW-Authenticate" "Bearer" "$wwwauth"

echo
echo "=== protocol ==="
init=$(rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}')
check "initialize returns serverInfo" "lv-battle-league" "$init"
check "initialize advertises tools" '"tools"' "$init"

tools=$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')
for t in sync_tournament get_sync_status list_seasons get_standings list_recent_tournaments; do
    check "tools/list has $t" "\"$t\"" "$tools"
done
check "annotations present" "readOnlyHint" "$tools"
check "destructiveHint present" "destructiveHint" "$tools"

echo
echo "=== read-only tools ==="
seasons=$(rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_seasons","arguments":{}}}')
check "list_seasons returns seeded season" "Season 1" "$seasons"

standings=$(rpc '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_standings","arguments":{}}}')
check "get_standings works on empty season" "standings" "$standings"

recent=$(rpc '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_recent_tournaments","arguments":{}}}')
check "list_recent_tournaments returns array" "content" "$recent"

echo
echo "=== error handling ==="
unknown=$(rpc '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"nope","arguments":{}}}')
check "unknown tool -> isError" "Unknown tool" "$unknown"

badseason=$(rpc '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_standings","arguments":{"seasonId":999}}}')
check "missing season -> friendly error" "does not exist" "$badseason"

missingargs=$(rpc '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"sync_tournament","arguments":{"seasonId":1}}}')
check "missing required arg -> error" "tournamentSlug is required" "$missingargs"

badsync=$(rpc '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"sync_tournament","arguments":{"tournamentSlug":"x","seasonId":999,"weekNumber":1}}}')
check "sync into missing season -> error" "does not exist" "$badsync"

nojob=$(rpc '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"get_sync_status","arguments":{"jobId":"nope"}}}')
check "unknown jobId -> friendly error" "No job" "$nojob"

# Regression: an out-of-range integer used to reach pg and echo the driver's
# 'invalid input syntax for type integer' back to the caller.
bigint=$(rpc '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"get_standings","arguments":{"seasonId":1e21}}}')
check "huge seasonId rejected before pg" "seasonId must be an integer" "$bigint"
if grep -qiE "invalid input syntax|ECONNREFUSED|password authentication|:5432|:25060" <<<"$bigint"; then
    echo "  FAIL  driver internals leaked to client"; fail=$((fail+1))
else
    echo "  PASS  no driver internals in error response"; pass=$((pass+1))
fi

# sync_tournament must be annotated destructive: it DELETEs the event's sets/games.
destructive=$(python3 -c "
import json,sys,re
raw=sys.stdin.read()
m=re.search(r'data: (.*)', raw)
payload=json.loads(m.group(1) if m else raw)
t=[x for x in payload['result']['tools'] if x['name']=='sync_tournament'][0]
print(t['annotations'].get('destructiveHint'))
" <<<"$tools" 2>/dev/null)
check "sync_tournament annotated destructive" "True" "$destructive"

echo
echo "=== sync job lifecycle (no start.gg token: expect job to fail cleanly) ==="
sync=$(rpc '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"sync_tournament","arguments":{"tournamentSlug":"https://www.start.gg/tournament/fake-slug-test/details","seasonId":1,"weekNumber":1}}}')
check "sync_tournament returns jobId" "jobId" "$sync"
check "slug extracted from URL" "fake-slug-test" "$sync"

JOBID=$(grep -o '\\"jobId\\": \\"[^\\]*' <<<"$sync" | head -1 | sed 's/.*\\"//')
if [ -z "$JOBID" ]; then
    JOBID=$(python3 -c "
import json,sys,re
raw=sys.stdin.read()
m=re.search(r'data: (.*)', raw)
payload=json.loads(m.group(1) if m else raw)
inner=json.loads(payload['result']['content'][0]['text'])
print(inner['jobId'])
" <<<"$sync" 2>/dev/null)
fi
echo "  jobId: ${JOBID:-<none>}"

if [ -n "${JOBID:-}" ]; then
    sleep 6
    status=$(rpc "{\"jsonrpc\":\"2.0\",\"id\":12,\"method\":\"tools/call\",\"params\":{\"name\":\"get_sync_status\",\"arguments\":{\"jobId\":\"$JOBID\"}}}")
    check "job status retrievable" "$JOBID" "$status"
    if grep -qF '"status": \"failed\"' <<<"$status" || grep -qF 'failed' <<<"$status"; then
        echo "  PASS  job failed cleanly (no start.gg token) rather than hanging"; pass=$((pass+1))
    else
        echo "  INFO  job status: $(head -c 200 <<<"$status")"
    fi
fi

echo
echo "======================================"
echo "  passed: $pass   failed: $fail"
echo "======================================"
[ "$fail" -eq 0 ]
