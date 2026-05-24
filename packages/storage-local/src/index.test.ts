import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { after } from "node:test";
import { runStorageConformanceSuite } from "@agentbox/testkit";
import { LocalDiskStorage } from "./index.js";

let tmpDir: string;

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

runStorageConformanceSuite(
  "LocalDiskStorage",
  async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "agentbox-local-test-"));
    return new LocalDiskStorage(tmpDir);
  },
  "stream",
);
