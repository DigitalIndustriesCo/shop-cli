/**
 * Shopify Admin GraphQL seams shared by operational command groups.
 *
 * A host may use `tokenStore` directly, or supply an opener backed by an app's
 * offline sessions. Commands never need to know which credential reached the
 * shop.
 */
export type Gql = (query: string, variables?: Record<string, unknown>) => Promise<any>;

export type ShopifyStore = { shop: string; gql: Gql };
export type OpenShop = (shop: string) => Promise<ShopifyStore> | ShopifyStore;

export const SHOP_OPTION = {
  shop: {
    kind: "value" as const,
    required: true,
    placeholder: "<domain>",
    summary: "Shopify store domain, e.g. example.myshopify.com.",
  },
};

/** Throws on an Admin GraphQL mutation's userErrors payload. */
export function assertNoUserErrors(
  mutation: string,
  errors: Array<{ message?: string; field?: string[] | null }> | undefined,
): void {
  if (errors?.length)
    throw new Error(`${mutation}: ${errors.map((error) => error.message ?? "unknown error").join("; ")}`);
}

/** Walk a cursor-paginated Admin GraphQL connection. */
export async function paginate<T = any>(
  gql: Gql,
  query: string,
  pick: (data: any) => { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: T[] } | null | undefined,
  options: { variables?: Record<string, unknown>; max?: number } = {},
): Promise<T[]> {
  const nodes: T[] = [];
  const max = options.max ?? Infinity;
  let cursor: string | null = null;
  do {
    const result = await gql(query, { ...(options.variables ?? {}), cursor });
    const connection = pick(result?.data);
    if (!connection) return nodes;
    nodes.push(...connection.nodes);
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor && nodes.length < max);
  return nodes.slice(0, max);
}

/**
 * A portable token-backed store opener for scripts that do not have an app
 * session. App hosts should instead pass their own `OpenShop` adapter.
 */
export function tokenStore(options: {
  apiVersion: string;
  tokenEnv?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}): OpenShop {
  const tokenEnv = options.tokenEnv ?? "SHOPIFY_ADMIN_ACCESS_TOKEN";
  const env = options.env ?? process.env;
  const request = options.fetch ?? fetch;

  return async (shop) => {
    const token = env[tokenEnv];
    if (!token) throw new Error(`${tokenEnv} is not set — supply an Admin API access token for ${shop}.`);
    const endpoint = `https://${shop}/admin/api/${options.apiVersion}/graphql.json`;
    return {
      shop,
      gql: async (query, variables) => {
        const response = await request(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
          body: JSON.stringify({ query, variables }),
        });
        if (!response.ok)
          throw new Error(`Shopify Admin GraphQL ${shop}: HTTP ${response.status} ${response.statusText}`);
        return response.json();
      },
    };
  };
}
