# The act() Pattern - Why It's Critical

## What is act()?

`act()` is a React testing utility that ensures **all updates, effects, and async operations complete** before your test assertions run.

```typescript
import { act } from 'react';

act(() => {
  // Code that causes React updates
});
```

## Why You Need act()

### The Problem

React updates are **asynchronous**. Without `act()`:

```typescript
// ❌ This test is FLAKY
setState('new value');
expect(state).toBe('new value'); // Might fail! Update hasn't completed yet
```

The assertion runs **before** React finishes processing the state change.

### The Solution

```typescript
// ✅ This test is RELIABLE
act(() => {
  setState('new value');
});
expect(state).toBe('new value'); // Always passes - update is complete
```

`act()` waits for all pending updates before continuing.

## The React Update Cycle

```
setState() called
    ↓
React schedules update
    ↓
[Some time passes...]
    ↓
React processes update
    ↓
Component re-renders
    ↓
Effects run
    ↓
✅ Update complete
```

Without `act()`, your test assertions might run at any point in this cycle.

With `act()`, assertions run **after** ✅.

## When to Use act()

### 1. State Updates

```typescript
import { act } from 'react';
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <Box>
      <Text>{count}</Text>
      <Button onClick={() => setCount(count + 1)}>Increment</Button>
    </Box>
  );
}

it('should increment counter', () => {
  const { lastFrame } = render(<Counter />);

  // ❌ WRONG
  // Click event triggers setState
  fireClickEvent();
  expect(lastFrame()).toContain('1'); // FLAKY!

  // ✅ CORRECT
  act(() => {
    fireClickEvent();
  });
  expect(lastFrame()).toContain('1'); // Reliable
});
```

### 2. User Input

```typescript
const { stdin, lastFrame } = render(<InputComponent />);

// ❌ WRONG
stdin.write('Hello');
expect(lastFrame()).toContain('Hello'); // FLAKY!

// ✅ CORRECT
act(() => {
  stdin.write('Hello');
});
expect(lastFrame()).toContain('Hello'); // Reliable
```

### 3. Timers

```typescript
// ❌ WRONG
vi.advanceTimersByTime(1000);
expect(state).toBe('updated'); // FLAKY!

// ✅ CORRECT
act(() => {
  vi.advanceTimersByTime(1000);
});
expect(state).toBe('updated'); // Reliable
```

### 4. Async Operations

```typescript
// ❌ WRONG
await someAsyncFunction();
expect(state).toBe('done'); // FLAKY!

// ✅ CORRECT
await act(async () => {
  await someAsyncFunction();
});
expect(state).toBe('done'); // Reliable
```

### 5. Rerenders

```typescript
const { rerender } = render(<MyComponent value="initial" />);

// ❌ WRONG
rerender(<MyComponent value="updated" />);
expect(lastFrame()).toContain('updated'); // FLAKY!

// ✅ CORRECT
act(() => {
  rerender(<MyComponent value="updated" />);
});
expect(lastFrame()).toContain('updated'); // Reliable
```

## act() Warnings

React emits warnings when you forget to use `act()`:

```
Warning: An update to MyComponent inside a test was not wrapped in act(...).
```

**These warnings mean your test is flaky!**

## Gemini CLI's Approach: Automatic act() Enforcement

**File**: `/packages/cli/test-setup.ts`

```typescript
let actWarnings: Array<{ message: string; stack: string }> = [];

beforeEach(() => {
  actWarnings = [];

  vi.spyOn(console, 'error').mockImplementation((...args) => {
    const message = args[0];

    if (typeof message === 'string' &&
        message.includes('was not wrapped in act(...)')) {
      // Capture the warning
      actWarnings.push({
        message: format(...args),
        stack: new Error().stack || '',
      });
    }
  });
});

afterEach(() => {
  if (actWarnings.length > 0) {
    // FAIL THE TEST if any act() warnings occurred
    throw new Error(`Failing test due to "act(...)" warnings:\n${messages}`);
  }
});
```

**Result**: Any test with act() warnings **automatically fails**.

This enforces proper act() usage across the entire test suite.

## Custom Render Wrapper Pattern

Instead of remembering to call `act()` everywhere, wrap it in your render utility:

```typescript
import { render as inkRender } from 'ink-testing-library';
import { act } from 'react';

export const render = (tree: React.ReactElement) => {
  let renderResult: ReturnType<typeof inkRender>;

  // Initial render wrapped in act()
  act(() => {
    renderResult = inkRender(tree);
  });

  // Wrap unmount and rerender methods
  const originalUnmount = renderResult.unmount;
  const originalRerender = renderResult.rerender;

  return {
    ...renderResult,
    unmount: () => {
      act(() => originalUnmount());
    },
    rerender: (newTree: React.ReactElement) => {
      act(() => originalRerender(newTree));
    },
  };
};
```

**Benefits**:
- Automatic act() wrapping for common operations
- Less boilerplate in tests
- Harder to forget

## Async act() Pattern

For async operations:

```typescript
await act(async () => {
  await someAsyncOperation();
});
```

**Example**:

```typescript
it('should handle async data fetch', async () => {
  const { lastFrame } = render(<DataComponent />);

  expect(lastFrame()).toContain('Loading...');

  await act(async () => {
    await waitForDataToLoad();
  });

  expect(lastFrame()).toContain('Data loaded');
});
```

## waitFor with act()

**Problem**: Vitest's `waitFor` doesn't wrap in act().

**Solution**: Custom `waitFor` that does:

```typescript
// File: /packages/cli/src/test-utils/async.ts
export async function waitFor(
  assertion: () => void,
  { timeout = 1000, interval = 50 } = {}
): Promise<void> {
  const startTime = Date.now();

  while (true) {
    try {
      assertion();
      return; // Assertion passed
    } catch (error) {
      if (Date.now() - startTime > timeout) {
        throw error; // Timeout
      }

      // Wait and try again, wrapped in act()
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, interval));
      });
    }
  }
}
```

**Usage**:

```typescript
import { waitFor } from '../test-utils/async';

await waitFor(() => {
  expect(lastFrame()).toContain('Updated');
}, { timeout: 2000 });
```

## Batching Multiple Updates

Multiple state updates in the same tick are automatically batched:

```typescript
act(() => {
  setState1('value1');
  setState2('value2');
  setState3('value3');
});
// Only ONE re-render happens, not three
```

## Common Mistakes

### Mistake 1: Forgetting act() on Input

```typescript
// ❌ WRONG
stdin.write('text');
expect(result).toContain('text');

// ✅ CORRECT
act(() => stdin.write('text'));
expect(result).toContain('text');
```

### Mistake 2: Using vitest's waitFor

```typescript
// ❌ WRONG - vitest waitFor doesn't wrap in act()
import { waitFor } from 'vitest';
await waitFor(() => expect(state).toBe('done'));

// ✅ CORRECT - custom waitFor wraps in act()
import { waitFor } from '../test-utils/async';
await waitFor(() => expect(state).toBe('done'));
```

### Mistake 3: Not Awaiting Async act()

```typescript
// ❌ WRONG
act(async () => {
  await someAsyncFunction();
});
// Continues immediately without waiting!

// ✅ CORRECT
await act(async () => {
  await someAsyncFunction();
});
// Waits for completion
```

### Mistake 4: Testing Outside Component Lifecycle

```typescript
// ❌ WRONG
const result = myHook();
result.doSomething();
expect(result.value).toBe('expected');

// ✅ CORRECT - use renderHook
const { result } = renderHook(() => myHook());
act(() => result.current.doSomething());
expect(result.current.value).toBe('expected');
```

## Debugging act() Issues

If you get act() warnings:

1. **Find the source**: Check the stack trace
2. **Identify the update**: What's causing the state change?
3. **Wrap it**: Put the triggering code in act()
4. **Verify**: Warning should disappear

## Testing Hooks with act()

Use `renderHook` utility:

```typescript
const { result } = renderHook(() => useMyHook());

act(() => {
  result.current.updateSomething('value');
});

expect(result.current.something).toBe('value');
```

## Real-World Example

From Gemini CLI's timer hook test:

```typescript
describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should increment time every second', () => {
    const { result } = renderHook(() => useTimer(true, 0));

    expect(result.current).toBe(0);

    // Advance time wrapped in act()
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current).toBe(3);
  });
});
```

## Key Takeaways

1. **Always wrap state updates in act()** - No exceptions
2. **Use custom wrappers** - Automate act() where possible
3. **Enforce with tests** - Fail tests on act() warnings
4. **Custom waitFor** - Don't use vitest's version
5. **Async requires await** - `await act(async () => ...)`
6. **Debugging** - Stack traces point to the source

## Best Practices

✅ Wrap all user input in act()
✅ Wrap all timer advances in act()
✅ Wrap all rerenders in act()
✅ Use custom render/renderHook wrappers
✅ Fail tests on act() warnings
✅ Use custom async waitFor

❌ Never test without act()
❌ Don't use vitest's waitFor
❌ Don't forget await on async act()

## Next Steps

Read `03-testing-input.md` to learn how to test keyboard and mouse input in terminal applications.
