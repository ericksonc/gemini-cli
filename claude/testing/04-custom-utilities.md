# Building Custom Test Utilities

## Why Custom Utilities?

Testing Ink applications requires repetitive setup:
- Wrapping everything in `act()`
- Providing React Context providers
- Mocking terminal size
- Creating mock dependencies

**Custom utilities solve this** by encapsulating common patterns.

## Pattern 1: Custom Render Function

### Problem

```typescript
// Every test needs this boilerplate
import { render as inkRender } from 'ink-testing-library';
import { act } from 'react';

act(() => {
  const result = inkRender(<MyComponent />);
});
```

### Solution

**File**: `test-utils/render.tsx`

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

    // Trigger rerender to pick up new width
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

**Usage**:

```typescript
import { render } from '../test-utils/render';

const { lastFrame } = render(<MyComponent />, 100); // 100 columns
```

**Benefits**:
- Automatic act() wrapping
- Terminal width control
- Clean test code

## Pattern 2: renderWithProviders

### Problem

Components need multiple Context providers:

```typescript
<ConfigProvider>
  <SettingsProvider>
    <ThemeProvider>
      <KeypressProvider>
        <MouseProvider>
          <MyComponent />
        </MouseProvider>
      </KeypressProvider>
    </ThemeProvider>
  </SettingsProvider>
</ConfigProvider>
```

### Solution

**File**: `test-utils/render.tsx`

```typescript
export const renderWithProviders = (
  component: React.ReactElement,
  {
    config,
    settings,
    theme,
    uiState,
    width,
    mouseEventsEnabled = false,
  }: {
    config?: Config;
    settings?: Settings;
    theme?: Theme;
    uiState?: Partial<UIState>;
    width?: number;
    mouseEventsEnabled?: boolean;
  } = {}
): ReturnType<typeof render> => {
  // Merge provided values with defaults
  const finalConfig = config || mockConfig;
  const finalSettings = settings || mockSettings;
  const finalTheme = theme || defaultTheme;
  const finalUIState = { ...baseMockUIState, ...uiState };

  return render(
    <ConfigContext.Provider value={finalConfig}>
      <SettingsContext.Provider value={finalSettings}>
        <ThemeContext.Provider value={finalTheme}>
          <UIStateContext.Provider value={finalUIState}>
            <KeypressProvider>
              <MouseProvider mouseEventsEnabled={mouseEventsEnabled}>
                <Box width={width || 100}>
                  {component}
                </Box>
              </MouseProvider>
            </KeypressProvider>
          </UIStateContext.Provider>
        </ThemeContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
    width
  );
};
```

**Usage**:

```typescript
const { lastFrame } = renderWithProviders(<MyComponent />, {
  settings: customSettings,
  width: 120,
});
```

## Pattern 3: renderHook Utility

### Problem

Testing hooks requires a test component:

```typescript
function TestComponent() {
  const result = useMyHook();
  // Now what? How do I assert on result?
}
```

### Solution

**File**: `test-utils/render.tsx`

```typescript
export function renderHook<Result, Props>(
  renderCallback: (props: Props) => Result,
  options?: {
    initialProps?: Props;
    wrapper?: React.ComponentType<{ children: React.ReactNode }>;
  }
): {
  result: { current: Result };
  rerender: (props?: Props) => void;
  unmount: () => void;
} {
  const result = { current: undefined as unknown as Result };
  let currentProps = options?.initialProps as Props;

  function TestComponent({
    renderCallback,
    props,
  }: {
    renderCallback: (props: Props) => Result;
    props: Props;
  }) {
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

**Usage**:

```typescript
const { result, rerender } = renderHook(() => useTimer(true, 0));

expect(result.current).toBe(0);

act(() => {
  vi.advanceTimersByTime(1000);
});

expect(result.current).toBe(1);
```

## Pattern 4: waitFor with act()

### Problem

Vitest's `waitFor` doesn't wrap in act(), causing warnings.

### Solution

**File**: `test-utils/async.ts`

```typescript
export async function waitFor(
  assertion: () => void,
  { timeout = 1000, interval = 50 } = {}
): Promise<void> {
  const startTime = Date.now();

  while (true) {
    try {
      assertion();
      return; // Success
    } catch (error) {
      if (Date.now() - startTime > timeout) {
        throw error; // Timeout
      }

      // Wait and retry, wrapped in act()
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, interval));
      });
    }
  }
}
```

**Usage**:

```typescript
await waitFor(() => {
  expect(lastFrame()).toContain('Updated');
}, { timeout: 2000, interval: 100 });
```

## Pattern 5: Custom Matchers

### Problem

Domain-specific assertions are verbose:

```typescript
const output = lastFrame();
const lines = output.split('\n');
expect(lines.every(line => !line.includes('\x1b'))).toBe(true);
```

### Solution

**File**: `test-utils/customMatchers.ts`

```typescript
import { expect } from 'vitest';

expect.extend({
  toHaveOnlyValidCharacters(received: TextBuffer) {
    let pass = true;
    const invalidLines: Array<{ line: number; content: string }> = [];

    for (let i = 0; i < received.lines.length; i++) {
      const line = received.lines[i];
      if (line.includes('\n') || /[\x00-\x08\x0B-\x1F]/.test(line)) {
        pass = false;
        invalidLines.push({ line: i, content: line });
      }
    }

    return {
      pass,
      message: () =>
        pass
          ? `Expected buffer to have invalid characters`
          : `Expected buffer to have only valid characters.\nInvalid lines:\n${invalidLines.map(l => `  Line ${l.line}: ${JSON.stringify(l.content)}`).join('\n')}`,
    };
  },

  toContainANSI(received: string, expectedColor: string) {
    const ansiCodes = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
    };

    const code = ansiCodes[expectedColor];
    const pass = received.includes(code);

    return {
      pass,
      message: () =>
        pass
          ? `Expected string not to contain ${expectedColor} ANSI code`
          : `Expected string to contain ${expectedColor} ANSI code`,
    };
  },
});

// Type definitions
declare global {
  namespace Vi {
    interface Matchers<R = unknown> {
      toHaveOnlyValidCharacters(): R;
      toContainANSI(color: string): R;
    }
  }
}
```

**Usage**:

```typescript
expect(buffer).toHaveOnlyValidCharacters();
expect(lastFrame()).toContainANSI('blue');
```

## Pattern 6: Mock Creators

### Problem

Creating realistic mocks is tedious:

```typescript
const mockConfig = {
  getModel: () => 'model',
  getTargetDir: () => '/path',
  getDebugMode: () => false,
  // ... 50 more methods
};
```

### Solution

**File**: `test-utils/mockConfig.ts`

```typescript
export const createMockConfig = (
  overrides: Partial<Config> = {}
): Config => {
  const defaults: Config = {
    getModel: () => 'gemini-pro',
    getTargetDir: () => '/test/dir',
    getDebugMode: () => false,
    getApiKey: () => 'test-key',
    // ... all required methods
  };

  return new Proxy({ ...defaults, ...overrides }, {
    get(target, prop) {
      if (prop in target) {
        return target[prop as keyof typeof target];
      }
      throw new Error(`mockConfig missing property: ${String(prop)}`);
    },
  }) as Config;
};
```

**Usage**:

```typescript
const config = createMockConfig({
  getModel: () => 'custom-model',
});
```

## Pattern 7: Global Test Setup

### Problem

Every test file needs the same setup:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

### Solution

**File**: `test-setup.ts` (referenced in vitest.config.ts)

```typescript
import { beforeEach, afterEach, vi } from 'vitest';

// Set React environment flag
global.IS_REACT_ACT_ENVIRONMENT = true;

// Enforce NO_COLOR for consistent theme tests
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
    throw new Error(
      `Test failed due to act() warnings:\n${actWarnings.map(w => w.message).join('\n\n')}`
    );
  }
});
```

## Pattern 8: Enum for Terminal Keys

### Problem

Magic strings are hard to maintain:

```typescript
stdin.write('\x1b[A');  // What key is this?
stdin.write('\u001B[B'); // Different format, same thing?
```

### Solution

**File**: `test-utils/keys.ts`

```typescript
export enum TerminalKeys {
  ENTER = '\r',
  TAB = '\t',
  ESCAPE = '\x1b',
  BACKSPACE = '\x7f',
  CTRL_C = '\x03',
  CTRL_D = '\x04',

  UP_ARROW = '\x1b[A',
  DOWN_ARROW = '\x1b[B',
  RIGHT_ARROW = '\x1b[C',
  LEFT_ARROW = '\x1b[D',

  HOME = '\x1b[H',
  END = '\x1b[F',
  PAGE_UP = '\x1b[5~',
  PAGE_DOWN = '\x1b[6~',
  DELETE = '\x1b[3~',
}
```

**Usage**:

```typescript
import { TerminalKeys } from '../test-utils/keys';

act(() => {
  stdin.write(TerminalKeys.UP_ARROW);
  stdin.write(TerminalKeys.ENTER);
});
```

## Complete Example: Test Utils Package

### File Structure

```
test-utils/
├── index.ts              # Re-export everything
├── render.tsx            # render, renderWithProviders, renderHook
├── async.ts              # waitFor
├── customMatchers.ts     # Custom expect matchers
├── mockConfig.ts         # Mock creators
├── mockSettings.ts       # Mock settings
├── mockCommandContext.ts # Mock command context
└── keys.ts               # Terminal key enum
```

### index.ts

```typescript
export { render, renderWithProviders, renderHook } from './render';
export { waitFor } from './async';
export { createMockConfig } from './mockConfig';
export { createMockSettings } from './mockSettings';
export { TerminalKeys } from './keys';
export './customMatchers'; // Side effect: register matchers
```

### Usage in Tests

```typescript
import { render, renderWithProviders, waitFor, TerminalKeys } from '../test-utils';

describe('MyComponent', () => {
  it('should render', () => {
    const { lastFrame } = render(<MyComponent />);
    expect(lastFrame()).toContain('Hello');
  });

  it('should handle input', async () => {
    const { stdin } = renderWithProviders(<MyComponent />);

    act(() => {
      stdin.write(TerminalKeys.ENTER);
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('Submitted');
    });
  });
});
```

## Best Practices

1. **One util file per concern** - render, async, mocks, etc.
2. **Export from index** - Single import point
3. **Document with JSDoc** - Help future developers
4. **Test your utils** - They're code too!
5. **Use TypeScript** - Type safety for utilities
6. **Keep it simple** - Don't over-abstract
7. **Follow conventions** - Match testing library patterns

## Testing Your Utilities

```typescript
// test-utils/render.test.ts
describe('render utility', () => {
  it('should wrap in act()', () => {
    const spy = vi.spyOn(console, 'error');

    const { lastFrame } = render(<Text>Test</Text>);

    expect(spy).not.toHaveBeenCalledWith(
      expect.stringContaining('act(...)')
    );

    spy.mockRestore();
  });

  it('should set terminal width', () => {
    const { stdout } = render(<Text>Test</Text>, 80);

    expect(stdout.columns).toBe(80);
  });
});
```

## Key Takeaways

1. **Encapsulate repetition** - DRY principle
2. **Wrap act() automatically** - Less boilerplate
3. **Provide defaults** - Make tests easy
4. **Custom matchers** - Domain-specific assertions
5. **Global setup** - Enforce standards
6. **Test your utilities** - They're production code

## Next Steps

Read `05-code-snippets.md` for copy-paste ready code examples.
