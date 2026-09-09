import { describe, expect, it, vi } from "vitest";
import { run } from "../src/run";
import type { AnyGroup, Group } from "../src/types";

// The safety contract: a writing command must not write unless --apply was
// passed. The dispatcher enforces it for every registered command.

type Io = { out: string[]; err: string[] };

const makeIo = () => {
  const io: Io = { out: [], err: [] };
  return {
    io,
    sink: { out: (line: string) => io.out.push(line), err: (line: string) => io.err.push(line) },
  };
};

const client = { name: "test-client" };

const group = (overrides: Partial<Group<typeof client>> = {}): AnyGroup =>
  ({
    name: "things",
    summary: "Test things.",
    openClient: () => client,
    commands: [
      {
        name: "look",
        summary: "A read-only command.",
        run: ({ say }) => say("looked"),
      },
      {
        name: "change",
        summary: "A writing command.",
        writes: true,
        run: ({ apply, plan, did }) => {
          plan("change one thing");
          if (!apply) return;
          did("changed one thing");
        },
      },
      {
        name: "needs",
        summary: "Requires an option.",
        options: {
          target: { kind: "value", required: true, placeholder: "<id>", summary: "What to act on." },
        },
        run: ({ required, say }) => say(`target=${required("target")}`),
      },
      {
        name: "wipe",
        summary: "A destructive command.",
        writes: true,
        confirm: () => "yes-really",
        run: ({ apply, plan, did }) => {
          plan("wipe everything");
          if (!apply) return;
          did("wiped");
        },
      },
    ],
    ...overrides,
  }) as AnyGroup;

const invoke = async (argv: string[], groups: AnyGroup[] = [group()]) => {
  const { io, sink } = makeIo();
  const result = await run("shop", groups, argv, sink);
  return { ...result, out: io.out.join("\n"), err: io.err.join("\n") };
};

describe("the write gate", () => {
  it("reports without writing when --apply is absent", async () => {
    const { exitCode, out } = await invoke(["things", "change"]);

    expect(exitCode).toBe(0);
    expect(out).toContain("DRY RUN — change one thing");
    expect(out).not.toContain("changed one thing");
    expect(out).toContain("Re-run with --apply");
  });

  it("writes when --apply is passed", async () => {
    const { exitCode, out } = await invoke(["things", "change", "--apply"]);

    expect(exitCode).toBe(0);
    expect(out).toContain("APPLY — change one thing");
    expect(out).toContain("changed one thing");
    expect(out).not.toContain("Re-run with --apply");
  });

  // A command that calls did() on a non-apply run is reporting a write it was
  // never cleared for. That is a bug in the command, and it fails loudly.
  it("refuses did() on a run that was not cleared to write", async () => {
    const rogue = group({
      commands: [
        { name: "rogue", summary: "Lies about writing.", writes: true, run: ({ did }) => did("wrote") },
      ],
    } as Partial<Group<typeof client>>);
    const { exitCode, err } = await invoke(["things", "rogue"], [rogue]);

    expect(exitCode).toBe(1);
    expect(err).toContain("did() called without --apply");
  });
});

describe("destructive confirmation", () => {
  it("blocks --apply until the confirm token matches", async () => {
    const { exitCode, err, out } = await invoke(["things", "wipe", "--apply"]);

    expect(exitCode).toBe(1);
    expect(err).toContain("--confirm=yes-really");
    expect(out).not.toContain("wiped");
  });

  it("runs once the token matches", async () => {
    const { exitCode, out } = await invoke(["things", "wipe", "--apply", "--confirm=yes-really"]);

    expect(exitCode).toBe(0);
    expect(out).toContain("wiped");
  });

  // The dry run is the safe path — it must stay reachable without ceremony.
  it("does not demand confirmation for a dry run", async () => {
    const { exitCode, out } = await invoke(["things", "wipe"]);

    expect(exitCode).toBe(0);
    expect(out).toContain("DRY RUN — wipe everything");
  });
});

describe("argument validation", () => {
  it("fails a missing required option before opening the client", async () => {
    const openClient = vi.fn(() => client);
    const { exitCode, err } = await invoke(["things", "needs"], [group({ openClient })]);

    expect(exitCode).toBe(1);
    expect(err).toContain("--target=<id> is required");
    expect(openClient).not.toHaveBeenCalled();
  });

  it("accepts a required option and passes it through", async () => {
    const { exitCode, out } = await invoke(["things", "needs", "--target=abc"]);

    expect(exitCode).toBe(0);
    expect(out).toContain("target=abc");
  });

  it("rejects an unknown option instead of ignoring it", async () => {
    const { exitCode, err } = await invoke(["things", "look", "--aply"]);

    expect(exitCode).toBe(1);
    expect(err).toContain("unknown option: --aply");
  });

  it("names the value form when a value option is passed bare", async () => {
    const { exitCode, err } = await invoke(["things", "needs", "--target"]);

    expect(exitCode).toBe(1);
    expect(err).toContain("--target needs a value");
  });

  it("keeps '=' inside an option value", async () => {
    const { out } = await invoke(["things", "needs", "--target=a=b"]);

    expect(out).toContain("target=a=b");
  });
});

describe("help and discovery", () => {
  it("lists every group and command with no arguments", async () => {
    const { exitCode, out } = await invoke([]);

    expect(exitCode).toBe(0);
    expect(out).toContain("things — Test things.");
    expect(out).toContain("look");
    expect(out).toContain("change");
  });

  it("marks writing commands in the index", async () => {
    const { out } = await invoke([]);

    expect(out).toMatch(/change\s+A writing command\. \(writes\)/);
  });

  it("shows a command's own options under --help", async () => {
    const { exitCode, out } = await invoke(["things", "needs", "--help"]);

    expect(exitCode).toBe(0);
    expect(out).toContain("--target=<id>");
    expect(out).toContain("(required)");
  });

  it("fails an unknown group with the index, not a stack trace", async () => {
    const { exitCode, err } = await invoke(["nope"]);

    expect(exitCode).toBe(1);
    expect(err).toContain("unknown group: nope");
    expect(err).toContain("things — Test things.");
  });
});

describe("failure reporting", () => {
  it("returns a failing exit code when a command throws", async () => {
    const boom = group({
      commands: [
        {
          name: "boom",
          summary: "Throws.",
          run: () => {
            throw new Error("it broke");
          },
        },
      ],
    } as Partial<Group<typeof client>>);
    const { exitCode, err } = await invoke(["things", "boom"], [boom]);

    expect(exitCode).toBe(1);
    expect(err).toContain("it broke");
  });

  it("exits non-zero for a reported problem without treating it as a crash", async () => {
    const checks = group({
      commands: [
        {
          name: "check",
          summary: "Reports a problem.",
          run: ({ say, fail }) => {
            say("DRIFT  one-migration");
            fail("1 drifted.");
          },
        },
      ],
    } as Partial<Group<typeof client>>);
    const { exitCode, out, err } = await invoke(["things", "check"], [checks]);

    expect(exitCode).toBe(1);
    expect(out).toContain("DRIFT  one-migration");
    expect(err).toContain("1 drifted.");
    // A crash prints a stack; a reported problem must not.
    expect(err).not.toContain("at ");
  });

  it("keeps a clean run at zero when fail() is never called", async () => {
    const { exitCode } = await invoke(["things", "look"]);

    expect(exitCode).toBe(0);
  });
});
