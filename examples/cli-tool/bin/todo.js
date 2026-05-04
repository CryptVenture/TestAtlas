#!/usr/bin/env node
// examples/cli-tool/bin/todo.js
//
// TestAtlas example app: a minimal commander 14 CLI managing a tiny todo
// list stored at ~/.config/todo/db.json. Three subcommands:
//
//   todo add <title> [--due <date>]
//   todo list [--status open|done]
//   todo complete <id>
//
// The companion `_testatlas/` workspace inside this directory is the
// quality intelligence layer produced by mapping this CLI end-to-end.

import { Command } from 'commander';
import { formatRow } from '../lib/format.js';
import { addTodo, completeTodo, listTodos } from '../lib/store.js';

const program = new Command();
program.name('todo').description('Tiny TestAtlas-example todo list CLI').version('0.0.0');

program
  .command('add <title>')
  .description('Add a new todo')
  .option('--due <date>', 'optional due date (YYYY-MM-DD)')
  .action(async (title, opts) => {
    const todo = await addTodo({ title, due: opts.due ?? null });
    console.log(`added: [${todo.id}] ${todo.title}`);
  });

program
  .command('list')
  .description('List todos')
  .option('--status <status>', 'filter: open or done')
  .action(async (opts) => {
    const items = await listTodos({ status: opts.status });
    if (items.length === 0) {
      console.log('(no todos)');
      return;
    }
    for (const t of items) console.log(formatRow(t));
  });

program
  .command('complete <id>')
  .description('Mark a todo as done')
  .action(async (id) => {
    const t = await completeTodo(id);
    if (!t) {
      console.error(`no todo with id ${id}`);
      process.exit(1);
    }
    console.log(`completed: [${t.id}] ${t.title}`);
  });

await program.parseAsync();
