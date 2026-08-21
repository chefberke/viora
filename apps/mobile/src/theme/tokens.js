/**
 * Design tokens — the only place to add or change a colour. `tailwind.config.js` turns
 * them into utility classes and `src/theme/palette.ts` into `rgb(...)` strings.
 *
 * CommonJS so tailwind.config.js can `require()` it at build time. Colours are `"R G B"`
 * channel strings, not hex, because that is the form `<alpha-value>` needs.
 */

/** @typedef {Record<string, string>} TokenSet */

const colors = {
  light: {
    /* Surfaces. Tinted page, white pills, so every control reads as a floating card.
       The dark theme inverts it: near-black page, lighter pills. */
    background: '242 242 247', // #F2F2F7
    surface: '255 255 255', // #FFFFFF — pills, round buttons, bottom bar
    'surface-strong': '235 235 240', // #EBEBF0 — pressed
    border: '229 229 236', // #E5E5EC — hairlines

    /* Text */
    foreground: '17 17 19', // #111113
    /* One step off the full black: headings and headline figures, which should lead the
       row without shouting it. Still far enough from `foreground-muted` to read as a
       heading beside the muted line under it. */
    'foreground-soft': '63 63 70', // #3F3F46
    'foreground-muted': '110 110 118', // #6E6E76 — placeholder, status label
    'foreground-subtle': '168 168 176', // #A8A8B0 — dot separators

    /* Status. `danger` removes or refuses, `warning` clears or exports, `accent` is a
       link, `success` a switch that is on. */
    danger: '225 29 72', // #E11D48
    warning: '245 158 11', // #F59E0B
    accent: '0 122 255', // #007AFF
    success: '22 163 74', // #16A34A
    /* Hydration. Its own token: water is not a link, so it must not borrow `accent`. */
    water: '2 132 199', // #0284C7

    /* Macro accents, darkened so they stay readable on white. */
    'macro-carbs': '225 29 72', // #E11D48
    'macro-protein': '180 83 9', // #B45309
    'macro-fat': '162 28 175', // #A21CAF

    /* The one composer action colour still in use: the sun on the morning greeting. It
       kept its name through the toolbar's removal because the name is the honest one —
       it is the warm end of the same set, and `warning` (which the afternoon uses) would
       have meant something this does not. Its two siblings went with the buttons. */
    'action-add': '234 88 12', // #EA580C

    /* The brand purple. Primary actions only, so it keeps meaning "the way forward". */
    brand: '124 77 255', // #7C4DFF
    'brand-strong': '106 61 232', // #6A3DE8 — pressed
    'brand-soft': '183 155 255', // #B79BFF — the crest of a shimmer through brand text
    'brand-foreground': '255 255 255', // #FFFFFF — text and icons on top of brand
  },

  dark: {
    /* Surfaces */
    background: '10 10 11', // #0A0A0B
    surface: '38 38 42', // #26262A
    'surface-strong': '52 52 58', // #34343A
    border: '44 44 48', // #2C2C30

    /* Text */
    foreground: '250 250 250', // #FAFAFA
    'foreground-soft': '201 201 206', // #C9C9CE
    'foreground-muted': '138 138 145', // #8A8A91
    'foreground-subtle': '90 90 98', // #5A5A62

    /* Status */
    danger: '255 77 109', // #FF4D6D
    warning: '255 159 10', // #FF9F0A
    accent: '10 132 255', // #0A84FF
    success: '48 209 88', // #30D158
    water: '56 189 248', // #38BDF8

    /* Macro accents */
    'macro-carbs': '255 77 109', // #FF4D6D
    'macro-protein': '255 214 10', // #FFD60A
    'macro-fat': '199 79 232', // #C74FE8

    /* See the light scheme for why only one of the three is left. */
    'action-add': '255 159 10', // #FF9F0A

    /* Brand, lifted: a purple tuned for white is too close to the near-black page. */
    brand: '138 99 255', // #8A63FF
    'brand-strong': '120 82 240', // #7852F0
    'brand-soft': '192 168 255', // #C0A8FF
    'brand-foreground': '255 255 255', // #FFFFFF
  },
};

/**
 * How far a surface floats above the background. The dark theme separates surfaces with
 * colour instead, so it switches the shadow off — one drawn on a near-black page is muddy.
 */
const elevation = {
  light: {
    shadowColor: '#0B0B14',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffsetHeight: 4,
    /* Android draws from this alone; it has no separate colour or radius. */
    androidElevation: 3,
  },

  dark: {
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffsetHeight: 0,
    androidElevation: 0,
  },
};

module.exports = { colors, elevation };
