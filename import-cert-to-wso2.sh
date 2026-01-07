#!/bin/bash

# Import self-signed certificate into WSO2 API Manager's Java truststore

echo "=== Importing Certificate to WSO2 API Manager Truststore ==="
echo ""

# Check if certificate exists
if [ ! -f "certs/server.crt" ]; then
  echo "❌ Certificate not found at certs/server.crt"
  echo "Please run ./generate-certs.sh first"
  exit 1
fi

# Common WSO2 installation paths
WSO2_PATHS=(
  "/Library/WSO2"
  "/opt/wso2"
  "$HOME/wso2"
  "/usr/local/wso2"
  "$HOME/Downloads/wso2am-*"
)

WSO2_HOME=""

# Try to find WSO2 installation
echo "Searching for WSO2 installation..."
for path_pattern in "${WSO2_PATHS[@]}"; do
  for path in $path_pattern; do
    if [ -d "$path" ]; then
      # Look for api-manager or jdk directory
      if [ -d "$path/wso2am-"* ] || [ -d "$path/jdk"* ]; then
        WSO2_HOME="$path"
        break 2
      fi
    fi
  done
done

# If not found, ask user
if [ -z "$WSO2_HOME" ]; then
  echo "Could not auto-detect WSO2 installation."
  echo ""
  read -p "Enter WSO2 API Manager installation path (e.g., /Library/WSO2/wso2am-4.3.0): " WSO2_HOME

  if [ ! -d "$WSO2_HOME" ]; then
    echo "❌ Directory not found: $WSO2_HOME"
    exit 1
  fi
fi

echo "WSO2 Home: $WSO2_HOME"
echo ""

# Find Java truststore in WSO2
CACERTS=""

# Try common locations
if [ -f "$WSO2_HOME/jdk-11"*/lib/security/cacerts ]; then
  CACERTS=$(ls "$WSO2_HOME/jdk-11"*/lib/security/cacerts 2>/dev/null | head -1)
elif [ -f "$WSO2_HOME/jdk"*/lib/security/cacerts ]; then
  CACERTS=$(ls "$WSO2_HOME/jdk"*/lib/security/cacerts 2>/dev/null | head -1)
elif [ -f "$WSO2_HOME/../jdk"*/lib/security/cacerts ]; then
  CACERTS=$(ls "$WSO2_HOME/../jdk"*/lib/security/cacerts 2>/dev/null | head -1)
fi

# Also check for client-truststore.jks (WSO2 specific)
WSO2_TRUSTSTORE="$WSO2_HOME/repository/resources/security/client-truststore.jks"

if [ -f "$WSO2_TRUSTSTORE" ]; then
  echo "Found WSO2 truststore: $WSO2_TRUSTSTORE"
  TRUSTSTORE_PATH="$WSO2_TRUSTSTORE"
  TRUSTSTORE_PASS="wso2carbon"
elif [ -f "$CACERTS" ]; then
  echo "Found Java cacerts: $CACERTS"
  TRUSTSTORE_PATH="$CACERTS"
  TRUSTSTORE_PASS="changeit"
else
  echo "❌ Could not find truststore"
  echo "Please provide the path to WSO2's truststore manually"
  read -p "Truststore path: " TRUSTSTORE_PATH
  read -p "Truststore password [wso2carbon]: " TRUSTSTORE_PASS
  TRUSTSTORE_PASS=${TRUSTSTORE_PASS:-wso2carbon}
fi

echo ""
echo "Truststore: $TRUSTSTORE_PATH"
echo ""

# Certificate alias
CERT_ALIAS="mcp-localhost"

# Find keytool
KEYTOOL=""
if [ -f "$WSO2_HOME/jdk"*/bin/keytool ]; then
  KEYTOOL=$(ls "$WSO2_HOME/jdk"*/bin/keytool 2>/dev/null | head -1)
else
  KEYTOOL=$(which keytool)
fi

if [ -z "$KEYTOOL" ]; then
  echo "❌ keytool not found"
  exit 1
fi

echo "Using keytool: $KEYTOOL"
echo ""

# Remove existing certificate if present
echo "Removing existing certificate (if any)..."
sudo "$KEYTOOL" -delete -alias "$CERT_ALIAS" \
  -keystore "$TRUSTSTORE_PATH" \
  -storepass "$TRUSTSTORE_PASS" 2>/dev/null || true

# Import certificate
echo "Importing certificate..."
sudo "$KEYTOOL" -import -trustcacerts -alias "$CERT_ALIAS" \
  -file certs/server.crt \
  -keystore "$TRUSTSTORE_PATH" \
  -storepass "$TRUSTSTORE_PASS" \
  -noprompt

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Certificate imported successfully!"
  echo ""
  echo "⚠️  IMPORTANT: You must restart WSO2 API Manager for changes to take effect:"
  echo ""
  echo "  cd $WSO2_HOME/bin"
  echo "  ./api-manager.sh stop"
  echo "  ./api-manager.sh start"
  echo ""
  echo "To verify:"
  echo "  $KEYTOOL -list -alias $CERT_ALIAS -keystore $TRUSTSTORE_PATH -storepass $TRUSTSTORE_PASS"
  echo ""
  echo "To remove later:"
  echo "  sudo $KEYTOOL -delete -alias $CERT_ALIAS -keystore $TRUSTSTORE_PATH -storepass $TRUSTSTORE_PASS"
else
  echo ""
  echo "❌ Failed to import certificate"
  exit 1
fi
