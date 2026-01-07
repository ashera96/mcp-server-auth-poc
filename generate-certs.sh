#!/bin/bash

# Generate self-signed SSL certificates for development

echo "Generating self-signed SSL certificates for localhost..."
echo ""

# Create certs directory if it doesn't exist
mkdir -p certs

# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -days 365 \
  -nodes \
  -subj '/CN=localhost'

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Certificates generated successfully!"
  echo ""
  echo "Files created:"
  echo "  - certs/server.key (private key)"
  echo "  - certs/server.crt (certificate)"
  echo ""
  echo "To run the server with HTTPS:"
  echo "  USE_HTTPS=true npm start"
  echo ""
  echo "⚠️  These are self-signed certificates for development only."
  echo "    Clients will need to use -k flag with curl or accept the certificate."
else
  echo "❌ Failed to generate certificates"
  exit 1
fi
