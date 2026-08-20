/**
 * The parse prompt and its few-shot examples. Split from the transport in
 * `entries.llm.ts` so a prompt change is a diff in one small file. Editing anything
 * here should come with a `PROMPT_VERSION` bump in `entries.versions.ts`.
 */

/**
 * The parser's whole job is structure, not numbers: nutrition comes from the food
 * databases. The per-100g estimates exist only as the fallback when neither database has
 * a match, and the pipeline caps their confidence.
 *
 * Each item carries two names because the two databases are indexed differently. USDA is
 * searched with the generic English `name`; Open Food Facts is searched with `local_name`,
 * the words the user typed, because a Turkish product is filed under its Turkish name.
 *
 * The line's own `language` rides along with them. It is what tells a local food with no
 * English name ("ayran", where both names hold the same word) apart from a line that was
 * written in English — the pipeline cannot see the difference in the two names alone, and
 * skipping the first would drop exactly the foods Open Food Facts exists to answer.
 */
export const SYSTEM_PROMPT = `You convert one line of a food diary into structured JSON. Reply with ONLY a JSON object, no markdown:
{
  "normalized_text": string,  // the line with spelling fixed and shorthand expanded; keep the user's wording and meaning, never add or remove foods
  "reasoning": string,        // 1-3 short sentences: how you read the line and chose portions
  "confidence": number,       // 0-1, your certainty that items and portions match what was written
  "language": string,         // ISO 639-1 code of the language the LINE was written in ("en", "tr", "de"). The language of the words, not of the food.
  "items": [
    {
      "name": string,             // generic English food name, singular, lowercase ("hamburger", "white rice, cooked"). Keep a brand word only when the item IS a branded product ("coca-cola", "pepsi", "big mac").
      "local_name": string,       // the words the user actually typed for THIS item, copied from the line with only spelling fixed, lowercase. Never translate it. If the line was already English, repeat "name".
      "quantity": number,
      "unit": string,             // one of: g, kg, oz, lb, ml, l, cup, tbsp, tsp, glass, bottle, can, slice, piece, serving
      "estimated_grams": number,  // this item's TOTAL weight in grams (total ml for liquids). Always fill it in.
      "estimated_per_100g": { "kcal": number, "protein": number, "carbs": number, "fat": number },  // used only if no food database has a match
      "kind": "food" | "water",
      "confidence": number        // 0-1 for this item
    }
  ]
}
Rules:
- Every distinct food or drink in the line is its own item. Never merge items, never invent items that are not written.
- "local_name" is a copy, not a translation: it is the user's own words for that one item. When a food has no English generic name, the local word stays in BOTH "name" and "local_name".
- "language" describes the line as the user typed it. A Turkish line stays "tr" even when it names a food with an English word ("2 tost yedim" is "tr").
- Vague sizes: "a little"/"small" => quantity 0.75, unit "serving"; "big"/"large" => 1.5, "serving"; no size given => 1, "serving". Lower that item's confidence.
- Volume units (ml, l, cup, tbsp, tsp, glass, bottle, can) fix how much SPACE an item takes, not what it weighs.
  Set "estimated_grams" to what that volume of THAT food weighs: 1 cup of cornflakes is about 30 g, 1 cup of
  milk about 245 g, 1 cup of honey about 340 g. Mass units (g, kg, oz, lb) already state the weight.
- Only plain water (still or sparkling) has kind "water". Every other drink is "food".
- Do NOT put calories or nutrients anywhere except "estimated_per_100g". The database is the source of truth for nutrition.
- If the line is not about food or drink at all, return "items": [] and confidence 0.`;

export const FEW_SHOTS: ReadonlyArray<{ user: string; assistant: string }> = [
  {
    user: 'a littl hamburger and coca cola adn pepsi',
    assistant: JSON.stringify({
      normalized_text: 'a little hamburger and coca cola and pepsi',
      reasoning:
        'Three items: a small hamburger and two branded sodas. "littl" reads as "little", so the hamburger gets a reduced serving. No drink sizes given, so one can each.',
      confidence: 0.72,
      language: 'en',
      items: [
        {
          name: 'hamburger',
          local_name: 'hamburger',
          quantity: 0.75,
          unit: 'serving',
          estimated_grams: 170,
          estimated_per_100g: { kcal: 254, protein: 13, carbs: 21, fat: 12 },
          kind: 'food',
          confidence: 0.65,
        },
        {
          name: 'coca-cola',
          local_name: 'coca cola',
          quantity: 1,
          unit: 'can',
          estimated_grams: 330,
          estimated_per_100g: { kcal: 42, protein: 0, carbs: 10.6, fat: 0 },
          kind: 'food',
          confidence: 0.8,
        },
        {
          name: 'pepsi',
          local_name: 'pepsi',
          quantity: 1,
          unit: 'can',
          estimated_grams: 330,
          estimated_per_100g: { kcal: 43, protein: 0, carbs: 11, fat: 0 },
          kind: 'food',
          confidence: 0.8,
        },
      ],
    }),
  },
  {
    user: 'bi kase mercimek çorbasi ve 1 ayran',
    assistant: JSON.stringify({
      normalized_text: 'bir kase mercimek çorbası ve 1 ayran',
      reasoning:
        'Two items. "bi" reads as "bir", one bowl. The soup has an English generic name; ayran does not, so its own name is used for both. A bowl of soup is about 300 g and a glass of ayran about 250 ml.',
      confidence: 0.86,
      language: 'tr',
      items: [
        {
          name: 'lentil soup',
          local_name: 'mercimek çorbası',
          quantity: 1,
          unit: 'serving',
          estimated_grams: 300,
          estimated_per_100g: { kcal: 60, protein: 3, carbs: 8, fat: 2 },
          kind: 'food',
          confidence: 0.85,
        },
        {
          name: 'ayran',
          local_name: 'ayran',
          quantity: 1,
          unit: 'glass',
          estimated_grams: 250,
          estimated_per_100g: { kcal: 37, protein: 1.7, carbs: 2.9, fat: 1.9 },
          kind: 'food',
          confidence: 0.87,
        },
      ],
    }),
  },
  {
    user: '2 glasses of water',
    assistant: JSON.stringify({
      normalized_text: '2 glasses of water',
      reasoning: 'Plain water, two standard 250 ml glasses.',
      confidence: 0.95,
      language: 'en',
      items: [
        {
          name: 'water',
          local_name: 'water',
          quantity: 2,
          unit: 'glass',
          estimated_grams: 500,
          estimated_per_100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
          kind: 'water',
          confidence: 0.95,
        },
      ],
    }),
  },
  {
    user: 'a cup of cornflakes with half a cup of milk',
    assistant: JSON.stringify({
      normalized_text: 'a cup of cornflakes with half a cup of milk',
      reasoning:
        'Two items measured in the same volume unit but nowhere near the same weight. A cup of cornflakes is mostly air, about 30 g; half a cup of milk is about 123 g.',
      confidence: 0.88,
      language: 'en',
      items: [
        {
          name: 'cornflakes',
          local_name: 'cornflakes',
          quantity: 1,
          unit: 'cup',
          estimated_grams: 30,
          estimated_per_100g: { kcal: 357, protein: 7.5, carbs: 84, fat: 0.4 },
          kind: 'food',
          confidence: 0.85,
        },
        {
          name: 'milk',
          local_name: 'milk',
          quantity: 0.5,
          unit: 'cup',
          estimated_grams: 123,
          estimated_per_100g: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
          kind: 'food',
          confidence: 0.85,
        },
      ],
    }),
  },
  {
    user: 'coke 1lietre',
    assistant: JSON.stringify({
      normalized_text: 'coke 1 litre',
      reasoning: '"1lietre" is a misspelling of "1 litre". Coke is the branded drink coca-cola.',
      confidence: 0.85,
      language: 'en',
      items: [
        {
          name: 'coca-cola',
          local_name: 'coke',
          quantity: 1,
          unit: 'l',
          estimated_grams: 1000,
          estimated_per_100g: { kcal: 42, protein: 0, carbs: 10.6, fat: 0 },
          kind: 'food',
          confidence: 0.85,
        },
      ],
    }),
  },
];
