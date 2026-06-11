# Pass Lens Release Publish Playbook

This playbook keeps Marketplace / Open VSX publication deterministic and reproducible.

Use it when you want to move a VSIX from local smoke checks to public preview
distribution.

## 1) Preflight

Before any publish attempt:

```powershell
npm run release:preflight
```

Required by `release:preflight`:

- `npm run validate:trace:all`
- `npm run release:smoke`
- `npm run package`
- `npm run release:preview:plan -- --output artifacts/release-preview-plan.json`

If any step fails, do not publish.

Use `npm run release:preview:plan` (JSON) to capture a snapshot:

```powershell
npm run release:preview:plan -- --json
npm run release:preview:plan -- --output artifacts/release-preview-plan.json
```

Inspect the plan fields:

- `target`: `marketplace` or `open-vsx`
- `command`: resolved publish command path
- `requiredEnv`: expected token variable
- `canExecute`: whether token is present and command resolved
- `vsix`: versioned package path to upload

## 2) Required credentials

- Marketplace: `VSCE_PAT`
- Open VSX: `OVSX_PAT`

Scope tokens narrowly:

- minimum token scope for automated publish workflows;
- no repo/public keys should be committed.

## 3) Dry-run checks

Run for both targets before any real publish:

```powershell
npm run release:publish:marketplace -- --dry-run
npm run release:publish:open-vsx -- --dry-run
```

Dry-run should print:

- final command line,
- required token,
- token availability (`yes`/`no`).

For a machine-readable audit record:

```powershell
npm run release:preview:plan -- --json --output artifacts/release-preview-plan.json
npm run release:publish:marketplace -- --dry-run --json --output artifacts/marketplace-publish-plan.json
npm run release:publish:open-vsx -- --dry-run --json --output artifacts/open-vsx-publish-plan.json
```

These files are useful to keep with release notes and CI artifacts.

If token is missing, publish will be blocked by design.

In GitHub Actions, use the same plan/verify pattern with:

- `workflow_dispatch` on `Release Publish`
- `target: both` (default) or a single target
- `execute: false` for plan-only output

The workflow uploads `pass-lens-release-preview-plan-<target>.json` artifacts for each
selected target. This mirrors local `npm run release:preview:plan` output and is useful
for keeping a publication audit record with the workflow run.

## 4) Execute publish

Execute only after dry-run is clean and you are ready to publish the current
version:

```powershell
npm run release:publish:marketplace -- --execute
npm run release:publish:open-vsx -- --execute
```

Run in this order:

1. Marketplace
2. Open VSX

### Success criteria

- command exit code is zero,
- target platform shows the new preview in list/search shortly after publish.

## 5) Post-publish verification

After publishing, record proof in release notes:

- marketplace page URL / install command,
- Open VSX listing URL,
- README install path updated if needed,
- publish artifact metadata saved as a file under `artifacts/` if CI archives it.

Then complete:

- `docs/expert-roadmap-todo.md` release blockers:
  - `Publish VS Code Marketplace preview`.
  - `Publish Open VSX preview`.
- `docs/release-milestones.md` open items.

## 6) Failure handling

If publish fails:

1. run `npm run release:check` and fix entry-point warnings first;
2. verify `npm run package` still succeeds;
3. rerun `npm run release:preview:plan -- --json`;
4. rerun the dry-run command, then retry `--execute`.

Treat publish blockers as release tasks until both `--execute` flows have successfully
run.
