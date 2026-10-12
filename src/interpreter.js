'use strict';
/**
 * INTERPRETER: walks the AST recursively and executes it.
 *
 *   execute(stmt)   runs a statement. It returns undefined normally, or a
 *                   "signal" object when the statement was ruk / aage badh /
 *                   wapas do, so loops and function calls can react to it.
 *   evaluate(expr)  computes the value of an expression.
 */
const { T, BhaiError } = require('./lexer');
const { Environment } = require('./environment');
const { createGlobalEnv } = require('./builtins');
const io = require('./io');
const V = require('./values');

const { BhaiFunction, BuiltinFunction, isTruthy, typeName, repr, stringify, valuesEqual } = V;

const BREAK = { kind: 'break' };
const CONTINUE = { kind: 'continue' };

// How many bhailang function calls may be nested before we stop the program.
const MAX_CALL_DEPTH = 400;
// Safety limit for "string * n" and "list * n" so a typo cannot eat all memory.
const MAX_REPEAT_LENGTH = 10000000;

const fail = (node, message) => { throw new BhaiError(message, node.line, node.col); };

// Dict keys must be simple values.
function checkKey(key, node) {
  const t = typeof key;
  if (t !== 'string' && t !== 'number' && t !== 'boolean') {
    fail(node, `Dict ki key string, number ya bool honi chahiye, mila ${typeName(key)}`);
  }
}

// Turn a (possibly negative) index into a real position, or fail with a friendly message.
function resolveIndex(idx, length, node) {
  if (typeof idx !== 'number' || !Number.isInteger(idx)) {
    fail(node, `Index poora number hona chahiye, mila ${typeName(idx)}`);
  }
  const i = idx < 0 ? idx + length : idx;
  if (i < 0 || i >= length) fail(node, `Index ${idx} range ke bahar hai (length ${length})`);
  return i;
}

function getIndex(obj, idx, node) {
  if (Array.isArray(obj)) return obj[resolveIndex(idx, obj.length, node)];
  if (typeof obj === 'string') return V.strAt(obj, resolveIndex(idx, V.strLen(obj), node));
  if (obj instanceof Map) {
    checkKey(idx, node);
    if (!obj.has(idx)) fail(node, `Key ${repr(idx)} dict mein nahi mili`);
    return obj.get(idx);
  }
  return fail(node, `${typeName(obj)} mein [ ] se index nahi lag sakta`);
}

function setIndex(obj, idx, value, node) {
  if (Array.isArray(obj)) { obj[resolveIndex(idx, obj.length, node)] = value; return; }
  if (obj instanceof Map) { checkKey(idx, node); obj.set(idx, value); return; }
  if (typeof obj === 'string') fail(node, 'Strings badli nahi ja sakti (nayi string banao)');
  fail(node, `${typeName(obj)} mein [ ] se value set nahi ho sakti`);
}

// "abc" * 3, [1, 2] * 2
function repeat(seq, count, node) {
  if (!Number.isInteger(count)) fail(node, 'Repeat karne ke liye poora number chahiye');
  const n = Math.max(0, count);
  if (seq.length * n > MAX_REPEAT_LENGTH) fail(node, 'Result bahut bada ho jayega, chhota number do');
  if (typeof seq === 'string') return seq.repeat(n);
  let out = [];
  for (let k = 0; k < n; k++) out = out.concat(seq);
  return out;
}

function applyBinary(op, l, r, node) {
  const bothNumbers = typeof l === 'number' && typeof r === 'number';
  switch (op) {
    case T.PLUS:
      if (bothNumbers) return l + r;
      if (typeof l === 'string' && typeof r === 'string') return l + r;
      if (Array.isArray(l) && Array.isArray(r)) return l.concat(r);
      if ((typeof l === 'string' && typeof r === 'number') || (typeof l === 'number' && typeof r === 'string')) {
        fail(node, "String aur number ko '+' se jod nahi sakte (number ko string banane ke liye str() use karo)");
      }
      return fail(node, `${typeName(l)} aur ${typeName(r)} ko '+' se jod nahi sakte`);

    case T.MINUS:
      if (bothNumbers) return l - r;
      return fail(node, `${typeName(l)} aur ${typeName(r)} ko '-' se ghata nahi sakte`);

    case T.STAR:
      if (bothNumbers) return l * r;
      if ((typeof l === 'string' || Array.isArray(l)) && typeof r === 'number') return repeat(l, r, node);
      if (typeof l === 'number' && (typeof r === 'string' || Array.isArray(r))) return repeat(r, l, node);
      return fail(node, `${typeName(l)} aur ${typeName(r)} ko '*' se guna nahi kar sakte`);

    case T.SLASH:
      if (!bothNumbers) fail(node, `${typeName(l)} aur ${typeName(r)} ko '/' se bhaag nahi de sakte`);
      if (r === 0) fail(node, 'Zero se divide? Mathematics ro padega bhai!');
      return l / r;

    case T.PERCENT:
      if (!bothNumbers) fail(node, `${typeName(l)} aur ${typeName(r)} pe '%' nahi chalta`);
      if (r === 0) fail(node, 'Zero se modulo? Mathematics ro padega bhai!');
      return ((l % r) + r) % r; // result takes the sign of the right side, like Python

    case T.POW:
      if (bothNumbers) return Math.pow(l, r);
      return fail(node, `${typeName(l)} aur ${typeName(r)} pe '**' nahi chalta`);

    case T.EQEQ: return valuesEqual(l, r);
    case T.NEQ: return !valuesEqual(l, r);

    case T.LT: case T.GT: case T.LTE: case T.GTE: {
      const comparable = bothNumbers || (typeof l === 'string' && typeof r === 'string');
      if (!comparable) fail(node, `${typeName(l)} aur ${typeName(r)} ko compare nahi kar sakte`);
      if (op === T.LT) return l < r;
      if (op === T.GT) return l > r;
      if (op === T.LTE) return l <= r;
      return l >= r;
    }

    default:
      return fail(node, `Unknown operator ${op}`);
  }
}

class Interpreter {
  /**
   * @param {Environment} [env]       scope to run in (default: a fresh global scope)
   * @param {object} [options]
   * @param {(line: string) => void} [options.out]       where `bhai bol` prints a line
   * @param {(text: string) => void} [options.write]     where `bhai sun` prompts are written
   * @param {() => (string|null)}    [options.readLine]  where `bhai sun` reads from
   */
  constructor(env, options = {}) {
    this.env = env || createGlobalEnv();
    this.out = options.out || io.writeLine;
    this.write = options.write || io.write;
    this.readLine = options.readLine || io.readLine;
    this.depth = 0; // current function-call nesting
  }

  // Run a whole Program. Returns the value of the last statement if it was a
  // bare expression (the REPL uses this to echo results), else undefined.
  run(program) {
    let last;
    for (const stmt of program.body) {
      if (stmt.type === 'ExprStmt') {
        last = this.evaluate(stmt.expr);
      } else {
        this.execute(stmt);
        last = undefined;
      }
    }
    return last;
  }

  // Run a list of statements inside the given scope, then switch back.
  // Returns a signal (break / continue / return) if one happened.
  execStatements(statements, env) {
    const outer = this.env;
    this.env = env;
    try {
      for (const stmt of statements) {
        const signal = this.execute(stmt);
        if (signal) return signal;
      }
    } finally {
      this.env = outer;
    }
    return undefined;
  }

  // ===== statements =====
  execute(node) {
    switch (node.type) {
      case 'VarDecl': {
        const value = this.evaluate(node.init);
        this.env.define(node.name, value, node.line, node.col);
        return undefined;
      }

      case 'Assign':
        this.executeAssign(node);
        return undefined;

      case 'Print':
        this.out(node.args.map((a) => stringify(this.evaluate(a))).join(' '));
        return undefined;

      case 'ExprStmt':
        this.evaluate(node.expr);
        return undefined;

      case 'If': {
        if (isTruthy(this.evaluate(node.cond))) {
          return this.execStatements(node.then.body, new Environment(this.env));
        }
        if (node.otherwise) {
          // `warna agar ...` is an If node; a plain `warna { }` is a Block node.
          return node.otherwise.type === 'If'
            ? this.execute(node.otherwise)
            : this.execStatements(node.otherwise.body, new Environment(this.env));
        }
        return undefined;
      }

      case 'While':
        while (isTruthy(this.evaluate(node.cond))) {
          const signal = this.execStatements(node.body.body, new Environment(this.env));
          if (signal) {
            if (signal.kind === 'break') break;
            if (signal.kind === 'continue') continue;
            return signal; // a `wapas do` inside the loop
          }
        }
        return undefined;

      case 'For':
        return this.executeFor(node);

      case 'FuncDecl': {
        const fn = new BhaiFunction(node.name, node.params, node.body, this.env);
        // Re-defining a function (handy in the REPL) is allowed; clobbering a variable is not.
        if (this.env.hasOwn(node.name) && this.env.vars.get(node.name) instanceof BhaiFunction) {
          this.env.vars.set(node.name, fn);
        } else {
          this.env.define(node.name, fn, node.line, node.col);
        }
        return undefined;
      }

      case 'Return':
        return { kind: 'return', value: node.value ? this.evaluate(node.value) : null };

      case 'Break': return BREAK;
      case 'Continue': return CONTINUE;

      default:
        return fail(node, `Unknown statement type: ${node.type}`);
    }
  }

  // x = 1;  x += 2;  xs[0] = 5;  xs[i] *= 2;
  executeAssign(node) {
    const { target, op } = node;

    if (target.type === 'Identifier') {
      let value = this.evaluate(node.value);
      if (op) {
        const current = this.env.get(target.name, target.line, target.col);
        value = applyBinary(op, current, value, node);
      }
      this.env.assign(target.name, value, target.line, target.col);
      return;
    }

    // Index target: evaluate the container and the index exactly once.
    const container = this.evaluate(target.object);
    const index = this.evaluate(target.index);
    let value = this.evaluate(node.value);
    if (op) value = applyBinary(op, getIndex(container, index, target), value, node);
    setIndex(container, index, value, target);
  }

  // har x mein <list | string | dict> { ... }
  executeFor(node) {
    const iterable = this.evaluate(node.iterable);
    let items;
    if (Array.isArray(iterable)) items = iterable;              // walks the live list
    else if (typeof iterable === 'string') items = V.chars(iterable);
    else if (iterable instanceof Map) items = [...iterable.keys()];
    else return fail(node.iterable, `${typeName(iterable)} pe 'har' loop nahi chalta (list, string, dict ya range() do)`);

    for (let i = 0; i < items.length; i++) {
      // a fresh scope per iteration, holding the loop variable
      const scope = new Environment(this.env);
      scope.define(node.varName, items[i]);
      const signal = this.execStatements(node.body.body, scope);
      if (signal) {
        if (signal.kind === 'break') break;
        if (signal.kind === 'continue') continue;
        return signal;
      }
    }
    return undefined;
  }

  // ===== expressions =====
  evaluate(node) {
    switch (node.type) {
      case 'Number':
      case 'String':
      case 'Bool':
        return node.value;

      case 'Null':
        return null;

      case 'Identifier':
        return this.env.get(node.name, node.line, node.col);

      case 'List':
        return node.items.map((item) => this.evaluate(item));

      case 'Dict': {
        const dict = new Map();
        for (const pair of node.pairs) {
          const key = this.evaluate(pair.key);
          checkKey(key, pair.key);
          dict.set(key, this.evaluate(pair.value));
        }
        return dict;
      }

      case 'Unary': {
        const v = this.evaluate(node.operand);
        if (typeof v !== 'number') fail(node, `'-' sirf number ke saath chalta hai, mila ${typeName(v)}`);
        return -v;
      }

      case 'Not':
        return !isTruthy(this.evaluate(node.operand));

      // `aur` / `ya` short-circuit and return one of the operands, like Python.
      case 'Logical': {
        const left = this.evaluate(node.left);
        if (node.op === 'ya') return isTruthy(left) ? left : this.evaluate(node.right);
        return isTruthy(left) ? this.evaluate(node.right) : left;
      }

      case 'Binary': {
        const l = this.evaluate(node.left);
        const r = this.evaluate(node.right);
        return applyBinary(node.op, l, r, node);
      }

      case 'Index':
        return getIndex(this.evaluate(node.object), this.evaluate(node.index), node);

      case 'Call': {
        const callee = this.evaluate(node.callee);
        const args = node.args.map((a) => this.evaluate(a));
        return this.callFunction(callee, args, node);
      }

      case 'Input': {
        if (node.prompt) this.write(stringify(this.evaluate(node.prompt)));
        const line = this.readLine();
        if (line === null) fail(node, 'Input khatam ho gaya, bhai sun() ko padhne ke liye kuch mila hi nahi');
        return line;
      }

      default:
        return fail(node, `Unknown expression type: ${node.type}`);
    }
  }

  callFunction(fn, args, node) {
    if (fn instanceof BuiltinFunction) {
      if (args.length < fn.minArgs || args.length > fn.maxArgs) {
        const want = fn.minArgs === fn.maxArgs ? `${fn.minArgs}` : `${fn.minArgs} se ${fn.maxArgs === Infinity ? 'zyada' : fn.maxArgs}`;
        fail(node, `${fn.name}() ko ${want} argument chahiye, ${args.length} mile`);
      }
      try {
        return fn.fn(args);
      } catch (e) {
        // builtins throw errors without a position; pin them to this call
        if (e instanceof BhaiError && e.line === undefined) { e.line = node.line; e.col = node.col; }
        throw e;
      }
    }

    if (fn instanceof BhaiFunction) {
      if (args.length !== fn.params.length) {
        fail(node, `kaam '${fn.name}' ko ${fn.params.length} argument chahiye, ${args.length} mile`);
      }
      if (this.depth >= MAX_CALL_DEPTH) {
        fail(node, `Recursion bahut gehra ho gaya (${MAX_CALL_DEPTH} calls). Kahin infinite recursion toh nahi?`);
      }
      const scope = new Environment(fn.closure);
      fn.params.forEach((name, i) => scope.define(name, args[i]));
      this.depth++;
      let signal;
      try {
        signal = this.execStatements(fn.body.body, scope);
      } finally {
        this.depth--;
      }
      return signal && signal.kind === 'return' ? signal.value : null;
    }

    return fail(node, `${typeName(fn)} ko function ki tarah call nahi kar sakte`);
  }
}

module.exports = { Interpreter };
