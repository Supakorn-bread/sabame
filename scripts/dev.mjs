import { spawn } from "node:child_process";

// npm runs predev first, so shared packages and Prisma Client already exist.
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") console.error(error.message);
    }
  }
}
for (const args of [["run", "dev", "-w", "@sabame/web", "--", ...process.argv.slice(2)], ["run", "dev", "-w", "@sabame/api"]]) {
  const child = spawn("npm", args, { stdio: "inherit", env: process.env, detached: process.platform !== "win32" });
  children.push(child);
  child.on("error", (error) => { console.error(error.message); stop(1); });
  child.on("exit", (code) => { if (!stopping) stop(code ?? 1); });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
