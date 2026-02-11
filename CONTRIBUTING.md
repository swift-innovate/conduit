# Contributing to Conduit

Thanks for your interest in contributing! Conduit is in early active development and we welcome contributions.

## Getting Started

1. Fork the repo and clone locally
2. Install dependencies: `npm install && cd ui && npm install`
3. Start the dev server: `npm run dev`
4. Make your changes on a feature branch
5. Submit a PR against `main`

## Development

```bash
# Backend (auto-reloads on changes)
npm run dev

# UI (Vite dev server with HMR)
cd ui && npm run dev

# Type checking
npm run build

# Tests
npm test
```

## Guidelines

- **Keep it simple.** Conduit is intentionally lightweight — five dependencies on the backend. Think twice before adding more.
- **TypeScript throughout.** No `any` unless absolutely necessary.
- **Test your changes.** If you're adding an endpoint, verify it works with curl.
- **Document API changes.** Update `API.md` if you add or modify endpoints.

## Reporting Issues

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
