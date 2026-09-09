# @digitalindustriesco/shop-cli

Framework-neutral, safety-first primitives for operational CLIs. It deliberately
contains no Shopify, database, environment, or project-specific knowledge.

A consuming project owns its commands, clients, target policy, and executable
entry point. This package owns declarative arguments, help, dispatch, dry-run
write gating, destructive-operation confirmation, and testable exit handling.

## Install

```sh
npm install @digitalindustriesco/shop-cli
```

GitHub Packages consumers need a project or user `.npmrc` containing:

```ini
@digitalindustriesco:registry=https://npm.pkg.github.com
```

## Use

```ts
import process from "node:process";
import { run, type Group } from "@digitalindustriesco/shop-cli";

type Client = { deleteWidget(id: string): Promise<void> };

const widgets: Group<Client> = {
  name: "widgets",
  summary: "Inspect and manage widgets.",
  openClient: async () => createProjectClient(),
  commands: [
    {
      name: "delete",
      summary: "Delete a widget.",
      writes: true,
      options: {
        id: { kind: "value", required: true, placeholder: "<id>", summary: "Widget to delete." },
      },
      confirm: ({ required }) => required("id"),
      async run({ client, apply, required, plan, did }) {
        const id = required("id");
        plan(`delete widget ${id}`);
        if (!apply) return;
        await client.deleteWidget(id);
        did(`deleted widget ${id}`);
      },
    },
  ],
};

const { exitCode } = await run("npm run shop --", [widgets], process.argv.slice(2));
process.exitCode = exitCode;
```

Writing commands run as dry runs by default. `--apply` permits a write;
`confirm` additionally requires `--confirm=<expected-target>` before an applied
run. Validation happens before `openClient`, so invalid calls never open a
network or database client.

## Boundaries

- Keep Shopify Admin API clients, authentication, target profiles, environment
  loading, and store safety policy in the consuming project or a dedicated
  Shopify adapter package.
- Keep domain commands (catalog, media, metafields, authoring) with the project
  that owns their semantics.
- Add genuinely shared Shopify transport only in a separately versioned package;
  this package remains dependency-free and reusable outside Shopify.

## Development

```sh
npm install
npm run check
npm run build
```

The release workflow publishes when a `v<package-version>` tag is pushed. It
validates that the tag matches `package.json`, then publishes to GitHub Packages:

```sh
npm version patch
# review and push the version commit
git push origin v$(node -p "require('./package.json').version")
```

An authorized maintainer may also run `npm publish` with GitHub Packages
credentials.
