# Release Readiness

This checklist keeps the public release path executable before Pass Lens is
published to the VS Code Marketplace or Open VSX.

Run the automated check for public onboarding checks:

```powershell
npm run release:check
```

The check validates:

- Marketplace-facing `package.json` metadata.
- README quick-start links and local VSIX install path.
- Release milestone coverage for VS Code Marketplace, Open VSX, and demo GIF
  work.
- Public docs required by new users and collector authors.
- Bundled sample traces with credible `provenance.kind` coverage.

Before publishing a preview:

```powershell
npm test
npm run validate:trace:all
npm run release:check
npm run package
```

Publishing itself still requires maintainer credentials:

- VS Code Marketplace: `vsce publish` or upload the packaged VSIX.
- Open VSX: `ovsx publish` or upload the packaged VSIX.

Keep Marketplace/Open VSX publication and the README demo GIF as explicit
release blockers until they are completed. This avoids presenting a polished
codebase without a clear external entry point.

Use strict mode for a release gate:

```powershell
npm run release:check:strict
```

`release:check:strict` fails the process if any roadmap release blocker is still
uncompleted.
