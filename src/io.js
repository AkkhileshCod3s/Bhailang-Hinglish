'use strict';
/**
 * IO: console input/output for the CLI.
 *
 * Input is read SYNCHRONOUSLY (fs.readSync on file descriptor 0), so
 * `bhai sun("...")` can simply wait for a line in the middle of a program.
 * We deliberately never touch process.stdin, because that would switch the
 * stream to async mode and make readSync unreliable.
 */
const fs = require('fs');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function write(text) { process.stdout.write(text); }
function writeLine(text) { process.stdout.write(text + '\n'); }
function writeErr(text) { process.stderr.write(text + '\n'); }

/**
 * Read one line from the keyboard (or a pipe). Returns the line without the
 * trailing newline, or null when there is no more input (EOF / Ctrl+D / Ctrl+Z).
 */
function readLine() {
  const bytes = [];
  const one = Buffer.alloc(1);
  for (;;) {
    let n;
    try {
      n = fs.readSync(0, one, 0, 1, null);
    } catch (e) {
      if (e.code === 'EAGAIN') { sleep(10); continue; } // stdin not ready yet, try again
      if (e.code === 'EOF') { n = 0; }                  // Windows reports end of input like this
      else throw e;
    }
    if (n === 0) {
      if (bytes.length === 0) return null;
      break;
    }
    if (one[0] === 10) break; // '\n'
    bytes.push(one[0]);
  }
  let line = Buffer.from(bytes).toString('utf8');
  if (line.endsWith('\r')) line = line.slice(0, -1); // Windows line ending
  return line;
}

module.exports = { write, writeLine, writeErr, readLine };
