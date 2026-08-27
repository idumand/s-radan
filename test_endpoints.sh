curl -s -X POST http://localhost:3000/api/v1/exchange-keys -H "Content-Type: application/json" -d '{"apiKey": "", "secretKey": ""}'
echo ""
curl -s http://localhost:3000/api/v1/status
