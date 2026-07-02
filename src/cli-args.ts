// Shared CLI argument plumbing (cli.ts routes, cli-store.ts consumes — a separate module so
// neither imports the other).

// Anything that could be a secret never reaches an output stream verbatim: every error/echo
// path routes through this. 64 hex chars is exactly a master seed's shape.
export const redactSecrets = (s: string): string =>
  s.replace(/[0-9a-fA-F]{64}/g, "[redacted 64-hex value]");

// Tiny flag reader: `--name value`, `--name=value`, and — for names declared boolean — bare
// `--name` that never consumes the next token. A value-taking flag left bare stores "" and is
// rejected by flagValue at consumption, so the error names the flag instead of misbehaving.
export function parseFlags(
  args: readonly string[],
  booleans: ReadonlySet<string> = new Set(),
): { flags: Map<string, string>; rest: string[] } {
  const flags = new Map<string, string>();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const name = a.slice(2);
      const value = args[i + 1];
      if (booleans.has(name) || value === undefined || value.startsWith("--")) {
        flags.set(name, "");
        continue;
      }
      flags.set(name, value);
      i += 1;
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

// A value-taking flag's value: absent → undefined; present-but-empty (bare `--home`) → a loud
// error, never an empty string that silently retargets something.
export function flagValue(flags: ReadonlyMap<string, string>, name: string): string | undefined {
  const v = flags.get(name);
  if (v === "") throw new Error(`--${name} needs a value`);
  return v;
}

// Reject typo'd flags: a swallowed `--teir private` must never silently become a default.
export function rejectUnknownFlags(
  flags: ReadonlyMap<string, string>,
  allowed: ReadonlySet<string>,
  context: string,
): void {
  for (const name of flags.keys()) {
    if (!allowed.has(name)) throw new Error(`${context}: unknown flag --${name}`);
  }
}
