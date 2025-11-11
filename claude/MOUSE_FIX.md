# Mouse Escape Sequence Fix

## Problem
Mouse sequences like `\x1b[<64;95;16M` appear in the prompt box because both MouseProvider and Ink's useInput are reading from the same stdin.

## Solution
Filter out mouse sequences in PromptBox's useInput callback BEFORE they're added to the prompt.

## Implementation

Replace the useInput callback in `src/components/PromptBox.tsx`:

```typescript
// BEFORE (lines 38-51):
useInput(
  (input, key) => {
    if (key.return) {
      if (value.trim()) {
        onSubmit(value);
      }
    } else if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input) {
      onChange(value + input);  // ❌ This adds mouse sequences!
    }
  },
  { isActive: !disabled }
);

// AFTER:
useInput(
  (input, key) => {
    if (key.return) {
      if (value.trim()) {
        onSubmit(value);
      }
    } else if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (!key.ctrl && !key.meta && input) {
      // Filter out mouse escape sequences
      // SGR format: \x1b[<digit;digit;digit[Mm]
      // X11 format: \x1b[M followed by 3 bytes
      if (
        input.includes('\x1b[<') ||                    // SGR mouse sequence
        input.includes('\x1b[M') ||                    // X11 mouse sequence
        /\x1b\[\d+;\d+;\d+[Mm]/.test(input) ||        // Full SGR pattern
        /\x1b\[<\d+;\d+;\d+[Mm]/.test(input)          // Full SGR with <
      ) {
        // Ignore - this is a mouse event, not keyboard input
        return;
      }

      onChange(value + input);
    }
  },
  { isActive: !disabled }
);
```

## Why This Works

1. **MouseProvider** still receives and handles mouse events for scrolling
2. **useInput** now filters out mouse sequences before adding them to the prompt
3. The mouse sequences never reach the prompt value
4. Scrolling works, no gobbledygook appears

## Alternative: More Robust Filter

If you want to be extra thorough, you can filter ANY escape sequence that starts with ESC:

```typescript
} else if (!key.ctrl && !key.meta && input) {
  // Filter out ALL escape sequences (anything starting with ESC)
  if (input.charCodeAt(0) === 0x1b) {
    // This is an escape sequence - ignore it
    // MouseProvider will handle it if it's a mouse event
    return;
  }

  onChange(value + input);
}
```

This is more aggressive but guarantees no escape sequences leak into the prompt.

## Testing

After applying the fix:
1. Run the app
2. Move your trackpad/mouse
3. Mouse sequences should NO LONGER appear in the prompt
4. Scrolling should still work via MouseProvider

## Why Your Previous Attempts Failed

1. **Alternate screen buffer** - Doesn't prevent stdin from being read by multiple handlers
2. **Input filtering in PromptBox** - You mentioned trying this, but the actual code doesn't have the filter
3. **resetMouseModes()** - Good hygiene but doesn't solve the double-consumption issue

The core problem was always that **two handlers were reading the same stdin** and one wasn't filtering mouse sequences.

## About @jrichman/ink Fork

The fork is fine - it's not the cause of the problem. The issue is architectural: Ink's useInput doesn't automatically filter mouse sequences because it doesn't know you're using mouse tracking.

You need to explicitly filter them in your application code.
