// Stable Node entry point; application sources live in server.ts and src/*.ts.
"use strict";
require("./scripts/ensure-build.cjs").ensureBuild();
const app = require("./dist/server.js");
if (require.main === module) app.start();
module.exports = app;
