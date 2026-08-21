# Parse accuracy — 2026-08-21T00:01:07.323Z

Model `openai/gpt-oss-120b`, prompt `v1.eba225e5`, 126 cases, replayed from committed fixtures.

| Metric | Value |
| --- | --- |
| Cases passed | 84.1% |
| Item precision / recall / F1 | 98.3% / 92.9% / 95.5% |
| Portion within band | 95.6% |
| Item calories within band | 90.3% |
| Row calories within band | 91.0% |
| Row calorie MAPE | 25.5% |
| Kind accuracy | 100.0% |
| Unit family accuracy | 100.0% |
| Grounding rate | 99.4% |
| Adversarial rejection | 100.0%  (n=10) |
| Expected calibration error | 0.092 |

## Failure taxonomy

| Code | Count | What it means |
| --- | --- | --- |
| `wrong_food` | 8 | right portion, but the matched food is the wrong food |
| `missed_item` | 7 | a food in the line is absent from the parse |
| `wrong_portion` | 6 | right food, weight outside the expected band |
| `merged_items` | 6 | two foods came back as one item |
| `hallucinated_item` | 3 | the parse invented a food the line never named |
| `ungrounded_fallback` | 1 | no database matched, so the numbers are a model guess |

## Confidence calibration

| Confidence | Items | Observed accuracy |
| --- | --- | --- |
| 0.4–0.5 | 1 | 100.0% |
| 0.6–0.7 | 9 | 100.0% |
| 0.7–0.8 | 59 | 93.2% |
| 0.8–0.9 | 51 | 84.3% |
| 0.9–1.0 | 51 | 96.1% |

## By category

| Tag | Cases | Pass rate |
| --- | --- | --- |
| `brand` | 12 | 75.0% |
| `composite` | 11 | 45.5% |
| `cooked_raw` | 10 | 90.0% |
| `injection` | 5 | 100.0% |
| `mixed_language` | 5 | 100.0% |
| `multi_item` | 20 | 80.0% |
| `non_food` | 10 | 100.0% |
| `numeric_edge` | 21 | 90.5% |
| `overflow` | 2 | 100.0% |
| `simple` | 24 | 83.3% |
| `tr_unit` | 19 | 89.5% |
| `typo` | 10 | 80.0% |
| `vague_size` | 15 | 66.7% |
| `volume_unit` | 24 | 91.7% |
| `water` | 9 | 88.9% |
