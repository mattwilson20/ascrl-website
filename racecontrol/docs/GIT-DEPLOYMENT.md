# Git deployment

Vercel project `ascrl/ascrl-race-control` is connected to `mattwilson20/ascrl-website`.

- Production branch: `codex/ascrl-race-control`
- Root directory: `racecontrol`
- Framework: Next.js; Node 24.x
- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build`
- Production domain: https://racecontrol.ascrl.online
- Preview deployments: disabled; production environment values are not shared with previews.

The project-level Ignored Build Step permits only the intended branch:

```sh
if [ "$VERCEL_GIT_COMMIT_REF" = "codex/ascrl-race-control" ]; then exit 1; else exit 0; fi
```

Vercel's exit convention is 0 to skip and 1 to build. Build skipping was enabled before connecting Git, then the production branch and folder were verified before allowing builds. A push to the configured branch triggers production deployment. The existing website on `main` and GitHub Pages remain separate.

Use Git pushes for normal releases. The previous CLI upload from inside `racecontrol` is no longer compatible with the project root setting: any manual source deployment must provide the repository layout with `racecontrol` beneath its root. Never change the production branch to `main` to work around a deployment error.

Database migrations are reviewed and applied separately. Git deployment does not run `supabase db push` or change the hosted database.

