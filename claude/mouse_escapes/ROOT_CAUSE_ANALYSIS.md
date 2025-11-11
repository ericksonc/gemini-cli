# Mouse Escape Sequence Pollution - Root Cause Analysis

**Date:** 2025-11-11
**Investigation:** Comparing chimera's cli_ink vs gemini-cli implementations
**Status:** ✅ ROOT CAUSE IDENTIFIED

---

## Executive Summary

**The Problem:** Mouse escape sequences (e.g., `[<65;93;19M`) appear as text in chimera's prompt box when using trackpad/mouse, despite MouseProvider working correctly.

**Root Cause:** **Architectural difference in stdin handling between chimera (using Ink's `useInput`) and gemini-cli (using custom `KeypressContext` with mouse event filtering).**

**Why chimera's attempts failed:** All previous fixes tried to filter mouse events INSIDE the PromptBox component's `useInput` callback, but by that time Ink has already processed and potentially modified the escape sequences. The ESC character (0x1b) may be stripped by Ink's internal input parsing before the callback receives it.

**The Solution:** Replace Ink's `useInput` with a custom keypress handling system that filters mouse events BEFORE they reach any input handlers, similar to gemini-cli's architecture.

---

## Detailed Analysis

### Architecture Comparison

#### Chimera's Current Architecture (BROKEN ❌)

```
User moves trackpad
    ↓
Terminal generates: \x1b[<64;95;16M
    ↓
stdin (Node.js EventEmitter broadcasts to ALL listeners)
    ↓
    ├─→ MouseProvider.handleData()
    │   └─→ parseMouseEvent()
    │       └─→ broadcast({ name: 'scroll-up', ... }) ✅ Works!
    │
    └─→ Ink's internal stdin handler
        └─→ Ink processes escape sequences
            └─→ Strips/modifies ESC character? [<64;95;16M
                └─→ useInput callback in PromptBox
                    └─→ input = "[<64;95;16M" (ESC missing!)
                        └─→ Filter check fails (checking for 0x1b at start)
                            └─→ onChange(value + input) ❌ Adds garbage to prompt!
```

**Key Issues:**
1. Both MouseProvider AND Ink's input handler receive the same stdin data (EventEmitter broadcasts)
2. Ink processes escape sequences internally before calling `useInput` callbacks
3. The ESC character (0x1b) is stripped/consumed by Ink's parser
4. The remaining partial sequence `[<64;95;16M` is passed to useInput as "unrecognized input"
5. Filtering in PromptBox's useInput callback fails because ESC is already gone
6. Result: partial mouse sequences appear in the prompt as text

#### Gemini-CLI's Architecture (WORKING ✅)

```
User moves trackpad
    ↓
Terminal generates: \x1b[<64;95;16M
    ↓
stdin (Node.js EventEmitter broadcasts to ALL listeners)
    ↓
    ├─→ MouseContext.handleData()
    │   └─→ parseMouseEvent()
    │       └─→ broadcast({ name: 'scroll-up', ... }) ✅
    │
    └─→ KeypressContext.handleData()
        └─→ emitKeys() generator (parses escape sequences)
            └─→ Detects mouse sequence at lines 371-389
                └─→ nonKeyboardEventFilter()
                    └─→ parseMouseEvent(key.sequence) returns truthy
                        └─→ Event is FILTERED OUT ✅
                        └─→ Never broadcast to keypress handlers!

InputPrompt uses useKeypress() instead of useInput()
    └─→ Only receives non-mouse keyboard events ✅
```

**Key Differences:**
1. **Custom keypress parsing**: gemini-cli doesn't use Ink's `useInput` at all
2. **Explicit mouse sequence handling**: The `emitKeys()` generator explicitly parses SGR (`[<`) and X11 (`[M`) mouse sequences (lines 371-389 in KeypressContext.tsx)
3. **Filtering BEFORE broadcasting**: Mouse events are filtered out in `nonKeyboardEventFilter()` BEFORE any keypress handler sees them
4. **Complete sequences preserved**: The full escape sequence (including ESC) is available for filtering

---

## Evidence: The Critical Code Differences

### Gemini-CLI: KeypressContext.tsx (Lines 129-141)

```typescript
function nonKeyboardEventFilter(
  keypressHandler: KeypressHandler,
): KeypressHandler {
  return (key: Key) => {
    if (
      !parseMouseEvent(key.sequence) &&  // ← FILTERS OUT MOUSE EVENTS!
      key.sequence !== FOCUS_IN &&
      key.sequence !== FOCUS_OUT
    ) {
      keypressHandler(key);  // ← Only non-mouse events are broadcast
    }
  };
}
```

### Gemini-CLI: KeypressContext.tsx (Lines 371-389)

The parser explicitly handles mouse sequences:

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

This ensures mouse sequences are fully parsed and included in `key.sequence` for filtering.

### Gemini-CLI: KeypressContext.tsx (Lines 580-583)

The filter is applied BEFORE any handlers receive events:

```typescript
const mouseFilterer = nonKeyboardEventFilter(broadcast);  // ← Apply filter
const backslashBufferer = bufferBackslashEnter(mouseFilterer);
const pasteBufferer = bufferPaste(backslashBufferer);
let dataListener = createDataListener(pasteBufferer);
```

### Chimera: PromptBox.tsx (Lines 46-58) - CURRENT (FAILED)

```typescript
} else if (!key.ctrl && !key.meta && input) {
  // ✅ FIX: Filter out mouse escape sequences
  // Mouse events should be handled by MouseProvider, not added to prompt

  // Check for escape sequence (ESC = 0x1b)
  if (input.charCodeAt(0) === 0x1b) {  // ← This check FAILS!
    // This is an escape sequence - could be mouse, arrow keys, etc.
    // Ink's useInput already handles arrow keys via the `key` object
    // Any remaining escape sequences (like mouse events) should be ignored
    return;
  }

  onChange(value + input);  // ← Still adds garbage because ESC is missing
}
```

**Why this fails:** By the time `useInput` callback is called, Ink has already processed the escape sequence internally. The `input` parameter contains `[<64;95;16M` (without the leading ESC), so `input.charCodeAt(0)` returns `0x5B` (`[`), not `0x1B` (ESC).

---

## Why Previous Attempts Failed

### Experiment 1: resetMouseModes()
- **Attempted:** Clear mouse modes from previous sessions
- **Failed because:** Problem isn't inherited pollution; both MouseProvider AND Ink receive current session's mouse events

### Experiment 2: Alternate Screen Buffer (?1049h)
- **Attempted:** Isolate display buffer
- **Failed because:** Doesn't prevent stdin broadcast to multiple listeners

### Experiment 3: Pattern Matching in PromptBox
- **Attempted:** `if (input.includes('\x1b[<'))`
- **Failed because:** ESC character already stripped by Ink

### Experiment 4: ESC Character Check in PromptBox
- **Attempted:** `if (input.charCodeAt(0) === 0x1b)`
- **Failed because:** ESC character already stripped by Ink; `input` starts with `[`

---

## The Solution

### Option 1: Implement Custom Keypress Handling (RECOMMENDED ✅)

Replace Ink's `useInput` with gemini-cli's architecture:

1. **Create KeypressContext** (similar to gemini-cli's):
   - Custom stdin parsing with `emitKeys()` generator
   - Explicit handling of SGR and X11 mouse sequences
   - `nonKeyboardEventFilter()` to filter out mouse events BEFORE broadcasting

2. **Create useKeypress hook**:
   - Subscribe to KeypressContext
   - Only receives non-mouse keyboard events

3. **Update PromptBox**:
   - Replace `useInput()` with `useKeypress()`
   - Remove failed mouse filtering attempts
   - Handle keyboard events normally

4. **Keep MouseProvider**:
   - No changes needed; it already works correctly
   - Both contexts listen to stdin independently

**Pros:**
- ✅ Matches production-tested gemini-cli architecture
- ✅ Clean separation of concerns
- ✅ Mouse events filtered at the lowest level
- ✅ Complete escape sequences available for parsing

**Cons:**
- Requires significant refactoring
- Need to port ~600 lines of keypress parsing logic from gemini-cli

### Option 2: Monkey-Patch Ink's stdin Handler (EXPERIMENTAL ⚠️)

Intercept stdin data BEFORE Ink sees it:

```typescript
// In App.tsx or index.tsx, before rendering
useEffect(() => {
  const originalOn = process.stdin.on.bind(process.stdin);

  process.stdin.on = function(event: string, handler: any) {
    if (event === 'data') {
      const filteredHandler = (data: Buffer | string) => {
        const str = typeof data === 'string' ? data : data.toString('utf-8');

        // Remove complete mouse sequences before passing to Ink
        let filtered = str;
        let match;
        while ((match = filtered.match(/\x1b\[<\d+;\d+;\d+[mM]/))) {
          filtered = filtered.slice(0, match.index) +
                     filtered.slice(match.index! + match[0].length);
        }

        if (filtered.length > 0) {
          handler(filtered);
        }
      };

      return originalOn(event, filteredHandler);
    }
    return originalOn(event, handler);
  };

  return () => {
    // Restore original
    process.stdin.on = originalOn;
  };
}, []);
```

**Pros:**
- Quick to implement
- Minimal changes to existing code

**Cons:**
- ⚠️ Fragile; monkey-patching is risky
- ⚠️ May break if Ink's internals change
- ⚠️ Doesn't handle X11 mouse sequences
- ⚠️ May cause issues with other stdin listeners

### Option 3: Use @jrichman/ink's stdin option (IF AVAILABLE)

Check if the Ink fork supports disabling default stdin handling:

```typescript
render(<App />, {
  stdin: createCustomStdin(),  // Custom stdin that filters mouse events
  // or
  stdin: null,  // Disable Ink's stdin handling entirely
});
```

Then implement custom stdin handling similar to Option 1.

**Requires investigating:** Whether @jrichman/ink@6.4.2 supports this option.

---

## Recommended Implementation Plan

### Phase 1: Port KeypressContext (HIGH PRIORITY)

1. **Copy from gemini-cli**:
   - `contexts/KeypressContext.tsx` → `cli_ink/src/contexts/KeypressContext.tsx`
   - `hooks/useKeypress.ts` → `cli_ink/src/hooks/useKeypress.ts`

2. **Update imports**:
   - Ensure `utils/input.ts` has ESC constant
   - Ensure `utils/mouse.ts` has `parseMouseEvent()` export

3. **Add to App.tsx**:
   ```typescript
   import { KeypressProvider } from './contexts/KeypressContext';

   <KeypressProvider>
     <MouseProvider>
       {/* existing app structure */}
     </MouseProvider>
   </KeypressProvider>
   ```

### Phase 2: Update PromptBox

1. **Replace useInput with useKeypress**:
   ```typescript
   // OLD:
   import { useInput } from 'ink';
   useInput((input, key) => { ... });

   // NEW:
   import { useKeypress } from '../hooks/useKeypress';
   useKeypress((key) => {
     // key.insertable - should this be inserted as text?
     // key.sequence - the actual characters
     // key.name - key name (e.g., 'backspace', 'return')
     // key.ctrl, key.meta, key.shift - modifiers
   });
   ```

2. **Update input handling logic**:
   - gemini-cli's `Key` interface has `insertable` flag
   - Use this instead of checking `!key.ctrl && !key.meta`

3. **Remove failed mouse filtering code**:
   - Remove ESC character checks
   - Remove pattern matching attempts
   - Filtering now happens in KeypressContext

### Phase 3: Testing

1. **Test basic input**:
   - Type text → should work normally
   - Backspace, Enter, arrow keys → should work

2. **Test mouse events**:
   - Move trackpad → should NOT see garbage in prompt
   - Scroll with trackpad → should scroll messages (if connected to ScrollProvider)
   - Click → should work if click handling is implemented

3. **Test edge cases**:
   - Paste multiline text
   - Fast typing
   - Rapid scrolling

---

## File References

### Gemini-CLI (Working Implementation)

- **packages/cli/src/ui/contexts/KeypressContext.tsx** (Lines 129-141, 371-389, 580-583)
  - Custom stdin parsing with mouse filtering

- **packages/cli/src/ui/contexts/MouseContext.tsx** (Lines 84-142)
  - Mouse event handling (nearly identical to chimera's)

- **packages/cli/src/ui/components/InputPrompt.tsx** (Line 818)
  - Uses `useKeypress()` instead of `useInput()`

- **packages/cli/src/ui/hooks/useKeypress.ts** (Lines 20-36)
  - Hook that subscribes to KeypressContext

- **packages/cli/src/ui/utils/mouse.ts** (Lines 176-180)
  - `parseMouseEvent()` used for filtering

### Chimera (Broken Implementation)

- **cli_ink/src/components/PromptBox.tsx** (Lines 38-62)
  - Uses Ink's `useInput()` with failed filtering attempts

- **cli_ink/src/contexts/MouseProvider.tsx** (Lines 60-148)
  - Mouse event handling (works correctly, nearly identical to gemini-cli's)

- **cli_ink/src/utils/mouse.ts** (Lines 177-180)
  - `parseMouseEvent()` function (identical to gemini-cli's)

---

## Additional Notes

### Why Ink Strips the ESC Character

Ink's `useInput` is designed for React-based terminal UIs where escape sequences should be parsed into meaningful events (arrow keys, function keys, etc.). When Ink encounters an escape sequence:

1. It buffers the sequence character by character
2. Tries to match it against known patterns (arrow keys, etc.)
3. If matched, converts to a structured `key` object with `name`, `ctrl`, etc.
4. If unrecognized, passes the remaining characters as `input`

For mouse sequences like `\x1b[<64;95;16M`:
- Ink starts buffering: `\x1b` (ESC)
- Continues: `\x1b[`
- Continues: `\x1b[<` - not a recognized key sequence
- Gives up parsing, strips the ESC, passes `[<64;95;16M` as raw input

This is expected behavior for normal keyboard input, but problematic when mouse tracking is enabled.

### Why Gemini-CLI's Approach Works

By implementing custom stdin parsing:
1. The parser KNOWS about mouse sequences (lines 371-389 explicitly handle them)
2. Complete sequences are buffered until the terminating character (`M`, `m`, or specific key)
3. The full sequence (including ESC) is available in `key.sequence`
4. The filter can use `parseMouseEvent(key.sequence)` to detect and block mouse events
5. Only non-mouse events reach the input handlers

### Why Both Listeners Receive the Same Data

Node.js streams use EventEmitter pattern:
```typescript
// When stdin receives data
stdin.emit('data', buffer);

// All registered listeners receive it:
stdin.on('data', mouseHandler);  // MouseProvider
stdin.on('data', inkHandler);    // Ink's internal handler

// Both handlers execute independently
// Neither "consumes" the data
// Both process the same buffer
```

This is why filtering at the PromptBox level fails - by the time PromptBox's `useInput` callback runs, Ink has already processed the data.

---

## Conclusion

The root cause is **architectural**: chimera uses Ink's `useInput` which processes escape sequences before the callback, stripping the ESC character and making mouse event filtering impossible at the PromptBox level.

Gemini-cli solves this by implementing custom stdin parsing that:
1. Explicitly handles mouse sequences
2. Filters them out BEFORE broadcasting to input handlers
3. Never uses Ink's `useInput` for the main input prompt

**Recommended Action:** Implement Option 1 (Custom Keypress Handling) by porting gemini-cli's KeypressContext and related code. This is the most robust, production-tested solution.

**Estimated Effort:** 4-6 hours for porting, testing, and integration.
