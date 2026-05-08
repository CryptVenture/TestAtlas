// scripts/lib/mcp-tool-catalog.js
//
// Quick 260508-u72 INV-E — Curated allowlist of mcp__chrome-devtools__*
// tool params. Source: chrome-devtools-mcp Phase-19 addenda + actual tool
// schemas (verified against the upstream tool catalog as of 2026-05-08).
// Tools NOT listed here are silently passed (lenient default — TestAtlas is
// not the chrome-devtools-mcp authority; we only flag KNOWN-INVALID).
//
// Update this file when new tools/params are added upstream.

export const MCP_TOOL_CATALOG = {
  // Page lifecycle / readiness
  'mcp__chrome-devtools__wait_for': {
    params: ['text', 'selector', 'timeout'],
  },
  'mcp__chrome-devtools__navigate': {
    params: ['url', 'waitUntil'],
  },
  'mcp__chrome-devtools__navigate_page': {
    params: ['url', 'waitUntil'],
  },
  'mcp__chrome-devtools__resize_page': {
    params: ['width', 'height'],
  },
  // Auditing
  'mcp__chrome-devtools__lighthouse_audit': {
    // The upstream tool returns Accessibility/SEO/Best-Practices/Agentic-
    // browsing on every call — there is NO `categories` / `category` /
    // `categoryFilter` parameter. Performance lives in
    // `performance_start_trace`.
    params: ['url', 'mode', 'device', 'outputDirPath'],
  },
  // Performance
  'mcp__chrome-devtools__performance_start_trace': {
    params: ['url', 'reload', 'waitForTimeout'],
  },
  'mcp__chrome-devtools__performance_stop_trace': {
    params: [],
  },
  'mcp__chrome-devtools__performance_analyze_insight': {
    params: ['insightName', 'insightSetId'],
  },
  // Interaction
  'mcp__chrome-devtools__click': {
    params: ['selector', 'button', 'clickCount'],
  },
  'mcp__chrome-devtools__type': {
    params: ['selector', 'text', 'delay'],
  },
  'mcp__chrome-devtools__press_key': {
    params: ['key'],
  },
  'mcp__chrome-devtools__hover': {
    params: ['selector'],
  },
  // Inspection
  'mcp__chrome-devtools__evaluate_script': {
    params: ['script', 'awaitPromise'],
  },
  'mcp__chrome-devtools__take_screenshot': {
    params: ['format', 'fullPage', 'quality', 'selector'],
  },
  'mcp__chrome-devtools__take_snapshot': {
    params: ['selector'],
  },
};

/**
 * @param {string} toolName e.g. "mcp__chrome-devtools__wait_for"
 * @param {string[]} paramNames keys passed to the call
 * @returns {{valid:boolean, invalid:string[], catalogued:boolean}}
 */
export function isValidMcpToolCall(toolName, paramNames) {
  const entry = MCP_TOOL_CATALOG[toolName];
  if (!entry) return { valid: true, invalid: [], catalogued: false };
  const invalid = paramNames.filter((p) => !entry.params.includes(p));
  return { valid: invalid.length === 0, invalid, catalogued: true };
}

/**
 * Return the catalogued tool catalog as a frozen object for tests.
 *
 * @returns {Readonly<typeof MCP_TOOL_CATALOG>}
 */
export function getMcpToolCatalog() {
  return MCP_TOOL_CATALOG;
}
