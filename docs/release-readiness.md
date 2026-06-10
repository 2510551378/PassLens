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
cd /path/to/PassLens
npm run release:check
npm run release:smoke
npm run package
```

Publishing itself is intentionally guarded:

- VS Code Marketplace: `node scripts/release-publish.js marketplace` for a dry run,
  `node scripts/release-publish.js marketplace --execute` to actually publish.
- Open VSX: `node scripts/release-publish.js open-vsx` for a dry run,
  `node scripts/release-publish.js open-vsx --execute` to actually publish.

The publish commands are also available as npm scripts:

```powershell
npm run release:publish:marketplace
npm run release:publish:open-vsx
```

Dry-run mode prints the exact CLI invocation and verifies that the VSIX
(`pass-lens-<version>.vsix`) exists before attempting publish.

Required credentials:

- `VSCE_PAT` for Marketplace publishing.
- `OVSX_PAT` for Open VSX publishing.

Keep Marketplace/Open VSX publication and the README demo GIF as explicit
release blockers until they are completed. This avoids presenting a polished
codebase without a clear external entry point.

Use strict mode for a release gate:

```powershell
npm run release:check:strict
```

`release:check:strict` fails the process if any roadmap release blocker is still
uncompleted.
