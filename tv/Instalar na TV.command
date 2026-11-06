#!/bin/bash
# Clique duas vezes para instalar o app Osmo Talents no Google TV pela rede Wi-Fi.
# Antes: na TV, ligue Configurações > Sistema > Opções do desenvolvedor > Depuração sem fio.
cd "$(dirname "$0")" || exit 1
ADB=/opt/homebrew/share/android-commandlinetools/platform-tools/adb
APK=app/build/outputs/apk/debug/app-debug.apk
pausa() { echo ""; read -r -p "Pode fechar esta janela (aperte Enter)." _; exit "${1:-0}"; }

# COMPILAR: monta o app (.apk) com a versão mais nova do código antes de instalar.
# Precisa do Java 17 (vem com o Android Studio, ou: brew install openjdk@17).
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
if [ -z "$JAVA_HOME" ]; then
  for J in "$(/usr/libexec/java_home -v 17 2>/dev/null)" /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
           "/Applications/Android Studio.app/Contents/jbr/Contents/Home" /opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home; do
    [ -n "$J" ] && [ -x "$J/bin/java" ] && { export JAVA_HOME="$J"; break; }
  done
fi
echo "=== Preparando o app (pode levar 1 ou 2 minutos na primeira vez) ==="
if ./gradlew -q assembleDebug; then
  echo "App pronto."
else
  echo ""
  echo "Não consegui montar o app. Se a mensagem acima falar de Java, instale o Java 17: brew install openjdk@17"
  pausa 1
fi
echo ""

echo "=== Instalar o Osmo Talents no Google TV ==="
echo ""
echo "PASSO 1 de 2: PAREAR (só na primeira vez)"
echo "Na TV: Depuração sem fio > 'Parear o dispositivo com um código de pareamento'."
echo "Deixe essa caixa aberta na TV. Ela mostra um endereço (IP:porta) e um código de 6 números."
echo "(Se este Mac já foi pareado antes, só aperte Enter para pular.)"
echo ""
read -r -p "Endereço da caixa de pareamento (ex.: 192.168.15.xx:xxxxx): " PAR
if [ -n "$PAR" ]; then
  read -r -p "Código de 6 números: " COD
  "$ADB" pair "$PAR" "$COD" || { echo ""; echo "Não pareou. Confira se a caixa ainda está aberta na TV e tente de novo."; pausa 1; }
fi

echo ""
echo "PASSO 2 de 2: CONECTAR"
echo "Na TV, feche a caixa de pareamento. Na tela 'Depuração sem fio' aparece"
echo "'Endereço IP e porta' (a porta é DIFERENTE da do pareamento)."
echo ""
read -r -p "Endereço IP e porta da tela principal (ex.: 192.168.15.xx:xxxxx): " CON
OUT=$("$ADB" connect "$CON" 2>&1); echo "$OUT"
echo "$OUT" | grep -q "connected to" || { echo ""; echo "Não conectou. Confira o endereço e se a TV está no mesmo Wi-Fi do Mac."; pausa 1; }

echo ""
echo "Instalando o app..."
"$ADB" -s "$CON" install -r "$APK" || pausa 1
"$ADB" -s "$CON" shell am start -n br.com.osmo.talents.tv/.MainActivity >/dev/null
echo ""
echo "Pronto! O Osmo Talents abriu na TV e fica na aba Apps."
pausa 0
