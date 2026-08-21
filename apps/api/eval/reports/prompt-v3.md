# Parse accuracy — 2026-08-21T00:52:07.433Z

Model `openai/gpt-oss-120b`, prompt `v3.4b2e0a99`, 126 cases, replayed from committed fixtures.

| Metric | Value |
| --- | --- |
| Cases passed | 88.1% |
| Item precision / recall / F1 | 93.9% / 100.0% / 96.9% |
| Portion within band | 96.0% |
| Item calories within band | 90.6% |
| Row calories within band | 91.9% |
| Row calorie MAPE | 27.7% |
| Kind accuracy | 100.0% |
| Unit family accuracy | 100.0% |
| Grounding rate | 98.4% |
| Adversarial rejection | 100.0%  (n=10) |
| Expected calibration error | 0.088 |

## Failure taxonomy

| Code | Count | What it means |
| --- | --- | --- |
| `hallucinated_item` | 12 | the parse invented a food the line never named |
| `wrong_food` | 7 | right portion, but the matched food is the wrong food |
| `wrong_portion` | 6 | right food, weight outside the expected band |
| `ungrounded_fallback` | 3 | no database matched, so the numbers are a model guess |

## Confidence calibration

| Confidence | Items | Observed accuracy |
| --- | --- | --- |
| 0.4–0.5 | 3 | 100.0% |
| 0.5–0.6 | 4 | 100.0% |
| 0.6–0.7 | 12 | 91.7% |
| 0.7–0.8 | 16 | 68.8% |
| 0.8–0.9 | 46 | 93.5% |
| 0.9–1.0 | 103 | 96.1% |

## By category

| Tag | Cases | Pass rate |
| --- | --- | --- |
| `brand` | 12 | 83.3% |
| `composite` | 11 | 63.6% |
| `cooked_raw` | 10 | 80.0% |
| `injection` | 5 | 100.0% |
| `mixed_language` | 5 | 100.0% |
| `multi_item` | 20 | 85.0% |
| `non_food` | 10 | 100.0% |
| `numeric_edge` | 21 | 85.7% |
| `overflow` | 2 | 100.0% |
| `simple` | 24 | 87.5% |
| `tr_unit` | 19 | 89.5% |
| `typo` | 10 | 90.0% |
| `vague_size` | 15 | 73.3% |
| `volume_unit` | 24 | 100.0% |
| `water` | 9 | 88.9% |
