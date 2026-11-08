// PM2 loads CommonJS configuration before TypeScript application modules.
require("./scripts/ensure-build.cjs").ensureBuild();
module.exports = require("./dist/ecosystem.config.js").default;
