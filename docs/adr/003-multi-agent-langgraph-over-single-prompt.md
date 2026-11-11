# ADR 003: Multi-Agent Graph with Verifier Pass Over Single Monolithic Prompt

## Status
Accepted

## Context
Initial AI code review experiments used a single monolithic prompt asking an LLM to "Review this diff for all bugs, security issues, and style problems."
This monolithic pattern produced three major failures:
1. **High False Positive Rate**: Over 40% of flagged issues were non-issues or style pedantry that annoyed developers.
2. **Context Dilution**: The LLM tried to balance logic correctness, security exploits, and style simultaneously, missing deeper logic vulnerabilities.
3. **Hallucinations**: The LLM made assertions about helper functions or caller signatures that did not match the actual codebase.

## Decision
We chose a **Multi-Agent Architecture** composed of:
1. **Planner**: Classifies changed files and assigns specialized agents.
2. **Parallel Specialist Agents**:
   - `Bug Agent`: Focuses solely on logic errors, off-by-one, null handling, missing await.
   - `Security Agent`: Focuses on injection, secrets, authorization checks, unsafe functions.
   - `Quality Agent`: Readability and maintainability.
   - `Test Agent`: Detects missing unit tests and proposes concrete test code.
3. **Read-Only Tool Execution**: Agents query definitions, callers, and tests via read-only tools.
4. **Skeptic Verifier Pass**: An adversarial verification step that re-reads high-severity findings against the raw code and drops ungrounded claims.

## Rationale
- Specialization gives each agent a focused context budget and explicit system instructions.
- The skeptic verifier directly eliminates hallucinated findings, cutting false positive rates from 1.8 down to 0.10 findings per clean PR on benchmark evals.
- Deterministic code—not the LLM—performs line boundary checks, fingerprinting, and comment posting.

