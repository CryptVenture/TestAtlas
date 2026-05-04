// examples/node-api/lib/store.js
//
// Single-process, in-memory Map for tasks. Seeded finding
// IN-MEMORY-STORE-DATA-LOSS: a process restart wipes all state. Documented
// in _testatlas/to_fix/.

export const tasks = new Map();
