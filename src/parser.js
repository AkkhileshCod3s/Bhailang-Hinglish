'use strict';
/**
 * PARSER: recursive descent, builds an AST from the token list.
 *
 * Statements
 *   program    -> statement* EOF
 *   statement  -> 'bhai ye hai' IDENT ( '=' expression )? ';'
 *               | 'bhai bol' ( expression ( ',' expression )* )? ';'
 *               | 'agar' expression block ( 'warna' ( ifStmt | block ) )?
 *               | 'jabtak' expression block
 *               | 'har' IDENT 'mein' expression block
 *               | 'kaam banao' IDENT '(' params ')' block
 *               | 'wapas do' expression? ';'
 *               | 'ruk' ';'  |  'aage badh' ';'
 *               | target ( '=' | '+=' | '-=' | '*=' | '/=' | '%=' ) expression ';'
 *               | expression ';'
 *   block      -> '{' statement* '}'
 *
 * Expressions (lowest to highest precedence)
 *   or         -> and ( 'ya' and )*
 *   and        -> not ( 'aur' not )*
 *   not        -> 'nahi' not | comparison
 *   comparison -> additive ( ('==' | '!=' | '<' | '>' | '<=' | '>=') additive )*
 *   additive   -> multiplicative ( ('+' | '-') multiplicative )*
 *   multiplicative -> unary ( ('*' | '/' | '%') unary )*
 *   unary      -> '-' unary | power
 *   power      -> postfix ( '**' unary )?          (right associative)
 *   postfix    -> primary ( '(' args ')' | '[' expression ']' )*
 *   primary    -> NUMBER | STRING | 'sahi' | 'galat' | 'khali' | IDENT
 *               | '(' expression ')' | '[' items ']' | '{' pairs '}'
 *               | 'bhai sun' '(' expression? ')'
 *
 * Each grammar level is one method, so tighter operators bind first.
 * A missing ';' is tolerated right before '}' and at the very end of input
 * (handy for the REPL).
 */
const { T, BhaiError } = require('./lexer');

const ASSIGN_OPS = new Set([T.EQ, T.PLUS_EQ, T.MINUS_EQ, T.STAR_EQ, T.SLASH_EQ, T.PERCENT_EQ]);

// Build an AST node that remembers where it came from (for error messages).
const node = (type, tok, props = {}) => ({ type, line: tok.line, col: tok.col, ...props });

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.loopDepth = 0; // > 0 while parsing inside a loop body (allows ruk / aage badh)
    this.funcDepth = 0; // > 0 while parsing inside a function body (allows wapas do)
  }

  // ----- token helpers -----
  peek() { return this.tokens[this.pos]; }
  advance() {
    const t = this.tokens[this.pos];
    if (t.type !== T.EOF) this.pos++; // never run past EOF
    return t;
  }
  check(type) { return this.peek().type === type; }
  match(type) { return this.check(type) ? this.advance() : null; }

  describe(t) {
    if (t.type === T.EOF) return 'code khatam';
    if (t.type === T.STRING) return JSON.stringify(t.value);
    return `'${t.value}'`;
  }

  fail(message, tok = this.peek()) {
    throw new BhaiError(message, tok.line, tok.col);
  }

  expect(type, message) {
    if (this.check(type)) return this.advance();
    const t = this.peek();
    this.fail(`${message} (mila: ${this.describe(t)})`, t);
  }

  // A simple statement ends with ';' (optional right before '}' or at EOF).
  endStatement() {
    if (this.check(T.EOF) || this.check(T.RBRACE)) return;
    this.expect(T.SEMI, "Bhai, statement ke end mein ';' lagana bhool gaya");
  }

  // True when the next token cannot start an expression (used for bare `wapas do;`).
  atStatementEnd() {
    return this.check(T.SEMI) || this.check(T.EOF) || this.check(T.RBRACE);
  }

  // ----- statements -----
  parseProgram() {
    const body = [];
    while (!this.check(T.EOF)) {
      if (this.match(T.SEMI)) continue; // skip empty statements
      if (this.check(T.RBRACE)) this.fail("Ye '}' fazool hai, koi block khula hi nahi tha");
      body.push(this.parseStatement());
    }
    return { type: 'Program', body };
  }

  // '{' statement* '}'
  parseBlock(message = "Block ke liye '{' chahiye") {
    const open = this.expect(T.LBRACE, message);
    const body = [];
    while (!this.check(T.RBRACE)) {
      if (this.check(T.EOF)) {
        this.fail(`'{' (line ${open.line}) khola tha par '}' se band karna bhool gaya`);
      }
      if (this.match(T.SEMI)) continue;
      body.push(this.parseStatement());
    }
    this.advance(); // '}'
    return node('Block', open, { body });
  }

  parseStatement() {
    const tok = this.peek();
    switch (tok.type) {
      case T.LET: return this.parseVarDecl();
      case T.PRINT: return this.parsePrint();
      case T.IF: return this.parseIf();
      case T.WHILE: return this.parseWhile();
      case T.FOR: return this.parseFor();
      case T.FUNC: return this.parseFunction();
      case T.RETURN: return this.parseReturn();
      case T.BREAK:
        if (this.loopDepth === 0) this.fail("'ruk' sirf loop (jabtak / har) ke andar chalta hai");
        this.advance();
        this.endStatement();
        return node('Break', tok);
      case T.CONTINUE:
        if (this.loopDepth === 0) this.fail("'aage badh' sirf loop (jabtak / har) ke andar chalta hai");
        this.advance();
        this.endStatement();
        return node('Continue', tok);
      default:
        return this.parseAssignOrExpression();
    }
  }

  // bhai ye hai <name> = <expr>;      (or just: bhai ye hai <name>;  -> khali)
  parseVarDecl() {
    const tok = this.advance(); // 'bhai ye hai'
    const name = this.expect(T.IDENT, "'bhai ye hai' ke baad variable ka naam chahiye");
    const init = this.match(T.EQ) ? this.parseExpression() : node('Null', name);
    this.endStatement();
    return node('VarDecl', tok, { name: name.value, init });
  }

  // bhai bol a, b, c;
  parsePrint() {
    const tok = this.advance(); // 'bhai bol'
    const args = [];
    if (!this.atStatementEnd()) {
      do { args.push(this.parseExpression()); } while (this.match(T.COMMA));
    }
    this.endStatement();
    return node('Print', tok, { args });
  }

  // agar <cond> { ... } warna agar <cond> { ... } warna { ... }
  parseIf() {
    const tok = this.advance(); // 'agar'
    const cond = this.parseExpression();
    const then = this.parseBlock("'agar' ki condition ke baad '{' chahiye");
    let otherwise = null;
    if (this.match(T.ELSE)) {
      otherwise = this.check(T.IF) ? this.parseIf() : this.parseBlock("'warna' ke baad '{' ya 'agar' chahiye");
    }
    return node('If', tok, { cond, then, otherwise });
  }

  // jabtak <cond> { ... }
  parseWhile() {
    const tok = this.advance(); // 'jabtak'
    const cond = this.parseExpression();
    this.loopDepth++;
    const body = this.parseBlock("'jabtak' ki condition ke baad '{' chahiye");
    this.loopDepth--;
    return node('While', tok, { cond, body });
  }

  // har <name> mein <iterable> { ... }
  parseFor() {
    const tok = this.advance(); // 'har'
    const name = this.expect(T.IDENT, "'har' ke baad loop variable ka naam chahiye");
    this.expect(T.IN, "Loop variable ke baad 'mein' chahiye (jaise: har i mein range(5) { ... })");
    const iterable = this.parseExpression();
    this.loopDepth++;
    const body = this.parseBlock("'har' loop ke baad '{' chahiye");
    this.loopDepth--;
    return node('For', tok, { varName: name.value, iterable, body });
  }

  // kaam banao <name>(a, b) { ... }
  parseFunction() {
    const tok = this.advance(); // 'kaam banao'
    const name = this.expect(T.IDENT, "'kaam banao' ke baad function ka naam chahiye");
    this.expect(T.LPAREN, "Function ke naam ke baad '(' chahiye");
    const params = [];
    if (!this.check(T.RPAREN)) {
      do {
        if (this.check(T.RPAREN)) break; // trailing comma
        const p = this.expect(T.IDENT, 'Parameter ka naam chahiye');
        if (params.includes(p.value)) this.fail(`Parameter '${p.value}' do baar likha hai`, p);
        params.push(p.value);
      } while (this.match(T.COMMA));
    }
    this.expect(T.RPAREN, "Parameters ke baad ')' chahiye");

    // A function body starts a fresh context: loops outside it don't count inside it.
    const savedLoop = this.loopDepth;
    this.loopDepth = 0;
    this.funcDepth++;
    const body = this.parseBlock("Function ke ')' ke baad '{' chahiye");
    this.funcDepth--;
    this.loopDepth = savedLoop;
    return node('FuncDecl', tok, { name: name.value, params, body });
  }

  // wapas do <expr>;
  parseReturn() {
    const tok = this.advance(); // 'wapas do'
    if (this.funcDepth === 0) this.fail("'wapas do' sirf kaam (function) ke andar chalta hai", tok);
    const value = this.atStatementEnd() ? null : this.parseExpression();
    this.endStatement();
    return node('Return', tok, { value });
  }

  // x = 1;   x += 1;   xs[0] = 5;   or a plain expression like  f(2);
  parseAssignOrExpression() {
    const tok = this.peek();
    const expr = this.parseExpression();
    if (ASSIGN_OPS.has(this.peek().type)) {
      const opTok = this.advance();
      if (expr.type !== 'Identifier' && expr.type !== 'Index') {
        this.fail("Assignment ke left side pe variable ya list/dict ka index chahiye", opTok);
      }
      const value = this.parseExpression();
      this.endStatement();
      // op is null for a plain '=', otherwise the arithmetic operator ('+' for '+=')
      return node('Assign', tok, { target: expr, op: opTok.type === T.EQ ? null : opTok.type[0], value });
    }
    this.endStatement();
    return node('ExprStmt', tok, { expr });
  }

  // ----- expressions -----
  parseExpression() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.check(T.OR)) {
      const op = this.advance();
      left = node('Logical', op, { op: 'ya', left, right: this.parseAnd() });
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.check(T.AND)) {
      const op = this.advance();
      left = node('Logical', op, { op: 'aur', left, right: this.parseNot() });
    }
    return left;
  }

  parseNot() {
    if (this.check(T.NOT)) {
      const op = this.advance();
      return node('Not', op, { operand: this.parseNot() });
    }
    return this.parseComparison();
  }

  // Generic left-associative binary level: operand ( op operand )*
  binaryLevel(parseOperand, ops) {
    let left = parseOperand();
    while (ops.includes(this.peek().type)) {
      const op = this.advance();
      left = node('Binary', op, { op: op.type, left, right: parseOperand() });
    }
    return left;
  }

  parseComparison() {
    return this.binaryLevel(() => this.parseAdditive(), [T.EQEQ, T.NEQ, T.LT, T.GT, T.LTE, T.GTE]);
  }

  parseAdditive() {
    return this.binaryLevel(() => this.parseMultiplicative(), [T.PLUS, T.MINUS]);
  }

  parseMultiplicative() {
    return this.binaryLevel(() => this.parseUnary(), [T.STAR, T.SLASH, T.PERCENT]);
  }

  parseUnary() {
    if (this.check(T.MINUS)) {
      const op = this.advance();
      return node('Unary', op, { op: '-', operand: this.parseUnary() });
    }
    return this.parsePower();
  }

  // 2 ** 3 ** 2 is 2 ** (3 ** 2), and -2 ** 2 is -(2 ** 2), like Python.
  parsePower() {
    const base = this.parsePostfix();
    if (this.check(T.POW)) {
      const op = this.advance();
      return node('Binary', op, { op: T.POW, left: base, right: this.parseUnary() });
    }
    return base;
  }

  // function calls f(x) and indexing xs[i], chained any number of times
  parsePostfix() {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.check(T.LPAREN)) {
        const open = this.advance();
        const args = [];
        if (!this.check(T.RPAREN)) {
          do {
            if (this.check(T.RPAREN)) break; // trailing comma
            args.push(this.parseExpression());
          } while (this.match(T.COMMA));
        }
        this.expect(T.RPAREN, "Function call mein ')' chahiye");
        // point error carets at the function name when we have one
        const where = expr.line ? expr : open;
        expr = node('Call', where, { callee: expr, args });
      } else if (this.check(T.LBRACKET)) {
        const open = this.advance();
        const index = this.parseExpression();
        this.expect(T.RBRACKET, "Index ke baad ']' chahiye");
        expr = node('Index', open, { object: expr, index });
      } else {
        return expr;
      }
    }
  }

  parsePrimary() {
    const tok = this.peek();
    switch (tok.type) {
      case T.NUMBER: this.advance(); return node('Number', tok, { value: tok.value });
      case T.STRING: this.advance(); return node('String', tok, { value: tok.value });
      case T.TRUE: this.advance(); return node('Bool', tok, { value: true });
      case T.FALSE: this.advance(); return node('Bool', tok, { value: false });
      case T.NULL: this.advance(); return node('Null', tok);
      case T.IDENT: this.advance(); return node('Identifier', tok, { name: tok.value });

      case T.LPAREN: {
        this.advance();
        const expr = this.parseExpression();
        this.expect(T.RPAREN, "Bracket band karna bhool gaya, ')' chahiye");
        return expr;
      }

      case T.LBRACKET: { // list literal
        this.advance();
        const items = [];
        if (!this.check(T.RBRACKET)) {
          do {
            if (this.check(T.RBRACKET)) break; // trailing comma
            items.push(this.parseExpression());
          } while (this.match(T.COMMA));
        }
        this.expect(T.RBRACKET, "List ke end mein ']' chahiye");
        return node('List', tok, { items });
      }

      case T.LBRACE: { // dict literal
        this.advance();
        const pairs = [];
        if (!this.check(T.RBRACE)) {
          do {
            if (this.check(T.RBRACE)) break; // trailing comma
            const key = this.parseExpression();
            this.expect(T.COLON, "Dict mein key ke baad ':' chahiye");
            pairs.push({ key, value: this.parseExpression() });
          } while (this.match(T.COMMA));
        }
        this.expect(T.RBRACE, "Dict ke end mein '}' chahiye");
        return node('Dict', tok, { pairs });
      }

      case T.INPUT: { // bhai sun("prompt")
        this.advance();
        this.expect(T.LPAREN, "'bhai sun' ke baad '(' chahiye, jaise: bhai sun(\"Naam? \")");
        const prompt = this.check(T.RPAREN) ? null : this.parseExpression();
        this.expect(T.RPAREN, "'bhai sun(' ke baad ')' chahiye");
        return node('Input', tok, { prompt });
      }

      default:
        this.fail(`Expression expected tha, par mila ${this.describe(tok)}`, tok);
    }
  }
}

function parse(tokens) {
  return new Parser(tokens).parseProgram();
}

module.exports = { parse, Parser };
