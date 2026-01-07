#!/bin/bash

# Import self-signed certificate into Java truststore
# This allows Java applications to trust the certificate

echo "=== Importing Certificate to Java Truststore ==="
echo ""

# Check if certificate exists
if [ ! -f "certs/server.crt" ]; then
  echo "❌ Certificate not found at certs/server.crt"
  echo "Please run ./generate-certs.sh first"
  exit 1
fi

# Find Java installation
if [ -z "$JAVA_HOME" ]; then
  # Try to find Java
  JAVA_BIN=$(which java)
  if [ -z "$JAVA_BIN" ]; then
    echo "❌ Java not found. Please set JAVA_HOME or install Java"
    exit 1
  fi
  # Try to determine JAVA_HOME from java binary
  JAVA_HOME=$(dirname $(dirname $(readlink -f $JAVA_BIN 2>/dev/null || echo $JAVA_BIN)))
  echo "Found Java at: $JAVA_HOME"
fi

# Locate cacerts file
CACERTS="${JAVA_HOME}/lib/security/cacerts"
if [ ! -f "$CACERTS" ]; then
  # Try alternative location for macOS
  CACERTS="${JAVA_HOME}/jre/lib/security/cacerts"
fi

if [ ! -f "$CACERTS" ]; then
  echo "❌ Could not find Java cacerts file"
  echo "Tried:"
  echo "  ${JAVA_HOME}/lib/security/cacerts"
  echo "  ${JAVA_HOME}/jre/lib/security/cacerts"
  exit 1
fi

echo "Java truststore: $CACERTS"
echo ""

# Default password for Java truststore
KEYSTORE_PASS="changeit"

# Alias for our certificate
CERT_ALIAS="mcp-localhost"

# Remove existing certificate if present
echo "Removing existing certificate (if any)..."
sudo keytool -delete -alias "$CERT_ALIAS" -keystore "$CACERTS" -storepass "$KEYSTORE_PASS" 2>/dev/null || true

# Import certificate
echo "Importing certificate..."
sudo keytool -import -trustcacerts -alias "$CERT_ALIAS" \
  -file certs/server.crt \
  -keystore "$CACERTS" \
  -storepass "$KEYSTORE_PASS" \
  -noprompt

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Certificate imported successfully!"
  echo ""
  echo "The certificate has been added to Java's truststore."
  echo "Java applications should now trust connections to https://localhost:3000"
  echo ""
  echo "To verify:"
  echo "  keytool -list -alias $CERT_ALIAS -keystore $CACERTS -storepass changeit"
  echo ""
  echo "To remove later:"
  echo "  sudo keytool -delete -alias $CERT_ALIAS -keystore $CACERTS -storepass changeit"
else
  echo ""
  echo "❌ Failed to import certificate"
  echo "You may need administrator privileges (sudo)"
  exit 1
fi
