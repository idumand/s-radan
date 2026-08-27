import re

with open("server.ts", "r") as f:
    text = f.read()

pattern = r"""if \(\!apiKey \|\| \!secret\) \{\s*return \{ success: false, message: "API Key veya Secret Key eksik. Simülasyon moduna geçildi." \};\s*\}"""

replacement = """if (!apiKey || !secret) {
      addEngineLog("WARN", "API Key eksik. Public market verisi ile çalışacak.");
    }"""

text = re.sub(pattern, replacement, text)

# We should also fix the parameters passed to ExchangeClass to only include keys if they exist
pattern2 = r"""exchange = new ExchangeClass\(\{\s*apiKey: apiKey\.trim\(\),\s*secret: secret\.trim\(\),"""

replacement2 = """
    const exOpts: any = {
      enableRateLimit: true,
      options: {
        defaultType: "future",
        adjustForTimeDifference: true,
      },
    };
    if (apiKey && secret) {
        exOpts.apiKey = apiKey.trim();
        exOpts.secret = secret.trim();
    }
    exchange = new ExchangeClass(exOpts);
"""

text = re.sub(pattern2, replacement2, text)

with open("server.ts", "w") as f:
    f.write(text)
