# Testing Ink Applications - Overview

## Why Testing Ink is Different

Ink applications don't render to regular `stdout` like normal Node.js programs. They use:
- **Virtual terminal buffer**: Ink maintains its own rendering buffer
- **React reconciliation**: Components update asynchronously via React
- **No DOM**: Can't use browser testing tools like jsdom
- **Terminal-specific APIs**: stdin, stdout, process.stdout.columns, etc.

This means you **cannot** use traditional testing approaches:
❌ Capture stdout with `process.stdout.write = ...`
❌ Use jsdom or browser testing tools
❌ Test synchronously without waiting for React updates

## The Solution: ink-testing-library

**ink-testing-library** provides:
- ✅ Virtual terminal rendering
- ✅ `lastFrame()` to inspect rendered output
- ✅ Terminal size simulation
- ✅ stdin mocking for input simulation
- ✅ Integration with React testing utilities

## Key Concepts

### 1. act() Pattern

**Critical**: All state changes and async operations MUST be wrapped in `act()` from React.

```typescript
import { act } from 'react';

// ❌ WRONG - State change not wrapped
setState('new value');

// ✅ CORRECT - Wrapped in act()
act(() => {
  setState('new value');
});

// ✅ CORRECT - Async operations
await act(async () => {
  await someAsyncOperation();
});
```

**Why**: React updates are asynchronous. `act()` ensures all updates complete before assertions.

### 2. lastFrame() Pattern

**Testing rendered output**:

```typescript
const { lastFrame } = render(<MyComponent />);

// Get the current terminal output
const output = lastFrame();

// Assert on the text content
expect(output).toContain('Hello World');
expect(output).toMatchSnapshot();
```

### 3. Mock stdin Pattern

**Simulating user input**:

```typescript
import { EventEmitter } from 'events';

class MockStdin extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();

  write(text: string) {
    this.emit('data', text);
  }
}

const stdin = new MockStdin();

// Simulate key press
act(() => {
  stdin.write('\r'); // Enter key
});

// Simulate mouse event
act(() => {
  stdin.write('\x1b[<0;10;20M'); // Left click at col 10, row 20
});
```

### 4. Terminal Width Simulation

**Testing responsive layouts**:

```typescript
const { lastFrame } = render(<MyComponent />, 80); // 80 columns wide

// Component receives process.stdout.columns = 80
```

## Test Structure

Typical test file structure:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('should render initial state', () => {
    const { lastFrame } = render(<MyComponent />);
    expect(lastFrame()).toContain('Initial text');
  });

  it('should handle user input', () => {
    const mockHandler = vi.fn();
    const { stdin, lastFrame } = render(
      <MyComponent onSubmit={mockHandler} />
    );

    act(() => {
      stdin.write('test input');
      stdin.write('\r'); // Submit
    });

    expect(mockHandler).toHaveBeenCalledWith('test input');
  });
});
```

## Gemini CLI's Testing Approach

Gemini CLI extends `ink-testing-library` with custom utilities:

### Custom Test Utilities

| Utility | Purpose | Location |
|---------|---------|----------|
| `render()` | Wraps ink-testing-library render with act() | `/test-utils/render.tsx` |
| `renderWithProviders()` | Renders with all React contexts | `/test-utils/render.tsx` |
| `renderHook()` | Tests custom hooks | `/test-utils/render.tsx` |
| `waitFor()` | Async assertions with act() | `/test-utils/async.ts` |
| `customMatchers` | Domain-specific assertions | `/test-utils/customMatchers.ts` |

### Test Setup

**Global setup** (`test-setup.ts`):
- Sets `IS_REACT_ACT_ENVIRONMENT = true`
- Captures act() warnings and fails tests
- Ensures consistent theme behavior
- Loads custom matchers

## Testing Statistics

From Gemini CLI codebase:
- **80+ test files** for UI components
- **1,255+ test cases** total
- **468+ snapshot tests** using `lastFrame()`
- **975 lines** for keyboard input testing alone
- **191 lines** for mouse event testing

## Common Pitfalls

### ❌ Don't: Test without act()
```typescript
// This will cause flaky tests and warnings
setState('value');
expect(result).toBe('value');
```

### ✅ Do: Wrap all state changes
```typescript
act(() => {
  setState('value');
});
expect(result).toBe('value');
```

### ❌ Don't: Use vitest waitFor directly
```typescript
// vitest's waitFor doesn't wrap in act()
await waitFor(() => expect(state).toBe('done'));
```

### ✅ Do: Use custom waitFor with act()
```typescript
// Custom waitFor wraps assertions in act()
await waitFor(() => {
  expect(state).toBe('done');
});
```

### ❌ Don't: Test time-dependent code with real timers
```typescript
// Flaky and slow
setTimeout(() => setState('done'), 1000);
await new Promise(resolve => setTimeout(resolve, 1100));
```

### ✅ Do: Use fake timers
```typescript
vi.useFakeTimers();
setTimeout(() => setState('done'), 1000);

act(() => {
  vi.advanceTimersByTime(1000);
});

expect(state).toBe('done');
vi.useRealTimers();
```

## Testing Levels

### 1. Component Tests (Unit)

Test individual React components in isolation:
- Render with mocked dependencies
- Test props, state, events
- Snapshot testing

### 2. Hook Tests (Unit)

Test custom React hooks:
- Use `renderHook()` utility
- Test hook return values
- Test hook state updates

### 3. Integration Tests

Test multiple components together:
- Full provider stack
- Realistic user interactions
- Test data flow

### 4. Context Tests

Test React Context providers:
- Provider behavior
- Context value changes
- Consumer interactions

## Test File Organization

```
packages/cli/src/ui/
├── components/
│   ├── MyComponent.tsx
│   └── MyComponent.test.tsx        # Component tests
├── hooks/
│   ├── useMyHook.ts
│   └── useMyHook.test.ts           # Hook tests
├── contexts/
│   ├── MyContext.tsx
│   └── MyContext.test.tsx          # Context tests
└── utils/
    ├── myUtil.ts
    └── myUtil.test.ts              # Utility tests
```

## Next Steps

1. **Read `01-ink-testing-library.md`** - Deep dive into ink-testing-library
2. **Read `02-act-pattern.md`** - Master the act() pattern
3. **Read `03-testing-input.md`** - Test keyboard and mouse input
4. **Read `04-custom-utilities.md`** - Build reusable test utilities
5. **Read `05-code-snippets.md`** - Copy-paste ready code

## Resources

- [ink-testing-library docs](https://github.com/vadimdemedes/ink-testing-library)
- [React Testing Best Practices](https://react.dev/reference/react/act)
- [Vitest Documentation](https://vitest.dev/)

---

**Created**: 2025-01-11
**Source**: Gemini CLI test codebase analysis
**Purpose**: Guide for testing modern terminal UI applications with Ink
