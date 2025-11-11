/**
 * Prompt Box Component
 *
 * Fixed 5-line input area at the bottom of the screen:
 * Line 1: Horizontal line (border)
 * Line 2: "> " + user input
 * Line 3: Horizontal line (border)
 * Line 4: Info line (blueprint name + model)
 * Line 5: Empty space
 *
 * FIX: Filters out mouse escape sequences to prevent them from appearing in prompt
 */

import React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

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

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (key.return) {
        if (value.trim()) {
          onSubmit(value);
        }
      } else if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
      } else if (!key.ctrl && !key.meta && input) {
        // ✅ FIX: Filter out mouse escape sequences
        // Mouse events should be handled by MouseProvider, not added to prompt

        // Check for escape sequence (ESC = 0x1b)
        if (input.charCodeAt(0) === 0x1b) {
          // This is an escape sequence - could be mouse, arrow keys, etc.
          // Ink's useInput already handles arrow keys via the `key` object
          // Any remaining escape sequences (like mouse events) should be ignored
          return;
        }

        // Check for specific mouse sequence patterns as additional safety
        if (
          input.includes('\x1b[<') ||                    // SGR mouse prefix
          input.includes('\x1b[M') ||                    // X11 mouse prefix
          /\x1b\[\d+;\d+;\d+[Mm]/.test(input) ||        // Full SGR pattern
          /\x1b\[<\d+;\d+;\d+[Mm]/.test(input)          // Full SGR with <
        ) {
          return;
        }

        onChange(value + input);
      }
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
