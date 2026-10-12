# bhailang

A GenZ Hinglish interpreted programming language, written from scratch in plain Node.js (no npm packages).

## Run it

```bash
node index.js                          # start the REPL
node index.js examples/fizzbuzz.bhai   # run a script
node test.js                           # run the test suite
```

Needs Node.js 14 or newer.

## Language tour

```
// comments start with //

bhai ye hai naam = "Bhai";          // declare a variable
bhai ye hai x;                      // no value -> khali (null)
x = 10;                             // assign
x += 5;                             // also -=  *=  /=  %=
bhai bol "Namaste", naam, x;        // print (several values are joined with spaces)
```

### Values

| Kind | Examples |
| --- | --- |
| number | `42`, `3.14`, `-7` |
| string | `"hello"`, `'hi'`, `"line\nbreak"` |
| bool / null | `sahi`, `galat`, `khali` |
| list | `[1, "a", sahi]`, `xs[0]`, `xs[-1]`, `xs[1] = 5` |
| dict | `{"naam": "bhai", "umar": 20}`, `d["naam"]`, `d["city"] = "Delhi"` |
| function | `kaam banao ...` (see below) |

### Operators (loosest to tightest)

| Operators | Meaning |
| --- | --- |
| `ya` | or |
| `aur` | and |
| `nahi` | not |
| `==` `!=` `<` `>` `<=` `>=` | comparison |
| `+` `-` | add / subtract (`+` also joins strings and lists) |
| `*` `/` `%` | multiply / divide / remainder (`"ab" * 3` repeats) |
| `-x` | negative |
| `**` | power (right associative) |
| `f(x)` `xs[i]` | call / index |

`aur` and `ya` short-circuit and return one of their operands, like Python. Empty values (`0`, `""`, `[]`, `{}`, `khali`, `galat`) count as false.

### Conditions

```
agar x > 10 {
  bhai bol "bada";
} warna agar x > 5 {
  bhai bol "medium";
} warna {
  bhai bol "chhota";
}
```

### Loops

```
jabtak i < 5 { i += 1; }                // while

har i mein range(5) { bhai bol i; }     // for: list, string, dict keys or range()

har i mein range(10) {
  agar i == 3 { aage badh; }            // skip to the next round
  agar i == 7 { ruk; }                  // stop the loop
  bhai bol i;
}
```

### Functions

```
kaam banao add(a, b) {
  wapas do a + b;
}
bhai bol add(2, 3);
```

Functions can call themselves, be passed around as values, and remember the variables around them (closures).
`wapas do;` with no value returns `khali`.

### Input

```
bhai ye hai naam = bhai sun("Tera naam? ");   // always gives a string
bhai ye hai umar = int(bhai sun("Umar? "));
```

### Built-in functions

| Group | Functions |
| --- | --- |
| basics | `len` `range` `str` `int` `float` `type` |
| math | `abs` `min` `max` `sum` `round` `floor` `ceil` `sqrt` `randint(a, b)` `random()` and the constant `pi` |
| lists | `sorted` `reverse` `push(list, x)` `pop(list)` / `pop(list, i)` |
| dicts / search | `keys` `values` `has(container, x)` (list item, substring or dict key) |
| strings | `upper` `lower` `strip` `split(s)` / `split(s, sep)` `join(list, sep)` `replace(s, old, new)` |

### Reserved words

`bhai ye hai`, `bhai bol`, `bhai sun`, `kaam banao`, `wapas do`, `aage badh`, `agar`, `warna`, `jabtak`, `har`, `mein`, `ruk`, `sahi`, `galat`, `khali`, `aur`, `ya`, `nahi`

### Scoping

`{ }` blocks (agar, loops, functions) get their own scope. Variables declared inside are not visible outside, but assigning to an outer variable (`x = 2;`) changes the outer one.

## REPL tips

- Variables and functions stay in memory between lines.
- A bare expression like `2 + 3` prints its result.
- For multi-line code, open a `{` and keep typing; after a block closes, press Enter on an empty line to run it. Write `warna` right after the closing `}` line to continue an `agar`.
- `nikal` or `exit` quits.

## Project layout

| File | Job |
| --- | --- |
| `src/lexer.js` | source text to tokens (multi-word keywords, strings, operators) |
| `src/parser.js` | recursive descent parser, builds the AST |
| `src/environment.js` | variable memory / nested scopes |
| `src/interpreter.js` | walks the AST and runs it |
| `src/values.js` | how values look at runtime, printing, equality |
| `src/builtins.js` | the built-in function library |
| `src/io.js` | console input / output |
| `index.js` | CLI: file runner and REPL |
| `test.js` | test suite (`node test.js`) |
| `examples/` | sample programs |

## Examples

`examples/fizzbuzz.bhai`, `functions.bhai`, `lists_and_dicts.bhai`, `calculator.bhai`, `guess.bhai`, `demo.bhai`
