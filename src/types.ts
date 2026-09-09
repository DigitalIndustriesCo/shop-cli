/**
 * The CLI's vocabulary. Nothing here knows about Shopify, this app, or this
 * repo — that is what lets `scripts/cli/` be copied into the next project and
 * wired to a different client. Repo-specific knowledge enters only through the
 * `openClient` a group is constructed with.
 */

/** One declared option. `value` takes `--name=x`; `flag` is bare `--name`. */
export type OptionSpec = {
  kind: "value" | "flag";
  /** Shown in help. Keep it to one line. */
  summary: string;
  /** A `value` option with `required` fails before the command body runs. */
  required?: boolean;
  /** Placeholder in help, e.g. `<domain>`. Ignored for flags. */
  placeholder?: string;
};

/** Declared positionals, rendered in help and validated before `run`. */
export type PositionalSpec = {
  name: string;
  summary: string;
  required?: boolean;
  /** Collects the rest, e.g. `<handle...>`. Only valid on the last entry. */
  variadic?: boolean;
};

/**
 * What a command body is handed. `apply` is the write gate: false means the run
 * must not mutate. `plan`/`did` render the uniform DRY RUN / APPLY reporting so
 * no command spells that banner itself.
 */
export type CommandContext<Client> = {
  /** The connected client the group opened, e.g. an Admin GraphQL caller. */
  client: Client;
  /** True only when `--apply` was passed. Never mutate when false. */
  apply: boolean;
  option: (name: string) => string | undefined;
  /** A declared `required` option — guaranteed present. */
  required: (name: string) => string;
  flag: (name: string) => boolean;
  positionals: string[];
  /** What the run would do. Prefixed DRY RUN or APPLY automatically. */
  plan: (message: string) => void;
  /** What the run actually did. Only legal when `apply` is true. */
  did: (message: string) => void;
  /** Ordinary output. */
  say: (message: string) => void;
  /** Non-fatal problem. Goes to stderr; does not set a failing exit code. */
  warn: (message: string) => void;
  /**
   * A problem the run must exit non-zero for without reading as a crash — drift
   * found, a check that did not pass. Goes to stderr; the command carries on and
   * returns normally, and the dispatcher exits 1.
   */
  fail: (message: string) => void;
};

export type Command<Client> = {
  name: string;
  summary: string;
  /** Longer help, shown under the usage line for `<cmd> --help`. */
  details?: string;
  options?: Record<string, OptionSpec>;
  positionals?: PositionalSpec[];
  /**
   * Declares the command writes. A writing command runs with `apply` false
   * unless `--apply` is passed, and its help says so. A command that omits this
   * is read-only and may not call `did`.
   */
  writes?: boolean;
  /**
   * Extra gate for a destructive command: the operator must pass
   * `--confirm=<the returned string>`. Receives the parsed context so the token
   * can name the actual target (a shop domain, a database).
   */
  confirm?: (ctx: CommandContext<Client>) => string;
  run: (ctx: CommandContext<Client>) => Promise<void> | void;
};

export type Group<Client> = {
  name: string;
  summary: string;
  /**
   * Opens whatever the commands in this group talk to, once, after arguments
   * validate. This is the seam that keeps the core portable.
   */
  openClient: (ctx: {
    option: (name: string) => string | undefined;
    flag: (name: string) => boolean;
  }) => Promise<Client> | Client;
  commands: Command<Client>[];
};

/** A group whose client type is opaque to the dispatcher. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGroup = Group<any>;
