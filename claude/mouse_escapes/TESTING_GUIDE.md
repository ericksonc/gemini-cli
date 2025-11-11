# Testing Guide: Verifying Mouse Escape Sequence Fix

This guide provides comprehensive testing procedures to verify the mouse pollution fix works correctly.

---

## Pre-Implementation Baseline

### Current Behavior (BROKEN ❌)

Before implementing the fix, document the current broken behavior:

1. **Start chimera's cli_ink:**
   ```bash
   cd chimera/cli_ink
   npm run dev  # or whatever the start command is
   ```

2. **Move trackpad/mouse over terminal:**
   - Expected (broken): See garbage like `[<64;95;16M[<65;95;16M` in prompt
   - Screenshot/record this for comparison

3. **Scroll with trackpad:**
   - Expected (broken): More garbage sequences appear in prompt
   - Note: Scrolling may or may not work depending on ScrollProvider hookup

4. **Type some text:**
   - Expected: Works, but garbage is mixed in with text

---

## Post-Implementation Testing

### Phase 1: Basic Functionality

After implementing the fix, test basic keyboard input:

#### Test 1.1: Regular Text Input
```
Steps:
1. Start the application
2. Type: "Hello, world!"
3. Verify: Text appears correctly in prompt

Expected: "Hello, world!"
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

#### Test 1.2: Special Characters
```
Steps:
1. Clear prompt (if possible) or start fresh
2. Type: "@file.txt #tag $var 100% ^test & (parentheses) [brackets] {braces}"
3. Verify: All characters appear correctly

Expected: All special characters visible
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

#### Test 1.3: Backspace
```
Steps:
1. Type: "Test123"
2. Press Backspace 3 times
3. Verify: "123" is deleted, leaving "Test"

Expected: "Test"
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

#### Test 1.4: Enter/Submit
```
Steps:
1. Type: "Submit test"
2. Press Enter
3. Verify: Message is submitted (however your app handles submission)

Expected: Message submitted
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

#### Test 1.5: Empty Submission
```
Steps:
1. Ensure prompt is empty
2. Press Enter
3. Verify: Nothing happens (empty messages should not submit)

Expected: No submission
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

---

### Phase 2: Mouse Event Handling (Critical!)

#### Test 2.1: Mouse Movement
```
Steps:
1. Clear prompt or start fresh
2. Move mouse/trackpad over terminal window
3. Move in circles, zigzags, random patterns
4. Observe prompt box

Expected: NO escape sequences appear in prompt
Actual: _________
Status: [ ] PASS  [ ] FAIL

If FAIL, what appears: _________
```

#### Test 2.2: Trackpad Scrolling
```
Steps:
1. Have some messages in the chat history (if applicable)
2. Clear prompt or start fresh
3. Scroll UP with trackpad/mouse wheel
4. Scroll DOWN with trackpad/mouse wheel
5. Observe prompt box

Expected: NO escape sequences appear in prompt
          (Scrolling may or may not work depending on ScrollProvider)
Actual: _________
Status: [ ] PASS  [ ] FAIL

If FAIL, what appears: _________
```

#### Test 2.3: Rapid Scrolling
```
Steps:
1. Clear prompt or start fresh
2. Rapidly scroll up and down multiple times
3. Do "flick" gestures on trackpad
4. Observe prompt box

Expected: NO escape sequences even during rapid scrolling
Actual: _________
Status: [ ] PASS  [ ] FAIL

If FAIL, describe behavior: _________
```

#### Test 2.4: Click Events
```
Steps:
1. Clear prompt or start fresh
2. Click on various parts of the terminal
3. Click inside prompt box
4. Click outside prompt box
5. Observe prompt box

Expected: NO escape sequences from clicks
Actual: _________
Status: [ ] PASS  [ ] FAIL

Notes: _________
```

#### Test 2.5: Mouse + Keyboard Combined
```
Steps:
1. Type: "Test"
2. Move mouse around
3. Type: " message"
4. Scroll with trackpad
5. Type: " works"
6. Observe final result

Expected: "Test message works" (no garbage mixed in)
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

---

### Phase 3: Edge Cases

#### Test 3.1: Fast Typing
```
Steps:
1. Clear prompt
2. Type as fast as possible: "The quick brown fox jumps over the lazy dog"
3. Verify all characters appear correctly

Expected: Complete sentence, no dropped characters
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

#### Test 3.2: Key Repeat
```
Steps:
1. Clear prompt
2. Hold down a key (e.g., 'a') for 2-3 seconds
3. Verify key repeats correctly

Expected: "aaaaaaaaaa..." (repeated characters)
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

#### Test 3.3: Multi-Line Input (if supported)
```
Steps:
1. If your input supports multiple lines, test:
   - Type some text
   - Insert newline (Shift+Enter or however it works)
   - Type more text
2. Verify newlines work correctly

Expected: Multi-line text in prompt
Actual: _________
Status: [ ] PASS  [ ] FAIL  [ ] N/A (not supported)
```

#### Test 3.4: Very Long Input
```
Steps:
1. Type or paste a very long string (500+ characters)
2. Verify it handles correctly (wraps, scrolls, etc.)

Expected: Long text handled gracefully
Actual: _________
Status: [ ] PASS  [ ] FAIL

Notes: _________
```

---

### Phase 4: Terminal Compatibility

Test on different terminal emulators if possible:

#### Test 4.1: VS Code Terminal
```
Terminal: VS Code integrated terminal
OS: _________
Result: [ ] PASS  [ ] FAIL
Notes: _________
```

#### Test 4.2: iTerm2 (macOS)
```
Terminal: iTerm2
OS: macOS
Result: [ ] PASS  [ ] FAIL
Notes: _________
```

#### Test 4.3: Terminal.app (macOS)
```
Terminal: Terminal.app
OS: macOS
Result: [ ] PASS  [ ] FAIL
Notes: _________
```

#### Test 4.4: Windows Terminal
```
Terminal: Windows Terminal
OS: Windows
Result: [ ] PASS  [ ] FAIL
Notes: _________
```

#### Test 4.5: GNOME Terminal (Linux)
```
Terminal: GNOME Terminal
OS: Linux
Result: [ ] PASS  [ ] FAIL
Notes: _________
```

#### Test 4.6: Alacritty
```
Terminal: Alacritty
OS: _________
Result: [ ] PASS  [ ] FAIL
Notes: _________
```

---

## Debug Testing

If tests fail, use these debug techniques:

### Debug 1: Enable Debug Logging

In KeypressContext.tsx:
```typescript
<KeypressProvider debugKeystrokeLogging={true}>
```

This will log all keypress events to console. Look for:
- Mouse sequences appearing in keypress logs (BAD - means filter failed)
- Mouse sequences NOT appearing in keypress logs (GOOD - means filter worked)

### Debug 2: Add PromptBox Logging

In PromptBox's useKeypress callback:
```typescript
useKeypress((key: Key) => {
  console.log('[PromptBox] Received key:', {
    name: key.name,
    sequence: JSON.stringify(key.sequence),
    insertable: key.insertable,
    charCode: key.sequence.charCodeAt(0),
  });

  // ... rest of handler
}, { isActive: !disabled });
```

Run app and move mouse. Check console:
- If you see `sequence: "\u001b[<64;95;16M"` → Filter failed
- If you NEVER see sequences starting with `\u001b[<` → Filter working ✅

### Debug 3: Test parseMouseEvent

Create a test file:
```typescript
// test-mouse-parse.ts
import { parseMouseEvent } from './utils/mouse';

const testCases = [
  '\x1b[<64;95;16M',      // SGR scroll down
  '\x1b[<65;95;16M',      // SGR scroll up
  '\x1b[<0;50;10M',       // SGR left press
  '\x1b[<0;50;10m',       // SGR left release
  '\x1b[M !!',            // X11 mouse event
  'Hello world',          // Not a mouse event
  '[<64;95;16M',          // Partial (missing ESC)
];

for (const testCase of testCases) {
  const result = parseMouseEvent(testCase);
  console.log(`Input: ${JSON.stringify(testCase)}`);
  console.log(`Result: ${result ? JSON.stringify(result) : 'null'}`);
  console.log('---');
}
```

Run it:
```bash
npx ts-node test-mouse-parse.ts
```

Expected:
- First 5 should parse successfully
- "Hello world" should return null
- "[<64;95;16M" (without ESC) should return null

---

## Automated Test Script

Create this test script to automate some checks:

```typescript
// test-mouse-filtering.test.ts
import { describe, it, expect } from 'vitest'; // or jest
import { parseMouseEvent } from '../utils/mouse';

describe('Mouse Event Parsing', () => {
  it('should parse SGR mouse events', () => {
    const result = parseMouseEvent('\x1b[<64;95;16M');
    expect(result).toBeTruthy();
    expect(result?.event.name).toBe('scroll-down');
  });

  it('should parse X11 mouse events', () => {
    const result = parseMouseEvent('\x1b[M !!');
    expect(result).toBeTruthy();
  });

  it('should NOT parse partial sequences', () => {
    const result = parseMouseEvent('[<64;95;16M');
    expect(result).toBeNull();
  });

  it('should NOT parse regular text', () => {
    const result = parseMouseEvent('Hello world');
    expect(result).toBeNull();
  });
});

describe('Mouse Event Filtering', () => {
  // If you export the filter function, test it directly
  it('should filter out mouse events from keypress stream', () => {
    // Mock test - adapt to your actual implementation
    const mockHandler = jest.fn();
    const filter = nonKeyboardEventFilter(mockHandler);

    // Simulate mouse event
    filter({
      name: '',
      sequence: '\x1b[<64;95;16M',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      insertable: false,
    });

    // Handler should NOT be called
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should allow regular keypress events', () => {
    const mockHandler = jest.fn();
    const filter = nonKeyboardEventFilter(mockHandler);

    // Simulate regular key
    filter({
      name: 'a',
      sequence: 'a',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      insertable: true,
    });

    // Handler SHOULD be called
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });
});
```

Run tests:
```bash
npm test
```

---

## Performance Testing

### Test P1: Input Lag
```
Steps:
1. Type continuously for 30 seconds
2. Observe responsiveness

Expected: No noticeable lag, characters appear immediately
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

### Test P2: Memory Leak Check
```
Steps:
1. Run app for 5+ minutes
2. Continuously type, scroll, move mouse
3. Monitor memory usage (Task Manager / Activity Monitor)

Expected: Memory stable, no continuous growth
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

### Test P3: High Frequency Events
```
Steps:
1. Use a gaming mouse with high polling rate, OR
2. Rapidly move trackpad in circular motions for 30 seconds
3. Observe app stability

Expected: No crashes, no performance degradation
Actual: _________
Status: [ ] PASS  [ ] FAIL
```

---

## Regression Testing

Test that the fix didn't break anything else:

### Regression 1: Message History
```
Does message history still work?
Status: [ ] PASS  [ ] FAIL  [ ] N/A
```

### Regression 2: Scrolling
```
Does scrolling (if implemented) still work?
Status: [ ] PASS  [ ] FAIL  [ ] N/A
```

### Regression 3: Syntax Highlighting
```
Does syntax highlighting (if implemented) still work?
Status: [ ] PASS  [ ] FAIL  [ ] N/A
```

### Regression 4: Command Completion
```
Does autocomplete/suggestions (if implemented) still work?
Status: [ ] PASS  [ ] FAIL  [ ] N/A
```

---

## Final Checklist

Before considering the fix complete:

- [ ] All Phase 1 tests pass (basic functionality)
- [ ] All Phase 2 tests pass (mouse event handling) ← CRITICAL!
- [ ] Most Phase 3 tests pass (edge cases)
- [ ] Tested on at least 2 different terminal emulators
- [ ] No memory leaks observed
- [ ] No regressions in existing functionality
- [ ] Code reviewed and follows project conventions
- [ ] Documentation updated if needed

---

## Reporting Results

When reporting test results, include:

1. **Environment:**
   - OS: _________
   - Terminal: _________
   - Node version: _________
   - Ink version: _________

2. **Overall Status:**
   - [ ] All critical tests pass
   - [ ] Some failures (list below)
   - [ ] Major issues (describe below)

3. **Failed Tests:**
   - Test #: _________
   - Expected: _________
   - Actual: _________
   - Console output: _________

4. **Screenshots/Videos:**
   - Before fix: [link/attach]
   - After fix: [link/attach]

5. **Additional Notes:**
   _________

---

## Success Criteria

The fix is considered successful if:

1. ✅ Mouse movement produces ZERO escape sequences in prompt
2. ✅ Scrolling produces ZERO escape sequences in prompt
3. ✅ All keyboard input works normally
4. ✅ No performance degradation
5. ✅ No regressions in existing features

If all above are true: **FIX SUCCESSFUL! 🎉**
