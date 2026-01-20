export const METRIC_DEFINITIONS = `
CLIMATE RISK METRICS GLOSSARY

The following metrics are used to quantify physical climate risk damage to assets. All damage metrics are calculated by consolidating relevant risk factors into multifactor statistics.

1. Downside Likelihood (dcr_score)
   - Product Label: "Downside Likelihood"
   - Definition: The probability that a physical asset will experience more negative impact during a future horizon than during the historical baseline (2010 horizon).
   - Usage: Best for comparing relative risk levels across different asset types or portfolios.

2. Expected Impact (expected_impact)
   - Product Label: "Expected Impact"
   - Definition: The expected impact facing a physical asset due to repair costs, measured as a percentage of tangible capital asset value.
   - Statistical Equivalent: Mean Damage.

3. Asset Damage Tail Risk / CVaR (cvar_*)
   - Definition: The Conditional Value at Risk (CVaR) represents the average damage in the worst-case scenarios, measured as a percentage of tangible capital asset value.
   - cvar_50: "Asset Damage Tail Risk (50%)" - Calculated given a 50% likelihood threshold.
   - cvar_95: "Asset Damage Tail Risk" - Calculated given a 95% likelihood threshold (Critical for stress testing).
   - cvar_99: "Asset Damage Tail Risk (99%)" - Calculated given a 99% likelihood threshold (Extreme tail risk).

4. Value at Risk (var_*)
   - Definition: The damage threshold that will not be exceeded with a specific confidence level, measured as a percentage of tangible capital asset value.
   - var_50: Value at Risk given a 50% likelihood threshold.
   - var_95: Value at Risk given a 95% likelihood threshold.
   - var_99: Value at Risk given a 99% likelihood threshold.
`;
