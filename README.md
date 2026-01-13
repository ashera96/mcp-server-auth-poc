# Secured MCP Server

An MCP (Model Context Protocol) server implementation with **dual authentication** support: API Key and OAuth 2.0 Client Credentials. This server requires authentication for all operations, including listing available tools.

## Features

- ✅ **Dual Authentication**: API Key AND OAuth 2.0 Client Credentials
- ✅ **HTTP and HTTPS support** with self-signed certificates for development
- ✅ **Stateless mode** - no session initialization required, supports multiple concurrent clients
- ✅ **OAuth2 token endpoint** - Full client credentials flow with JWT tokens
- ✅ **Three sample tools**: `get_server_time`, `echo`, and `calculate`
- ✅ **Mock credentials** for POC testing
- Built with TypeScript and the MCP SDK

## Authentication Methods

This server supports **TWO authentication methods** - use either one:

### Method 1: API Key (Simple)

Include the API key in HTTP headers:

```bash
x-api-key: mcp-secret-key-12345
```

### Method 2: OAuth 2.0 (Standard)

1. Get an access token:
```bash
curl -X POST https://localhost:3000/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "mcp-client",
    "client_secret": "mcp-client-secret"
  }'
```

2. Use the Bearer token:
```bash
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**See [OAUTH2.md](OAUTH2.md) for complete OAuth2 documentation.**

## Test Credentials

| Method | Credential | Value |
|--------|-----------|-------|
| API Key | Header | `x-api-key: mcp-secret-key-12345` |
| OAuth2 | Client ID | `mcp-client` |
| OAuth2 | Client Secret | `mcp-client-secret` |
| OAuth2 | Token Lifetime | 1 hour |

The authentication is enforced at two levels:
1. **HTTP middleware** extracts credentials from headers
2. **MCP request handlers** validate credentials before processing

Requests without valid authentication will be rejected.

## Stateless Mode

This server runs in **stateless mode**, which means:
- ✅ No session initialization required
- ✅ Each request is independent
- ✅ Multiple clients can connect simultaneously without conflicts
- ✅ No session ID tracking or management
- ✅ Perfect for HTTP-based API access

You can call tools directly without calling `initialize` first!

## Available Tools

### 1. get_server_time
Returns the current server time in the specified timezone.

**Parameters:**
- `timezone` (optional): Timezone string (e.g., 'UTC', 'America/New_York')

### 2. echo
Echoes back the provided message.

**Parameters:**
- `message` (required): The message to echo back

### 3. calculate
Performs basic arithmetic operations.

**Parameters:**
- `operation` (required): One of 'add', 'subtract', 'multiply', 'divide'
- `a` (required): First number
- `b` (required): Second number

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Running the Server

### HTTP Mode (Default)

```bash
npm start
```

The server will start on `http://localhost:3000`.

### HTTPS Mode

First, generate self-signed certificates:

```bash
./generate-certs.sh
```

Then start the server with HTTPS enabled:

```bash
USE_HTTPS=true npm start
```

The server will start on `https://localhost:3000`.

### Custom Port

```bash
PORT=8080 npm start
# or
PORT=8080 USE_HTTPS=true npm start
```

## API Endpoints

- **GET /health** - Health check endpoint (no authentication required)
- **POST /mcp** - MCP endpoint for JSON-RPC requests (requires `x-api-key` header)
- **GET /mcp** - SSE endpoint for streaming (requires `x-api-key` header)

## Testing

### Automated Tests

The repository includes a comprehensive test script that works with both HTTP and HTTPS:

```bash
# Test HTTP mode
./test-api.sh

# Test HTTPS mode
USE_HTTPS=true ./test-api.sh
```

### Manual Testing Examples

#### 1. Health Check (no authentication):
```bash
curl http://localhost:3000/health

# or for HTTPS
curl -k https://localhost:3000/health
```

#### 2. List Tools (stateless - no init needed):
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: mcp-secret-key-12345" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

#### 3. Call the Echo Tool:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: mcp-secret-key-12345" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "echo",
      "arguments": {
        "message": "Hello, World!"
      }
    }
  }'
```

#### 4. Call the Calculate Tool:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: mcp-secret-key-12345" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "calculate",
      "arguments": {
        "operation": "add",
        "a": 42,
        "b": 58
      }
    }
  }'
```

#### 5. HTTPS Requests:
For HTTPS, add the `-k` flag to ignore self-signed certificates:

```bash
curl -k -X POST https://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: mcp-secret-key-12345" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Testing Authentication

### Valid API Key (should succeed):
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: mcp-secret-key-12345" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Missing API Key (should fail):
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Wrong API Key (should fail):
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: wrong-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## How It Works

### Authentication Flow

1. **HTTP Header Validation**: The Express middleware checks for the `x-api-key` header on incoming requests
2. **Metadata Injection**: The middleware injects the API key into the MCP request metadata (`request.params._meta.apiKey`)
3. **MCP Handler Validation**: Each MCP request handler (tools/list, tools/call) validates the API key before processing
4. **Error Handling**: Invalid or missing API keys result in MCP error responses with code `-32600`

### Stateless Mode

The server uses `sessionIdGenerator: undefined` in the transport configuration, which enables stateless mode:

```typescript
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // Stateless mode
});
```

This allows:
- No session initialization required
- Multiple concurrent clients without conflicts
- Each request is fully independent
- Perfect for RESTful-style API access

### Architecture

```
HTTP/HTTPS Request with x-api-key header
    ↓
Express Middleware (injectApiKeyMiddleware)
    ↓
Inject API key into request.params._meta.apiKey
    ↓
StreamableHTTPServerTransport (stateless)
    ↓
MCP Server Request Handlers
    ↓
validateApiKey() checks request.params._meta.apiKey
    ↓
Execute tool or return error
```

## HTTPS Setup

### Generate Self-Signed Certificates

```bash
./generate-certs.sh
```

This creates:
- `certs/server.key` - Private key
- `certs/server.crt` - Self-signed certificate (valid for 365 days)

### Manual Certificate Generation

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -days 365 \
  -nodes \
  -subj '/CN=localhost'
```

### Using HTTPS in Production

For production:
1. Replace self-signed certificates with certificates from a trusted CA (Let's Encrypt, etc.)
2. Update certificate paths in [src/index.ts](src/index.ts) if needed
3. Remove the `-k` flag from curl commands
4. Configure proper certificate validation in clients

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)
- `USE_HTTPS` - Enable HTTPS mode (default: false, set to "true" to enable)

### API Key

The hard-coded API key is defined in [src/index.ts:17](src/index.ts#L17):

```typescript
const VALID_API_KEY = "mcp-secret-key-12345";
```

## Files

- [src/index.ts](src/index.ts) - Main server implementation
- [test-api.sh](test-api.sh) - Comprehensive test script (HTTP and HTTPS)
- [generate-certs.sh](generate-certs.sh) - SSL certificate generation script
- [package.json](package.json) - Dependencies and scripts
- [tsconfig.json](tsconfig.json) - TypeScript configuration

## Security Notes

This is a **proof-of-concept** implementation. For production use, you should:

### Authentication
- Store API keys securely (environment variables, secrets management systems, vault)
- Support multiple API keys with different permissions/scopes
- Implement key rotation mechanisms
- Add rate limiting per API key
- Log authentication attempts and failures
- Consider OAuth2, JWT, or other robust authentication mechanisms

### HTTPS/TLS
- Use certificates from a trusted Certificate Authority (CA)
- Implement proper certificate validation
- Use HTTPS for all communication in production
- Consider mTLS (mutual TLS) for enhanced security
- Keep certificates updated and monitor expiration

### General Security
- Implement request validation and sanitization
- Add IP allowlisting/blocklisting
- Implement proper error handling (don't leak sensitive info)
- Add monitoring and alerting
- Regular security audits
- Keep dependencies updated

## Transport Protocol

This server uses the **Streamable HTTP** transport from the MCP SDK in stateless mode, which:
- Supports both Server-Sent Events (SSE) for streaming and regular HTTP responses
- Works without session state or initialization
- Handles both GET (for SSE streams) and POST (for messages) requests
- Allows multiple independent concurrent clients
- Perfect for HTTP-based API access patterns

## Troubleshooting

### "Server already initialized" error
This should not occur in stateless mode. If you see this, check that `sessionIdGenerator` is set to `undefined` in [src/index.ts:256](src/index.ts#L256).

### HTTPS certificate errors
- Make sure you've run `./generate-certs.sh`
- Use `-k` flag with curl for self-signed certificates
- Check that `certs/` directory contains `server.key` and `server.crt`

### Authentication errors
- Verify the `x-api-key` header is included
- Check that the API key matches `mcp-secret-key-12345`
- Ensure the header name is exactly `x-api-key` (lowercase)

## License

MIT
