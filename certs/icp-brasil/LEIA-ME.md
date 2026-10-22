# Certificados da ICP-Brasil

Usados para conferir laudos assinados digitalmente (selo "verificado").

- `raizes.pem`: as 6 Autoridades Certificadoras Raiz Brasileiras em vigor (v5, v6, v7, v10, v11, v12). São a âncora de confiança.
- `intermediarias.pem`: as ACs intermediárias credenciadas, para completar a cadeia quando o PDF não traz todas.

Origem: repositório oficial do ITI, baixado por HTTPS em 22/10/2026
(`https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip`).
Todas as intermediárias foram conferidas com `openssl verify` contra as raízes.

Para atualizar (quando o ITI publicar novas ACs): `bash scripts/atualizar-icp.sh`
