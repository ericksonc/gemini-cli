# Code Comparison: Gemini-CLI vs Chimera

This document shows side-by-side comparisons of critical code sections.

---

## Input Handling Architecture

### Gemini-CLI: InputPrompt.tsx (WORKING ✅)

```typescript
// Line 22: Import custom keypress hook
import { useKeypress } from '../hooks/useKeypress.js';

// Line 43: Import mouse hook
import { useMouse, type MouseEvent } from '../contexts/MouseContext.js';

// Lines 361-384: Mouse event handler (separate from keyboard)
const handleMouse = useCallback(
  (event: MouseEvent) => {
    if (event.name === 'left-press' && innerBoxRef.current) {
      const { x, y, width, height } = getBoundingBox(innerBoxRef.current);
      const mouseX = event.col - 1;
      const mouseY = event.row - 1;
      if (
        mouseX >= x &&
        mouseX < x + width &&
        mouseY >= y &&
        mouseY < y + height
      ) {
        const relX = mouseX - x;
        const relY = mouseY - y;
        const visualRow = buffer.visualScrollRow + relY;
        buffer.moveToVisualPosition(visualRow, relX);
      }
    }
  },
  [buffer],
);

// Line 384: Use mouse hook (separate from keyboard)
useMouse(handleMouse, { isActive: focus && !isEmbeddedShellFocused });

// Lines 386-816: Keyboard input handler
const handleInput = useCallback(
  (key: Key) => {
    // ... extensive keyboard handling ...
    // NO mouse filtering needed - already done in KeypressContext!
  },
  [ /* dependencies */ ],
);

// Line 818: Use keypress hook (NOT Ink's useInput!)
useKeypress(handleInput, { isActive: !isEmbeddedShellFocused });
```

**Key Points:**
- Uses `useKeypress` (custom hook), NOT Ink's `useInput`
- Mouse handling is completely separate via `useMouse`
- No mouse filtering in input handler - it's already filtered upstream
- Clean separation of concerns

### Chimera: PromptBox.tsx (BROKEN ❌)

```typescript
// Line 13: Import Ink's useInput
import { Box, Text, useInput, useStdout } from 'ink';

// Lines 38-62: Combined keyboard + attempted mouse filtering
useInput(
  (input, key) => {
    if (key.return) {
      if (value.trim()) {
        onSubmit(value);
      }
    } else if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input) {
      // ❌ ATTEMPTED FIX: Filter out mouse escape sequences
      // Check for escape sequence (ESC = 0x1b)
      if (input.charCodeAt(0) === 0x1b) {  // ← FAILS: ESC already stripped!
        return;
      }

      onChange(value + input);  // ← Still adds garbage
    }
  },
  { isActive: !disabled }
);
```

**Key Points:**
- Uses Ink's `useInput` hook
- Tries to filter mouse events in the callback
- Filtering fails because Ink strips ESC before callback
- No separation between mouse and keyboard handling

---

## Stdin Processing: Keypress Context

### Gemini-CLI: KeypressContext.tsx (WORKING ✅)

#### Part 1: Mouse Event Filter (Lines 129-141)

```typescript
function nonKeyboardEventFilter(
  keypressHandler: KeypressHandler,
): KeypressHandler {
  return (key: Key) => {
    if (
      !parseMouseEvent(key.sequence) &&  // ← CRITICAL: Filters out mouse events!
      key.sequence !== FOCUS_IN &&
      key.sequence !== FOCUS_OUT
    ) {
      keypressHandler(key);  // ← Only non-mouse events pass through
    }
  };
}
```

**This is the magic!** Mouse events are detected and blocked before any handler sees them.

#### Part 2: SGR Mouse Sequence Parsing (Lines 371-379)

```typescript
} else if (ch === '<') {
  // SGR mouse mode - ESC [< sequence
  ch = yield;
  sequence += ch;
  // Don't skip on empty string here to avoid timeouts on slow events.
  while (ch === '' || ch === ';' || (ch >= '0' && ch <= '9')) {
    ch = yield;
    sequence += ch;
  }
```

**Critical:** The parser explicitly handles `[<` sequences (SGR mouse events), ensuring the full sequence including ESC is preserved in `key.sequence`.

#### Part 3: X11 Mouse Sequence Parsing (Lines 380-389)

```typescript
} else if (ch === 'M') {
  // X11 mouse mode - ESC [M sequence
  // three characters after 'M'
  ch = yield;
  sequence += ch;
  ch = yield;
  sequence += ch;
  ch = yield;
  sequence += ch;
}
```

**Critical:** Also handles X11 format mouse events.

#### Part 4: Filter Application (Lines 580-583)

```typescript
const mouseFilterer = nonKeyboardEventFilter(broadcast);  // ← Filter applied HERE
const backslashBufferer = bufferBackslashEnter(mouseFilterer);
const pasteBufferer = bufferPaste(backslashBufferer);
let dataListener = createDataListener(pasteBufferer);
```

**Critical:** The filter is in the pipeline BEFORE any handlers receive events.

### Chimera: No KeypressContext (MISSING ❌)

Chimera doesn't have a KeypressContext at all. It relies entirely on Ink's `useInput`, which:
1. Doesn't know about mouse sequences
2. Strips escape characters during parsing
3. Passes unrecognized sequences to callbacks
4. Makes filtering impossible

---

## Mouse Event Handling

### Gemini-CLI: MouseContext.tsx (Lines 84-142)

```typescript
useEffect(() => {
  if (!mouseEventsEnabled) {
    return;
  }

  let mouseBuffer = '';

  const broadcast = (event: MouseEvent) => {
    for (const handler of subscribers) {
      handler(event);
    }
  };

  const handleData = (data: Buffer | string) => {
    mouseBuffer += typeof data === 'string' ? data : data.toString('utf-8');

    if (mouseBuffer.length > MAX_MOUSE_BUFFER_SIZE) {
      mouseBuffer = mouseBuffer.slice(-MAX_MOUSE_BUFFER_SIZE);
    }

    while (mouseBuffer.length > 0) {
      const parsed = parseMouseEvent(mouseBuffer);

      if (parsed) {
        if (debugKeystrokeLogging) {
          debugLogger.log('[DEBUG] Mouse event parsed:', JSON.stringify(parsed.event));
        }
        broadcast(parsed.event);
        mouseBuffer = mouseBuffer.slice(parsed.length);
        continue;
      }

      if (isIncompleteMouseSequence(mouseBuffer)) {
        break;
      }

      const nextEsc = mouseBuffer.indexOf(ESC, 1);
      if (nextEsc !== -1) {
        mouseBuffer = mouseBuffer.slice(nextEsc);
      } else {
        mouseBuffer = '';
        break;
      }
    }
  };

  stdin.on('data', handleData);

  return () => {
    stdin.removeListener('data', handleData);
  };
}, [stdin, mouseEventsEnabled, subscribers, debugKeystrokeLogging]);
```

### Chimera: MouseProvider.tsx (Lines 86-141)

```typescript
useEffect(() => {
  if (!mouseEventsEnabled) {
    return;
  }

  let mouseBuffer = '';

  const broadcast = (event: MouseEvent) => {
    for (const handler of subscribers) {
      handler(event);
    }
  };

  const handleData = (data: Buffer | string) => {
    mouseBuffer += typeof data === 'string' ? data : data.toString('utf-8');

    if (mouseBuffer.length > MAX_MOUSE_BUFFER_SIZE) {
      mouseBuffer = mouseBuffer.slice(-MAX_MOUSE_BUFFER_SIZE);
    }

    while (mouseBuffer.length > 0) {
      const parsed = parseMouseEvent(mouseBuffer);

      if (parsed) {
        if (debugKeystrokeLogging) {
          console.log('[DEBUG] Mouse event parsed:', JSON.stringify(parsed.event));
        }
        broadcast(parsed.event);
        mouseBuffer = mouseBuffer.slice(parsed.length);
        continue;
      }

      if (isIncompleteMouseSequence(mouseBuffer)) {
        break;
      }

      const nextEsc = mouseBuffer.indexOf(ESC, 1);
      if (nextEsc !== -1) {
        mouseBuffer = mouseBuffer.slice(nextEsc);
      } else {
        mouseBuffer = '';
        break;
      }
    }
  };

  stdin.on('data', handleData);

  return () => {
    stdin.removeListener('data', handleData);
  };
}, [stdin, mouseEventsEnabled, subscribers, debugKeystrokeLogging]);
```

**These are nearly IDENTICAL!** The mouse handling in both projects is correct.

The difference is in keyboard handling:
- **Gemini-CLI:** Has KeypressContext that filters out mouse events
- **Chimera:** Uses Ink's useInput which doesn't filter mouse events

---

## Data Flow Diagrams

### Gemini-CLI Architecture (WORKING ✅)

```
┌─────────────────────────────────────────────────────────────────┐
│ USER MOVES TRACKPAD                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Terminal generates: \x1b[<64;95;16M                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ process.stdin (EventEmitter broadcasts to ALL listeners)        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
    ┌───────────────────────┐  ┌───────────────────────┐
    │  MouseContext         │  │  KeypressContext      │
    │  stdin.on('data')     │  │  stdin.on('data')     │
    └───────────────────────┘  └───────────────────────┘
                ↓                          ↓
    ┌───────────────────────┐  ┌───────────────────────┐
    │  handleData()         │  │  dataListener()       │
    │  parseMouseEvent()    │  │  emitKeys()           │
    └───────────────────────┘  └───────────────────────┘
                ↓                          ↓
    ┌───────────────────────┐  ┌───────────────────────┐
    │  broadcast({          │  │  Parser recognizes    │
    │    name: 'scroll-up', │  │  SGR sequence (<)     │
    │    col: 95,           │  │  Buffers full         │
    │    row: 16            │  │  sequence with ESC    │
    │  })                   │  └───────────────────────┘
    └───────────────────────┘              ↓
                ↓              ┌───────────────────────┐
    ┌───────────────────────┐  │  nonKeyboardEvent     │
    │  useMouse handlers    │  │  Filter()             │
    │  (e.g., ScrollProvider│  │  parseMouseEvent()    │
    │   handleScroll)       │  │  → BLOCKS IT ✅       │
    └───────────────────────┘  └───────────────────────┘
                ↓                          ↓
    ┌───────────────────────┐  ┌───────────────────────┐
    │  Scrolling works! ✅  │  │  NO broadcast to      │
    │                       │  │  keypress handlers    │
    └───────────────────────┘  └───────────────────────┘
                                           ↓
                               ┌───────────────────────┐
                               │  InputPrompt's        │
                               │  handleInput()        │
                               │  NEVER SEES MOUSE     │
                               │  EVENTS ✅            │
                               └───────────────────────┘
```

### Chimera Architecture (BROKEN ❌)

```
┌─────────────────────────────────────────────────────────────────┐
│ USER MOVES TRACKPAD                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Terminal generates: \x1b[<64;95;16M                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ process.stdin (EventEmitter broadcasts to ALL listeners)        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
    ┌───────────────────────┐  ┌───────────────────────┐
    │  MouseProvider        │  │  Ink's Internal       │
    │  stdin.on('data')     │  │  stdin Handler        │
    └───────────────────────┘  └───────────────────────┘
                ↓                          ↓
    ┌───────────────────────┐  ┌───────────────────────┐
    │  handleData()         │  │  Ink's input parser   │
    │  parseMouseEvent()    │  │  Buffers: \x1b        │
    └───────────────────────┘  │  Then: \x1b[          │
                ↓              │  Then: \x1b[<         │
    ┌───────────────────────┐  │  Not recognized!      │
    │  broadcast({          │  │  Strips ESC           │
    │    name: 'scroll-up', │  │  Passes: [<64;95;16M  │
    │    col: 95,           │  └───────────────────────┘
    │    row: 16            │              ↓
    │  })                   │  ┌───────────────────────┐
    └───────────────────────┘  │  useInput callback    │
                ↓              │  in PromptBox         │
    ┌───────────────────────┐  └───────────────────────┘
    │  useMouse handlers    │              ↓
    │  (if implemented,     │  ┌───────────────────────┐
    │   works correctly ✅) │  │  input = "[<64;95;16M"│
    └───────────────────────┘  │  key = {}             │
                               └───────────────────────┘
                                           ↓
                               ┌───────────────────────┐
                               │  if (!key.ctrl &&     │
                               │      !key.meta &&     │
                               │      input) {         │
                               │    // Try to filter:  │
                               │    if (input.charCodeAt│
                               │        (0) === 0x1b)  │
                               │      return;          │
                               │    // ❌ FAILS!       │
                               │    // 0x1b is ESC     │
                               │    // input[0] is '[' │
                               │    // (0x5B)          │
                               └───────────────────────┘
                                           ↓
                               ┌───────────────────────┐
                               │  onChange(value +     │
                               │    input)             │
                               │  ❌ Adds garbage!     │
                               └───────────────────────┘
```

---

## Why ESC Character Check Fails in Chimera

### Expected vs Actual

**What we expect:**
```
input = "\x1b[<64;95;16M"
input.charCodeAt(0) = 0x1b (ESC)
if (0x1b === 0x1b) return; // ✅ Should work
```

**What actually happens:**
```
Ink receives: "\x1b[<64;95;16M"
Ink's parser:
  1. Sees \x1b (ESC) → start escape sequence
  2. Buffers: \x1b[
  3. Buffers: \x1b[<
  4. Not a known sequence (not arrow key, not function key)
  5. Gives up parsing
  6. Strips ESC, passes remainder to callback

useInput callback receives:
  input = "[<64;95;16M"  // ← No ESC!
  input.charCodeAt(0) = 0x5B (which is '[')
  if (0x5B === 0x1b) return; // ❌ FAILS!

Result:
  onChange(value + "[<64;95;16M") // ← Garbage added to prompt!
```

---

## The Fix: Side-by-Side

### Before (Chimera - BROKEN ❌)

```typescript
// PromptBox.tsx
import { Box, Text, useInput, useStdout } from 'ink';

useInput(
  (input, key) => {
    if (key.return) {
      if (value.trim()) onSubmit(value);
    } else if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input) {
      // ❌ Failed filtering attempt
      if (input.charCodeAt(0) === 0x1b) {
        return;
      }
      onChange(value + input);
    }
  },
  { isActive: !disabled }
);
```

### After (Chimera - FIXED ✅)

```typescript
// PromptBox.tsx
import { Box, Text, useStdout } from 'ink';  // No useInput!
import { useKeypress, type Key } from '../hooks/useKeypress';

useKeypress(
  (key: Key) => {
    // Return/Enter
    if (key.name === 'return' || key.name === 'enter') {
      if (value.trim()) onSubmit(value);
      return;
    }

    // Backspace/Delete
    if (key.name === 'backspace' || key.name === 'delete') {
      onChange(value.slice(0, -1));
      return;
    }

    // Regular character input
    if (key.insertable && key.sequence) {
      onChange(value + key.sequence);
      return;
    }

    // ✅ No filtering needed!
    // Mouse events already filtered by KeypressContext
  },
  { isActive: !disabled }
);
```

**Plus add KeypressContext (see IMPLEMENTATION_GUIDE.md for full code)**

---

## Summary

| Aspect | Gemini-CLI ✅ | Chimera ❌ |
|--------|--------------|-----------|
| **Keypress Handling** | Custom KeypressContext | Ink's useInput |
| **Mouse Filtering** | In KeypressContext (lines 129-141) | In PromptBox (too late!) |
| **Escape Sequence Parsing** | Custom emitKeys() generator | Ink's internal parser |
| **Mouse Sequence Handling** | Explicit SGR/X11 parsing (lines 371-389) | Not handled |
| **ESC Character Preserved** | Yes, in key.sequence | No, stripped by Ink |
| **Filter Location** | Before broadcast to handlers | In individual callback |
| **Result** | Mouse events never reach input handlers | Mouse sequences leak through as text |

**The fix:** Port gemini-cli's KeypressContext architecture to chimera.
