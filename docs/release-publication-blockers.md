# Pass Lens Publication Blockers Checklist

This document tracks the two external publishing blockers and provides concrete steps to clear them.

## Blocker: Publish VS Code Marketplace preview

- [ ] Install and configure a valid `VSCE_PAT` token with publish scope.
- [ ] Confirm `npm run release:check` passes (entrypoint checks are still green).
- [ ] Generate a clean dry-run command:

```powershell
npm run release:publish:marketplace:json
```

- [ ] Confirm command output shows:

  - resolved `vsce` publish command,
  - `requiredEnv: VSCE_PAT`,
  - `canExecute: true`.

- [ ] Confirm local publish readiness across both storefront targets:

```powershell
npm run release:publish:ready
```

- [ ] Keep `pass-lens-0.1.0.vsix` package available and correct.
- [ ] Execute preview publish when ready:

```powershell
npm run release:publish:marketplace:execute
```

- [ ] Capture marketplace proof (URL or listing visibility confirmation).

## Blocker: Publish Open VSX preview

- [ ] Install and configure a valid `OVSX_PAT` token with publish scope.
- [ ] Confirm `npm run release:check` passes (entrypoint checks are still green).
- [ ] Generate a clean dry-run command:

```powershell
npm run release:publish:open-vsx:json
```

- [ ] Confirm command output shows:

  - resolved `ovsx` publish command,
  - `requiredEnv: OVSX_PAT`,
  - `canExecute: true`.

- [ ] Confirm local publish readiness across both storefront targets:

```powershell
npm run release:publish:ready
```

- [ ] Keep `pass-lens-0.1.0.vsix` package available and correct.
- [ ] Execute preview publish when ready:

```powershell
npm run release:publish:open-vsx:execute
```

- [ ] Capture Open VSX listing proof.

## Shared preconditions

- Marketplace/Open VSX publish flows are intentionally blocked when required tokens are missing.
- Use strict mode before release execution:

```powershell
npm run release:preflight:strict
```

- If one blocker is blocked by environment, keep it unchecked and continue iterating on
  other release-readiness work.

Once both blocker checklists are complete, mark roadmap release items as done:

- [x] Publish VS Code Marketplace preview.
- [x] Publish Open VSX preview.

Update `docs/expert-roadmap-todo.md` when completed.
