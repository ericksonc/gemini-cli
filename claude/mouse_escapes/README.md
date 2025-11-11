# Mouse Escape Sequence Pollution - Investigation Report

**Date:** November 11, 2025
**Project:** Chimera cli_ink
**Issue:** Mouse escape sequences appearing as text in prompt box
**Status:** ✅ ROOT CAUSE IDENTIFIED AND SOLUTION PROVIDED

---

## Quick Summary

**The Problem:**
When users move their trackpad/mouse in chimera's cli_ink terminal UI, escape sequences like `[<65;93;19M` appear as text in the prompt box instead of being handled as mouse events.

**Root Cause:**
Chimera uses Ink's `useInput` hook which internally processes escape sequences and strips the ESC character before passing unrecognized sequences to callbacks. This makes it impossible to filter mouse events at the PromptBox level. Gemini-CLI avoids this by implementing a custom KeypressContext that filters mouse events BEFORE any input handler sees them.

**The Solution:**
Port gemini-cli's KeypressContext architecture to chimera, which includes:
1. Custom stdin parsing with explicit mouse sequence handling
2. Mouse event filtering BEFORE broadcasting to input handlers
3. Replace Ink's `useInput` with custom `useKeypress` hook

---

## Investigation Files

This directory contains a comprehensive analysis of the issue and solution:

### 1. ROOT_CAUSE_ANALYSIS.md
**Purpose:** Deep technical analysis of why the problem occurs
**Key Sections:**
- Architecture comparison (chimera vs gemini-cli)
- Why previous fix attempts failed
- Evidence and code analysis
- Recommended solution with implementation phases

**Read this first** to understand the problem fully.

### 2. CODE_COMPARISON.md
**Purpose:** Side-by-side code comparisons showing exact differences
**Key Sections:**
- Input handling architecture differences
- Stdin processing comparison
- Data flow diagrams (working vs broken)
- Critical code snippets with annotations

**Read this** to see exactly what's different between working and broken implementations.

### 3. IMPLEMENTATION_GUIDE.md
**Purpose:** Step-by-step instructions for implementing the fix
**Key Sections:**
- Files to copy from gemini-cli
- Required code modifications
- Integration steps
- Troubleshooting guide

**Follow this** when you're ready to implement the fix.

### 4. TESTING_GUIDE.md
**Purpose:** Comprehensive testing procedures
**Key Sections:**
- Pre-implementation baseline (document broken behavior)
- Post-implementation test phases
- Debug techniques
- Success criteria

**Use this** to verify the fix works correctly.

---

## Quick Start

If you want to fix this immediately:

1. **Read:** ROOT_CAUSE_ANALYSIS.md (15 min)
2. **Review:** CODE_COMPARISON.md (10 min)
3. **Implement:** Follow IMPLEMENTATION_GUIDE.md (4-6 hours)
4. **Test:** Use TESTING_GUIDE.md (1-2 hours)

**Total estimated time:** 6-9 hours for complete implementation and testing.

---

## Key Findings

### What We Discovered

1. **Both MouseProvider implementations are correct**
   Chimera's MouseProvider is nearly identical to gemini-cli's and works perfectly. This was never the issue.

2. **The problem is in keyboard input handling**
   Gemini-CLI uses a custom KeypressContext with mouse filtering.
   Chimera uses Ink's `useInput` which doesn't filter mouse events.

3. **Ink strips ESC characters**
   By the time `useInput` callbacks receive data, Ink has already processed escape sequences and stripped the ESC character (0x1b), making it impossible to detect and filter mouse sequences.

4. **All previous fixes failed for the same reason**
   Every attempt to filter in the PromptBox component was "too late" - the ESC character was already gone.

### Critical Code Sections

**Gemini-CLI's Mouse Filter (KeypressContext.tsx:129-141):**
```typescript
function nonKeyboardEventFilter(keypressHandler: KeypressHandler): KeypressHandler {
  return (key: Key) => {
    if (!parseMouseEvent(key.sequence) && /* ... */) {
      keypressHandler(key);  // Only non-mouse events pass through
    }
  };
}
```

**This single function is the key to why gemini-cli works!**

### Why Previous Attempts Failed

| Attempt | What It Tried | Why It Failed |
|---------|---------------|---------------|
| resetMouseModes() | Clear inherited terminal state | Problem isn't inherited pollution |
| Alternate screen buffer | Isolate display | Doesn't prevent stdin broadcast |
| Pattern matching | `input.includes('\x1b[<')` | ESC already stripped by Ink |
| ESC check | `input.charCodeAt(0) === 0x1b` | ESC already stripped by Ink |

---

## Recommended Solution

### Option 1: Custom KeypressContext (RECOMMENDED ✅)

**Pros:**
- Production-tested (gemini-cli uses this)
- Clean architecture
- Complete solution
- Matches industry patterns

**Cons:**
- Requires significant porting effort (~600 lines)
- 4-6 hours implementation time

**Difficulty:** Medium-High
**Reliability:** Very High

### Option 2: Monkey-Patch Stdin (EXPERIMENTAL ⚠️)

**Pros:**
- Quick to implement (30 min)
- Minimal code changes

**Cons:**
- Fragile, may break with Ink updates
- Doesn't handle all mouse formats
- Not production-ready

**Difficulty:** Low
**Reliability:** Low

### Option 3: Disable Mouse Events (WORKAROUND ❌)

**Pros:**
- Immediate fix
- Zero implementation effort

**Cons:**
- Lose ALL mouse functionality
- Not a real solution

**Difficulty:** None
**Reliability:** N/A (not a fix)

---

## Files to Port from Gemini-CLI

1. **contexts/KeypressContext.tsx** (618 lines)
   - Custom stdin parsing
   - Mouse event filtering
   - Key event generation

2. **hooks/useKeypress.ts** (36 lines)
   - Hook interface for KeypressContext

3. **Update PromptBox.tsx**
   - Replace `useInput` with `useKeypress`
   - Remove failed filtering attempts

4. **Update App.tsx**
   - Add KeypressProvider wrapper

---

## Testing Requirements

After implementation, the fix must pass:

- ✅ Mouse movement produces ZERO escape sequences in prompt
- ✅ Scrolling produces ZERO escape sequences in prompt
- ✅ All keyboard input works normally
- ✅ No performance degradation
- ✅ Works on multiple terminal emulators

See TESTING_GUIDE.md for complete test procedures.

---

## Technical Details

### Why Both Handlers Receive stdin Data

Node.js EventEmitter broadcasts to ALL listeners:
```typescript
stdin.on('data', mouseHandler);    // MouseProvider
stdin.on('data', inkHandler);      // Ink's internal handler
// Both receive the SAME data independently
```

This is NOT a bug - it's by design. The solution is to filter at the application level.

### Why ESC Character Disappears

Ink's input processing:
1. Receives: `\x1b[<64;95;16M`
2. Buffers escape sequence
3. Tries to match against known patterns (arrow keys, etc.)
4. Fails to match (not a recognized key)
5. Strips `\x1b`, passes `[<64;95;16M` to callback

This is expected behavior for keyboard input, but problematic with mouse tracking enabled.

---

## References

### Chimera Repository
- **Path:** `/tmp/chimera_investigation/chimera/`
- **Branch:** `dev`
- **Relevant files:**
  - `cli_ink/src/components/PromptBox.tsx` (broken implementation)
  - `cli_ink/src/contexts/MouseProvider.tsx` (working correctly)
  - `meta/agents/cli/mouse_pollution_experiments_20241111.md` (previous attempts)

### Gemini-CLI Repository
- **Path:** `/home/user/gemini-cli/`
- **Relevant files:**
  - `packages/cli/src/ui/contexts/KeypressContext.tsx` (working implementation)
  - `packages/cli/src/ui/contexts/MouseContext.tsx` (nearly identical to chimera's)
  - `packages/cli/src/ui/components/InputPrompt.tsx` (uses useKeypress, not useInput)

---

## Next Steps

1. **Decision:** Choose implementation approach (recommend Option 1)
2. **Planning:** Allocate 6-9 hours for implementation + testing
3. **Implementation:** Follow IMPLEMENTATION_GUIDE.md step-by-step
4. **Testing:** Use TESTING_GUIDE.md to verify fix
5. **Documentation:** Update chimera's docs with architecture notes

---

## Questions?

If you need clarification on any aspect:

1. See the specific document for that topic (listed above)
2. Check CODE_COMPARISON.md for visual examples
3. Look at gemini-cli's working implementation directly
4. Reference the experiments document in chimera for what's already been tried

---

## Success Metrics

The fix will be considered successful when:

1. Users can move their mouse/trackpad without seeing any escape sequences
2. All keyboard input continues to work normally
3. Mouse events (if implemented) continue to work via MouseProvider
4. No performance degradation
5. No regressions in existing features

**Expected outcome:** Clean, professional terminal UI without mouse escape sequence pollution! ✅

---

*Investigation completed by Claude Code*
*Date: November 11, 2025*
