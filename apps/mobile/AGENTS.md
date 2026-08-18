# Viora Mobile

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Folder structure

```
app/                    expo-router routes ONLY
src/features/<name>/    one self-contained feature
src/shared/             cross-feature code (ui/, and later hooks/, lib/)
src/theme/              design tokens and the color scheme system
```

Rules:

- `app/` never holds logic. A route file picks a screen and passes props, nothing else.
- A feature is imported only through its `index.ts`. Never reach into another feature's
  `components/` or `screens/`.
- `src/shared/` never imports from `src/features/`.
- When a second feature needs something, move it down into `src/shared/`.
- Files are `kebab-case`, matching expo-router's own route files. Components stay `PascalCase`.
- `@/` maps to `src/`, so `@/shared/ui` and `@/theme`.

## Colors and theming

**To add or change a color, edit `src/theme/tokens.js` and nothing else.** That file is the single
source of truth. `tailwind.config.js` turns it into CSS variables plus semantic utilities, and
`src/theme/palette.ts` resolves the same tokens into `rgb(...)` strings.

- Style with semantic classes: `bg-background`, `bg-surface`, `text-foreground`,
  `text-foreground-muted`, `text-macro-carbs`. Never hard-code a hex value in a component.
- Never write a `dark:` prefix. The CSS variables already switch per scheme, so one class covers
  both themes.
- `useTheme()` is only for props that cannot take a className — `placeholderTextColor`,
  `selectionColor`, navigator `contentStyle`, and the shadow below.
- Icons are themed the same way as text: `<Icon name="mic" className="text-action-voice" />`.

The two schemes separate surfaces from the page in different ways, and this is deliberate:
light uses a tinted page with white pills lifted by a shadow, dark uses a near-black page
with pills lifted by colour. So the shadow is a theme token (`elevation` in `tokens.js`),
not a decoration — it is empty in dark, because a shadow on a near-black page only muddies
it. `Pill` and `IconButton` already apply it; new surfaces should use those primitives
rather than re-adding a shadow by hand.

The app follows the device theme. `app.json` sets `userInterfaceStyle: "automatic"` and
`tailwind.config.js` sets `darkMode: 'class'` — class mode still follows the system, and it is the
only mode in which NativeWind's `setColorScheme()` works, which is what a future theme switcher
needs. `ThemeProvider` already owns that preference; wiring a switcher means persisting it there.

## Metro

`metro.config.js` stays minimal. Expo configures monorepo resolution itself since SDK 52; setting
`watchFolders`, `nodeModulesPaths` or `disableHierarchicalLookup` by hand breaks nested dependency
resolution.
