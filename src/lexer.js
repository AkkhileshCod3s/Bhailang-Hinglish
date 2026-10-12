'use strict';
/**
 * LEXER: turns raw source text into a flat list of tokens.
 *
 * Multi-word keywords ("bhai ye hai", "bhai bol", "kaam banao", ...) become
 * ONE token each, no matter how much whitespace sits between the words.
 */

// Error type shared by every stage; carries line/column for friendly messages.
class BhaiError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'BhaiError';
    this.line = line;
    this.col = col;
  }
}

// Token type constants. Operator/punctuation types are the lexeme itself.
const T = {
  // multi-word keywords
  LET: 'LET',           // bhai ye hai   (declare a variable)
  PRINT: 'PRINT',       // bhai bol      (print)
  INPUT: 'INPUT',       // bhai sun      (read a line from the keyboard)
  FUNC: 'FUNC',         // kaam banao    (define a function)
  RETURN: 'RETURN',     // wapas do      (return from a function)
  CONTINUE: 'CONTINUE', // aage badh     (next loop iteration)
  // single-word keywords
  IF: 'IF',             // agar
  ELSE: 'ELSE',         // warna
  WHILE: 'WHILE',       // jabtak
  FOR: 'FOR',           // har
  IN: 'IN',             // mein
  BREAK: 'BREAK',       // ruk
  TRUE: 'TRUE',         // sahi
  FALSE: 'FALSE',       // galat
  NULL: 'NULL',         // khali
  AND: 'AND',           // aur
  OR: 'OR',             // ya
  NOT: 'NOT',           // nahi
  // literals and names
  IDENT: 'IDENT',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  // assignment operators
  EQ: '=', PLUS_EQ: '+=', MINUS_EQ: '-=', STAR_EQ: '*=', SLASH_EQ: '/=', PERCENT_EQ: '%=',
  // comparison operators
  EQEQ: '==', NEQ: '!=', LT: '<', GT: '>', LTE: '<=', GTE: '>=',
  // arithmetic operators
  PLUS: '+', MINUS: '-', STAR: '*', SLASH: '/', PERCENT: '%', POW: '**',
  // punctuation
  LPAREN: '(', RPAREN: ')', LBRACE: '{', RBRACE: '}', LBRACKET: '[', RBRACKET: ']',
  COMMA: ',', COLON: ':', SEMI: ';',
  EOF: 'EOF',
};

// Multi-word keywords. These are sticky regexes (flag y), so they only match
// exactly at a given position. The negative lookahead stops "bhai bolna" from
// being read as "bhai bol" + "na".
const MULTI_WORD = [
  { re: /bhai\s+ye\s+hai(?![A-Za-z0-9_])/y, type: T.LET },
  { re: /bhai\s+bol(?![A-Za-z0-9_])/y, type: T.PRINT },
  { re: /bhai\s+sun(?![A-Za-z0-9_])/y, type: T.INPUT },
  { re: /kaam\s+banao(?![A-Za-z0-9_])/y, type: T.FUNC },
  { re: /wapas\s+do(?![A-Za-z0-9_])/y, type: T.RETURN },
  { re: /aage\s+badh(?![A-Za-z0-9_])/y, type: T.CONTINUE },
];

// Single-word keywords. An identifier is looked up here after it is read in full.
const WORDS = {
  agar: T.IF, warna: T.ELSE, jabtak: T.WHILE, har: T.FOR, mein: T.IN, ruk: T.BREAK,
  sahi: T.TRUE, galat: T.FALSE, khali: T.NULL,
  aur: T.AND, ya: T.OR, nahi: T.NOT,
};

const TWO_CHAR = new Set(['==', '!=', '<=', '>=', '**', '+=', '-=', '*=', '/=', '%=']);
const ONE_CHAR = new Set(['=', '<', '>', '+', '-', '*', '/', '%', '(', ')', '{', '}', '[', ']', ',', ':', ';']);

const ESCAPES = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'" };

const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => /[A-Za-z_]/.test(c);
const isIdentPart = (c) => /[A-Za-z0-9_]/.test(c);

/**
 * @param {string} src        source code
 * @param {number} startLine  first line number (the REPL passes a running counter)
 */
function tokenize(src, startLine = 1) {
  const tokens = [];
  let i = 0, line = startLine, col = 1;

  // Move forward n characters while tracking line/column.
  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; } else { col++; }
      i++;
    }
  };
  const push = (type, value, l, c) => tokens.push({ type, value, line: l, col: c });

  while (i < src.length) {
    const ch = src[i];

    // Whitespace (also covers \r from Windows line endings and a leading BOM)
    if (/\s/.test(ch) || ch === '﻿') { advance(); continue; }

    // Comments: // till end of line
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') advance();
      continue;
    }

    const startL = line, startC = col;

    // Strings: "..." or '...' with \n \t \\ \" escapes. They must end on the same line.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      advance();
      let text = '';
      for (;;) {
        if (i >= src.length || src[i] === '\n') {
          throw new BhaiError('String khatam nahi hui, closing quote lagana bhool gaya', startL, startC);
        }
        const c = src[i];
        if (c === quote) { advance(); break; }
        if (c === '\\') {
          advance();
          const e = src[i];
          if (e === undefined || e === '\n') {
            throw new BhaiError('String khatam nahi hui, closing quote lagana bhool gaya', startL, startC);
          }
          if (!Object.prototype.hasOwnProperty.call(ESCAPES, e)) {
            throw new BhaiError(`Galat escape '\\${e}' (chalte hain: \\n \\t \\r \\0 \\\\ \\" \\')`, line, col);
          }
          text += ESCAPES[e];
          advance();
          continue;
        }
        text += c;
        advance();
      }
      push(T.STRING, text, startL, startC);
      continue;
    }

    // Numbers: 42, 3.14, .5
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1] || ''))) {
      let text = '';
      while (i < src.length && isDigit(src[i])) { text += src[i]; advance(); }
      if (src[i] === '.' && isDigit(src[i + 1] || '')) {
        text += '.'; advance();
        while (i < src.length && isDigit(src[i])) { text += src[i]; advance(); }
      }
      push(T.NUMBER, parseFloat(text), startL, startC);
      continue;
    }

    // Keywords and identifiers
    if (isIdentStart(ch)) {
      // 1) multi-word keywords first ("bhai ye hai", "kaam banao", ...)
      let matched = false;
      for (const kw of MULTI_WORD) {
        kw.re.lastIndex = i;
        const m = kw.re.exec(src);
        if (m) {
          push(kw.type, m[0], startL, startC);
          advance(m[0].length);
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 2) read the whole word, then check whether it is a keyword
      let text = '';
      while (i < src.length && isIdentPart(src[i])) { text += src[i]; advance(); }
      const kwType = Object.prototype.hasOwnProperty.call(WORDS, text) ? WORDS[text] : T.IDENT;
      push(kwType, text, startL, startC);
      continue;
    }

    // Operators and punctuation (two-character ones first: == != <= >= ** += ...)
    const two = src.slice(i, i + 2);
    if (TWO_CHAR.has(two)) {
      push(two, two, startL, startC);
      advance(2);
      continue;
    }
    if (ONE_CHAR.has(ch)) {
      push(ch, ch, startL, startC);
      advance();
      continue;
    }
    if (ch === '!') {
      throw new BhaiError("'!' akela nahi chalta. 'nahi' likho, ya '!=' use karo", startL, startC);
    }

    throw new BhaiError(`Ye kya bakchodi hai? Unknown character '${ch}'`, startL, startC);
  }

  tokens.push({ type: T.EOF, value: null, line, col });
  return tokens;
}

module.exports = { tokenize, T, BhaiError };
