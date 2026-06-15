import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { config } from "dotenv";

function findWorkspaceRoot(startDirectory: string) {
  let directory = startDirectory;

  while (true) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) {
      return directory;
    }

    const parent = dirname(directory);

    if (parent === directory) {
      return null;
    }

    directory = parent;
  }
}

const workspaceRoot = findWorkspaceRoot(process.cwd());

if (workspaceRoot) {
  const envPath = join(workspaceRoot, ".env");

  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}
