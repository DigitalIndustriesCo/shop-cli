/**
 * Framework-neutral operational CLI primitives.
 *
 * A host application owns its command groups, clients, target policy, and
 * process entry point; this package owns parsing, help, dispatch, and the
 * dry-run/apply/confirmation safety contract.
 */
export { GLOBAL_OPTIONS, UsageError, parseArgv, validate } from "./args";
export type { ParsedArgs } from "./args";
export { renderCommand, renderGroup, renderIndex } from "./help";
export { run } from "./run";
export {
  assertNoUserErrors,
  paginate,
  SHOP_OPTION,
  tokenStore,
} from "./shopify";
export type { Gql, OpenShop, ShopifyStore } from "./shopify";
export { createProductsGroup } from "./shopify/products";
export type {
  AnyGroup,
  Command,
  CommandContext,
  Group,
  OptionSpec,
  PositionalSpec,
} from "./types";
