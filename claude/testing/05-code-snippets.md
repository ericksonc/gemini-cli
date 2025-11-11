# Testing Code Snippets - Copy & Paste Ready

## Quick Start Template

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('should render initial state', () => {
    const { lastFrame } = render(<MyComponent />);
    expect(lastFrame()).toContain('Expected text');
  });

  it('should update on prop change', () => {
    const { lastFrame, rerender } = render(<MyComponent value="initial" />);

    expect(lastFrame()).toContain('initial');

    act(() => {
      rerender(<MyComponent value="updated" />);
    });

    expect(lastFrame()).toContain('updated');
  });
});
```

## Custom render() Wrapper

```typescript
// test-utils/render.tsx
import { render as inkRender } from 'ink-testing-library';
import { act } from 'react';

export const render = (
  tree: React.ReactElement,
  terminalWidth?: number
) => {
  let renderResult: ReturnType<typeof inkRender>;

  act(() => {
    renderResult = inkRender(tree);
  });

  if (terminalWidth !== undefined && renderResult.stdout) {
    Object.defineProperty(renderResult.stdout, 'columns', {
      get: () => terminalWidth,
      configurable: true,
    });

    act(() => {
      renderResult.rerender(tree);
    });
  }

  const originalUnmount = renderResult.unmount;
  const originalRerender = renderResult.rerender;

  return {
    ...renderResult,
    unmount: () => act(() => originalUnmount()),
    rerender: (newTree: React.ReactElement) =>
      act(() => originalRerender(newTree)),
  };
};
```

## MockStdin Class

```typescript
import { EventEmitter } from 'events';

export class MockStdin extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();
  resume = vi.fn();
  pause = vi.fn();

  override on = this.addListener;
  override removeListener = super.removeListener;

  write(text: string) {
    this.emit('data', text);
  }
}
```

## useStdin Mock Setup

```typescript
import { vi } from 'vitest';
import { useStdin } from 'ink';

vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useStdin: vi.fn(),
  };
});

describe('MyComponent', () => {
  let stdin: MockStdin;

  beforeEach(() => {
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: stdin.setRawMode,
    });
  });

  it('should handle input', () => {
    const { lastFrame } = render(<MyComponent />);

    act(() => {
      stdin.write('test');
      stdin.write('\r'); // Enter
    });

    expect(lastFrame()).toContain('test');
  });
});
```

## Custom waitFor

```typescript
// test-utils/async.ts
import { act } from 'react';

export async function waitFor(
  assertion: () => void,
  { timeout = 1000, interval = 50 } = {}
): Promise<void> {
  const startTime = Date.now();

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - startTime > timeout) {
        throw error;
      }

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, interval));
      });
    }
  }
}
```

## renderHook Utility

```typescript
// test-utils/render.tsx
import { act } from 'react';

export function renderHook<Result, Props>(
  renderCallback: (props: Props) => Result,
  options?: {
    initialProps?: Props;
    wrapper?: React.ComponentType<{ children: React.ReactNode }>;
  }
) {
  const result = { current: undefined as unknown as Result };
  let currentProps = options?.initialProps as Props;

  function TestComponent({ renderCallback, props }: any) {
    result.current = renderCallback(props);
    return null;
  }

  const Wrapper = options?.wrapper || (({ children }) => <>{children}</>);

  let inkRerender: (tree: React.ReactElement) => void;
  let unmount: () => void;

  act(() => {
    const renderResult = render(
      <Wrapper>
        <TestComponent renderCallback={renderCallback} props={currentProps} />
      </Wrapper>
    );
    inkRerender = renderResult.rerender;
    unmount = renderResult.unmount;
  });

  function rerender(props?: Props) {
    if (arguments.length > 0) {
      currentProps = props as Props;
    }
    act(() => {
      inkRerender(
        <Wrapper>
          <TestComponent renderCallback={renderCallback} props={currentProps} />
        </Wrapper>
      );
    });
  }

  return { result, rerender, unmount };
}
```

## Testing Hooks Example

```typescript
describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should increment every second', () => {
    const { result } = renderHook(() => useTimer(true, 0));

    expect(result.current).toBe(0);

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

## Terminal Keys Enum

```typescript
// test-utils/keys.ts
export enum TerminalKeys {
  // Basic keys
  ENTER = '\r',
  TAB = '\t',
  ESCAPE = '\x1b',
  BACKSPACE = '\x7f',

  // Control keys
  CTRL_A = '\x01',
  CTRL_C = '\x03',
  CTRL_D = '\x04',
  CTRL_Z = '\x1a',

  // Arrow keys
  UP_ARROW = '\x1b[A',
  DOWN_ARROW = '\x1b[B',
  RIGHT_ARROW = '\x1b[C',
  LEFT_ARROW = '\x1b[D',

  // Navigation keys
  HOME = '\x1b[H',
  END = '\x1b[F',
  PAGE_UP = '\x1b[5~',
  PAGE_DOWN = '\x1b[6~',
  DELETE = '\x1b[3~',
  INSERT = '\x1b[2~',
}
```

## Mouse Event Simulation

```typescript
// SGR mouse events
const mouseClick = (col: number, row: number) =>
  `\x1b[<0;${col};${row}M`;

const mouseRelease = (col: number, row: number) =>
  `\x1b[<0;${col};${row}m`;

const scrollUp = (col: number, row: number) =>
  `\x1b[<64;${col};${row}M`;

const scrollDown = (col: number, row: number) =>
  `\x1b[<65;${col};${row}M`;

// Usage
act(() => {
  stdin.write(mouseClick(10, 20));
  stdin.write(mouseRelease(10, 20));
});
```

## Component with Context Test

```typescript
describe('ComponentWithContext', () => {
  const mockContextValue = {
    state: 'initial',
    setState: vi.fn(),
  };

  it('should use context value', () => {
    const { lastFrame } = render(
      <MyContext.Provider value={mockContextValue}>
        <MyComponent />
      </MyContext.Provider>
    );

    expect(lastFrame()).toContain('initial');
  });
});
```

## Testing Async State Updates

```typescript
it('should update after async operation', async () => {
  const { lastFrame } = render(<AsyncComponent />);

  expect(lastFrame()).toContain('Loading...');

  await waitFor(() => {
    expect(lastFrame()).toContain('Loaded');
  }, { timeout: 2000 });
});
```

## Snapshot Testing

```typescript
it('should match snapshot', () => {
  const { lastFrame } = render(<MyComponent prop="value" />);

  expect(lastFrame()).toMatchSnapshot();
});
```

## Testing Responsive Layout

```typescript
describe('responsive layout', () => {
  it('should render single line on wide terminal', () => {
    const { lastFrame } = render(<MyComponent />, 120);

    expect(lastFrame()?.includes('\n')).toBe(false);
  });

  it('should render multiple lines on narrow terminal', () => {
    const { lastFrame } = render(<MyComponent />, 40);

    const lines = lastFrame()?.split('\n');
    expect(lines).toHaveLength(3);
  });
});
```

## Mock Child Components

```typescript
vi.mock('./ChildComponent.js', () => ({
  ChildComponent: ({ value }: { value: string }) => (
    <Text>MockChild: {value}</Text>
  ),
}));

it('should render with mocked child', () => {
  const { lastFrame } = render(<ParentComponent />);

  expect(lastFrame()).toContain('MockChild');
});
```

## Test Setup File

```typescript
// test-setup.ts
import { beforeEach, afterEach, vi } from 'vitest';
import { format } from 'node:util';

global.IS_REACT_ACT_ENVIRONMENT = true;

// Unset NO_COLOR for consistent theme tests
if (process.env.NO_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

// Import custom matchers
import './src/test-utils/customMatchers';

// Track act() warnings
let actWarnings: Array<{ message: string; stack: string }> = [];

beforeEach(() => {
  actWarnings = [];

  vi.spyOn(console, 'error').mockImplementation((...args) => {
    const message = String(args[0]);

    if (message.includes('was not wrapped in act(...)')) {
      actWarnings.push({
        message: format(...args),
        stack: new Error().stack || '',
      });
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();

  if (actWarnings.length > 0) {
    const messages = actWarnings.map(w => w.message).join('\n\n');
    throw new Error(`Test failed due to act() warnings:\n${messages}`);
  }
});
```

## Vitest Config

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: true,
    setupFiles: ['./test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

## Parameterized Tests

```typescript
it.each([
  { input: 'hello', expected: 'HELLO' },
  { input: 'world', expected: 'WORLD' },
  { input: 'test', expected: 'TEST' },
])('should uppercase "$input"', ({ input, expected }) => {
  const { lastFrame } = render(<UppercaseComponent text={input} />);

  expect(lastFrame()).toContain(expected);
});
```

## Testing Keyboard Events

```typescript
import { TerminalKeys } from '../test-utils/keys';

it.each([
  { key: TerminalKeys.UP_ARROW, expected: 'up' },
  { key: TerminalKeys.DOWN_ARROW, expected: 'down' },
  { key: TerminalKeys.ENTER, expected: 'submit' },
])('should handle $expected on key press', ({ key, expected }) => {
  const handler = vi.fn();
  const { stdin } = render(<KeyHandler onKey={handler} />);

  act(() => {
    stdin.write(key);
  });

  expect(handler).toHaveBeenCalledWith(expected);
});
```

## Testing with Fake Timers

```typescript
describe('TimerComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should update after timeout', () => {
    const { lastFrame } = render(<TimerComponent delay={1000} />);

    expect(lastFrame()).toContain('Waiting...');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(lastFrame()).toContain('Done!');
  });
});
```

## Custom Matcher Example

```typescript
// test-utils/customMatchers.ts
import { expect } from 'vitest';

expect.extend({
  toContainANSI(received: string, expectedColor: string) {
    const ansiCodes = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      blue: '\x1b[34m',
    };

    const code = ansiCodes[expectedColor];
    const pass = received.includes(code);

    return {
      pass,
      message: () =>
        pass
          ? `Expected not to contain ${expectedColor} ANSI`
          : `Expected to contain ${expectedColor} ANSI`,
    };
  },
});

// Usage
it('should render blue text', () => {
  const { lastFrame } = render(<Text color="blue">Hello</Text>);

  expect(lastFrame()).toContainANSI('blue');
});
```

## Complete Test File Template

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render, waitFor, TerminalKeys } from '../test-utils';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  let onSubmit: vi.Mock;

  beforeEach(() => {
    onSubmit = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render initial state', () => {
      const { lastFrame } = render(<MyComponent onSubmit={onSubmit} />);

      expect(lastFrame()).toContain('Initial state');
    });

    it('should match snapshot', () => {
      const { lastFrame } = render(<MyComponent onSubmit={onSubmit} />);

      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('user interactions', () => {
    it('should handle text input', () => {
      const { stdin, lastFrame } = render(<MyComponent onSubmit={onSubmit} />);

      act(() => {
        stdin.write('Hello');
      });

      expect(lastFrame()).toContain('Hello');
    });

    it('should submit on Enter', () => {
      const { stdin } = render(<MyComponent onSubmit={onSubmit} />);

      act(() => {
        stdin.write('Test message');
        stdin.write(TerminalKeys.ENTER);
      });

      expect(onSubmit).toHaveBeenCalledWith('Test message');
    });
  });

  describe('responsive layout', () => {
    it('should adapt to narrow width', () => {
      const { lastFrame } = render(<MyComponent onSubmit={onSubmit} />, 40);

      const lines = lastFrame()?.split('\n');
      expect(lines?.length).toBeGreaterThan(1);
    });
  });
});
```

## Debugging Tips

```typescript
// Print last frame for debugging
it('should render correctly', () => {
  const { lastFrame } = render(<MyComponent />);

  console.log(lastFrame()); // See actual output

  expect(lastFrame()).toContain('Expected');
});

// Print all frames to see render history
it('should not render too many times', () => {
  const { frames } = render(<MyComponent />);

  console.log('Render count:', frames.length);
  frames.forEach((frame, i) => {
    console.log(`Frame ${i}:`, frame);
  });

  expect(frames.length).toBeLessThanOrEqual(3);
});
```

## Key Takeaways

1. Always wrap updates in `act()`
2. Use custom utilities to reduce boilerplate
3. Mock stdin for input testing
4. Use fake timers for time-based tests
5. Test responsive layouts with different widths
6. Create reusable test helpers
7. Enforce act() usage with test setup

---

Copy these snippets into your test files and adapt as needed!
