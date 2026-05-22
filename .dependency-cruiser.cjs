/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // contracts has no workspace deps
    {
      name: "contracts-no-workspace-deps",
      severity: "error",
      comment: "packages/contracts must not depend on any other workspace package",
      from: { path: "^packages/contracts/src" },
      to: {
        path: "^packages/(?!contracts)",
        pathNot: "node_modules",
      },
    },
    // core must never import a concrete adapter or Node-only API
    {
      name: "core-no-concrete-adapters",
      severity: "error",
      comment: "packages/core must not import concrete adapter implementations",
      from: { path: "^packages/core/src" },
      to: {
        path: "^packages/(storage-local|storage-s3)/src",
      },
    },
    {
      name: "core-no-node-apis",
      severity: "error",
      comment: "packages/core must not import Node-only APIs",
      from: { path: "^packages/core/src" },
      to: { path: "^node:(fs|path|child_process|worker_threads|os|net|cluster)" },
    },
    // packages/server must never import concrete adapters or Node-only APIs
    {
      name: "server-pkg-no-concrete-adapters",
      severity: "error",
      comment: "packages/server must not import concrete adapter implementations",
      from: { path: "^packages/server/src" },
      to: {
        path: "^packages/(storage-local|storage-s3)/src",
      },
    },
    {
      name: "server-pkg-no-node-apis",
      severity: "error",
      comment: "packages/server must not import Node-only APIs",
      from: { path: "^packages/server/src" },
      to: { path: "^node:(fs|path|child_process|worker_threads|os|net|cluster)" },
    },
    // apps/cli depends only on client and contracts
    {
      name: "cli-no-server-internals",
      severity: "error",
      comment: "apps/cli must not import packages/server or packages/core directly",
      from: { path: "^apps/cli/src" },
      to: { path: "^packages/(server|core|db|auth)/src" },
    },
    // No circular dependencies anywhere
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies are not allowed",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    prefix: "",
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
