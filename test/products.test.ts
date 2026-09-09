import { describe, expect, it, vi } from "vitest";

import { run } from "../src/run";
import { createProductsGroup } from "../src/shopify/products";

const invoke = async (
  argv: string[],
  handlers: { rejectDelete?: boolean; deletePolicyDetails?: string } = {},
) => {
  const gql = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
    if (query.includes("query ProductForOperation")) {
      const handle = variables?.handle;
      return { data: { productByIdentifier: handle === "missing" ? null : { id: `gid:${handle}`, handle, title: "Product", status: "ACTIVE" } } };
    }
    if (query.includes("mutation DeleteProduct"))
      return { data: { productDelete: { deletedProductId: variables?.input && "gid:one", userErrors: [] } } };
    if (query.includes("mutation ArchiveProduct"))
      return { data: { productUpdate: { product: {}, userErrors: [] } } };
    throw new Error(`unexpected query ${query}`);
  });
  const out: string[] = [];
  const err: string[] = [];
  const group = createProductsGroup({
    openShop: () => ({ shop: "example.myshopify.com", gql }),
    assertDeleteAllowed: () => {
      if (handlers.rejectDelete) throw new Error("deletion is not allowed here");
    },
    deletePolicyDetails: handlers.deletePolicyDetails,
  });
  const result = await run("shop", [group], argv, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { ...result, gql, out: out.join("\n"), err: err.join("\n") };
};

describe("products delete", () => {
  it("renders a host's delete policy in command help", async () => {
    const result = await invoke(
      ["products", "delete", "--help"],
      { deletePolicyDetails: "This host refuses product deletion on its live store." },
    );
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain("This host refuses product deletion on its live store.");
  });

  it("plans an explicit handle without deleting by default", async () => {
    const result = await invoke(["products", "delete", "one", "--shop=example.myshopify.com"]);
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain("DRY RUN — permanently delete 1 product(s)");
    expect(result.gql.mock.calls.some(([query]) => query.includes("mutation DeleteProduct"))).toBe(false);
  });

  it("requires the shop confirmation before an applied delete", async () => {
    const result = await invoke(["products", "delete", "one", "--shop=example.myshopify.com", "--apply"]);
    expect(result.exitCode).toBe(1);
    expect(result.err).toContain("--confirm=example.myshopify.com");
  });

  it("deletes only after the target confirmation and host policy pass", async () => {
    const result = await invoke([
      "products", "delete", "one", "--shop=example.myshopify.com", "--apply", "--confirm=example.myshopify.com",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.out).toContain("deleted one");
    expect(result.gql.mock.calls.some(([query]) => query.includes("mutation DeleteProduct"))).toBe(true);
  });

  it("refuses a batch with an unresolved handle without a partial deletion", async () => {
    const result = await invoke([
      "products", "delete", "one", "missing", "--shop=example.myshopify.com", "--apply", "--confirm=example.myshopify.com",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.err).toContain("NOT FOUND missing");
    expect(result.gql.mock.calls.some(([query]) => query.includes("mutation DeleteProduct"))).toBe(false);
  });
});
