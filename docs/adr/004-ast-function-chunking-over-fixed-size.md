# ADR 004: AST-Based Symbol Chunking Over Fixed-Size Line/Token Chunking

## Status
Accepted

## Context
Standard RAG architectures often split text into fixed-size chunks (e.g., 500 characters or 100 lines) with a constant sliding window overlap. In source code, splitting files arbitrarily across line boundaries cuts functions, classes, and loops in half. This corrupts embedding representations and starves LLMs of complete function context.

## Decision
We chose **AST-based function and class symbol chunking** with fallback sliding windows:
1. Parse code into full functions, methods, and classes using syntax trees.
2. One chunk per symbol. If a symbol exceeds 60 lines, split into overlapping windows of 60 lines with 15 line overlap.
3. Prefix each chunk with metadata: `File: <path>\nSymbol: <name>\n\n<content>`.

## Rationale
1. A function is the fundamental unit of program execution and semantic meaning.
2. Embedding a complete function produces coherent vector similarity matches for callers and callees.
3. Adding the `File:` and `Symbol:` headers ensures the vector embedding captures semantic location, preventing retrieval ambiguity between similarly named functions in different directories.

