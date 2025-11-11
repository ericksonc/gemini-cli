# Implementation Guide: Fixing Mouse Escape Sequence Pollution

This guide provides step-by-step instructions for fixing the mouse pollution issue in chimera's cli_ink.

---

## Prerequisites

- Understanding of the root cause (see ROOT_CAUSE_ANALYSIS.md)
- Access to both gemini-cli and chimera repositories
- TypeScript/React knowledge

---

## Step 1: Copy KeypressContext from Gemini-CLI

### File to Copy

**Source:** `gemini-cli/packages/cli/src/ui/contexts/KeypressContext.tsx`
**Destination:** `chimera/cli_ink/src/contexts/KeypressContext.tsx`

### Required Modifications

1. **Update imports:**
   ```typescript
   // Remove gemini-cli specific imports
   // OLD:
   import { debugLogger, type Config } from '@google/gemini-cli-core';

   // NEW:
   // Remove debugLogger if not needed, or implement simple console.log version
   ```

2. **Remove Config dependency:**
   ```typescript
   // In KeypressProvider props:
   // OLD:
   export function KeypressProvider({
     children,
     config,
     debugKeystrokeLogging,
   }: {
     children: React.ReactNode;
     config?: Config;
     debugKeystrokeLogging?: boolean;
   })

   // NEW:
   export function KeypressProvider({
     children,
     debugKeystrokeLogging,
   }: {
     children: React.ReactNode;
     debugKeystrokeLogging?: boolean;
   })
   ```

3. **Keep the critical filtering logic:**
   - Lines 129-141: `nonKeyboardEventFilter()`
   - Lines 243-514: `emitKeys()` generator
   - Lines 371-389: SGR and X11 mouse sequence parsing
   - Lines 580-583: Filter application

### Minimal Version (If Full Port is Too Complex)

If porting the full 618-line file is too complex, create a minimal version:

```typescript
// chimera/cli_ink/src/contexts/KeypressContext.tsx

import { useStdin } from 'ink';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { parseMouseEvent } from '../utils/mouse.js';

export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  paste: boolean;
  insertable: boolean;
  sequence: string;
}

export type KeypressHandler = (key: Key) => void;

interface KeypressContextValue {
  subscribe: (handler: KeypressHandler) => void;
  unsubscribe: (handler: KeypressHandler) => void;
}

const KeypressContext = createContext<KeypressContextValue | undefined>(undefined);

export function useKeypressContext() {
  const context = useContext(KeypressContext);
  if (!context) {
    throw new Error('useKeypressContext must be used within a KeypressProvider');
  }
  return context;
}

// Filter out mouse events before broadcasting to keypress handlers
function nonKeyboardEventFilter(
  keypressHandler: KeypressHandler,
): KeypressHandler {
  return (key: Key) => {
    // Block mouse events - they're handled by MouseProvider
    if (parseMouseEvent(key.sequence)) {
      return;
    }
    keypressHandler(key);
  };
}

export function KeypressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { stdin, setRawMode } = useStdin();
  const subscribers = useRef<Set<KeypressHandler>>(new Set()).current;

  const subscribe = useCallback(
    (handler: KeypressHandler) => subscribers.add(handler),
    [subscribers],
  );

  const unsubscribe = useCallback(
    (handler: KeypressHandler) => subscribers.delete(handler),
    [subscribers],
  );

  const broadcast = useCallback(
    (key: Key) => subscribers.forEach((handler) => handler(key)),
    [subscribers],
  );

  useEffect(() => {
    const wasRaw = stdin.isRaw;
    if (!wasRaw) {
      setRawMode(true);
    }

    // Apply mouse filter BEFORE broadcasting
    const mouseFilterer = nonKeyboardEventFilter(broadcast);

    // Simple keypress handler - converts Ink's input format to Key format
    const handleKeypress = (input: string, key: any) => {
      const keyEvent: Key = {
        name: key.name || '',
        ctrl: key.ctrl || false,
        meta: key.meta || false,
        shift: key.shift || false,
        paste: false,
        insertable: !key.ctrl && !key.meta && input && input.length === 1,
        sequence: input || '',
      };

      mouseFilterer(keyEvent);
    };

    // Use Ink's useInput under the hood, but apply filtering
    // This is a hybrid approach - still uses Ink but adds filtering layer

    // For a FULL solution, you need to port the entire emitKeys() generator
    // from gemini-cli's KeypressContext.tsx lines 264-514

    // TODO: Port full stdin parsing from gemini-cli for complete solution

    return () => {
      if (!wasRaw) {
        setRawMode(false);
      }
    };
  }, [stdin, setRawMode, broadcast]);

  return (
    <KeypressContext.Provider value={{ subscribe, unsubscribe }}>
      {children}
    </KeypressContext.Provider>
  );
}
```

**NOTE:** This minimal version is INCOMPLETE. For the full solution, you MUST port gemini-cli's `emitKeys()` generator (lines 264-514) which handles all escape sequence parsing including mouse sequences.

---

## Step 2: Copy useKeypress Hook from Gemini-CLI

### File to Copy

**Source:** `gemini-cli/packages/cli/src/ui/hooks/useKeypress.ts`
**Destination:** `chimera/cli_ink/src/hooks/useKeypress.ts`

### Content (No Modifications Needed)

```typescript
import { useEffect } from 'react';
import type { KeypressHandler, Key } from '../contexts/KeypressContext.js';
import { useKeypressContext } from '../contexts/KeypressContext.js';

export type { Key };

/**
 * A hook that listens for keypress events from stdin.
 *
 * @param onKeypress - The callback function to execute on each keypress.
 * @param options - Options to control the hook's behavior.
 * @param options.isActive - Whether the hook should be actively listening for input.
 */
export function useKeypress(
  onKeypress: KeypressHandler,
  { isActive }: { isActive: boolean },
) {
  const { subscribe, unsubscribe } = useKeypressContext();

  useEffect(() => {
    if (!isActive) {
      return;
    }

    subscribe(onKeypress);
    return () => {
      unsubscribe(onKeypress);
    };
  }, [isActive, onKeypress, subscribe, unsubscribe]);
}
```

---

## Step 3: Update App.tsx

Add KeypressProvider wrapper:

```typescript
// cli_ink/src/components/App.tsx

import { KeypressProvider } from '../contexts/KeypressContext';
import { MouseProvider } from '../contexts/MouseProvider';

export const App: React.FC = () => {
  // ... existing code ...

  return (
    <KeypressProvider>
      <MouseProvider mouseEventsEnabled={true}>
        {/* existing app structure */}
      </MouseProvider>
    </KeypressProvider>
  );
};
```

**Important:** KeypressProvider should wrap MouseProvider (order matters).

---

## Step 4: Update PromptBox.tsx

Replace `useInput` with `useKeypress`:

### Current Code (Lines 38-62)

```typescript
import { Box, Text, useInput, useStdout } from 'ink';

// ...

useInput(
  (input, key) => {
    if (key.return) {
      if (value.trim()) {
        onSubmit(value);
      }
    } else if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input) {
      // ❌ FAILED FILTERING ATTEMPTS HERE
      if (input.charCodeAt(0) === 0x1b) {
        return;
      }
      onChange(value + input);
    }
  },
  { isActive: !disabled }
);
```

### New Code

```typescript
import { Box, Text, useStdout } from 'ink';  // Remove useInput
import { useKeypress, type Key } from '../hooks/useKeypress';

// ...

useKeypress(
  (key: Key) => {
    // Return/Enter key
    if (key.name === 'return' || key.name === 'enter') {
      if (value.trim()) {
        onSubmit(value);
      }
      return;
    }

    // Backspace/Delete
    if (key.name === 'backspace' || key.name === 'delete') {
      onChange(value.slice(0, -1));
      return;
    }

    // Regular character input
    // key.insertable flag indicates if this should be inserted as text
    if (key.insertable && key.sequence) {
      onChange(value + key.sequence);
      return;
    }

    // Note: Mouse events are already filtered out by KeypressContext!
    // No need for manual filtering here
  },
  { isActive: !disabled }
);
```

### Complete PromptBox.tsx After Changes

```typescript
/**
 * Prompt Box Component
 *
 * Fixed 5-line input area at the bottom of the screen:
 * Line 1: Horizontal line (border)
 * Line 2: "> " + user input
 * Line 3: Horizontal line (border)
 * Line 4: Info line (blueprint name + model)
 * Line 5: Empty space
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useKeypress, type Key } from '../hooks/useKeypress';

const BRAND_COLOR = '#00D4AA';

interface PromptBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  blueprintName?: string;
  modelSlug?: string;
}

export const PromptBox: React.FC<PromptBoxProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  blueprintName = 'unknown',
  modelSlug = 'unknown',
}) => {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;

  // Handle keyboard input using custom keypress handler
  useKeypress(
    (key: Key) => {
      // Return/Enter key
      if (key.name === 'return' || key.name === 'enter') {
        if (value.trim()) {
          onSubmit(value);
        }
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

      // Mouse events are filtered out by KeypressContext
      // Arrow keys, Ctrl+C, etc. can be added here as needed
    },
    { isActive: !disabled }
  );

  // Create horizontal line (offset by 1 char from left)
  const horizontalLine = ' ' + '─'.repeat(terminalWidth - 2);

  return (
    <Box
      flexDirection="column"
      height={5}
      width="100%"
    >
      {/* Line 1: Top border */}
      <Text color={disabled ? 'gray' : BRAND_COLOR}>
        {horizontalLine}
      </Text>

      {/* Line 2: Input line */}
      <Box marginLeft={1}>
        <Text color={disabled ? 'gray' : BRAND_COLOR}>
          {'> '}
        </Text>
        <Text color={disabled ? 'gray' : 'white'}>
          {value}
          {!disabled && <Text inverse> </Text>}
        </Text>
      </Box>

      {/* Line 3: Bottom border */}
      <Text color={disabled ? 'gray' : BRAND_COLOR}>
        {horizontalLine}
      </Text>

      {/* Line 4: Info line */}
      <Box marginLeft={1}>
        <Text dimColor>
          {blueprintName} · {modelSlug}
        </Text>
      </Box>

      {/* Line 5: Empty */}
      <Text> </Text>
    </Box>
  );
};
```

---

## Step 5: Testing Checklist

### Basic Input Tests

- [ ] Type regular text → should appear in prompt
- [ ] Press Enter → should submit (if non-empty)
- [ ] Press Backspace → should delete last character
- [ ] Type special characters (@, #, $, etc.) → should work
- [ ] Type spaces → should work

### Mouse Event Tests

- [ ] Move mouse over terminal → no garbage in prompt
- [ ] Scroll with trackpad → no garbage in prompt
- [ ] Click in terminal → no garbage in prompt
- [ ] Rapid scrolling → no garbage in prompt

### Edge Cases

- [ ] Fast typing → no dropped characters
- [ ] Hold down a key → should repeat correctly
- [ ] Paste text → should work (may need additional handling)
- [ ] Arrow keys → should work if implemented
- [ ] Ctrl+C, Ctrl+D → should work if implemented

---

## Step 6: Additional Key Handling (Optional)

If you need arrow keys, Ctrl+C, etc., add to the `useKeypress` callback:

```typescript
useKeypress(
  (key: Key) => {
    // ... existing handlers ...

    // Arrow keys (if needed for multi-line input)
    if (key.name === 'up') {
      // Handle up arrow
      return;
    }
    if (key.name === 'down') {
      // Handle down arrow
      return;
    }

    // Ctrl+C (clear input)
    if (key.name === 'c' && key.ctrl) {
      onChange('');
      return;
    }

    // Ctrl+D (exit? or other behavior)
    if (key.name === 'd' && key.ctrl) {
      // Handle Ctrl+D
      return;
    }

    // Tab completion (if needed)
    if (key.name === 'tab') {
      // Handle tab
      return;
    }
  },
  { isActive: !disabled }
);
```

---

## Troubleshooting

### Issue: Still seeing escape sequences

**Cause:** The full `emitKeys()` generator wasn't ported.

**Solution:** Port the complete KeypressContext from gemini-cli (lines 264-514), which includes full escape sequence parsing. The minimal version provided above is incomplete.

### Issue: Some keys not working

**Cause:** Key name mapping differences between Ink and custom parser.

**Solution:** Add debug logging:
```typescript
useKeypress((key: Key) => {
  console.log('Key pressed:', key);
  // ... rest of handler
}, { isActive: !disabled });
```

Compare key names with gemini-cli's key handling.

### Issue: TypeScript errors on Key interface

**Cause:** Missing properties in Key interface.

**Solution:** Ensure Key interface matches exactly:
```typescript
export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  paste: boolean;
  insertable: boolean;
  sequence: string;
}
```

### Issue: Mouse events still leaking through

**Cause:** `parseMouseEvent()` not catching all mouse sequences.

**Solution:** Check utils/mouse.ts has both SGR and X11 regex patterns:
```typescript
export const SGR_MOUSE_REGEX = /^\x1b\[<(\d+);(\d+);(\d+)([mM])/;
export const X11_MOUSE_REGEX = /^\x1b\[M([\s\S]{3})/;
```

---

## Alternative: Quick Workaround (Not Recommended)

If full porting is too complex and you need a quick fix:

### Disable Mouse Events Entirely

In App.tsx:
```typescript
<MouseProvider mouseEventsEnabled={false}>
```

And remove mouse event enabling:
```typescript
// Comment out or remove
// enableMouseEvents();
```

**Pros:** Immediate fix, no garbage in prompt
**Cons:** Lose all mouse functionality (scrolling, clicking)

---

## Summary

**Required Files:**
1. Copy/adapt KeypressContext.tsx
2. Copy useKeypress.ts
3. Update App.tsx (add provider)
4. Update PromptBox.tsx (replace useInput with useKeypress)

**Critical Code:**
- `nonKeyboardEventFilter()` in KeypressContext
- `emitKeys()` generator for full escape sequence parsing
- Mouse sequence handling at lines 371-389

**Estimated Time:**
- Minimal version: 2-3 hours
- Full port: 4-6 hours
- Testing: 1-2 hours

**Result:** Mouse events filtered before reaching PromptBox, no more garbage in prompt! ✅
