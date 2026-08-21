// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    rules: {
      // React Compiler's rules, and the three this app disagrees with by design rather
      // than by accident. An `Animated.Value` and a Reanimated shared value are both
      // mutable handles kept in a ref and read while rendering — the documented React
      // Native idiom, and there is no rewrite that satisfies the rule and keeps the
      // animation. Warnings rather than off: a new one is still worth reading, it just
      // should not be the thing that fails the run.
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      // Effects that reset local state when the prop it derives from changes. The
      // key-based remount the rule prefers would drop the subtree, which inside a sheet
      // means losing the keyboard mid-edit.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
