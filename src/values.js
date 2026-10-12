'use strict';
/**
 * VALUES: how bhailang values look inside JavaScript, plus helpers for them.
 *
 *   bhailang   JavaScript
 *   --------   ----------------------------
 *   number     number
 *   string     string
 *   sahi/galat boolean
 *   khali      null
 *   list       Array
 *   dict       Map   (keys: string, number or bool)
 *   kaam       BhaiFunction  (user-defined)  /  BuiltinFunction (len, range, ...)
 */
const { BhaiError } = require('./lexer');

// A function written in bhailang. `closure` is the scope it was defined in,
// which is what makes closures work.
class BhaiFunction {
  constructor(name, params, body, closure) {
    this.name = name;
    this.params = params;
    this.body = body;
    this.closure = closure;
  }
}

// A function implemented in JavaScript (len, range, ...).
class BuiltinFunction {
  constructor(name, minArgs, maxArgs, fn) {
    this.name = name;
    this.minArgs = minArgs;
    this.maxArgs = maxArgs;
    this.fn = fn;
  }
}

const isFunction = (v) => v instanceof BhaiFunction || v instanceof BuiltinFunction;

// Python-style truthiness: galat, khali, 0, "", [] and {} are all false.
function isTruthy(v) {
  if (v === null || v === false) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map) return v.size > 0;
  return true;
}

function typeName(v) {
  if (v === null) return 'khali';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (Array.isArray(v)) return 'list';
  if (v instanceof Map) return 'dict';
  if (isFunction(v)) return 'function';
  return 'unknown';
}

function formatNumber(n) {
  if (Number.isNaN(n)) return 'nan';
  if (n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';
  return String(n);
}

// repr: the "code-like" form. Strings keep their quotes: "hi"
function repr(v, seen = new Set()) {
  if (v === null) return 'khali';
  if (v === true) return 'sahi';
  if (v === false) return 'galat';
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (seen.has(v)) return '[...]'; // a list that contains itself
    seen.add(v);
    const text = '[' + v.map((x) => repr(x, seen)).join(', ') + ']';
    seen.delete(v);
    return text;
  }
  if (v instanceof Map) {
    if (seen.has(v)) return '{...}';
    seen.add(v);
    const text = '{' + [...v].map(([k, x]) => repr(k, seen) + ': ' + repr(x, seen)).join(', ') + '}';
    seen.delete(v);
    return text;
  }
  if (v instanceof BhaiFunction) return `<kaam ${v.name}>`;
  if (v instanceof BuiltinFunction) return `<builtin ${v.name}>`;
  return String(v);
}

// stringify: what `bhai bol` shows. Same as repr, except a bare string has no quotes.
function stringify(v) {
  return typeof v === 'string' ? v : repr(v);
}

// Deep equality, like Python's ==.
function valuesEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => valuesEqual(x, b[i]));
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k) || !valuesEqual(v, b.get(k))) return false;
    }
    return true;
  }
  return false;
}

// -1 / 0 / 1 ordering for sorted(), min() and max(). Only number-number or string-string.
function compare(a, b) {
  const both = (typeof a === 'number' && typeof b === 'number') ||
               (typeof a === 'string' && typeof b === 'string');
  if (!both) throw new BhaiError(`${typeName(a)} aur ${typeName(b)} ko compare nahi kar sakte`);
  return a < b ? -1 : a > b ? 1 : 0;
}

// Strings are counted in real characters, so an emoji is length 1, not 2.
const HAS_SURROGATE = /[\uD800-\uDFFF]/;
const chars = (s) => Array.from(s);
const strLen = (s) => (HAS_SURROGATE.test(s) ? chars(s).length : s.length);
const strAt = (s, i) => (HAS_SURROGATE.test(s) ? chars(s)[i] : s[i]);

module.exports = {
  BhaiFunction, BuiltinFunction, isFunction,
  isTruthy, typeName, repr, stringify, valuesEqual, compare, formatNumber,
  chars, strLen, strAt,
};
