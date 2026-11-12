# Real model evaluation — 2026-11-11

Actual installed phi3:3.8b and qwen2.5:3b, Ollama loopback, context 4096, sequential inference. Map/reduce ceiling 512 tokens, final 1,024, single corpus requests 512; intermediate cap 1,500 UTF-8 bytes and 256-token safety margin. No model downloads.

Both models ran original public synthetic short, technical, three-source, hostile-text and 30-section long fixtures. Raw results: [Phi-3](../alpha-hardening/evidence/phi3-hardening-evaluation.json), [Qwen](../alpha-hardening/evidence/qwen-hardening-evaluation.json). The evaluation harness passing means the evaluation ran, not that every answer passed quality acceptance.

Phi-3 long processing failed safely on oversized notes: 11 planned requests, 32.915 seconds, no final answer. Qwen completed 11 requests in 35.174 seconds, with 14 recognized passage references and no nonexistent recognized IDs. Its range was wrong (42–67 versus 42–71), frequency claim unsupported and causal interpretation absent from the source. Reliable long synthesis is not solved.

Instructions now precede untrusted JSON in the same user message. Increased note/final budgets address premature truncation. Provenance now follows source order even with uneven reduction trees. Oversized, empty and truncated notes still stop execution visibly.

[Real Helium workflows](../alpha-hardening/evidence/helium-workflows.json) separately record seven completed generations: Phi webpage summary/follow-up, Qwen model switch, DOCX summary/Q&A, PDF summary and multiple-tab comparison. These short successes do not validate every preset or long document format. Further gates: repeated progressive-size runs, long PDF/DOCX, section-level fact checks and model-specific supported limits. No model is silently substituted on failure.
