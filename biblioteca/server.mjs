#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("../scripts/ensure-build.cjs").ensureBuild();
const { start } = await import("./dist/server.mjs");
start();
