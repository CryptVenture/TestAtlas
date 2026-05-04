// examples/cli-tool/lib/format.js
//
// Render a single todo row.

/**
 * @param {{id: string, status: string, title: string, due?: string|null}} t
 * @returns {string}
 */
export function formatRow(t) {
  const due = t.due ? ` (due: ${t.due})` : '';
  return `[${t.id}] [${t.status}] ${t.title}${due}`;
}
