'use strict';
/**
 * BUILTINS: the standard library that is always available.
 *
 *   len  range  str  int  float  type  abs  min  max  sum  round  sorted  reverse
 *   push  pop  keys  values  has
 *   upper  lower  strip  split  join  replace
 *   floor  ceil  sqrt  randint  random  pi
 *
 * Errors thrown here carry no line number; the interpreter adds the position
 * of the call when it catches them.
 */
const { BhaiError } = require('./lexer');
const { Environment } = require('./environment');
const V = require('./values');

const { BuiltinFunction, typeName, valuesEqual, compare } = V;

const fail = (msg) => { throw new BhaiError(msg); };

function needNumber(v, fname) {
  if (typeof v !== 'number') fail(`${fname}() ko number chahiye, mila ${typeName(v)}`);
  return v;
}
function needInt(v, fname) {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${fname}() ko poora number chahiye, mila ${V.repr(v)}`);
  return v;
}
function needString(v, fname) {
  if (typeof v !== 'string') fail(`${fname}() ko string chahiye, mila ${typeName(v)}`);
  return v;
}
function needList(v, fname) {
  if (!Array.isArray(v)) fail(`${fname}() ko list chahiye, mila ${typeName(v)}`);
  return v;
}
function needDict(v, fname) {
  if (!(v instanceof Map)) fail(`${fname}() ko dict chahiye, mila ${typeName(v)}`);
  return v;
}

// Python rounds halves to the nearest EVEN number: round(2.5) is 2, round(3.5) is 4.
function roundHalfEven(x) {
  const r = Math.round(x);
  return (Math.abs(x % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r;
}

function install(env) {
  const def = (name, minArgs, maxArgs, fn) => env.define(name, new BuiltinFunction(name, minArgs, maxArgs, fn));

  // ---- basics ----
  def('len', 1, 1, ([x]) => {
    if (typeof x === 'string') return V.strLen(x);
    if (Array.isArray(x)) return x.length;
    if (x instanceof Map) return x.size;
    return fail(`len() ${typeName(x)} pe nahi chalta (string, list ya dict do)`);
  });

  // range(stop)  range(start, stop)  range(start, stop, step)  -> list of numbers
  def('range', 1, 3, (a) => {
    a.forEach((x) => needInt(x, 'range'));
    let start = 0, stop, step = 1;
    if (a.length === 1) { stop = a[0]; } else { start = a[0]; stop = a[1]; if (a.length === 3) step = a[2]; }
    if (step === 0) fail('range ka step 0 nahi ho sakta');
    const count = Math.max(0, Math.ceil((stop - start) / step));
    if (count > 10000000) fail('range bahut bada hai (maximum 1 crore numbers)');
    const out = new Array(count);
    for (let i = 0; i < count; i++) out[i] = start + i * step;
    return out;
  });

  def('str', 1, 1, ([x]) => V.stringify(x));
  def('type', 1, 1, ([x]) => typeName(x));

  def('int', 1, 1, ([x]) => {
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) fail('int() inf ya nan ko number nahi bana sakta');
      return Math.trunc(x);
    }
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (typeof x === 'string') {
      if (!/^\s*[+-]?\d+\s*$/.test(x)) fail(`int() ${JSON.stringify(x)} ko poora number nahi bana sakta`);
      return parseInt(x.trim(), 10);
    }
    return fail(`int() ${typeName(x)} ko number nahi bana sakta`);
  });

  def('float', 1, 1, ([x]) => {
    if (typeof x === 'number') return x;
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (typeof x === 'string') {
      if (!/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(x)) {
        fail(`float() ${JSON.stringify(x)} ko number nahi bana sakta`);
      }
      return Number(x.trim());
    }
    return fail(`float() ${typeName(x)} ko number nahi bana sakta`);
  });

  // ---- math ----
  def('abs', 1, 1, ([x]) => Math.abs(needNumber(x, 'abs')));
  def('floor', 1, 1, ([x]) => Math.floor(needNumber(x, 'floor')));
  def('ceil', 1, 1, ([x]) => Math.ceil(needNumber(x, 'ceil')));
  def('sqrt', 1, 1, ([x]) => {
    if (needNumber(x, 'sqrt') < 0) fail('Negative number ka sqrt nahi nikal sakte');
    return Math.sqrt(x);
  });
  def('round', 1, 2, ([x, digits]) => {
    needNumber(x, 'round');
    if (digits === undefined) return roundHalfEven(x);
    needInt(digits, 'round');
    return digits >= 0 ? Number(x.toFixed(Math.min(digits, 100))) : roundHalfEven(x / 10 ** -digits) * 10 ** -digits;
  });
  def('randint', 2, 2, ([a, b]) => {
    needInt(a, 'randint'); needInt(b, 'randint');
    if (a > b) fail('randint(a, b) mein a, b se bada nahi hona chahiye');
    return a + Math.floor(Math.random() * (b - a + 1));
  });
  def('random', 0, 0, () => Math.random());
  env.define('pi', Math.PI);

  // min(list)  or  min(a, b, c ...)  -- same for max
  const extreme = (name, pick) => def(name, 1, Infinity, (a) => {
    const items = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
    if (items.length === 0) fail(`${name}() ko kam se kam ek value chahiye`);
    return items.reduce((best, x) => (pick(compare(x, best)) ? x : best));
  });
  extreme('min', (c) => c < 0);
  extreme('max', (c) => c > 0);

  def('sum', 1, 1, ([xs]) => {
    needList(xs, 'sum');
    return xs.reduce((total, x) => total + needNumber(x, 'sum'), 0);
  });

  // ---- lists ----
  def('sorted', 1, 1, ([x]) => {
    const items = typeof x === 'string' ? V.chars(x) : needList(x, 'sorted').slice();
    return items.sort(compare);
  });
  def('reverse', 1, 1, ([x]) => {
    if (typeof x === 'string') return V.chars(x).reverse().join('');
    return needList(x, 'reverse').slice().reverse();
  });
  def('push', 2, 2, ([xs, x]) => { needList(xs, 'push').push(x); return null; });
  def('pop', 1, 2, ([xs, idx]) => {
    needList(xs, 'pop');
    if (xs.length === 0) fail('Khali list se pop nahi kar sakte');
    let i = idx === undefined ? xs.length - 1 : needInt(idx, 'pop');
    if (i < 0) i += xs.length;
    if (i < 0 || i >= xs.length) fail(`pop ka index ${idx} range ke bahar hai (length ${xs.length})`);
    return xs.splice(i, 1)[0];
  });

  // ---- dicts and membership ----
  def('keys', 1, 1, ([d]) => [...needDict(d, 'keys').keys()]);
  def('values', 1, 1, ([d]) => [...needDict(d, 'values').values()]);
  // has(container, x): is x inside the list / substring of the string / key of the dict?
  def('has', 2, 2, ([c, x]) => {
    if (Array.isArray(c)) return c.some((item) => valuesEqual(item, x));
    if (typeof c === 'string') {
      if (typeof x !== 'string') fail(`string mein sirf string dhundh sakte, mila ${typeName(x)}`);
      return c.includes(x);
    }
    if (c instanceof Map) return c.has(x);
    return fail(`has() ${typeName(c)} pe nahi chalta (list, string ya dict do)`);
  });

  // ---- strings ----
  def('upper', 1, 1, ([s]) => needString(s, 'upper').toUpperCase());
  def('lower', 1, 1, ([s]) => needString(s, 'lower').toLowerCase());
  def('strip', 1, 1, ([s]) => needString(s, 'strip').trim());
  def('split', 1, 2, ([s, sep]) => {
    needString(s, 'split');
    if (sep === undefined) {
      const t = s.trim();
      return t === '' ? [] : t.split(/\s+/);
    }
    needString(sep, 'split');
    if (sep === '') fail('split ka separator khali nahi ho sakta');
    return s.split(sep);
  });
  def('join', 1, 2, ([xs, sep = '']) => {
    needList(xs, 'join');
    needString(sep, 'join');
    if (!xs.every((x) => typeof x === 'string')) fail('join() sirf strings ki list jod sakta hai (numbers ke liye pehle str() use karo)');
    return xs.join(sep);
  });
  def('replace', 3, 3, ([s, from, to]) => {
    needString(s, 'replace'); needString(from, 'replace'); needString(to, 'replace');
    if (from === '') fail('replace mein dhundhne wala text khali nahi ho sakta');
    return s.split(from).join(to);
  });
}

// A fresh global scope: a read-only layer of built-ins with an empty
// user scope on top, which is where program variables live.
function createGlobalEnv() {
  const base = new Environment(null, true);
  install(base);
  return new Environment(base);
}

module.exports = { createGlobalEnv };
