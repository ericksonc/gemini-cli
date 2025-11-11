# ink-testing-library Deep Dive

## Installation

```bash
npm install --save-dev ink-testing-library vitest @types/react
```

## Basic Usage

### Simple Render

```typescript
import { render } from 'ink-testing-library';
import { Text } from 'ink';

const { lastFrame } = render(<Text>Hello World</Text>);

console.log(lastFrame());
// Output: "Hello World"
```

### Return Values

```typescript
const result = render(<MyComponent />);

result.lastFrame();    // Get current terminal output as string
result.frames;         // Array of all frames (render history)
result.stdin;          // Mock stdin for simulating input
result.stdout;         // Mock stdout
result.rerender(tree); // Update component with new props
result.unmount();      // Unmount component
```

## lastFrame() - The Core Testing Method

### What is lastFrame()?

`lastFrame()` returns the current terminal output as a string, exactly as it would appear in a real terminal.

```typescript
const { lastFrame } = render(
  <Box flexDirection="column">
    <Text color="blue">Line 1</Text>
    <Text color="red">Line 2</Text>
  </Box>
);

const output = lastFrame();
// output === "Line 1\nLine 2"
// (ANSI color codes are included but not shown here)
```

### Text Assertions

```typescript
const { lastFrame } = render(<MyComponent />);

// Contains text
expect(lastFrame()).toContain('Hello');

// Exact match
expect(lastFrame()).toBe('Expected output');

// Regex match
expect(lastFrame()).toMatch(/Hello \w+/);

// Multiple lines
const output = lastFrame();
const lines = output?.split('\n');
expect(lines[0]).toBe('First line');
expect(lines[1]).toBe('Second line');
```

### Snapshot Testing

```typescript
it('should render correctly', () => {
  const { lastFrame } = render(<MyComponent prop="value" />);

  expect(lastFrame()).toMatchSnapshot();
});
```

**Benefits**:
- Catches unintended UI changes
- Visual regression testing
- Fast to write

**Drawbacks**:
- Snapshots can be large
- Can hide real bugs if not reviewed
- ANSI codes make diffs hard to read

## Terminal Width Simulation

### Custom Width

```typescript
const { lastFrame } = render(<MyComponent />, 80); // 80 columns
```

This sets `process.stdout.columns` to 80 for the component.

### Responsive Layout Testing

```typescript
describe('responsive layout', () => {
  it('should render single line on wide terminal', () => {
    const { lastFrame } = render(<MyComponent />, 120);

    const output = lastFrame();
    expect(output?.includes('\n')).toBe(false); // No line breaks
  });

  it('should render multiple lines on narrow terminal', () => {
    const { lastFrame } = render(<MyComponent />, 40);

    const output = lastFrame();
    const lines = output?.split('\n');
    expect(lines).toHaveLength(3); // Split into 3 lines
  });
});
```

## Simulating User Input

### stdin Property

The `stdin` property is a mock stdin that components can read from.

```typescript
const { stdin, lastFrame } = render(<InputComponent />);

// Simulate typing
stdin.write('H');
stdin.write('e');
stdin.write('l');
stdin.write('l');
stdin.write('o');

// Simulate Enter key
stdin.write('\r');

expect(lastFrame()).toContain('You typed: Hello');
```

### Special Keys

```typescript
// Enter
stdin.write('\r');      // or '\n'

// Backspace
stdin.write('\x7f');    // or '\x08'

// Tab
stdin.write('\t');

// Escape
stdin.write('\x1b');

// Ctrl+C
stdin.write('\x03');

// Arrow keys
stdin.write('\x1b[A');  // Up
stdin.write('\x1b[B');  // Down
stdin.write('\x1b[C');  // Right
stdin.write('\x1b[D');  // Left

// Mouse click (SGR format)
stdin.write('\x1b[<0;10;20M');  // Left click at col 10, row 20
```

### Input Must Be Wrapped in act()

**Critical**: Always wrap input in `act()` to ensure React updates complete.

```typescript
import { act } from 'react';

const { stdin } = render(<MyComponent />);

// ❌ WRONG
stdin.write('\r');

// ✅ CORRECT
act(() => {
  stdin.write('\r');
});
```

## Updating Components (rerender)

### Props Changes

```typescript
const { lastFrame, rerender } = render(<MyComponent value="initial" />);

expect(lastFrame()).toContain('initial');

// Update props
rerender(<MyComponent value="updated" />);

expect(lastFrame()).toContain('updated');
```

### With Context

```typescript
const { lastFrame, rerender } = render(
  <MyContext.Provider value="initial">
    <MyComponent />
  </MyContext.Provider>
);

expect(lastFrame()).toContain('initial');

rerender(
  <MyContext.Provider value="updated">
    <MyComponent />
  </MyContext.Provider>
);

expect(lastFrame()).toContain('updated');
```

### Must Be Wrapped in act()

```typescript
import { act } from 'react';

// ❌ WRONG
rerender(<MyComponent updated={true} />);

// ✅ CORRECT
act(() => {
  rerender(<MyComponent updated={true} />);
});
```

## Cleanup (unmount)

```typescript
const { unmount } = render(<MyComponent />);

// After test
unmount();
```

### Why Unmount?

- Prevents memory leaks
- Cleans up timers and subscriptions
- Stops background processes

### Automatic Cleanup with afterEach

```typescript
import { afterEach } from 'vitest';

let renderResult: ReturnType<typeof render> | null = null;

afterEach(() => {
  if (renderResult) {
    renderResult.unmount();
    renderResult = null;
  }
});

it('test 1', () => {
  renderResult = render(<MyComponent />);
  // Test code
});
```

## Frames Array

The `frames` property contains the render history:

```typescript
const { frames } = render(<Counter />);

// frames[0] - Initial render
// frames[1] - After first update
// frames[2] - After second update
// etc.

console.log(frames.length); // Number of renders
console.log(frames[0]);     // First render output
```

**Use case**: Debugging render loops or unexpected updates.

## stdout Property

The `stdout` mock provides:

```typescript
const { stdout } = render(<MyComponent />);

stdout.columns;  // Terminal width
stdout.rows;     // Terminal height
stdout.write;    // Mock write function
```

### Overriding Terminal Size

```typescript
Object.defineProperty(stdout, 'columns', {
  get: () => 100,
  configurable: true,
});

Object.defineProperty(stdout, 'rows', {
  get: () => 30,
  configurable: true,
});
```

## Testing with Providers

### Manual Provider Wrapping

```typescript
const { lastFrame } = render(
  <SettingsProvider value={mockSettings}>
    <ThemeProvider theme={mockTheme}>
      <MyComponent />
    </ThemeProvider>
  </SettingsProvider>
);
```

### Helper Function Pattern

```typescript
const renderWithProviders = (
  component: React.ReactElement,
  options = {}
) => {
  return render(
    <SettingsProvider value={options.settings || defaultSettings}>
      <ThemeProvider theme={options.theme || defaultTheme}>
        {component}
      </ThemeProvider>
    </SettingsProvider>,
    options.width
  );
};

// Usage
const { lastFrame } = renderWithProviders(<MyComponent />, {
  settings: customSettings,
  width: 100,
});
```

## Common Patterns from Gemini CLI

### Pattern 1: Custom Render Wrapper

**Source**: `/packages/cli/src/test-utils/render.tsx`

```typescript
import { render as inkRender } from 'ink-testing-library';
import { act } from 'react';

export const render = (
  tree: React.ReactElement,
  terminalWidth?: number
): ReturnType<typeof inkRender> => {
  let renderResult: ReturnType<typeof inkRender>;

  // Wrap initial render in act()
  act(() => {
    renderResult = inkRender(tree);
  });

  // Set terminal width if provided
  if (terminalWidth !== undefined && renderResult.stdout) {
    Object.defineProperty(renderResult.stdout, 'columns', {
      get: () => terminalWidth,
      configurable: true,
    });

    // Rerender to pick up new width
    act(() => {
      renderResult.rerender(tree);
    });
  }

  // Wrap unmount and rerender in act()
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
- All renders automatically wrapped in act()
- Terminal width control
- Cleaner test code

### Pattern 2: Component Mocking

```typescript
import { vi } from 'vitest';

// Mock child components to isolate testing
vi.mock('./LoadingIndicator.js', () => ({
  LoadingIndicator: ({ thought }: { thought?: string }) => (
    <Text>MockLoadingIndicator{thought ? `: ${thought}` : ''}</Text>
  ),
}));

// Now tests only focus on parent component logic
const { lastFrame } = render(<ParentComponent />);
expect(lastFrame()).toContain('MockLoadingIndicator');
```

### Pattern 3: Context Value Mocking

```typescript
const mockContextValue = {
  state: 'initial',
  setState: vi.fn(),
};

const { lastFrame } = render(
  <MyContext.Provider value={mockContextValue}>
    <MyComponent />
  </MyContext.Provider>
);

// Verify context was used
expect(mockContextValue.setState).toHaveBeenCalled();
```

## Limitations

### What You CAN'T Test

❌ **Actual terminal rendering** - It's a virtual buffer, not a real terminal
❌ **Color appearance** - ANSI codes are strings, not visual colors
❌ **Terminal emulator behavior** - No iTerm2/Alacritty/etc. specifics
❌ **Performance** - Virtual rendering is slower than production

### What You CAN Test

✅ **Component logic** - State, props, events
✅ **Text output** - What users see
✅ **Layout** - Line breaks, spacing, alignment
✅ **User interactions** - Key presses, mouse events
✅ **Responsive behavior** - Different terminal widths

## Key Takeaways

1. **Always use act()** - Wrap all renders, updates, and input
2. **lastFrame() is your friend** - Primary assertion method
3. **Terminal width matters** - Test responsive layouts
4. **Mock carefully** - Balance isolation and realism
5. **Snapshot judiciously** - Useful but can hide bugs
6. **Clean up** - Always unmount after tests

## Next Steps

Read `02-act-pattern.md` to master the critical act() pattern for reliable tests.
