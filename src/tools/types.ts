// Shared shape every tool module exports. We keep input schemas as JSON
// Schema (not zod) because that's what the MCP protocol ships across the
// wire. Zod is used internally for runtime validation of decoded args only
// where strictly necessary; for these read-only tools the SDK's optional
// validation provider plus simple guards in handlers are sufficient.

import type { RetailerApiClient } from '../client.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (args: unknown, client: RetailerApiClient) => Promise<unknown>;
}
