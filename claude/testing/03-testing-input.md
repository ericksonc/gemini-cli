# Testing Keyboard & Mouse Input

## Overview

Testing terminal input is complex because:
- **Raw ANSI escape sequences** for special keys
- **Two mouse protocols** (SGR and X11)
- **Modifier keys** encoded in sequences
- **Incomplete sequences** can arrive

## Mock stdin Pattern

### Basic MockStdin Class

```typescript
import { EventEmitter } from 'events';

class MockStdin extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();
  resume = vi.fn();
  pause = vi.fn();

  // Simulate data events
  write(text: string) {
    this.emit('data', text);
  }
}
```

### Using with Ink

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

const stdin = new MockStdin();
(useStdin as Mock).mockReturnValue({
  stdin,
  setRawMode: stdin.setRawMode,
});
```

## Testing Keyboard Input

### Regular Characters

```typescript
act(() => {
  stdin.write('a');  // Single character
  stdin.write('Hello');  // Multiple characters
});
```

### Special Keys

```typescript
// Enter
act(() => stdin.write('\r'));     // Carriage return
act(() => stdin.write('\n'));     // Line feed

// Backspace
act(() => stdin.write('\x7f'));   // DEL
act(() => stdin.write('\x08'));   // BS

// Tab
act(() => stdin.write('\t'));

// Escape
act(() => stdin.write('\x1b'));

// Ctrl+C
act(() => stdin.write('\x03'));

// Ctrl+D
act(() => stdin.write('\x04'));
```

### Arrow Keys

```typescript
act(() => stdin.write('\x1b[A'));  // Up
act(() => stdin.write('\x1b[B'));  // Down
act(() => stdin.write('\x1b[C'));  // Right
act(() => stdin.write('\x1b[D'));  // Left
```

### Function Keys

```typescript
act(() => stdin.write('\x1bOP'));  // F1
act(() => stdin.write('\x1bOQ'));  // F2
act(() => stdin.write('\x1bOR'));  // F3
act(() => stdin.write('\x1bOS'));  // F4

// F5-F12 use different sequences
act(() => stdin.write('\x1b[15~'));  // F5
act(() => stdin.write('\x1b[17~'));  // F6
// etc.
```

### Modifier Keys

#### Ctrl + Key

```typescript
// Ctrl+A through Ctrl+Z are ASCII 1-26
act(() => stdin.write('\x01'));  // Ctrl+A
act(() => stdin.write('\x02'));  // Ctrl+B
// ...
act(() => stdin.write('\x1a'));  // Ctrl+Z
```

#### Alt + Key

```typescript
// Alt sends ESC prefix
act(() => stdin.write('\x1ba'));  // Alt+A
act(() => stdin.write('\x1bx'));  // Alt+X
```

#### Shift + Arrow

```typescript
act(() => stdin.write('\x1b[1;2A'));  // Shift+Up
act(() => stdin.write('\x1b[1;2B'));  // Shift+Down
act(() => stdin.write('\x1b[1;2C'));  // Shift+Right
act(() => stdin.write('\x1b[1;2D'));  // Shift+Left
```

#### Ctrl + Arrow

```typescript
act(() => stdin.write('\x1b[1;5A'));  // Ctrl+Up
act(() => stdin.write('\x1b[1;5B'));  // Ctrl+Down
act(() => stdin.write('\x1b[1;5C'));  // Ctrl+Right
act(() => stdin.write('\x1b[1;5D'));  // Ctrl+Left
```

## Kitty Keyboard Protocol

Kitty protocol provides enhanced key detection:

```typescript
// Simple key
act(() => stdin.write('\x1b[97u'));  // 'a'

// With modifiers
act(() => stdin.write('\x1b[97;3u'));  // Alt+a (modifier code 3)
act(() => stdin.write('\x1b[97;5u'));  // Ctrl+a (modifier code 5)

// Special keys
act(() => stdin.write('\x1b[13u'));    // Enter (keycode 13)
act(() => stdin.write('\x1b[27u'));    // Escape (keycode 27)

// Numpad Enter
act(() => stdin.write('\x1b[57414u')); // Keycode 57414
```

### Modifier Codes

| Modifier | Code |
|----------|------|
| Shift | 2 |
| Alt | 3 |
| Shift+Alt | 4 |
| Ctrl | 5 |
| Shift+Ctrl | 6 |
| Alt+Ctrl | 7 |
| Shift+Alt+Ctrl | 8 |

## Testing Mouse Input

### SGR Mouse Protocol (Preferred)

**Format**: `\x1b[<button;col;row[Mm]`
- `M` = press
- `m` = release

```typescript
// Left click at column 10, row 20
act(() => stdin.write('\x1b[<0;10;20M'));  // Press
act(() => stdin.write('\x1b[<0;10;20m'));  // Release

// Right click
act(() => stdin.write('\x1b[<2;15;25M'));

// Middle click
act(() => stdin.write('\x1b[<1;5;5M'));

// Scroll up
act(() => stdin.write('\x1b[<64;10;10M'));

// Scroll down
act(() => stdin.write('\x1b[<65;10;10M'));

// Mouse move (with button held)
act(() => stdin.write('\x1b[<32;12;12M'));
```

### Button Codes

```typescript
// Basic buttons
0  // Left button
1  // Middle button
2  // Right button

// Scroll
64 // Scroll up
65 // Scroll down

// Movement
32 // Move (bit flag added to button)
```

### Modifier Flags

```typescript
// Add these to button code
+4   // Shift held
+8   // Alt/Meta held
+16  // Ctrl held

// Example: Ctrl+Left click
act(() => stdin.write('\x1b[<16;10;20M')); // 0 + 16 = 16
```

### X11 Mouse Protocol (Fallback)

**Format**: `\x1b[M<byte><byte><byte>`

```typescript
// Encode: charCode = value + 32
const encode = (n: number) => String.fromCharCode(n + 32);

// Left click at column 10, row 20
const button = encode(0);      // Button code
const col = encode(10);         // Column
const row = encode(20);         // Row

act(() => stdin.write(`\x1b[M${button}${col}${row}`));
```

## Bracketed Paste Mode

Multi-line pastes are wrapped in special sequences:

```typescript
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

act(() => {
  stdin.write(PASTE_START);
  stdin.write('Line 1\n');
  stdin.write('Line 2\n');
  stdin.write('Line 3');
  stdin.write(PASTE_END);
});
```

## Complete Input Test Example

From Gemini CLI keyboard tests:

```typescript
describe('KeypressContext', () => {
  let stdin: MockStdin;
  let keyHandler: vi.Mock;

  beforeEach(() => {
    stdin = new MockStdin();
    keyHandler = vi.fn();

    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: stdin.setRawMode,
    });
  });

  it('should recognize Enter key', () => {
    const { result } = renderHook(() => useKeypress(keyHandler), {
      wrapper: KeypressProvider,
    });

    act(() => stdin.write('\r'));

    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'return',
        ctrl: false,
        meta: false,
        shift: false,
      })
    );
  });

  it('should recognize Ctrl+C', () => {
    const { result } = renderHook(() => useKeypress(keyHandler), {
      wrapper: KeypressProvider,
    });

    act(() => stdin.write('\x03'));

    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'c',
        ctrl: true,
      })
    );
  });

  it('should handle bracketed paste', () => {
    const { result } = renderHook(() => useKeypress(keyHandler), {
      wrapper: KeypressProvider,
    });

    act(() => {
      stdin.write('\x1b[200~');
      stdin.write('Pasted text');
      stdin.write('\x1b[201~');
    });

    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'paste',
        paste: 'Pasted text',
      })
    );
  });
});
```

## Testing Mouse Events

From Gemini CLI mouse tests:

```typescript
describe('MouseContext', () => {
  let stdin: MockStdin;
  let mouseHandler: vi.Mock;

  beforeEach(() => {
    stdin = new MockStdin();
    mouseHandler = vi.fn();
  });

  it.each([
    {
      sequence: '\x1b[<0;10;20M',
      expected: { name: 'left-press', col: 10, row: 20 },
    },
    {
      sequence: '\x1b[<64;15;25M',
      expected: { name: 'scroll-up', col: 15, row: 25 },
    },
    {
      sequence: '\x1b[<65;30;30M',
      expected: { name: 'scroll-down', col: 30, row: 30 },
    },
  ])(
    'should parse $sequence as $expected.name',
    ({ sequence, expected }) => {
      const { result } = renderHook(() => useMouse(mouseHandler), {
        wrapper: MouseProvider,
      });

      act(() => stdin.write(sequence));

      expect(mouseHandler).toHaveBeenCalledWith(
        expect.objectContaining(expected)
      );
    }
  );
});
```

## Testing Input Components

Complete example testing an input prompt:

```typescript
describe('InputPrompt', () => {
  let stdin: MockStdin;
  let onSubmit: vi.Mock;

  beforeEach(() => {
    stdin = new MockStdin();
    onSubmit = vi.fn();

    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: vi.fn(),
    });
  });

  it('should handle typing', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={onSubmit} />
    );

    act(() => {
      stdin.write('H');
      stdin.write('e');
      stdin.write('l');
      stdin.write('l');
      stdin.write('o');
    });

    expect(lastFrame()).toContain('Hello');
  });

  it('should handle backspace', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={onSubmit} />
    );

    act(() => {
      stdin.write('Hello');
      stdin.write('\x7f');  // Backspace
      stdin.write('\x7f');  // Backspace
    });

    expect(lastFrame()).toContain('Hel');
  });

  it('should submit on Enter', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={onSubmit} />
    );

    act(() => {
      stdin.write('Test message');
      stdin.write('\r');
    });

    expect(onSubmit).toHaveBeenCalledWith('Test message');
  });

  it('should handle arrow key navigation', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={onSubmit} />
    );

    act(() => {
      stdin.write('Hello');
      stdin.write('\x1b[D');  // Left arrow
      stdin.write('\x1b[D');  // Left arrow
      stdin.write('X');       // Insert X
    });

    expect(lastFrame()).toContain('HelXlo');
  });
});
```

## Testing Sequence Buffering

Some escape sequences might arrive incomplete:

```typescript
it('should handle incomplete escape sequences', () => {
  const { result } = renderHook(() => useKeypress(keyHandler), {
    wrapper: KeypressProvider,
  });

  // Send incomplete sequence
  act(() => {
    stdin.write('\x1b[');  // Start of arrow key sequence
  });

  // Handler shouldn't be called yet
  expect(keyHandler).not.toHaveBeenCalled();

  // Complete the sequence
  act(() => {
    stdin.write('A');  // Complete: Up arrow
  });

  // Now it should be called
  expect(keyHandler).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'up' })
  );
});
```

## Testing with Fake Timers

For timeout-based input:

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should timeout incomplete sequences', () => {
  const { result } = renderHook(() => useKeypress(keyHandler), {
    wrapper: KeypressProvider,
  });

  act(() => {
    stdin.write('\x1b[');  // Incomplete
  });

  act(() => {
    vi.advanceTimersByTime(100);  // Timeout period
  });

  // Should emit raw escape key
  expect(keyHandler).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'escape' })
  );
});
```

## Key Reference Table

| Key | Sequence | Hex |
|-----|----------|-----|
| Enter | `\r` or `\n` | `0x0D` or `0x0A` |
| Backspace | `\x7f` or `\x08` | DEL or BS |
| Tab | `\t` | `0x09` |
| Escape | `\x1b` | `0x1B` |
| Ctrl+C | `\x03` | `0x03` |
| Ctrl+D | `\x04` | `0x04` |
| Up Arrow | `\x1b[A` | ESC [ A |
| Down Arrow | `\x1b[B` | ESC [ B |
| Right Arrow | `\x1b[C` | ESC [ C |
| Left Arrow | `\x1b[D` | ESC [ D |
| Home | `\x1b[H` or `\x1b[1~` | |
| End | `\x1b[F` or `\x1b[4~` | |
| Page Up | `\x1b[5~` | |
| Page Down | `\x1b[6~` | |
| Delete | `\x1b[3~` | |
| Insert | `\x1b[2~` | |

## Best Practices

1. **Always wrap in act()** - Every stdin.write()
2. **Test edge cases** - Incomplete sequences, rapid input
3. **Use fake timers** - For timeout testing
4. **Mock early** - vi.mock() before imports
5. **Clean up** - Reset mocks in afterEach()
6. **Test modifiers** - Shift, Ctrl, Alt combinations
7. **Test both protocols** - SGR and X11 mouse

## Common Pitfalls

❌ Forgetting act() wrapper
❌ Testing with real timers (flaky)
❌ Not mocking useStdin
❌ Incomplete escape sequences
❌ Wrong mouse coordinate encoding

✅ Always use act()
✅ Use fake timers
✅ Mock useStdin properly
✅ Test sequence buffering
✅ Follow protocol specs

## Next Steps

Read `04-custom-utilities.md` to learn how to build reusable test utilities.
