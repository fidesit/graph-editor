# Contributing to @anthropic-ai/graph-editor

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Code of Conduct

Please be respectful and constructive in all interactions. We're building something together.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Angular CLI 19+

### Setup

```bash
# Clone the repository
git clone https://github.com/fidesit/graph-editor.git
cd graph-editor

# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test

# Run the demo app
npm run start:demo
```

## Development Workflow

### Branch Naming

- `feature/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation updates
- `refactor/description` — Code refactoring

### Commit Messages

Use conventional commits:

```
feat: add port-based connections
fix: correct edge rendering on zoom
docs: update API documentation
refactor: simplify drag handler
```

### Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Add/update tests as needed
5. Run `npm test` and ensure all tests pass
6. Run `npm run lint` and fix any issues
7. Submit a pull request

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No type errors (`npm run build`)
- [ ] Lint passes (`npm run lint`)
- [ ] Commit messages follow conventional commits

## Architecture

### Project Structure

```
graph-editor/
├── projects/
│   └── graph-editor/          # Library source
│       ├── src/
│       │   ├── lib/           # Core components and services
│       │   └── public-api.ts  # Public exports
│       └── package.json       # Library package config
├── src/                       # Demo application
│   └── app/
└── package.json               # Workspace config
```

### Key Principles

1. **Domain-agnostic**: No workflow/agent/step concepts in the library
2. **Configuration-driven**: Everything customizable via config
3. **Type-safe**: Full TypeScript with strict mode
4. **Standalone components**: No NgModules

### Adding Features

When adding new features:

1. Update the configuration types if needed
2. Implement the feature in the library
3. Add tests
4. Update the demo app to showcase it
5. Update documentation

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Documentation

- Update README.md for user-facing changes
- Update inline TSDoc comments for API changes
- Add examples to the demo app

## Releasing

Releases are automated via GitHub Actions when a new tag is pushed.

Only maintainers can create releases.

## Questions?

Open an issue with the "question" label.
