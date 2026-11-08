import path from "node:path";

// Node sources run from dist/src; persistent data and static assets stay at the project root.
export const PROJECT_ROOT = path.resolve(__dirname, "../..");
