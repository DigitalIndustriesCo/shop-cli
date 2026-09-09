/**
 * Argument parsing and validation.
 *
 * Parsing is declarative: a command states its options, and an unknown or
 * missing one fails consistently before the command body — and before any
 * client is opened.
 */
import type { Command, OptionSpec, PositionalSpec } from "./types";

export type ParsedArgs = {
  values: Map<string, string>;
  flags: Set<string>;
  positionals: string[];
};

/** Splits raw argv into `--name=value`, bare `--name`, and positionals. */
export function parseArgv(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (const token of argv) {
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) flags.add(body);
    // Keeps `=` inside the value: --why=a=b reads as "a=b".
    else values.set(body.slice(0, eq), body.slice(eq + 1));
  }

  return { values, flags, positionals };
}

/**
 * Options every command accepts. They are parsed by the dispatcher, so a
 * command never declares them and never has to remember to honour them.
 */
export const GLOBAL_OPTIONS: Record<string, OptionSpec> = {
  apply: {
    kind: "flag",
    summary: "Perform the writes. Without it a writing command only reports.",
  },
  confirm: {
    kind: "value",
    placeholder: "<token>",
    summary: "Acknowledge a destructive command's named target.",
  },
  help: { kind: "flag", summary: "Show this help." },
};

export class UsageError extends Error {}

const optionList = (command: Command<unknown>): Record<string, OptionSpec> => ({
  ...(command.options ?? {}),
  ...GLOBAL_OPTIONS,
});

function checkUnknown(parsed: ParsedArgs, command: Command<unknown>): void {
  const known = optionList(command);
  const unknown = [
    ...[...parsed.values.keys()].filter((name) => !(name in known)),
    ...[...parsed.flags].filter((name) => !(name in known)),
  ];

  if (!unknown.length) return;

  const suggestions = Object.keys(known)
    .filter((name) => unknown.some((u) => name.startsWith(u.slice(0, 3))))
    .map((name) => `--${name}`);

  throw new UsageError(
    `unknown option${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `--${u}`).join(", ")}` +
      (suggestions.length ? `\nDid you mean ${suggestions.join(", ")}?` : ""),
  );
}

function checkShape(parsed: ParsedArgs, command: Command<unknown>): void {
  for (const [name, spec] of Object.entries(command.options ?? {})) {
    const given = parsed.values.has(name);
    const asFlag = parsed.flags.has(name);

    if (spec.kind === "value") {
      // A value option passed bare is the likeliest typo here, so it gets its
      // own message rather than falling through to "missing".
      if (asFlag)
        throw new UsageError(`--${name} needs a value: --${name}=${spec.placeholder ?? "<value>"}`);
      if (spec.required && !given)
        throw new UsageError(
          `--${name}=${spec.placeholder ?? "<value>"} is required — ${spec.summary}`,
        );
      continue;
    }

    if (given)
      throw new UsageError(`--${name} is a flag and takes no value — pass it bare as --${name}`);
  }
}

function checkPositionals(parsed: ParsedArgs, command: Command<unknown>): void {
  const specs: PositionalSpec[] = command.positionals ?? [];
  const required = specs.filter((spec) => spec.required);

  if (parsed.positionals.length < required.length) {
    const missing = required[parsed.positionals.length];
    throw new UsageError(`<${missing.name}> is required — ${missing.summary}`);
  }

  const variadic = specs.some((spec) => spec.variadic);
  if (!variadic && parsed.positionals.length > specs.length) {
    const extra = parsed.positionals.slice(specs.length);
    throw new UsageError(
      `unexpected argument${extra.length > 1 ? "s" : ""}: ${extra.join(", ")}`,
    );
  }
}

/** Validates parsed argv against a command. Throws `UsageError` on any problem. */
export function validate(parsed: ParsedArgs, command: Command<unknown>): void {
  checkUnknown(parsed, command);
  checkShape(parsed, command);
  checkPositionals(parsed, command);
}
