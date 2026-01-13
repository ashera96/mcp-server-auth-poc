# OAuth2 Client Credentials Flow

This server implements OAuth 2.0 Client Credentials grant for machine-to-machine authentication.

## Quick Start

### 1. Get an Access Token

```bash
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "mcp-client",
    "client_secret": "mcp-client-secret"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "mcp:tools"
}
```

### 2. Use the Token

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### 3. Revoke a Token (Optional)

```bash
curl -X POST http://localhost:3000/oauth/revoke \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_ACCESS_TOKEN"
  }'
```

## Test Credentials

- **Client ID**: `mcp-client`
- **Client Secret**: `mcp-client-secret`
- **Token Lifetime**: 1 hour (3600 seconds)
- **Scope**: `mcp:tools`

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/oauth/token` | POST | Get access token |
| `/oauth/revoke` | POST | Revoke access token |
| `/mcp` | POST/GET | MCP server endpoint |

## OAuth2 Flow

```
1. Client requests token with credentials
   POST /oauth/token
   { "grant_type": "client_credentials", ... }

2. Server validates credentials
   - Checks client_id and client_secret
   - Generates JWT access token
   - Stores token in valid tokens set

3. Server returns token
   { "access_token": "...", "expires_in": 3600 }

4. Client uses token for API requests
   Authorization: Bearer <access_token>

5. Server validates token on each request
   - Verifies JWT signature
   - Checks if token is in valid set
   - Checks expiration

6. (Optional) Client revokes token when done
   POST /oauth/revoke
   { "token": "..." }
```

## Token Format

Tokens are JWT (JSON Web Tokens) with the following structure:

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "client_id": "mcp-client",
  "scope": "mcp:tools",
  "iat": 1234567890,
  "exp": 1234571490
}
```

## Error Responses

### Invalid Client Credentials
```json
{
  "error": "invalid_client",
  "error_description": "Invalid client credentials"
}
```

### Unsupported Grant Type
```json
{
  "error": "unsupported_grant_type",
  "error_description": "Only client_credentials grant type is supported"
}
```

### Invalid Token
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32600,
    "message": "Invalid or expired OAuth2 token"
  }
}
```

## Testing

Run the OAuth2 test script:

```bash
./test-oauth2.sh
```

This will test:
- ✅ Token generation
- ✅ Invalid credentials handling
- ✅ Using token to list tools
- ✅ Using token to call tools
- ✅ Invalid token rejection
- ✅ Token revocation
- ✅ Revoked token rejection

## Integration with WSO2 API Manager

WSO2 can proxy OAuth2 requests to this server:

1. **Token Generation**: WSO2 can use its own OAuth2 or forward to `/oauth/token`
2. **Token Validation**: Set up WSO2 to validate JWT tokens
3. **Pass Token**: WSO2 forwards the Bearer token to MCP server

### WSO2 Configuration Example

```xml
<api context="/mcp" version="v1">
  <resource methods="POST GET" url-mapping="/tools">
    <inSequence>
      <!-- Validate OAuth2 token -->
      <oauthService/>
      <!-- Forward to backend -->
      <send>
        <endpoint>
          <http uri-template="http://localhost:3000/mcp"/>
        </endpoint>
      </send>
    </inSequence>
  </resource>
</api>
```

## Security Notes

This is a **POC implementation**. For production:

1. **Store secrets securely**: Use environment variables or secrets manager
2. **Use HTTPS**: Always use TLS in production
3. **Implement token refresh**: Add refresh token support
4. **Add rate limiting**: Prevent token generation abuse
5. **Use persistent storage**: Store tokens in database, not memory
6. **Implement scopes properly**: Fine-grained access control
7. **Add token introspection**: `/oauth/introspect` endpoint
8. **Audit logging**: Log all token operations
9. **Implement PKCE**: For public clients
10. **Use strong secrets**: Generate cryptographically secure secrets

## Comparison: API Key vs OAuth2

| Feature | API Key | OAuth2 |
|---------|---------|---------|
| Complexity | Simple | Moderate |
| Token Lifetime | Permanent | Expiring (1h) |
| Revocation | N/A | Supported |
| Best For | Internal use | External APIs |
| Header | `x-api-key` | `Authorization: Bearer` |
| Standard | Custom | RFC 6749 |

Both methods are supported simultaneously - use whichever fits your use case!
