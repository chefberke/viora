# Parse accuracy — 2026-08-20T23:27:23.214Z

Model `openai/gpt-oss-120b`, prompt `v1.eba225e5`, 126 cases, replayed from committed fixtures.

| Metric | Value |
| --- | --- |
| Cases passed | 55.6% |
| Item precision / recall / F1 | 97.6% / 90.2% / 93.8% |
| Portion within band | 86.0% |
| Item calories within band | 64.2% |
| Row calories within band | 64.9% |
| Row calorie MAPE | 54.1% |
| Kind accuracy | 100.0% |
| Unit family accuracy | 100.0% |
| Grounding rate | 99.4% |
| Adversarial rejection | 90.0%  (n=10) |
| Expected calibration error | 0.281 |

## Failure taxonomy

| Code | Count | What it means |
| --- | --- | --- |
| `wrong_food` | 30 | right portion, but the matched food is the wrong food |
| `wrong_portion` | 19 | right food, weight outside the expected band |
| `missed_item` | 11 | a food in the line is absent from the parse |
| `merged_items` | 7 | two foods came back as one item |
| `hallucinated_item` | 4 | the parse invented a food the line never named |
| `truncated_items` | 2 | the item list was cut at MAX_ITEMS without saying so |
| `unexpected_error` | 1 | the run did not produce a result |
| `ungrounded_fallback` | 1 | no database matched, so the numbers are a model guess |

## Confidence calibration

| Confidence | Items | Observed accuracy |
| --- | --- | --- |
| 0.4–0.5 | 1 | 100.0% |
| 0.6–0.7 | 12 | 91.7% |
| 0.7–0.8 | 48 | 95.8% |
| 0.8–0.9 | 47 | 63.8% |
| 0.9–1.0 | 58 | 50.0% |

## By category

| Tag | Cases | Pass rate |
| --- | --- | --- |
| `brand` | 12 | 58.3% |
| `composite` | 11 | 45.5% |
| `cooked_raw` | 10 | 10.0% |
| `injection` | 5 | 60.0% |
| `mixed_language` | 5 | 80.0% |
| `multi_item` | 20 | 30.0% |
| `non_food` | 10 | 90.0% |
| `numeric_edge` | 21 | 61.9% |
| `overflow` | 2 | 0.0% |
| `simple` | 24 | 50.0% |
| `tr_unit` | 19 | 68.4% |
| `typo` | 10 | 30.0% |
| `vague_size` | 15 | 46.7% |
| `volume_unit` | 24 | 66.7% |
| `water` | 9 | 77.8% |
