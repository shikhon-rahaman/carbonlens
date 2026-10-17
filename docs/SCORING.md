# Project Scoring

`score_project(ndvi_series, claimed_hectares, source)` returns three component scores,
a weighted total, human-readable flags and corresponding machine-readable flag codes,
a confidence label, and a seasonal-awareness note. Component scores range from 0 to
100; the total is an integer from 0 to 100.

## Formula

- **Vegetation:** calculate the arithmetic mean of the observations after clamping each
  NDVI value to `[-1, 1]`, then map it to a 0-100 scale with
  `((mean NDVI + 1) / 2) * 100`.
- **Stability:** start at 100 and subtract `100 * largest consecutive-quarter NDVI drop`
  plus `100 * max(0, -linear trend slope) * observed quarter span`. The slope is NDVI
  change per quarter, and the span is inclusive from the first through the last
  observation. For dated data, only adjacent calendar quarters contribute to the
  largest-quarter-drop term; gaps do not count as a single-quarter drop. Clamp the result
  to `[0, 100]`.
- **Consistency:** count observations whose NDVI is strictly greater than `0.5`.
  Treat that fraction as a proxy for the healthy-area fraction, estimate healthy area as
  `claimed hectares * fraction`, and score `100 * (1 - abs(claimed - estimate) /
  claimed)`. This simplifies to 100 times the fraction of observations above the
  threshold.
- **Total:** `round(0.4 * vegetation + 0.35 * stability + 0.25 * consistency)`.
  Component values are rounded to two decimal places before this weighted calculation.

Flags are emitted for mean NDVI below `0.5`, a consecutive-quarter drop of at least
`0.15`, a trend slope of at most `-0.01` NDVI per quarter, fewer than 70% of
observations above `0.5`, fewer than eight observations, or cached data. Confidence is
`high` only for live data with at least eight observations; otherwise it is `low`.

## Assumptions and limits

The series represents quarterly area-level NDVI observations, ordered by their ISO
dates when dates are present. Without dates, input order is assumed to represent
consecutive quarters. A minimum of eight observations is used for high confidence to
require about two years of quarterly coverage. Invalid or empty series, non-finite
values, non-positive claimed areas, and source values other than `live` or `cached` are
rejected.

The `NDVI > 0.5` fraction is a temporal-observation proxy, not a pixel-level
measurement of healthy hectares. Since the function receives no spatial pixel-area
data, it cannot independently verify the claimed acreage; consistency therefore
compares the claim with this limited proxy. NDVI is not a measurement of carbon
sequestration, credit quality, ownership, additionality, permanence, or legal
eligibility.

Quarter-to-quarter changes can reflect seasonality, clouds, sensor conditions, or
biome-specific behavior. When dates provide matching quarters across years, compare
those same-quarter observations year over year before interpreting a decline or acting
on a flag. The seasonal note is a reminder, not a seasonal correction in the score.
Scores are deterministic indicators and are not a substitute for field verification
or human review.
