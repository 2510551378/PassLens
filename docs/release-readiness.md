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
- `CONTRIBUTING.md` contribution rules and sample/collector contribution checks.
- `docs/release-publication-blockers.md` publication blocker checklist.
- Bundled sample traces with credible `provenance.kind` coverage.
- `docs/sample-provenance.md` and `sample-traces/` are kept in sync (every sample
  JSON has a matching provenance record).

Before you publish, you can also generate an executable publish plan:

```powershell
npm run release:preview:plan -- --output .github/release-preview-plan.json
```

This command writes a structured summary for `marketplace` and `open-vsx` plans,
including resolved command path, target VSIX artifact, required env token check, and
any blockers such as missing publish binaries.

Before a dry-run publish attempt:

```powershell
cd /path/to/PassLens
npm run release:preflight
```

For an actual publish execution (strict gate), run:

```powershell
cd /path/to/PassLens
npm run release:preflight:strict
```

For the full preflight sequence in one command:

```powershell
npm run release:preflight
```

This runs the release smoke checks, packages VSIX, and writes a
`artifacts/release-preview-plan.json` report.

For a step-by-step dry-run/execute sequence and post-publish verification checklist,
follow [`release-publish-playbook.md`](release-publish-playbook.md).

For the explicit external-release blocker tracking checklist, see
[`release-publication-blockers.md`](release-publication-blockers.md).

CI can also generate and persist the publish plan:

```text
Run `release-preview-plan` workflow to generate
`pass-lens-release-preview-plan` artifact containing the latest publish
readiness summary.
```

Publishing itself is intentionally guarded:

- VS Code Marketplace: `npm run release:publish:marketplace:json` for dry run,
  `npm run release:publish:marketplace:execute` to publish.
- Open VSX: `npm run release:publish:open-vsx:json` for a dry run,
  `npm run release:publish:open-vsx:execute` to publish.

The publish commands are also available as npm scripts:

```powershell
npm run release:publish:marketplace:json
npm run release:publish:marketplace:execute
npm run release:publish:open-vsx:json
npm run release:publish:open-vsx:execute
```

Dry-run mode prints the exact CLI invocation and verifies that the VSIX
(`pass-lens-<version>.vsix`) exists before attempting publish.

Required credentials:

- `VSCE_PAT` for Marketplace publishing.
- `OVSX_PAT` for Open VSX publishing.

Keep Marketplace/Open VSX publication and the README demo GIF as explicit
release blockers until they are completed. This avoids presenting a polished
codebase without a clear external entry point.

Use strict mode for a release gate (CI execute mode also enforces this):

```powershell
npm run release:check:strict
```

`release:check:strict` fails the process if any roadmap release blocker is still
uncompleted.
