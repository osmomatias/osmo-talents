#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este script atualiza a "lista de autoridades oficiais"
# que o detetive de laudos usa. Ele baixa do site oficial do governo (ITI) todos os
# certificados das autoridades, joga fora os vencidos, separa as RAÍZES (as que assinam a
# si mesmas) das INTERMEDIÁRIAS e confere se cada intermediária chega numa raiz.
# Se algo não bater, não troca nada. Depois é só publicar.
# Atualiza os certificados da ICP-Brasil (raízes e ACs intermediárias) a partir do repositório oficial do ITI.
# Uso, no terminal do editor:  bash scripts/atualizar-icp.sh   (depois publique com bash publicar.sh)
set -e
cd "$(dirname "$0")/.."
DEST=certs/icp-brasil
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "Baixando do ITI..."
curl -sSf -m 120 -o "$TMP/ac.zip" https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip
mkdir "$TMP/zip" && unzip -qo "$TMP/ac.zip" -d "$TMP/zip"
: > "$TMP/raizes.pem"; : > "$TMP/inter.pem"
for f in "$TMP"/zip/*.crt; do
  pem="$(openssl x509 -inform DER -in "$f" 2>/dev/null || openssl x509 -in "$f" 2>/dev/null)" || continue
  openssl x509 -noout -checkend 0 <<< "$pem" >/dev/null || continue  # vencido
  subj="$(openssl x509 -noout -subject <<< "$pem")"; iss="$(openssl x509 -noout -issuer <<< "$pem")"
  if [ "${subj#subject=}" = "${iss#issuer=}" ]; then
    case "$subj" in *"O=ICP-Brasil"*) echo "$pem" >> "$TMP/raizes.pem";; esac
  else echo "$pem" >> "$TMP/inter.pem"; fi
done
# cada intermediária precisa encadear numa raiz
bad=0
awk -v d="$TMP" '/BEGIN CERTIFICATE/{n++} n{print > (d "/i" n ".pem")}' "$TMP/inter.pem"
for f in "$TMP"/i*.pem; do openssl verify -CAfile "$TMP/raizes.pem" -untrusted "$TMP/inter.pem" "$f" >/dev/null 2>&1 || bad=$((bad+1)); done
[ "$bad" = 0 ] || { echo "$bad certificado(s) não encadeiam nas raízes. Nada foi alterado."; exit 1; }
cp "$TMP/raizes.pem" "$DEST/raizes.pem"; cp "$TMP/inter.pem" "$DEST/intermediarias.pem"
echo "Pronto: $(grep -c BEGIN "$DEST/raizes.pem") raízes e $(grep -c BEGIN "$DEST/intermediarias.pem") intermediárias."
