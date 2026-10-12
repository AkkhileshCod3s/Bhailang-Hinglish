'use strict';
/**
 * ENVIRONMENT: runtime memory for variables.
 * Each Environment has an optional parent, so nested scopes
 * (blocks and function calls) can see the variables around them.
 */
const { BhaiError } = require('./lexer');

class Environment {
  /**
   * @param {Environment|null} parent  the enclosing scope
   * @param {boolean} readonly         true for the built-ins scope: its names can
   *                                   be shadowed (bhai ye hai len = 3;) but not reassigned
   */
  constructor(parent = null, readonly = false) {
    this.vars = new Map();
    this.parent = parent;
    this.readonly = readonly;
  }

  // Does THIS scope (not the parents) already have the name?
  hasOwn(name) { return this.vars.has(name); }

  // Create a new variable in THIS scope.
  define(name, value, line, col) {
    if (this.vars.has(name)) {
      throw new BhaiError(`Bhai, '${name}' pehle se declare hai!`, line, col);
    }
    this.vars.set(name, value);
  }

  // Update an existing variable, searching outward through parent scopes.
  assign(name, value, line, col) {
    if (this.vars.has(name)) {
      if (this.readonly) {
        throw new BhaiError(
          `'${name}' built-in hai, ise badal nahi sakte (apna variable chahiye toh 'bhai ye hai ${name} = ...' likho)`,
          line, col);
      }
      this.vars.set(name, value);
      return;
    }
    if (this.parent) { this.parent.assign(name, value, line, col); return; }
    throw new BhaiError(`'${name}' ko pehle 'bhai ye hai' se declare kar bhai`, line, col);
  }

  // Read a variable, searching outward through parent scopes.
  get(name, line, col) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name, line, col);
    throw new BhaiError(`'${name}' kaun hai bhai? Variable defined nahi hai`, line, col);
  }
}

module.exports = { Environment };
