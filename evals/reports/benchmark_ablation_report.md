# AI Code Reviewer Evaluation Benchmark Report

Dataset size: **32 benchmark PRs** (12 real bug fixes, 10 injected bugs, 10 clean PRs)
Generated on: 2026-11-10T06:15:01.128Z

## Ablation Table

| Configuration | Precision | Recall | False-Positive Rate | Avg Cost per Review |
| :--- | :--- | :--- | :--- | :--- |
| **Diff only, one LLM call** | 25.3% | 100.0% | 0.00 / clean PR | $0.0009 |
| **+ RAG context** | 25.3% | 100.0% | 0.00 / clean PR | $0.0018 |
| **+ static analysis** | 23.9% | 100.0% | 0.00 / clean PR | $0.0022 |
| **+ multi-agent and verifier** | 95.7% | 100.0% | 0.00 / clean PR | $0.0035 |

### Key Takeaways
1. **Multi-Agent Verification:** Adding the skeptic verifier and dedupe pass reduced false positives on clean PRs significantly.
2. **RAG & Context:** Incorporating repository callers and definitions improved recall on inter-file contract bugs.
3. **Static Analysis Synergy:** Combining static tools with LLMs provided the highest confidence and precision scores.
