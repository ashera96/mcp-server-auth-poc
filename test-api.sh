#!/bin/bash

# Test script for the secured MCP server
# Supports both HTTP and HTTPS modes

API_KEY="mcp-secret-key-12345"
PORT="${PORT:-3000}"

# Detect if server is running in HTTPS mode
if [ "$USE_HTTPS" = "true" ]; then
  BASE_URL="https://localhost:${PORT}"
  CURL_OPTS="-k"  # Ignore self-signed certificate
else
  BASE_URL="http://localhost:${PORT}"
  CURL_OPTS=""
fi

echo "=== Testing Secured MCP Server (Stateless Mode) ==="
echo "Server: $BASE_URL"
echo ""

# Test 1: Health check (no auth required)
echo "1. Health Check (no authentication):"
curl $CURL_OPTS -s "${BASE_URL}/health" | jq .
echo ""

# Test 2: List tools WITH valid API key (no initialization needed in stateless mode)
echo "2. List tools WITH valid API key (stateless - no init needed):"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 3: Try to list tools WITHOUT API key (should fail)
echo "3. Try to list tools WITHOUT API key (should fail with auth error):"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 4: Try to list tools WITH WRONG API key (should fail)
echo "4. Try to list tools WITH WRONG API key (should fail):"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: wrong-key-123" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 5: Call echo tool WITH valid API key
echo "5. Call echo tool WITH valid API key:"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"echo","arguments":{"message":"Hello from authenticated client!"}}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 6: Call calculate tool WITH valid API key
echo "6. Call calculate tool WITH valid API key (42 + 58):"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"calculate","arguments":{"operation":"add","a":42,"b":58}}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 7: Call get_server_time tool WITH valid API key
echo "7. Call get_server_time tool WITH valid API key:"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_server_time","arguments":{"timezone":"America/New_York"}}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 8: Multiple concurrent requests (stateless mode allows this!)
echo "8. Multiple concurrent tool calls (testing stateless mode):"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"calculate","arguments":{"operation":"multiply","a":7,"b":6}}}' | sed 's/event: message//' | sed 's/data: //' | jq . &

curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"calculate","arguments":{"operation":"divide","a":100,"b":4}}}' | sed 's/event: message//' | sed 's/data: //' | jq . &

wait
echo ""

echo "=== Test Complete ==="
echo ""
echo "✅ Stateless mode allows multiple independent requests without initialization!"
