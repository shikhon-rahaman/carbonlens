## Summary

Describe the change and its user impact.

## Verification

- [ ] Relevant tests pass locally.
- [ ] Linting and type checks pass.
- [ ] Documentation and environment examples are updated when needed.

## Security checklist

- [ ] No secrets, private keys, or personal data were committed.
- [ ] Inputs are validated, bounded, and errors remain generic.
- [ ] New external calls have timeouts, retry limits, and safe fallback behavior.
- [ ] Database access uses parameterized queries; no user URL is fetched server-side.
- [ ] Client-rendered text is treated as untrusted; no unsafe HTML or code execution was added.
- [ ] Smart-contract changes are testnet-only and include tests.
