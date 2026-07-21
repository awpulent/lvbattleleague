const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const safeEqual = require('../middleware/safe-equal');
const crypto = require('crypto');
const { listing, byName, ToolError } = require('./tools');

// LVBL MCP server — lets Claude Cowork run the weekly tournament sync and read
// standings from any surface, without the operator's admin secret ever leaving
// this process.
//
// The tools call sync/ingest directly rather than looping back through
// /admin/sync over HTTP, so ADMIN_SECRET is not involved at all. The only
// credential this surface accepts is MCP_API_TOKEN, which is scoped to the tools
// in ./tools.js and nothing else.
//
// Transport is stateless Streamable HTTP: no session state to keep, which keeps
// it correct if App Platform runs more than one instance.

const router = express.Router();

// Tighter than the global 120/min. Polling get_sync_status every few seconds
// during a sync sits well inside this.
const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: req => req.headers.authorization || ipKeyGenerator(req.ip),
});

function mcpAuth(req, res, next) {
    const configured = process.env.MCP_API_TOKEN;
    if (!configured) {
        console.error('[mcp] MCP_API_TOKEN is not set — refusing all MCP requests.');
        return res.status(503).json({ error: 'MCP endpoint not configured' });
    }
    // Header only. A token in the query string leaks into logs and history, and
    // the MCP spec prohibits it.
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token || !safeEqual(token, configured)) {
        console.warn(`[mcp] auth failed ip=${req.ip} ${new Date().toISOString()}`);
        // WWW-Authenticate keeps this a well-formed 401 for MCP clients.
        res.set('WWW-Authenticate', 'Bearer');
        return res.status(401).json({ error: 'Invalid or missing MCP token' });
    }
    next();
}

async function handleMcpRequest(req, res) {
    // Imported lazily: the SDK is ESM-first and pulling it in at module load
    // would slow every boot, including deploys that never receive an MCP call.
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { StreamableHTTPServerTransport } = await import(
        '@modelcontextprotocol/sdk/server/streamableHttp.js'
    );
    const { ListToolsRequestSchema, CallToolRequestSchema } = await import(
        '@modelcontextprotocol/sdk/types.js'
    );

    const server = new Server(
        { name: 'lv-battle-league', version: require('../package.json').version },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listing }));

    server.setRequestHandler(CallToolRequestSchema, async request => {
        const { name, arguments: args } = request.params;
        const tool = byName.get(name);
        if (!tool) {
            return {
                isError: true,
                content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            };
        }
        try {
            return await tool.handler(args || {});
        } catch (err) {
            // Tool failures come back as isError results, not protocol errors, so
            // Claude can read the message and correct the call.
            //
            // Only ToolError text is safe to return: it is raised deliberately for
            // bad arguments and missing records. Anything else is a pg or start.gg
            // error whose message carries internal detail (DB host, port, role
            // name, raw upstream bodies), so it is logged against a correlation ID
            // and the caller gets a generic message — matching the global error
            // handler in server.js.
            if (err instanceof ToolError) {
                console.warn(`[mcp] tool ${name} rejected: ${err.message}`);
                return { isError: true, content: [{ type: 'text', text: err.message }] };
            }
            const ref = crypto.randomUUID();
            console.error(`[mcp] tool ${name} failed ref=${ref}:`, err);
            return {
                isError: true,
                content: [{ type: 'text', text: `Tool call failed (ref ${ref})` }],
            };
        }
    });

    // Stateless: no session id, no per-session state retained between requests.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
    });

    await server.connect(transport);
    // req.body is already parsed by the global express.json() middleware.
    await transport.handleRequest(req, res, req.body);
}

router.all('/', mcpLimiter, mcpAuth, (req, res, next) => {
    handleMcpRequest(req, res).catch(next);
});

module.exports = router;
