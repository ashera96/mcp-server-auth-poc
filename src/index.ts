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

// Hard-coded API key for POC
const VALID_API_KEY = "mcp-secret-key-12345";
const PORT = process.env.PORT || 3000;
const USE_HTTPS = process.env.USE_HTTPS === "true" || false;

/**
 * Authentication middleware to validate API key
 * Checks for API key in the request metadata
 */
function validateApiKey(apiKey: string | undefined): void {
  if (!apiKey || apiKey !== VALID_API_KEY) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Invalid or missing API key. Please provide a valid API key in the request metadata."
    );
  }
}

/**
 * Extract API key from request metadata
 */
function getApiKeyFromMeta(meta?: Record<string, unknown>): string | undefined {
  if (!meta) return undefined;
  return meta.apiKey as string | undefined;
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
   * Requires authentication via API key
   */
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    // Extract and validate API key from request metadata
    const apiKey = getApiKeyFromMeta(request.params?._meta);
    validateApiKey(apiKey);

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
   * Requires authentication via API key
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Extract and validate API key from request metadata
    const apiKey = getApiKeyFromMeta(request.params._meta);
    validateApiKey(apiKey);

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
 * Middleware to inject API key from HTTP headers into MCP request metadata
 */
function injectApiKeyMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // Get API key from header
  const apiKey = req.headers["x-api-key"] as string | undefined;

  // Inject into request body metadata if body exists
  if (req.body && typeof req.body === "object") {
    if (!req.body.params) {
      req.body.params = {};
    }
    if (!req.body.params._meta) {
      req.body.params._meta = {};
    }
    req.body.params._meta.apiKey = apiKey;
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

  // Create MCP server and transport in stateless mode
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode - no session tracking
  });

  await server.connect(transport);

  // MCP endpoint - handles both GET (SSE) and POST (messages)
  // Apply API key injection middleware before handling requests
  app.all("/mcp", injectApiKeyMiddleware, async (req, res) => {
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
      console.error("  mkdir -p certs");
      console.error("  openssl req -x509 -newkey rsa:4096 -keyout certs/server.key -out certs/server.crt -days 365 -nodes -subj '/CN=localhost'");
      process.exit(1);
    }

    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };

    https.createServer(httpsOptions, app).listen(PORT, () => {
      console.log(`\n✅ Secured MCP Server running on https://localhost:${PORT}`);
      console.log(`MCP endpoint: https://localhost:${PORT}/mcp`);
      console.log(`Health check: https://localhost:${PORT}/health`);
      console.log(`\nValid API Key for testing: ${VALID_API_KEY}`);
      console.log(`\nSend requests with header: x-api-key: ${VALID_API_KEY}`);
      console.log(`\nExample curl command (use -k to ignore self-signed cert):`);
      console.log(`curl -k -X POST https://localhost:${PORT}/mcp \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -H "Accept: application/json, text/event-stream" \\`);
      console.log(`  -H "x-api-key: ${VALID_API_KEY}" \\`);
      console.log(`  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`\n✅ Secured MCP Server running on http://localhost:${PORT}`);
      console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`\nValid API Key for testing: ${VALID_API_KEY}`);
      console.log(`\nSend requests with header: x-api-key: ${VALID_API_KEY}`);
      console.log(`\nExample curl command to test:`);
      console.log(`curl -X POST http://localhost:${PORT}/mcp \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -H "Accept: application/json, text/event-stream" \\`);
      console.log(`  -H "x-api-key: ${VALID_API_KEY}" \\`);
      console.log(`  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`);
    });
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
