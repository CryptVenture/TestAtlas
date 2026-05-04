// examples/cli-tool/lib/store.js
//
// JSON-file persistence at ~/.config/todo/db.json. Read-then-write helpers.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const DB_DIR = path.join(homedir(), '.config', 'todo');
const DB_PATH = path.join(DB_DIR, 'db.json');

async function readDb() {
  try {
    const text = await readFile(DB_PATH, 'utf8');
    const obj = JSON.parse(text);
    return Array.isArray(obj.todos) ? obj : { todos: [], nextId: 1 };
  } catch (err) {
    if (err.code === 'ENOENT') return { todos: [], nextId: 1 };
    throw err;
  }
}

async function writeDb(db) {
  await mkdir(DB_DIR, { recursive: true });
  await writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}

export async function addTodo({ title, due }) {
  const db = await readDb();
  const todo = { id: String(db.nextId), title, status: 'open', due: due ?? null };
  db.todos.push(todo);
  db.nextId += 1;
  await writeDb(db);
  return todo;
}

export async function listTodos({ status } = {}) {
  const db = await readDb();
  if (!status) return db.todos;
  return db.todos.filter((t) => t.status === status);
}

export async function completeTodo(id) {
  const db = await readDb();
  const t = db.todos.find((x) => x.id === id);
  if (!t) return null;
  t.status = 'done';
  await writeDb(db);
  return t;
}
