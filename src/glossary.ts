export const METRIC_DEFINITIONS = `
CLIMATE RISK METRICS GLOSSARY

The following metrics are used to quantify physical climate risk damage to assets.

1. Downside Likelihood (dcr_score)
   - Product Label: "Downside Likelihood"
   - Definition: A standardized score representing the likelihood of significant asset damage relative to replacement cost.
   - Usage: Best for comparing relative risk levels across different asset types or portfolios.

2. Expected Impact (expected_impact)
   - Product Label: "Expected Impact Asset Damage"
   - Definition: The probability-weighted average damage ratio calculated over the entire distribution of potential climate outcomes.
   - Statistical Equivalent: Mean Damage.

3. Tail Risk (cvar_95)
   - Product Label: "Tail Risk Asset Damage"
   - Definition: The average damage ratio in the worst 5% of potential climate outcomes (95th percentile and above).
   - Usage: Critical for stress testing and understanding "worst-case" scenarios.

4. Value at Risk (VaR)
   - var_50: Median risk threshold.
   - var_95: The damage threshold that will not be exceeded with 95% confidence (1-in-20 year intensity).
   - var_99: The damage threshold that will not be exceeded with 99% confidence (1-in-100 year intensity).

5. Conditional Value at Risk (CVaR / Expected Shortfall)
   - cvar_50: The average damage in the worst 50% of cases.
   - cvar_99: The average damage in the worst 1% of cases (extreme tail risk).
`;
