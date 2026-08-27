import re

with open("server.ts", "r") as f:
    text = f.read()

# Add a route to serve the available futures markets and current stats
# This replaces the hardcoded list with real data dynamically fetched by frontend if needed, 
# or we can just fetch it on frontend directly via Binance REST.
