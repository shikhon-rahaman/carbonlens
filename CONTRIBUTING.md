# Contributing to CarbonLens

Thank you for contributing. CarbonLens is a testnet demonstration for transparent carbon-market evidence, not a production registry.

## Before opening a pull request

- Keep changes small, focused, and documented.
- Do not commit `.env` files, keys, tokens, evidence containing sensitive information, or generated build artifacts.
- Add or update tests when behavior changes.
- Run the relevant checks described in the pull-request template.
- Follow the API contract in `docs/SPEC.md` and preserve its generic error responses.

## Security expectations

Validate and bound inputs, use parameterized database queries, do not fetch user-provided URLs, and treat all user and LLM text as untrusted. Report vulnerabilities privately according to `SECURITY.md`.

## Commit and review

Use clear imperative commit messages. Pull requests need at least one review when collaborators are available, all required checks must pass, and force-pushes to the default branch are not permitted.
