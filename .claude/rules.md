# Solama — Development Rules

## Code Quality
- All implementations must be production-grade, advanced, and sophisticated
- Zero dead code — every line must serve a purpose
- Zero errors — code must compile and run without warnings or errors
- No file shall exceed 1000 lines of code — split into modules if needed

## Architecture
- Ultra-organized, lightweight, and solid structure
- Clear separation: programs/ (on-chain), app/ (frontend), server/ (backend)
- Each module has a single responsibility
- No circular dependencies

## Blockchain First
- No simulations, no mock data — everything connects to Solana devnet
- All transactions are real on-chain transactions
- Price feeds come from live Binance WebSocket — no fake data
- Wallet connection via Phantom — real signatures only

## Security (10/10)
- NEVER publish secrets, private keys, tokens, or API keys to GitHub or npm
- All sensitive values in .env (gitignored)
- Validate all inputs on-chain and client-side
- PDA seeds must be deterministic and collision-resistant
- All SOL transfers go through the vault PDA — no direct transfers
- Authority checks on every privileged instruction
- Overflow protection on all math operations

## Pre-Publish Checklist
- Verify the full flow end-to-end before every commit
- Run `anchor build` — zero errors, zero warnings
- Run `npm run build` — zero errors
- Grep for secrets: no .env values, no private keys, no tokens in source
- Review every file in the diff before pushing
- .gitignore must exclude: .env, node_modules, target, .anchor, *.key

## Git Hygiene
- Atomic commits — one purpose per commit
- Clear commit messages describing the "why"
- Never force push to main
