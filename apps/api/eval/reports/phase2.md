# Parse accuracy — 2026-08-21T00:27:15.044Z

Model `openai/gpt-oss-120b`, prompt `v2.ba6c328b`, 126 cases, replayed from committed fixtures.

| Metric | Value |
| --- | --- |
| Cases passed | 86.5% |
| Item precision / recall / F1 | 94.8% / 99.5% / 97.1% |
| Portion within band | 96.0% |
| Item calories within band | 90.6% |
| Row calories within band | 91.9% |
| Row calorie MAPE | 27.6% |
| Kind accuracy | 100.0% |
| Unit family accuracy | 100.0% |
| Grounding rate | 98.9% |
| Adversarial rejection | 100.0%  (n=10) |
| Expected calibration error | 0.075 |

## Failure taxonomy

| Code | Count | What it means |
| --- | --- | --- |
| `hallucinated_item` | 9 | the parse invented a food the line never named |
| `wrong_food` | 8 | right portion, but the matched food is the wrong food |
| `wrong_portion` | 6 | right food, weight outside the expected band |
| `ungrounded_fallback` | 2 | no database matched, so the numbers are a model guess |
| `split_item` | 1 | one food came back as two items |
| `missed_item` | 1 | a food in the line is absent from the parse |

## Confidence calibration

| Confidence | Items | Observed accuracy |
| --- | --- | --- |
| 0.4–0.5 | 2 | 100.0% |
| 0.5–0.6 | 4 | 100.0% |
| 0.6–0.7 | 7 | 85.7% |
| 0.7–0.8 | 20 | 90.0% |
| 0.8–0.9 | 72 | 90.3% |
| 0.9–1.0 | 78 | 94.9% |

## By category

| Tag | Cases | Pass rate |
| --- | --- | --- |
| `brand` | 12 | 66.7% |
| `composite` | 11 | 63.6% |
| `cooked_raw` | 10 | 80.0% |
| `injection` | 5 | 100.0% |
| `mixed_language` | 5 | 100.0% |
| `multi_item` | 20 | 80.0% |
| `non_food` | 10 | 100.0% |
| `numeric_edge` | 21 | 100.0% |
| `overflow` | 2 | 100.0% |
| `simple` | 24 | 91.7% |
| `tr_unit` | 19 | 100.0% |
| `typo` | 10 | 90.0% |
| `vague_size` | 15 | 66.7% |
| `volume_unit` | 24 | 91.7% |
| `water` | 9 | 77.8% |
