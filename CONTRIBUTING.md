# Contributing

Thanks for helping. There are two ways to contribute.

## Suggest an incident

Use **Send a tip** on [cyberxmas.com/submit](https://cyberxmas.com/submit) rather than opening an
issue. Tips need a published CVE or a direct link to a trusted source, and editors review every
one before anything is published.

## Contribute code

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Follow the setup in the [README](README.md) and the layout and rules in
   [AGENTS.md](AGENTS.md) (they apply to humans too) and
   [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).
3. Before opening a pull request, make sure these pass:

   ```sh
   pnpm check
   pnpm test
   pnpm build
   ```

4. Keep pull requests focused. Describe what changed and why, and include a screenshot for UI
   changes.

Some rules reviewers will hold you to:

- SQL lives only in `src/lib/server/db`, with bound parameters.
- No new outbound requests to user-supplied URLs.
- Schema changes are new migrations, never edits to existing ones.
- New settings are documented in `docs/INFRASTRUCTURE.md`.
- No secrets, real credentials or personal data in code, tests or fixtures.
- Content stays defensive: no exploit code or reproduction steps.

By contributing you agree that your contribution is licensed under the [GPL-3.0](LICENSE).
