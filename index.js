#!/usr/bin/env node
'use strict';
/**
 * CLI entry point.
 *   node index.js              -> start the REPL
 *   node index.js file.bhai    -> run a script file
 *   node index.js --help       -> usage
 *   node index.js --version    -> version
 */
const fs = require('fs');
const { tokenize, BhaiError } = require('./src/lexer');
const { parse } = require('./src/parser');
const { Interpreter } = require('./src/interpreter');
const { repr } = require('./src/values');
const io = require('./src/io');

const VERSION = require('./package.json').version;

// Don't crash with a stack trace when output is piped into something that closes early.
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });

// Full pipeline: source -> tokens -> AST -> execution
function execute(source, interpreter, startLine = 1) {
  const tokens = tokenize(source, startLine);
  const ast = parse(tokens);
  return interpreter.run(ast);
}

// Print an error with the offending source line and a ^ under the column.
// `lines` is the whole source split into lines, indexed by (line number - 1).
function reportError(err, lines) {
  if (err instanceof BhaiError) {
    const where = err.line ? ` [line ${err.line}, col ${err.col}]` : '';
    io.writeErr(`Error${where}: ${err.message}`);
    const text = err.line && lines ? lines[err.line - 1] : undefined;
    if (text !== undefined) {
      io.writeErr('  ' + text.replace(/\r$/, ''));
      io.writeErr('  ' + ' '.repeat(Math.max(0, err.col - 1)) + '^');
    }
  } else if (err instanceof RangeError && /call stack/i.test(err.message)) {
    io.writeErr('Error: Code bahut gehra nested hai (stack overflow). Recursion ya expression chhota karo.');
  } else {
    io.writeErr('Internal error: ' + (err && err.stack ? err.stack : err));
  }
}

function runFile(path) {
  let source;
  try {
    source = fs.readFileSync(path, 'utf8');
  } catch (e) {
    io.writeErr(`File nahi mili bhai: ${path}`);
    process.exitCode = 1;
    return;
  }
  try {
    execute(source, new Interpreter());
  } catch (err) {
    reportError(err, source.split('\n'));
    process.exitCode = 1;
  }
}

// True while the text has an unclosed ( [ or {  -> the REPL should ask for more lines.
// Brackets inside strings and // comments are ignored.
function isOpen(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote || c === '\n') quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; }
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
  }
  return depth > 0;
}

function startRepl() {
  const interpreter = new Interpreter(); // memory persists across inputs
  const history = [];                    // every line typed so far, so errors can show the right line

  io.write(`bhailang v${VERSION} - GenZ Hinglish REPL\n`);
  io.write("Type 'nikal' ya 'exit' to quit. Multi-line code: '{' kholte hi '...' prompt aayega,\n");
  io.write('block ke baad ek khali line dabao to run ho jayega.\n\n');

  for (;;) {
    io.write('bhai> ');
    const first = io.readLine();
    if (first === null) break;
    const cmd = first.trim();
    if (cmd === 'exit' || cmd === 'nikal' || cmd === '.exit') break;
    if (cmd === '') continue;

    // Keep reading while a bracket is still open. After a multi-line block closes,
    // wait for a blank line (or a `warna ...` line) so agar / warna can continue.
    let chunk = first;
    let count = 1;
    for (;;) {
      const open = isOpen(chunk);
      const waitForBlank = !open && count > 1 && chunk.trimEnd().endsWith('}');
      if (!open && !waitForBlank) break;
      io.write('...  ');
      const next = io.readLine();
      if (next === null) break;
      if (waitForBlank && next.trim() === '') break;
      chunk += '\n' + next;
      count++;
    }

    const startLine = history.length + 1;
    history.push(...chunk.split('\n'));
    try {
      const result = execute(chunk, interpreter, startLine);
      if (result !== undefined && result !== null) io.writeLine(repr(result)); // echo bare expressions
    } catch (err) {
      reportError(err, history);
    }
  }

  io.write('\nChalo bhai, phir milenge!\n');
}

const HELP = `bhailang v${VERSION}

Usage:
  node index.js              start the interactive REPL
  node index.js file.bhai    run a bhailang script
  node index.js --help       show this help
  node index.js --version    show the version`;

const arg = process.argv[2];
if (arg === '--help' || arg === '-h') io.writeLine(HELP);
else if (arg === '--version' || arg === '-v') io.writeLine(VERSION);
else if (arg) runFile(arg);
else startRepl();
