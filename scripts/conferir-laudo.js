// Confere um PDF no seu computador, sem enviar para o site (mesma conferência do selo de verificado).
// Uso:  node scripts/conferir-laudo.js caminho/do/laudo.pdf
const fs = require("node:fs");
const { verifyMedicalPdf } = require("../src/icp");

const file = process.argv[2];
if (!file) { console.log("Uso: node scripts/conferir-laudo.js caminho/do/laudo.pdf"); process.exit(1); }
verifyMedicalPdf(fs.readFileSync(file)).then(r => {
  console.log("\n✔ Aprovado: o selo seria concedido.");
  console.log(`  Assinado por: ${r.doctor}  (CRM${r.uf ? "-" + r.uf : ""} ${r.crm})`);
  console.log(`  Data da assinatura: ${r.signedAt.toLocaleString("pt-BR")}`);
  console.log(`  Lista de revogados: ${{ ok: "conferida, certificado não revogado", indisponivel: "não deu para baixar (conferência pulada)" }[r.revocation]}\n`);
}, e => { console.log(`\n✘ Recusado: ${e.message}\n`); process.exit(2); });
