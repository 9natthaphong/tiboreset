import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_APP_MODE: "demo", CONTROL_ROOM_ENABLED: process.env.CONTROL_ROOM_ENABLED ?? "true" },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", code => process.exit(code ?? 0));
