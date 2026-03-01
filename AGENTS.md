# Graph Editor — Project Knowledge Base

## Overview

`@utisha/graph-editor` — Configuration-driven visual graph editor for Angular 19+.

## Structure

```
graph-editor/
├── projects/graph-editor/     # Library source
│   ├── src/lib/               # Component, services, models
│   └── package.json           # Library version (publish this)
├── src/app/                   # Demo application
├── dist/                      # Build output
├── CHANGELOG.md               # Release notes
└── README.md                  # Documentation
```

## Commands

```bash
npm test              # Run tests (ChromeHeadless)
npm run build         # Build library
npm run build:demo    # Build demo app
npm run start         # Run demo locally (port 4200)
```

## Release Checklist

When releasing a new version:

1. **Version** — Update `projects/graph-editor/package.json`
2. **CHANGELOG.md** — Add release notes following Keep a Changelog format:
   - `### Added` — New features
   - `### Changed` — Changes to existing functionality
   - `### Fixed` — Bug fixes
3. **README.md** — Update Features and Roadmap sections if applicable
4. **Demo help** — Update help popup in `src/app/app.component.ts` with new keyboard shortcuts/features
5. **Verify** — Run `npm test && npm run build && npm run build:demo`
6. **Commit** — Commit all changes with message like `release: 1.0.1`
7. **Tag** — Create tag in format like `1.0.1`
8. **Push** — Push commits and tags; CI will publish to npm

## Conventions

- Angular 19, standalone components, signals (no RxJS)
- SVG-based rendering
- Dagre for auto-layout
- Karma + Jasmine for tests (ChromeHeadless)
- Keep a Changelog format for CHANGELOG.md
