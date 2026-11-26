import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node scripts/prepare-worker-seccomp.mjs INPUT OUTPUT");
const bytes = await readFile(source);
const digest = "cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849";
if (createHash("sha256").update(bytes).digest("hex") !== digest) {
  throw new Error("Unexpected Playwright 1.64.1 seccomp profile checksum");
}
const profile = JSON.parse(bytes);
// Docker checks capabilities when it compiles the profile. Chromium gains
// CAP_SYS_CHROOT only later inside its own user namespace. Let Linux enforce
// that capability check at syscall time while the worker drops all outer caps.
profile.syscalls.push({ names: ["chroot"], action: "SCMP_ACT_ALLOW", args: [] });
await writeFile(destination, JSON.stringify(profile, null, 2) + "\n", { mode: 0o644 });
