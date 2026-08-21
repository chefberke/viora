# Parse accuracy — 2026-08-21T00:22:50.191Z

Model `openai/gpt-oss-120b`, prompt `v2.ba6c328b`, 126 cases, recorded against the live providers.

| Metric | Value |
| --- | --- |
| Cases passed | 81.0% |
| Item precision / recall / F1 | 94.3% / 89.7% / 91.9% |
| Portion within band | 95.4% |
| Item calories within band | 90.2% |
| Row calories within band | 91.3% |
| Row calorie MAPE | 28.0% |
| Kind accuracy | 100.0% |
| Unit family accuracy | 100.0% |
| Grounding rate | 98.8% |
| Adversarial rejection | 100.0%  (n=10) |
| Expected calibration error | 0.067 |
| Latency p50 / p95 | 5370 ms / 23030 ms |

## Failure taxonomy

| Code | Count | What it means |
| --- | --- | --- |
| `hallucinated_item` | 9 | the parse invented a food the line never named |
| `llm_invalid_output` | 8 | the run did not produce a result |
| `wrong_food` | 7 | right portion, but the matched food is the wrong food |
| `wrong_portion` | 6 | right food, weight outside the expected band |
| `ungrounded_fallback` | 2 | no database matched, so the numbers are a model guess |
| `split_item` | 1 | one food came back as two items |
| `missed_item` | 1 | a food in the line is absent from the parse |

## Confidence calibration

| Confidence | Items | Observed accuracy |
| --- | --- | --- |
| 0.4–0.5 | 2 | 100.0% |
| 0.5–0.6 | 4 | 100.0% |
| 0.6–0.7 | 5 | 80.0% |
| 0.7–0.8 | 14 | 85.7% |
| 0.8–0.9 | 65 | 90.8% |
| 0.9–1.0 | 75 | 94.7% |

## By category

| Tag | Cases | Pass rate |
| --- | --- | --- |
| `brand` | 12 | 58.3% |
| `composite` | 11 | 45.5% |
| `cooked_raw` | 10 | 80.0% |
| `injection` | 5 | 100.0% |
| `mixed_language` | 5 | 100.0% |
| `multi_item` | 20 | 65.0% |
| `non_food` | 10 | 100.0% |
| `numeric_edge` | 21 | 100.0% |
| `overflow` | 2 | 100.0% |
| `simple` | 24 | 87.5% |
| `tr_unit` | 19 | 89.5% |
| `typo` | 10 | 80.0% |
| `vague_size` | 15 | 53.3% |
| `volume_unit` | 24 | 87.5% |
| `water` | 9 | 77.8% |
