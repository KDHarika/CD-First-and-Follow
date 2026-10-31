# DUALCORE — Execution & Compilation Lab

DUALCORE is a browser-only compiler design laboratory. It runs the same mini-language program through a recursive-descent parser and two independent execution paths: direct AST interpretation, and three-address intermediate code executed by a virtual machine.

## Run

Open `index.html` in a modern browser. No server, build step, dependency install, or network access is required. Select an example or edit the source, then choose **Run both paths**. Use the inspection tabs to view source, AST, intermediate instructions, execution trace, and the performance report.

## Language

```text
let x = 10;
x = x + 1;
if (x >= 10) { print(x); } else { print(0); }
while (x < 13) { x = x + 1; }
```

Supports integer and decimal literals, declarations and assignments, `+ - * /`, comparisons `< > <= >= == !=`, `if` / `else`, `while`, `print(...)`, nested expressions, and brace-delimited blocks. Variables use a single program-wide environment. Conditions treat `0` as false and nonzero numbers as true. Execution has a 10,000-step safety limit.

Errors include source line and column where available. Division by zero, undefined variables, invalid characters or syntax, unsupported forms, and execution-limit violations are reported in the UI.

## Performance measurements

The profiler uses `performance.now()`, two warm-up passes, and nine measured passes per phase. Reported timings are approximate and reflect the current browser/device; small programs can be dominated by timer resolution and runtime noise. The comparison checks output values automatically. Interpreter evaluation and VM instruction counts come from actual executions. VM execution operates only on generated instructions.

## Included examples

- Arithmetic with decimal values and operator precedence
- Conditional branch and inequality comparison
- While loop with accumulation and a final counter

The UI also includes source, AST, intermediate code, execution trace, and performance report views.
