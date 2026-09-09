import { readFileSync } from "node:fs";

import type { Group } from "../types";
import { assertNoUserErrors, SHOP_OPTION, type OpenShop, type ShopifyStore } from "../shopify";

const PRODUCT_BY_HANDLE = `#graphql
  query ProductForOperation($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) { id handle title status }
  }`;

const PRODUCT_ARCHIVE = `#graphql
  mutation ArchiveProduct($input: ProductInput!) {
    productUpdate(product: $input) { product { id handle status } userErrors { field message } }
  }`;

const PRODUCT_DELETE = `#graphql
  mutation DeleteProduct($input: ProductDeleteInput!) {
    productDelete(input: $input) { deletedProductId userErrors { field message } }
  }`;

type Product = { id: string; handle: string; title: string; status: string };

const inputHandles = (positionals: string[], file?: string): string[] => {
  const fromFile = file
    ? readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
    : [];
  return [...new Set([...positionals, ...fromFile])];
};

async function resolveProducts(
  client: ShopifyStore,
  handles: string[],
): Promise<{ found: Product[]; missing: string[] }> {
  const found: Product[] = [];
  const missing: string[] = [];
  for (const handle of handles) {
    const result = await client.gql(PRODUCT_BY_HANDLE, { handle });
    const product = result?.data?.productByIdentifier as Product | null;
    if (product) found.push(product);
    else missing.push(handle);
  }
  return { found, missing };
}

const handleInput = {
  positionals: [{ name: "handle", summary: "Product handle(s).", variadic: true }],
  options: {
    ...SHOP_OPTION,
    "handles-file": {
      kind: "value" as const,
      placeholder: "<path>",
      summary: "Newline-delimited product handles; blank lines and # comments are ignored.",
    },
  },
};

/**
 * Generic product lifecycle commands. The host supplies authentication and can
 * reject destructive writes for shops its own policy protects.
 */
export function createProductsGroup(options: {
  openShop: OpenShop;
  /** Called before an applied product deletion. Throw to refuse the target. */
  assertDeleteAllowed?: (shop: string) => void;
  /** Host-specific target policy rendered in `products delete --help`. */
  deletePolicyDetails?: string;
}): Group<ShopifyStore> {
  return {
    name: "products",
    summary: "Generic Shopify product lifecycle operations.",
    openClient: ({ option }) => options.openShop(option("shop")!),
    commands: [
      {
        name: "archive",
        summary: "Archive explicit products, keeping their catalog records recoverable.",
        details: "Supply handles as arguments, a newline-delimited file, or both. This is a write and defaults to a dry run.",
        writes: true,
        ...handleInput,
        run: async ({ client, positionals, option, apply, plan, did, say, fail, warn }) => {
          const handles = inputHandles(positionals, option("handles-file"));
          if (!handles.length) throw new Error("pass one or more handles or --handles-file=<path>");
          const { found, missing } = await resolveProducts(client, handles);
          for (const handle of missing) warn(`NOT FOUND ${handle}`);
          if (missing.length) {
            fail("No products were changed: every requested handle must resolve first.");
            return;
          }
          for (const product of found) say(`${product.handle} — ${product.title} (${product.status})`);
          plan(`archive ${found.length} product(s) on ${client.shop}.`);
          if (!apply) return;
          for (const product of found) {
            const result = await client.gql(PRODUCT_ARCHIVE, { input: { id: product.id, status: "ARCHIVED" } });
            assertNoUserErrors("productUpdate", result?.data?.productUpdate?.userErrors);
            did(`archived ${product.handle}`);
          }
        },
      },
      {
        name: "delete",
        summary: "Permanently delete explicit products.",
        details:
          "Deletion is irreversible. Review the dry-run output first; the applied invocation also requires --confirm=<shop>." +
          (options.deletePolicyDetails ? `\n\n${options.deletePolicyDetails}` : ""),
        writes: true,
        confirm: ({ required }) => required("shop"),
        ...handleInput,
        run: async ({ client, required, positionals, option, apply, plan, did, say, fail, warn }) => {
          const shop = required("shop");
          const handles = inputHandles(positionals, option("handles-file"));
          if (!handles.length) throw new Error("pass one or more handles or --handles-file=<path>");
          const { found, missing } = await resolveProducts(client, handles);
          for (const handle of missing) warn(`NOT FOUND ${handle}`);
          if (missing.length) {
            fail("No products were changed: every requested handle must resolve first.");
            return;
          }
          for (const product of found) say(`${product.handle} — ${product.title} (${product.status})`);
          plan(`permanently delete ${found.length} product(s) on ${client.shop}.`);
          if (!apply) return;
          options.assertDeleteAllowed?.(shop);
          for (const product of found) {
            const result = await client.gql(PRODUCT_DELETE, { input: { id: product.id } });
            assertNoUserErrors("productDelete", result?.data?.productDelete?.userErrors);
            did(`deleted ${product.handle}`);
          }
        },
      },
    ],
  };
}
