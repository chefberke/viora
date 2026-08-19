/**
 * The parse prompt and its few-shot examples. Split from the transport in
 * `entries.llm.ts` so a prompt change is a diff in one small file. Editing anything
 * here should come with a `PROMPT_VERSION` bump in `entries.versions.ts`.
 */

/**
 * The parser's whole job is structure, not numbers: nutrition comes from USDA. The
 * per-100g estimates exist only as the fallback when the database has no match, and
 * the pipeline caps their confidence.
 */
export const SYSTEM_PROMPT = `You convert one line of a food diary into structured JSON. Reply with ONLY a JSON object, no markdown:
{
  "normalized_text": string,  // the line with spelling fixed and shorthand expanded; keep the user's wording and meaning, never add or remove foods
  "reasoning": string,        // 1-3 short sentences: how you read the line and chose portions
  "confidence": number,       // 0-1, your certainty that items and portions match what was written
  "items": [
    {
      "name": string,             // generic English food name, singular, lowercase ("hamburger", "white rice, cooked"). Keep a brand word only when the item IS a branded product ("coca-cola", "pepsi", "big mac").
      "quantity": number,
      "unit": string,             // one of: g, kg, oz, lb, ml, l, cup, tbsp, tsp, glass, bottle, can, slice, piece, serving
      "estimated_grams": number,  // this item's TOTAL weight in grams (total ml for liquids). Always fill it in.
      "estimated_per_100g": { "kcal": number, "protein": number, "carbs": number, "fat": number },  // used only if the food database has no match
      "kind": "food" | "water",
      "confidence": number        // 0-1 for this item
    }
  ]
}
Rules:
- Every distinct food or drink in the line is its own item. Never merge items, never invent items that are not written.
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
      items: [
        {
          name: 'hamburger',
          quantity: 0.75,
          unit: 'serving',
          estimated_grams: 170,
          estimated_per_100g: { kcal: 254, protein: 13, carbs: 21, fat: 12 },
          kind: 'food',
          confidence: 0.65,
        },
        {
          name: 'coca-cola',
          quantity: 1,
          unit: 'can',
          estimated_grams: 330,
          estimated_per_100g: { kcal: 42, protein: 0, carbs: 10.6, fat: 0 },
          kind: 'food',
          confidence: 0.8,
        },
        {
          name: 'pepsi',
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
    user: '2 glasses of water',
    assistant: JSON.stringify({
      normalized_text: '2 glasses of water',
      reasoning: 'Plain water, two standard 250 ml glasses.',
      confidence: 0.95,
      items: [
        {
          name: 'water',
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
      items: [
        {
          name: 'cornflakes',
          quantity: 1,
          unit: 'cup',
          estimated_grams: 30,
          estimated_per_100g: { kcal: 357, protein: 7.5, carbs: 84, fat: 0.4 },
          kind: 'food',
          confidence: 0.85,
        },
        {
          name: 'milk',
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
      items: [
        {
          name: 'coca-cola',
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
