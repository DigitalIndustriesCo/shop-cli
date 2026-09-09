# @digitalindustriesco/shop-cli

Safety-first Shopify operations CLI building blocks. It owns declarative
arguments, help, dispatch, dry-run write gating, destructive-operation
confirmation, Shopify Admin GraphQL helpers, and reusable Shopify operations.

A consuming project supplies its authentication adapter and its own target
policy. That permits a plain Admin token in a standalone script, or an embedded
app's offline session, without baking either credential model into every command.
Marla-specific authoring, taxonomy, and configurator operations remain in their
own project.

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

## Shopify operations

`createProductsGroup` supplies portable, explicit-handle lifecycle commands:

```ts
import { createProductsGroup, run, tokenStore } from "@digitalindustriesco/shop-cli";

const groups = [
  createProductsGroup({
    openShop: tokenStore({ apiVersion: "2025-10" }),
    // A host may reject protected shops before an applied deletion.
    assertDeleteAllowed: (shop) => assertSafeTarget(shop),
  }),
];
await run("shop", groups, process.argv.slice(2));
```

- `shop products archive <handle...> --shop=<domain>` archives products.
- `shop products delete <handle...> --shop=<domain>` is dry-run by default and
  requires both `--apply` and `--confirm=<domain>` to delete.
- `--handles-file=<path>` accepts a newline-delimited, reviewable product list.

`tokenStore` is for projects using a direct Admin token. An embedded app should
pass its own `OpenShop` adapter, which keeps its session/database routing and
live-store policy in the host while still using the shared commands.

## Boundaries

- Keep client-specific domain commands (for example, configurator authoring,
  client taxonomy, and product-art conventions) with their owning project.
- Keep the host's session lookup, environment loading, and store policy at the
  adapter seam; shared operations never assume how a project authenticates.
- Add portable Shopify operations here when their behavior has no client
  vocabulary or data-model assumptions.

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
