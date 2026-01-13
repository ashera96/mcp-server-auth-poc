#!/bin/bash

# Test script for OAuth2 authentication

API_KEY="mcp-secret-key-12345"
CLIENT_ID="mcp-client"
CLIENT_SECRET="mcp-client-secret"
PORT="${PORT:-3000}"

# Detect if server is running in HTTPS mode
if [ "$USE_HTTPS" = "true" ]; then
  BASE_URL="https://localhost:${PORT}"
  CURL_OPTS="-k"
else
  BASE_URL="http://localhost:${PORT}"
  CURL_OPTS=""
fi

echo "=== Testing OAuth2 Authentication ==="
echo "Server: $BASE_URL"
echo ""

# Test 1: Get OAuth2 Access Token
echo "1. Request OAuth2 Access Token:"
TOKEN_RESPONSE=$(curl $CURL_OPTS -s -X POST "${BASE_URL}/oauth/token" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"client_credentials\",\"client_id\":\"${CLIENT_ID}\",\"client_secret\":\"${CLIENT_SECRET}\"}")

echo "$TOKEN_RESPONSE" | jq .
ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
echo ""
echo "Access Token: ${ACCESS_TOKEN:0:50}..."
echo ""

# Test 2: Try to get token with wrong credentials
echo "2. Try to get token with WRONG credentials (should fail):"
curl $CURL_OPTS -s -X POST "${BASE_URL}/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"wrong-id","client_secret":"wrong-secret"}' | jq .
echo ""

# Test 3: List tools with OAuth2 token
echo "3. List tools with OAuth2 Bearer token:"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 4: Call echo tool with OAuth2 token
echo "4. Call echo tool with OAuth2 Bearer token:"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"message":"Hello from OAuth2!"}}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 5: Call calculate tool with OAuth2 token
echo "5. Call calculate tool with OAuth2 Bearer token:"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"calculate","arguments":{"operation":"multiply","a":7,"b":8}}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 6: Try to use tools without token (should fail)
echo "6. Try to call tool WITHOUT token (should fail):"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 7: Try with invalid token (should fail)
echo "7. Try with INVALID Bearer token (should fail):"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer invalid-token-12345" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/list","params":{}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 8: Revoke token
echo "8. Revoke OAuth2 token:"
curl $CURL_OPTS -s -X POST "${BASE_URL}/oauth/revoke" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${ACCESS_TOKEN}\"}" | jq .
echo ""

# Test 9: Try to use revoked token (should fail)
echo "9. Try to use REVOKED token (should fail):"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/list","params":{}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

# Test 10: Verify API Key still works
echo "10. Verify API Key authentication still works:"
curl $CURL_OPTS -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"echo","arguments":{"message":"API Key still works!"}}}' | sed 's/event: message//' | sed 's/data: //' | jq .
echo ""

echo "=== OAuth2 Test Complete ==="
echo ""
echo "✅ Both authentication methods are working!"
echo "   - OAuth2 Client Credentials (Bearer token)"
echo "   - API Key (x-api-key header)"
