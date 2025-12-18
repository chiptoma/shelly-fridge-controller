# ESLint Configuration

ESLint handles both **linting** and **formatting** in this project (Antfu-style, no Prettier needed).

## Quick Start

```bash
# Check for lint issues
npm run lint

# Auto-fix all issues
npm run lint:fix
```

## VSCode Integration

The project auto-fixes on save. Just save any file and ESLint will:
1. Fix formatting issues (quotes, semicolons, spacing)
2. Sort imports by group
3. Apply code quality fixes

## Shelly Language Restrictions

The ESLint config enforces all Shelly Script limitations:

### Forbidden (Errors)

| Feature | Alternative |
|---------|-------------|
| ES6 Classes | Use functions and objects |
| async/await | Use callbacks |
| Promises | Use callbacks |
| Generators | Use iterative loops |
| for...of | Use traditional `for` loop |
| Template literals | Use string concatenation |
| Arrow functions | Use `function() {}` |
| Default parameters | Use `x = x \|\| default` |
| Destructuring | Use explicit property access |
| Spread operator | Use `Object.assign()` |

### Warned (Soft Limits)

| Feature | Limit | Reason |
|---------|-------|--------|
| Nesting depth | 4 levels | Memory/stack constraints |
| Callback nesting | 3 levels | Prevents crashes |
| Function size | 100 lines | Memory efficiency |
| Parameters | 5 max | Call overhead |
| Complexity | 15 max | Maintainability |

## Formatting Style

- **Single quotes** (not double)
- **No semicolons**
- **2-space indentation**
- **Trailing commas** in multi-line

## Plugins

The configuration uses these ESLint plugins:

| Plugin | Purpose |
|--------|---------|
| `@stylistic/eslint-plugin` | Code formatting |
| `eslint-plugin-import-x` | Import sorting |
| `eslint-plugin-jsdoc` | JSDoc validation |
| `eslint-plugin-sonarjs` | Code quality |
| `typescript-eslint` | TypeScript support |

## JSDoc Tags

The project uses custom JSDoc tags for state documentation:

- `@mutates` - Documents state mutations
- `@sideeffect` - Documents side effects (relay, timers)
- `@reads` - Documents state reads

Example:
```javascript
/**
 * Set relay state with safety checks.
 * @param {boolean} wantOn - Desired relay state
 * @mutates V.sys_relay
 * @sideeffect Shelly.call('Switch.Set')
 */
function setRelay(wantOn) { ... }
```

## Expected Warnings

The following complexity warnings are expected and acceptable:

| Function | Module | Reason |
|----------|--------|--------|
| `setRelay` | control.js | Complex relay logic with safety checks |
| `determineMode` | control.js | Multiple state transitions |
| `executeSwitchDecision` | control.js | Switch decision with timing guards |
| `adaptHysteresis` | features.js | Multi-condition adaptation logic |
| `mainLoopTick` | loop.js | Main loop orchestration |
| `recoverBootState` | main.js | Boot recovery state machine |

These functions are legitimately complex due to their control logic responsibilities.

## Configuration

See [`eslint.config.ts`](../eslint.config.ts) for the full configuration. Key sections:

- `shellyGlobals` - Shelly-specific global variables
- `forbiddenSyntax` - Forbidden ES6+ features (arrow functions, classes, etc.)
- `forbiddenProps` - Forbidden ES6+ methods (Number.isNaN, Object.entries, etc.)
- `shellyRules` - Memory-conscious constraints and restrictions
- `stylisticOverrides` - Project-specific formatting overrides
- `jsdocRules` - JSDoc validation
- `qualityRules` - Code quality checks (complexity, SonarJS rules)

## File-Specific Rules

| Files | Restrictions |
|-------|--------------|
| `src/**/*.js` | Full Shelly restrictions |
| `src/**/*.test.js` | Relaxed (runs in Node.js) |
| `tools/**/*.ts` | Relaxed (runs in Node.js) |
| `*.config.ts` | Relaxed (config files) |
