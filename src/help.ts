/**
 * Help rendering. The command index makes an application's complete operational
 * surface discoverable without requiring operators to know script paths.
 */
import { GLOBAL_OPTIONS } from "./args";
import type { AnyGroup, Command, OptionSpec } from "./types";

const pad = (rows: [string, string][], indent = "  "): string => {
  const width = rows.reduce((max, [left]) => Math.max(max, left.length), 0);
  return rows.map(([left, right]) => `${indent}${left.padEnd(width)}  ${right}`).join("\n");
};

const signature = (name: string, spec: OptionSpec): string =>
  spec.kind === "flag" ? `--${name}` : `--${name}=${spec.placeholder ?? "<value>"}`;

/** `shop` with no arguments: every group and command, grouped. */
export function renderIndex(bin: string, groups: AnyGroup[]): string {
  const sections = groups.map((group) => {
    const rows: [string, string][] = group.commands.map((command) => [
      command.name,
      command.writes ? `${command.summary} (writes)` : command.summary,
    ]);
    return `${group.name} — ${group.summary}\n${pad(rows, "    ")}`;
  });

  return [
    `usage: ${bin} <group> <command> [options]`,
    "",
    sections.join("\n\n"),
    "",
    `Run \`${bin} <group> <command> --help\` for a command's options.`,
    "A command marked (writes) reports only, until you pass --apply.",
  ].join("\n");
}

/** `shop <group>`: the commands in one group. */
export function renderGroup(bin: string, group: AnyGroup): string {
  const rows: [string, string][] = group.commands.map((command) => [
    command.name,
    command.writes ? `${command.summary} (writes)` : command.summary,
  ]);

  return [
    `usage: ${bin} ${group.name} <command> [options]`,
    "",
    group.summary,
    "",
    pad(rows),
  ].join("\n");
}

/** `shop <group> <command> --help`. */
export function renderCommand(bin: string, group: AnyGroup, command: Command<unknown>): string {
  const positionals = (command.positionals ?? [])
    .map((spec) => {
      const label = spec.variadic ? `${spec.name}...` : spec.name;
      return spec.required ? `<${label}>` : `[${label}]`;
    })
    .join(" ");

  const lines = [
    `usage: ${bin} ${group.name} ${command.name}${positionals ? ` ${positionals}` : ""} [options]`,
    "",
    command.summary,
  ];

  if (command.details) lines.push("", command.details);

  if (command.positionals?.length) {
    lines.push(
      "",
      "Arguments:",
      pad(command.positionals.map((spec) => [spec.name, spec.summary])),
    );
  }

  const own = Object.entries(command.options ?? {});
  if (own.length) {
    lines.push(
      "",
      "Options:",
      pad(
        own.map(([name, spec]) => [
          signature(name, spec),
          spec.required ? `${spec.summary} (required)` : spec.summary,
        ]),
      ),
    );
  }

  lines.push(
    "",
    "Global options:",
    pad(Object.entries(GLOBAL_OPTIONS).map(([name, spec]) => [signature(name, spec), spec.summary])),
  );

  if (command.writes)
    lines.push("", "This command writes. Without --apply it reports what it would do.");

  return lines.join("\n");
}
