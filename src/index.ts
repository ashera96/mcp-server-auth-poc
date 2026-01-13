#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import https from "https";
import fs from "fs";
import jwt from "jsonwebtoken";

// Hard-coded credentials for POC
const VALID_API_KEY = "mcp-secret-key-12345";
const JWT_SECRET = "mcp-jwt-secret-key-do-not-use-in-production";
const OAUTH_CLIENT_ID = "mcp-client";
const OAUTH_CLIENT_SECRET = "mcp-client-secret";

const PORT = process.env.PORT || 3000;
const USE_HTTPS = process.env.USE_HTTPS === "true" || false;

// In-memory token store (for POC only)
const validTokens = new Set<string>();

/**
 * Authentication type
 */
type AuthType = "apikey" | "oauth2";

/**
 * Validate authentication credentials
 */
function validateAuth(apiKey: string | undefined, bearerToken: string | undefined): AuthType {
  // Try API key first
  if (apiKey && apiKey === VALID_API_KEY) {
    return "apikey";
  }

  // Try OAuth2 bearer token
  if (bearerToken) {
    try {
      const decoded = jwt.verify(bearerToken, JWT_SECRET) as jwt.JwtPayload;

      // Check if token is in valid tokens set
      if (validTokens.has(bearerToken)) {
        return "oauth2";
      }

      throw new Error("Token not in valid set");
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Invalid or expired OAuth2 token"
      );
    }
  }

  throw new McpError(
    ErrorCode.InvalidRequest,
    "Authentication required. Provide either 'x-api-key' header or 'Authorization: Bearer' token."
  );
}

/**
 * Extract credentials from request metadata
 */
function getCredentialsFromMeta(meta?: Record<string, unknown>): {
  apiKey?: string;
  bearerToken?: string;
} {
  if (!meta) return {};
  return {
    apiKey: meta.apiKey as string | undefined,
    bearerToken: meta.bearerToken as string | undefined,
  };
}

/**
 * Create a new MCP server instance with authentication
 */
function createServer() {
  const server = new Server(
    {
      name: "secured-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  /**
   * Handler for listing available tools
   * Requires authentication via API key or OAuth2
   */
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    // Extract and validate credentials from request metadata
    const { apiKey, bearerToken } = getCredentialsFromMeta(request.params?._meta);
    const authType = validateAuth(apiKey, bearerToken);

    console.log(`✓ Authenticated tools/list request via ${authType}`);

    // If authentication succeeds, return the list of available tools
    return {
      tools: [
        {
          name: "get_server_time",
          description: "Returns the current server time",
          inputSchema: {
            type: "object",
            properties: {
              timezone: {
                type: "string",
                description: "Timezone for the time (e.g., 'UTC', 'America/New_York')",
              },
            },
          },
        },
        {
          name: "echo",
          description: "Echoes back the provided message",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The message to echo back",
              },
            },
            required: ["message"],
          },
        },
        {
          name: "calculate",
          description: "Performs basic arithmetic operations",
          inputSchema: {
            type: "object",
            properties: {
              operation: {
                type: "string",
                enum: ["add", "subtract", "multiply", "divide"],
                description: "The arithmetic operation to perform",
              },
              a: {
                type: "number",
                description: "First number",
              },
              b: {
                type: "number",
                description: "Second number",
              },
            },
            required: ["operation", "a", "b"],
          },
        },
      ],
    };
  });

  /**
   * Handler for tool execution
   * Requires authentication via API key or OAuth2
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Extract and validate credentials from request metadata
    const { apiKey, bearerToken } = getCredentialsFromMeta(request.params._meta);
    const authType = validateAuth(apiKey, bearerToken);

    console.log(`✓ Authenticated tools/call request via ${authType}`);

    // Process the tool call based on the tool name
    switch (request.params.name) {
      case "get_server_time": {
        const timezone = (request.params.arguments?.timezone as string) || "UTC";
        const now = new Date();
        return {
          content: [
            {
              type: "text",
              text: `Current server time: ${now.toLocaleString("en-US", {
                timeZone: timezone,
              })} (${timezone})`,
            },
          ],
        };
      }

      case "echo": {
        const message = request.params.arguments?.message as string;
        if (!message) {
          throw new McpError(ErrorCode.InvalidParams, "Message is required");
        }
        return {
          content: [
            {
              type: "text",
              text: `Echo: ${message}`,
            },
          ],
        };
      }

      case "calculate": {
        const { operation, a, b } = request.params.arguments as {
          operation: "add" | "subtract" | "multiply" | "divide";
          a: number;
          b: number;
        };

        let result: number;
        switch (operation) {
          case "add":
            result = a + b;
            break;
          case "subtract":
            result = a - b;
            break;
          case "multiply":
            result = a * b;
            break;
          case "divide":
            if (b === 0) {
              throw new McpError(ErrorCode.InvalidParams, "Cannot divide by zero");
            }
            result = a / b;
            break;
          default:
            throw new McpError(ErrorCode.InvalidParams, `Unknown operation: ${operation}`);
        }

        return {
          content: [
            {
              type: "text",
              text: `Result: ${a} ${operation} ${b} = ${result}`,
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  });

  return server;
}

/**
 * Middleware to inject credentials from HTTP headers into MCP request metadata
 */
function injectAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // Get API key from header
  const apiKey = req.headers["x-api-key"] as string | undefined;

  // Get Bearer token from Authorization header
  const authHeader = req.headers["authorization"] as string | undefined;
  let bearerToken: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    bearerToken = authHeader.substring(7);
  }

  // Inject into request body metadata if body exists
  if (req.body && typeof req.body === "object") {
    if (!req.body.params) {
      req.body.params = {};
    }
    if (!req.body.params._meta) {
      req.body.params._meta = {};
    }
    if (apiKey) {
      req.body.params._meta.apiKey = apiKey;
    }
    if (bearerToken) {
      req.body.params._meta.bearerToken = bearerToken;
    }
  }

  next();
}

/**
 * Start the HTTP server with Streamable HTTP transport
 */
async function main() {
  const app = express();

  // Enable CORS for testing
  app.use(cors());

  // Parse JSON bodies
  app.use(express.json());

  // Health check endpoint (no authentication required)
  app.get("/health", (req, res) => {
    res.json({ status: "ok", server: "secured-mcp-server", version: "1.0.0" });
  });

  // OAuth2 Token Endpoint (mock)
  app.post("/oauth/token", (req, res) => {
    const { grant_type, client_id, client_secret } = req.body;

    // Validate grant type
    if (grant_type !== "client_credentials") {
      res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "Only client_credentials grant type is supported",
      });
      return;
    }

    // Validate client credentials
    if (client_id !== OAUTH_CLIENT_ID || client_secret !== OAUTH_CLIENT_SECRET) {
      res.status(401).json({
        error: "invalid_client",
        error_description: "Invalid client credentials",
      });
      return;
    }

    // Generate JWT access token
    const accessToken = jwt.sign(
      {
        client_id: client_id,
        scope: "mcp:tools",
        iat: Math.floor(Date.now() / 1000),
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Store token in valid tokens set
    validTokens.add(accessToken);

    // Return token response
    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "mcp:tools",
    });
  });

  // OAuth2 Token Revocation Endpoint (mock)
  app.post("/oauth/revoke", (req, res) => {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Token parameter is required",
      });
      return;
    }

    // Remove token from valid tokens set
    validTokens.delete(token);

    res.status(200).json({ revoked: true });
  });

  // Create MCP server and transport in stateless mode
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode - no session tracking
  });

  await server.connect(transport);

  // MCP endpoint - handles both GET (SSE) and POST (messages)
  // Apply auth injection middleware before handling requests
  app.all("/mcp", injectAuthMiddleware, async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  // Start server with HTTPS or HTTP
  if (USE_HTTPS) {
    // Check if certificates exist
    const certPath = "./certs/server.crt";
    const keyPath = "./certs/server.key";

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.error("\n❌ HTTPS enabled but certificates not found!");
      console.error("Please generate certificates first:");
      console.error("  ./generate-certs.sh");
      process.exit(1);
    }

    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };

    https.createServer(httpsOptions, app).listen(PORT, () => {
      console.log(`\n✅ Secured MCP Server running on https://localhost:${PORT}`);
      console.log(`MCP endpoint: https://localhost:${PORT}/mcp`);
      console.log(`OAuth2 token endpoint: https://localhost:${PORT}/oauth/token`);
      console.log(`Health check: https://localhost:${PORT}/health`);
      console.log(`\n🔑 Authentication Methods:`);
      console.log(`  1. API Key: ${VALID_API_KEY}`);
      console.log(`  2. OAuth2 Client Credentials:`);
      console.log(`     Client ID: ${OAUTH_CLIENT_ID}`);
      console.log(`     Client Secret: ${OAUTH_CLIENT_SECRET}`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`\n✅ Secured MCP Server running on http://localhost:${PORT}`);
      console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
      console.log(`OAuth2 token endpoint: http://localhost:${PORT}/oauth/token`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`\n🔑 Authentication Methods:`);
      console.log(`  1. API Key: ${VALID_API_KEY}`);
      console.log(`     Header: x-api-key: ${VALID_API_KEY}`);
      console.log(`  2. OAuth2 Client Credentials:`);
      console.log(`     Client ID: ${OAUTH_CLIENT_ID}`);
      console.log(`     Client Secret: ${OAUTH_CLIENT_SECRET}`);
      console.log(`\n📝 Get OAuth2 Token:`);
      console.log(`curl -X POST http://localhost:${PORT}/oauth/token \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"grant_type":"client_credentials","client_id":"${OAUTH_CLIENT_ID}","client_secret":"${OAUTH_CLIENT_SECRET}"}'`);
    });
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
