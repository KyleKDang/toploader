/**
 * The design system's "tokens, not values" rule, enforced rather than
 * remembered.
 *
 * No hex code, no px font size, and no hardcoded radius appears in a
 * component. If a screen needs a value the design system does not name, the
 * fix is to add it to docs/design-system.md and to src/styles/theme.css, not
 * to inline it here.
 *
 * The rule reads every string the component layer contains - string literals,
 * template chunks, and JSX attribute text - because a Tailwind class, an
 * inline style object and a raw CSS string are all just strings by the time
 * they reach the linter, and a value smuggled in through any of them is the
 * same drift.
 */

/** A hex color: #fff, #ffff, #ffffff, #ffffffff. */
const HEX_COLOR = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;

/**
 * A px font size, in either notation the codebase can express one:
 * a CSS declaration (`font-size: 15px`), a style-object key (`fontSize`
 * followed by a px string), or a Tailwind arbitrary type utility
 * (`text-[15px]`, `text-[0.9rem]`).
 */
const PX_FONT_SIZE = [
  /font-size\s*:\s*[^;]*\b\d*\.?\d+(?:px|pt|em|rem)/i,
  /\btext-\[[^\]]*\b\d*\.?\d+(?:px|pt|em|rem)/i,
];

/**
 * A hardcoded radius: a CSS declaration, or a Tailwind arbitrary radius
 * utility (`rounded-[10px]`, `rounded-t-[6px]`).
 */
const HARDCODED_RADIUS = [
  /border-radius\s*:\s*[^;]*\b\d*\.?\d+(?:px|pt|em|rem|%)/i,
  /\brounded(?:-[a-z]{1,2})?-\[[^\]]*\b\d*\.?\d+(?:px|pt|em|rem|%)/i,
];

const CHECKS = [
  { test: (text) => HEX_COLOR.test(text), messageId: 'hexColor' },
  {
    test: (text) => PX_FONT_SIZE.some((re) => re.test(text)),
    messageId: 'pxFontSize',
  },
  {
    test: (text) => HARDCODED_RADIUS.some((re) => re.test(text)),
    messageId: 'hardcodedRadius',
  },
];

/** @type {import('eslint').Rule.RuleModule} */
const noRawValues = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hex colors, px font sizes and hardcoded radii in components; use design system tokens instead',
    },
    schema: [],
    messages: {
      hexColor:
        'Hex color "{{value}}". Use a --color-* token from src/styles/theme.css; nothing in the codebase refers to "green" or "grey", only to accent or muted.',
      pxFontSize:
        'px font size in "{{value}}". Use a --text-* token; the scale is xs/sm/base/lg/xl and 13px is the floor.',
      hardcodedRadius:
        'Hardcoded radius in "{{value}}". Use rounded-sm, rounded-md or rounded-full, which compile from the --radius-* tokens.',
    },
  },

  create(context) {
    /**
     * @param {import('estree').Node} node
     * @param {string} text
     */
    function check(node, text) {
      if (!text) return;

      // Every check that matches is reported, not just the first: one
      // className can carry a hardcoded radius and a px font size at once,
      // and naming only one of them sends the reader back for a second pass.
      for (const { test, messageId } of CHECKS) {
        if (!test(text)) continue;

        context.report({
          node,
          messageId,
          data: { value: text.length > 60 ? `${text.slice(0, 57)}...` : text },
        });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};

export default {
  meta: { name: 'design-tokens' },
  rules: { 'no-raw-values': noRawValues },
};
