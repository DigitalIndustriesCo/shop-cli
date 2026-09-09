/**
 * The dispatcher: resolve group + command, validate, open the client, run.
 *
 * The write gate lives here rather than in each command: `apply` reaches a
 * command already decided, and `did()` refuses to be called when it is false.
 * A command therefore cannot report a write it was not cleared to perform.
 */
import { UsageError, parseArgv, validate } from "./args";
import { renderCommand, renderGroup, renderIndex } from "./help";
import type { AnyGroup, Command, CommandContext } from "./types";

export type RunResult = { exitCode: number };

type Io = {
  out: (line: string) => void;
  err: (line: string) => void;
};

const defaultIo: Io = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/** Mutable across one run so `fail()` can decide the exit code from inside a command. */
type Outcome = { failed: boolean };

function buildContext<Client>(
  command: Command<Client>,
  parsed: ReturnType<typeof parseArgv>,
  client: Client,
  io: Io,
  outcome: Outcome,
): CommandContext<Client> {
  const apply = parsed.flags.has("apply");

  return {
    client,
    apply,
    option: (name) => parsed.values.get(name),
    required: (name) => {
      const value = parsed.values.get(name);
      // Unreachable via the dispatcher (validate ran first); this catches a
      // command asking for an option it forgot to declare.
      if (value === undefined)
        throw new Error(`${command.name}: --${name} was read but is not declared required`);
      return value;
    },
    flag: (name) => parsed.flags.has(name),
    positionals: parsed.positionals,
    plan: (message) => io.out(`${apply ? "APPLY" : "DRY RUN"} — ${message}`),
    did: (message) => {
      if (!apply)
        throw new Error(`${command.name}: did() called without --apply — this run must not write`);
      io.out(message);
    },
    say: (message) => io.out(message),
    warn: (message) => io.err(message),
    fail: (message) => {
      outcome.failed = true;
      io.err(message);
    },
  };
}

/**
 * Runs one invocation. Returns an exit code rather than calling `process.exit`,
 * so the whole surface is testable without spawning.
 */
export async function run(
  bin: string,
  groups: AnyGroup[],
  argv: string[],
  io: Io = defaultIo,
): Promise<RunResult> {
  const [groupName, commandName, ...rest] = argv;

  if (!groupName || groupName === "--help") {
    io.out(renderIndex(bin, groups));
    return { exitCode: 0 };
  }

  const group = groups.find((candidate) => candidate.name === groupName);
  if (!group) {
    io.err(`unknown group: ${groupName}\n`);
    io.err(renderIndex(bin, groups));
    return { exitCode: 1 };
  }

  if (!commandName || commandName === "--help") {
    io.out(renderGroup(bin, group));
    return { exitCode: 0 };
  }

  const command = group.commands.find((candidate) => candidate.name === commandName);
  if (!command) {
    io.err(`unknown command: ${groupName} ${commandName}\n`);
    io.err(renderGroup(bin, group));
    return { exitCode: 1 };
  }

  const parsed = parseArgv(rest);

  if (parsed.flags.has("help")) {
    io.out(renderCommand(bin, group, command));
    return { exitCode: 0 };
  }

  try {
    validate(parsed, command);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.err(`${error.message}\n`);
    io.err(renderCommand(bin, group, command));
    return { exitCode: 1 };
  }

  try {
    const client = await group.openClient({
      option: (name) => parsed.values.get(name),
      flag: (name) => parsed.flags.has(name),
    });
    const outcome: Outcome = { failed: false };
    const ctx = buildContext(command, parsed, client, io, outcome);

    if (command.confirm && ctx.apply) {
      const expected = command.confirm(ctx);
      if (parsed.values.get("confirm") !== expected) {
        io.err(
          `this command needs --confirm=${expected} to run with --apply.\n` +
            "Re-run without --apply to see what it would do.",
        );
        return { exitCode: 1 };
      }
    }

    await command.run(ctx);

    if (command.writes && !ctx.apply)
      io.out("\nNothing was written. Re-run with --apply to perform it.");

    return { exitCode: outcome.failed ? 1 : 0 };
  } catch (error) {
    io.err(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return { exitCode: 1 };
  }
}
