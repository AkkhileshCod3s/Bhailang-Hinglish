'use strict';
// Small dependency-free test suite. Run with: node test.js
const path = require('path');
const { spawnSync } = require('child_process');
const { tokenize, BhaiError } = require('./src/lexer');
const { parse } = require('./src/parser');
const { Interpreter } = require('./src/interpreter');

let passed = 0, failed = 0;
const section = (name) => console.log(`\n${name}`);

// Run a program. Returns { lines, prompts }.
//   lines   - everything `bhai bol` printed (one entry per line)
//   prompts - text written by `bhai sun("...")`
// `input` is a list of lines that `bhai sun` will read.
function runFull(src, input = []) {
  const lines = [], prompts = [];
  const queue = input.slice();
  const interp = new Interpreter(undefined, {
    out: (s) => lines.push(s),
    write: (s) => prompts.push(s),
    readLine: () => (queue.length ? queue.shift() : null),
  });
  interp.run(parse(tokenize(src)));
  return { lines, prompts };
}
const run = (src, input) => runFull(src, input).lines;

function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log(`  FAIL ${name}\n       expected ${e}\n       got      ${a}`); }
}

function throwsBhai(name, src, fragment, input) {
  try { run(src, input); failed++; console.log(`  FAIL ${name} (no error thrown)`); }
  catch (e) {
    if (e instanceof BhaiError && e.message.includes(fragment)) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log(`  FAIL ${name}\n       expected error containing "${fragment}"\n       got ${e && e.message}`); }
  }
}

console.log('bhailang tests');

// ---------------------------------------------------------------- basics
section('basics');
eq('spec example', run(`bhai ye hai score = 10;
bhai ye hai bonus = 5;
bhai ye hai total = score + bonus * 2;
bhai bol total;`), ['20']);
eq('precedence * over +', run('bhai bol 2 + 3 * 4;'), ['14']);
eq('brackets', run('bhai bol (2 + 3) * 4;'), ['20']);
eq('left-assoc minus', run('bhai bol 10 - 3 - 2;'), ['5']);
eq('left-assoc divide', run('bhai bol 100 / 10 / 5;'), ['2']);
eq('unary minus', run('bhai bol -3 + 5;'), ['2']);
eq('decimals', run('bhai bol 1.5 * 2;'), ['3']);
eq('reassignment', run('bhai ye hai x = 1; x = x + 9; bhai bol x;'), ['10']);
eq('comments ignored', run('// hi\nbhai bol 7; // bye'), ['7']);
eq('extra spaces/newlines in keyword', run('bhai   ye\n hai y = 4; bhai\tbol y;'), ['4']);
eq('CRLF line endings', run('bhai ye hai a = 2;\r\nbhai bol a;\r\n'), ['2']);
eq('BOM at start of file', run('﻿bhai bol 9;'), ['9']);
eq('last semicolon optional', run('bhai bol 1 + 1'), ['2']);
eq('identifier starting with bhai', run('bhai ye hai bhaiji = 3; bhai bol bhaiji;'), ['3']);
eq('declare without value is khali', run('bhai ye hai x; bhai bol x;'), ['khali']);
eq('print with several values', run('bhai bol 1, "a", sahi;'), ['1 a sahi']);
eq('print with nothing is an empty line', run('bhai bol;'), ['']);
eq('compound assignment', run('bhai ye hai x = 10; x += 5; x -= 3; x *= 2; x /= 4; x %= 4; bhai bol x;'), ['2']);

throwsBhai('undefined variable', 'bhai bol nope;', 'defined nahi');
throwsBhai('assign before declare', 'z = 3;', 'declare');
throwsBhai('redeclare', 'bhai ye hai a = 1; bhai ye hai a = 2;', 'pehle se declare');
throwsBhai('divide by zero', 'bhai bol 5 / 0;', 'Zero');
throwsBhai('modulo by zero', 'bhai bol 5 % 0;', 'Zero');
throwsBhai('missing semicolon', 'bhai bol 1\nbhai bol 2;', "';'");
throwsBhai('unclosed bracket', 'bhai bol (1 + 2;', "')'");
throwsBhai('unknown character', 'bhai bol 3 @ 4;', 'Unknown character');
throwsBhai('bhai bolna is not a keyword', 'bhai bolna 3;', 'bolna');
throwsBhai('stray close brace', '}', 'fazool');
throwsBhai('cannot assign to a literal', '5 = 3;', 'left side');

// ------------------------------------------------- stage 1: strings, booleans, operators
section('stage 1: strings, booleans, operators');
eq('string literal', run('bhai bol "namaste";'), ['namaste']);
eq('single quoted string', run("bhai bol 'hi';"), ['hi']);
eq('string escapes', run('bhai bol "a\\tb\\\\c\\"d";'), ['a\tb\\c"d']);
eq('string concat', run('bhai bol "ab" + "cd";'), ['abcd']);
eq('string repeat', run('bhai bol "ab" * 3;'), ['ababab']);
eq('number * string repeat', run('bhai bol 2 * "xy";'), ['xyxy']);
eq('booleans and khali print', run('bhai bol sahi; bhai bol galat; bhai bol khali;'), ['sahi', 'galat', 'khali']);
eq('number comparisons', run('bhai bol 3 < 5, 3 > 5, 3 <= 3, 3 >= 4;'), ['sahi galat sahi galat']);
eq('equality', run('bhai bol 2 == 2, 2 != 2, "a" == "a", "a" != "b";'), ['sahi galat sahi sahi']);
eq('string comparison', run('bhai bol "apple" < "banana";'), ['sahi']);
eq('different types are not equal', run('bhai bol 1 == "1", sahi == 1, khali == galat;'), ['galat galat galat']);
eq('deep list equality', run('bhai bol [1, [2, 3]] == [1, [2, 3]], [1] == [2];'), ['sahi galat']);
eq('aur / ya / nahi', run('bhai bol sahi aur galat, galat ya sahi, nahi sahi, nahi galat;'), ['galat sahi galat sahi']);
eq('ya returns the first truthy operand', run('bhai bol galat ya "default";'), ['default']);
eq('aur returns the deciding operand', run('bhai bol 5 aur 7, 0 aur 7;'), ['7 0']);
eq('aur short-circuits', run('bhai bol galat aur nope;'), ['galat']);
eq('ya short-circuits', run('bhai bol sahi ya nope;'), ['sahi']);
eq('nahi binds looser than ==', run('bhai bol nahi 1 == 2;'), ['sahi']);
eq('modulo', run('bhai bol 10 % 3;'), ['1']);
eq('modulo with negative left side', run('bhai bol -7 % 3;'), ['2']);
eq('power', run('bhai bol 2 ** 10;'), ['1024']);
eq('power is right associative', run('bhai bol 2 ** 3 ** 2;'), ['512']);
eq('-2 ** 2 is -4', run('bhai bol -2 ** 2;'), ['-4']);
eq('power with negative exponent', run('bhai bol 2 ** -1;'), ['0.5']);

throwsBhai('number + string', 'bhai bol 1 + "a";', 'str()');
throwsBhai('string - string', 'bhai bol "a" - "b";', 'ghata');
throwsBhai('compare number with string', 'bhai bol 1 < "a";', 'compare');
throwsBhai('unary minus on a string', 'bhai bol -"a";', 'number');
throwsBhai('unterminated string', 'bhai bol "oops;', 'closing quote');
throwsBhai('bad escape', 'bhai bol "a\\qb";', 'escape');
throwsBhai('lone !', 'bhai bol !1;', 'nahi');

// ------------------------------------------------------------ stage 2: conditions
section('stage 2: agar / warna');
eq('agar true branch', run('agar 5 > 3 { bhai bol "haan"; }'), ['haan']);
eq('agar false, no else', run('agar 1 > 3 { bhai bol "haan"; } bhai bol "end";'), ['end']);
eq('warna branch', run('agar 1 > 3 { bhai bol "A"; } warna { bhai bol "B"; }'), ['B']);
eq('warna agar chain', run(`bhai ye hai x = 5;
agar x < 3 { bhai bol "chhota"; }
warna agar x < 10 { bhai bol "medium"; }
warna { bhai bol "bada"; }`), ['medium']);
eq('only the first true branch runs', run('agar sahi { bhai bol 1; } warna agar sahi { bhai bol 2; }'), ['1']);
eq('parentheses around the condition are fine', run('agar (1 < 2) { bhai bol "ok"; }'), ['ok']);
eq('nested agar', run('agar sahi { agar galat { bhai bol "no"; } warna { bhai bol "inner"; } }'), ['inner']);
eq('truthiness: 0, "", [], {} are false', run(`
agar 0 { bhai bol "x"; } warna { bhai bol "0 false"; }
agar "" { bhai bol "x"; } warna { bhai bol "empty string false"; }
agar [] { bhai bol "x"; } warna { bhai bol "empty list false"; }
agar {} { bhai bol "x"; } warna { bhai bol "empty dict false"; }
agar khali { bhai bol "x"; } warna { bhai bol "khali false"; }
agar [0] { bhai bol "non-empty list true"; }
agar "a" { bhai bol "non-empty string true"; }`),
  ['0 false', 'empty string false', 'empty list false', 'empty dict false', 'khali false', 'non-empty list true', 'non-empty string true']);
eq('block variable is not visible outside', (() => {
  try { run('agar sahi { bhai ye hai inner = 1; } bhai bol inner;'); return 'no error'; }
  catch (e) { return e instanceof BhaiError ? 'error' : 'crash'; }
})(), 'error');
eq('block can update an outer variable', run('bhai ye hai x = 1; agar sahi { x = 2; } bhai bol x;'), ['2']);
eq('semicolon optional before }', run('agar sahi { bhai bol 1 }'), ['1']);

throwsBhai('agar without block', 'agar sahi bhai bol 1;', "'{'");
throwsBhai('unclosed block', 'agar sahi { bhai bol 1;', "band karna");

// ----------------------------------------------------------------- stage 3: loops
section('stage 3: loops');
eq('jabtak counts', run('bhai ye hai i = 0; jabtak i < 3 { bhai bol i; i += 1; }'), ['0', '1', '2']);
eq('har over range', run('har i mein range(3) { bhai bol i; }'), ['0', '1', '2']);
eq('har over a list', run('har x mein ["a", "b"] { bhai bol x; }'), ['a', 'b']);
eq('har over a string', run('har c mein "hey" { bhai bol c; }'), ['h', 'e', 'y']);
eq('har over dict keys', run('har k mein {"a": 1, "b": 2} { bhai bol k; }'), ['a', 'b']);
eq('ruk stops the loop', run('har i mein range(10) { agar i == 3 { ruk; } bhai bol i; }'), ['0', '1', '2']);
eq('aage badh skips an iteration', run('har i mein range(5) { agar i % 2 == 0 { aage badh; } bhai bol i; }'), ['1', '3']);
eq('ruk only leaves the inner loop', run(`
har i mein range(2) {
  har j mein range(5) { agar j == 2 { ruk; } bhai bol i, j; }
}`), ['0 0', '0 1', '1 0', '1 1']);
eq('jabtak with ruk', run('bhai ye hai n = 0; jabtak sahi { n += 1; agar n == 4 { ruk; } } bhai bol n;'), ['4']);
eq('loop variable does not leak', (() => {
  try { run('har i mein range(2) { } bhai bol i;'); return 'leaked'; } catch (e) { return 'ok'; }
})(), 'ok');
eq('variables declared in a loop body are fresh each time', run('har i mein range(3) { bhai ye hai sq = i * i; bhai bol sq; }'), ['0', '1', '4']);
eq('sum with a loop', run('bhai ye hai total = 0; har i mein range(1, 101) { total += i; } bhai bol total;'), ['5050']);
eq('empty range does nothing', run('har i mein range(0) { bhai bol i; } bhai bol "done";'), ['done']);

throwsBhai('ruk outside a loop', 'ruk;', 'loop');
throwsBhai('aage badh outside a loop', 'aage badh;', 'loop');
throwsBhai('ruk inside a function inside a loop', 'har i mein [1] { kaam banao f() { ruk; } }', 'loop');
throwsBhai('har over a number', 'har i mein 5 { }', "'har' loop");
throwsBhai('har without mein', 'har i range(3) { }', 'mein');

// -------------------------------------------------------------- stage 4: functions
section('stage 4: functions');
eq('simple function', run('kaam banao add(a, b) { wapas do a + b; } bhai bol add(2, 3);'), ['5']);
eq('function without wapas do gives khali', run('kaam banao f() { } bhai bol f();'), ['khali']);
eq('bare wapas do gives khali', run('kaam banao f() { wapas do; } bhai bol f();'), ['khali']);
eq('wapas do stops the function', run('kaam banao f() { bhai bol 1; wapas do 5; bhai bol 2; } bhai bol f();'), ['1', '5']);
eq('wapas do from inside a loop', run('kaam banao find() { har i mein range(10) { agar i == 4 { wapas do i; } } wapas do -1; } bhai bol find();'), ['4']);
eq('recursion: fib(15)', run(`kaam banao fib(n) { agar n < 2 { wapas do n; } wapas do fib(n - 1) + fib(n - 2); } bhai bol fib(15);`), ['610']);
eq('recursion: factorial(10)', run(`kaam banao fact(n) { agar n <= 1 { wapas do 1; } wapas do n * fact(n - 1); } bhai bol fact(10);`), ['3628800']);
eq('closure keeps its variable', run(`
kaam banao make_counter() {
  bhai ye hai c = 0;
  kaam banao inc() { c += 1; wapas do c; }
  wapas do inc;
}
bhai ye hai a = make_counter();
bhai ye hai b = make_counter();
a(); a();
bhai bol a(), b();`), ['3 1']);
eq('functions are values', run('kaam banao twice(f, x) { wapas do f(f(x)); } kaam banao inc(n) { wapas do n + 1; } bhai bol twice(inc, 5);'), ['7']);
eq('parameters shadow outer variables', run('bhai ye hai x = 1; kaam banao f(x) { x = 99; wapas do x; } bhai bol f(5), x;'), ['99 1']);
eq('function can change an outer variable', run('bhai ye hai total = 0; kaam banao add(n) { total += n; } add(4); add(6); bhai bol total;'), ['10']);
eq('a function can be redefined', run('kaam banao f() { wapas do 1; } kaam banao f() { wapas do 2; } bhai bol f();'), ['2']);
eq('function printing', run('kaam banao hello() { } bhai bol hello;'), ['<kaam hello>']);
eq('mutual recursion', run(`
kaam banao is_even(n) { agar n == 0 { wapas do sahi; } wapas do is_odd(n - 1); }
kaam banao is_odd(n) { agar n == 0 { wapas do galat; } wapas do is_even(n - 1); }
bhai bol is_even(10), is_odd(7);`), ['sahi sahi']);

throwsBhai('too few arguments', 'kaam banao f(a, b) { } f(1);', 'argument');
throwsBhai('too many arguments', 'kaam banao f(a) { } f(1, 2);', 'argument');
throwsBhai('calling a non-function', 'bhai ye hai x = 5; x();', 'call nahi');
throwsBhai('wapas do outside a function', 'wapas do 5;', 'kaam');
throwsBhai('duplicate parameter', 'kaam banao f(a, a) { }', 'do baar');
throwsBhai('infinite recursion is caught', 'kaam banao f() { wapas do f(); } f();', 'Recursion');
throwsBhai('function name clashing with a variable', 'bhai ye hai f = 1; kaam banao f() { }', 'pehle se declare');

// ------------------------------------------------- stage 5: lists, dicts, builtins, input
section('stage 5: lists');
eq('list literal prints like code', run('bhai bol [1, "a", sahi, khali];'), ['[1, "a", sahi, khali]']);
eq('empty list', run('bhai bol [];'), ['[]']);
eq('trailing comma', run('bhai bol [1, 2,];'), ['[1, 2]']);
eq('indexing', run('bhai ye hai xs = [10, 20, 30]; bhai bol xs[0], xs[2];'), ['10 30']);
eq('negative indexing', run('bhai ye hai xs = [10, 20, 30]; bhai bol xs[-1], xs[-3];'), ['30 10']);
eq('index assignment', run('bhai ye hai xs = [1, 2, 3]; xs[1] = 99; bhai bol xs;'), ['[1, 99, 3]']);
eq('compound index assignment', run('bhai ye hai xs = [1, 2, 3]; xs[0] += 10; xs[2] *= 5; bhai bol xs;'), ['[11, 2, 15]']);
eq('nested lists', run('bhai ye hai g = [[1, 2], [3, 4]]; bhai bol g[1][0]; g[0][1] = 9; bhai bol g;'), ['3', '[[1, 9], [3, 4]]']);
eq('list concat', run('bhai bol [1] + [2, 3];'), ['[1, 2, 3]']);
eq('list repeat', run('bhai bol [0] * 3;'), ['[0, 0, 0]']);
eq('lists are shared by reference', run('bhai ye hai a = [1]; bhai ye hai b = a; push(b, 2); bhai bol a;'), ['[1, 2]']);
eq('push and pop', run('bhai ye hai xs = [1, 2]; push(xs, 3); bhai bol pop(xs), xs;'), ['3 [1, 2]']);
eq('pop with index', run('bhai ye hai xs = [1, 2, 3]; bhai bol pop(xs, 0), xs;'), ['1 [2, 3]']);
eq('string indexing', run('bhai bol "hello"[1], "hello"[-1];'), ['e o']);
eq('len of list/string/dict', run('bhai bol len([1, 2, 3]), len("abc"), len({"a": 1});'), ['3 3 1']);
eq('len counts an emoji as 1', run('bhai bol len("😎");'), ['1']);
eq('indexing a call result', run('bhai bol range(5)[2];'), ['2']);

throwsBhai('index out of range', 'bhai ye hai xs = [1]; bhai bol xs[5];', 'range ke bahar');
throwsBhai('negative index out of range', 'bhai bol [1][-2];', 'range ke bahar');
throwsBhai('non-integer index', 'bhai bol [1, 2][0.5];', 'poora number');
throwsBhai('string index out of range', 'bhai bol "ab"[2];', 'range ke bahar');
throwsBhai('cannot change a string', 'bhai ye hai s = "abc"; s[0] = "x";', 'badli nahi');
throwsBhai('indexing a number', 'bhai bol 5[0];', 'index nahi');
throwsBhai('pop from empty list', 'pop([]);', 'Khali list');

section('stage 5: dicts');
eq('dict prints like code', run('bhai bol {"naam": "bhai", "umar": 20};'), ['{"naam": "bhai", "umar": 20}']);
eq('empty dict', run('bhai bol {};'), ['{}']);
eq('dict lookup', run('bhai ye hai d = {"a": 1}; bhai bol d["a"];'), ['1']);
eq('dict insert and update', run('bhai ye hai d = {}; d["x"] = 1; d["x"] += 5; d[2] = "two"; bhai bol d;'), ['{"x": 6, 2: "two"}']);
eq('keys and values', run('bhai ye hai d = {"a": 1, "b": 2}; bhai bol keys(d), values(d);'), ['["a", "b"] [1, 2]']);
eq('has: dict, list, string', run('bhai bol has({"a": 1}, "a"), has([1, 2], 3), has("hello", "ell");'), ['sahi galat sahi']);
eq('dict inside a list inside a dict', run('bhai ye hai d = {"xs": [{"k": 1}]}; bhai bol d["xs"][0]["k"];'), ['1']);
eq('dict equality ignores order', run('bhai bol {"a": 1, "b": 2} == {"b": 2, "a": 1};'), ['sahi']);

throwsBhai('missing dict key', 'bhai bol {"a": 1}["b"];', 'nahi mili');
throwsBhai('bad dict key', 'bhai ye hai d = {}; d[[1]] = 2;', 'key');

section('stage 5: range and conversions');
eq('range(stop)', run('bhai bol range(4);'), ['[0, 1, 2, 3]']);
eq('range(start, stop)', run('bhai bol range(2, 5);'), ['[2, 3, 4]']);
eq('range with step', run('bhai bol range(10, 0, -3);'), ['[10, 7, 4, 1]']);
eq('range(0) is empty', run('bhai bol range(0);'), ['[]']);
eq('str()', run('bhai bol "n=" + str(5), str([1, "a"]);'), ['n=5 [1, "a"]']);
eq('int()', run('bhai bol int("42"), int(3.9), int(-3.9), int("  7 ");'), ['42 3 -3 7']);
eq('float()', run('bhai bol float("3.5") + 1, float("2e2");'), ['4.5 200']);
eq('type()', run('bhai bol type(1), type("a"), type(sahi), type(khali), type([]), type({}), type(len);'), ['number string bool khali list dict function']);

throwsBhai('int of garbage', 'int("abc");', 'int()');
throwsBhai('range with a float', 'range(2.5);', 'range()');
throwsBhai('range step 0', 'range(1, 5, 0);', 'step');
throwsBhai('len of a number', 'len(5);', 'len()');
throwsBhai('builtin arity', 'len();', 'argument');
throwsBhai('builtin errors point at the call', 'int("x");', 'int()');

section('stage 5: other builtins');
eq('abs / min / max / sum', run('bhai bol abs(-3), min(4, 2, 9), max([4, 2, 9]), sum([1, 2, 3]);'), ['3 2 9 6']);
eq('min / max of strings', run('bhai bol min("b", "a"), max(["x", "z", "y"]);'), ['a z']);
eq('round (half to even) and floor/ceil/sqrt', run('bhai bol round(2.5), round(3.5), round(3.14159, 2), floor(2.7), ceil(2.1), sqrt(16);'), ['2 4 3.14 2 3 4']);
eq('sorted and reverse', run('bhai bol sorted([3, 1, 2]), sorted(["b", "a"]), reverse([1, 2, 3]), reverse("abc");'), ['[1, 2, 3] ["a", "b"] [3, 2, 1] cba']);
eq('sorted does not change the original', run('bhai ye hai xs = [2, 1]; sorted(xs); bhai bol xs;'), ['[2, 1]']);
eq('string helpers', run('bhai bol upper("abc"), lower("ABC"), strip("  hi  "), replace("a-b-c", "-", "+");'), ['ABC abc hi a+b+c']);
eq('split and join', run('bhai bol split("a,b,c", ","), split("  one  two "), join(["a", "b"], "-"), join(["x", "y"]);'), ['["a", "b", "c"] ["one", "two"] a-b xy']);
eq('randint stays in range', run('bhai ye hai ok = sahi; har i mein range(200) { bhai ye hai r = randint(3, 5); agar r < 3 ya r > 5 { ok = galat; } } bhai bol ok;'), ['sahi']);
eq('pi', run('bhai bol round(pi, 2);'), ['3.14']);
eq('builtins can be shadowed', run('bhai ye hai len = 5; bhai bol len;'), ['5']);

throwsBhai('builtins cannot be reassigned', 'len = 5;', 'built-in');
throwsBhai('sqrt of negative', 'sqrt(-1);', 'sqrt');
throwsBhai('join needs strings', 'join([1, 2]);', 'strings');
throwsBhai('sorted mixed types', 'sorted([1, "a"]);', 'compare');

section('stage 5: bhai sun (input)');
{
  const r = runFull('bhai ye hai naam = bhai sun("Naam? "); bhai bol "Namaste " + naam;', ['Bhai']);
  eq('reads a line', r.lines, ['Namaste Bhai']);
  eq('writes the prompt', r.prompts, ['Naam? ']);
}
eq('input then int()', run('bhai ye hai n = int(bhai sun("")); bhai bol n * 2;', ['21']), ['42']);
eq('several inputs in order', run('bhai bol bhai sun("") + bhai sun("");', ['a', 'b']), ['ab']);
eq('input() with no prompt', run('bhai bol bhai sun();', ['hi']), ['hi']);
throwsBhai('input at end of input', 'bhai sun("");', 'Input khatam', []);

// ------------------------------------------------------------- programs
section('whole programs');
eq('fizzbuzz', run(`
har i mein range(1, 16) {
  agar i % 15 == 0 { bhai bol "FizzBuzz"; }
  warna agar i % 3 == 0 { bhai bol "Fizz"; }
  warna agar i % 5 == 0 { bhai bol "Buzz"; }
  warna { bhai bol i; }
}`), ['1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz']);
eq('primes below 20', run(`
kaam banao is_prime(n) {
  agar n < 2 { wapas do galat; }
  har d mein range(2, n) { agar n % d == 0 { wapas do galat; } }
  wapas do sahi;
}
bhai ye hai found = [];
har n mein range(20) { agar is_prime(n) { push(found, n); } }
bhai bol found;`), ['[2, 3, 5, 7, 11, 13, 17, 19]']);
eq('word count with a dict', run(`
bhai ye hai counts = {};
har w mein split("a b a c b a") {
  agar has(counts, w) { counts[w] += 1; } warna { counts[w] = 1; }
}
bhai bol counts;`), ['{"a": 3, "b": 2, "c": 1}']);
eq('bubble sort', run(`
bhai ye hai xs = [5, 2, 9, 1, 7];
bhai ye hai n = len(xs);
har i mein range(n) {
  har j mein range(n - 1 - i) {
    agar xs[j] > xs[j + 1] {
      bhai ye hai tmp = xs[j];
      xs[j] = xs[j + 1];
      xs[j + 1] = tmp;
    }
  }
}
bhai bol xs;`), ['[1, 2, 5, 7, 9]']);

// ------------------------------------------------------------- end to end (CLI)
section('command line');
{
  const index = path.join(__dirname, 'index.js');
  const node = process.execPath;
  const cli = (args, input) => spawnSync(node, [index, ...args], { input, encoding: 'utf8' });

  const demo = cli([path.join(__dirname, 'examples', 'demo.bhai')]);
  eq('runs a script file', demo.stdout, '20\n30\n');
  eq('script exits with 0', demo.status, 0);

  const missing = cli(['no_such_file.bhai']);
  eq('missing file exits with 1', missing.status, 1);

  const version = cli(['--version']);
  eq('--version', version.stdout.trim(), require('./package.json').version);

  const repl = cli([], 'bhai ye hai x = 10;\nbhai bol x * 2;\nx + 1\nkaam banao f(n) {\n  wapas do n * 3;\n}\n\nf(4)\n"hi"\nnikal\n');
  eq('REPL keeps variables, echoes expressions, handles multi-line functions',
    repl.stdout.split('\n').filter((l) => !l.startsWith('bhailang') && !l.startsWith('Type') && !l.startsWith('block ') && l.trim() !== ''),
    ['bhai> bhai> 20', 'bhai> 11', 'bhai> ...  ...  ...  bhai> 12', 'bhai> "hi"', 'bhai> ', 'Chalo bhai, phir milenge!']);

  const err = cli([], 'bhai bol nope;\nbhai bol 1;\nnikal\n');
  eq('REPL survives an error', [err.stderr.includes('nope'), err.stdout.includes('1'), err.status], [true, true, 0]);

  const askme = spawnSync(node, ['-e', `
    const { Interpreter } = require(${JSON.stringify(path.join(__dirname, 'src', 'interpreter'))});
    const { tokenize } = require(${JSON.stringify(path.join(__dirname, 'src', 'lexer'))});
    const { parse } = require(${JSON.stringify(path.join(__dirname, 'src', 'parser'))});
    new Interpreter().run(parse(tokenize('bhai ye hai a = bhai sun("A? "); bhai ye hai b = bhai sun("B? "); bhai bol a + b;')));
  `], { input: 'x\r\ny\n', encoding: 'utf8' });
  eq('real stdin input (with a Windows line ending)', askme.stdout, 'A? B? xy\n');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
