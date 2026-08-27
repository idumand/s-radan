import re

with open("server.ts", "r") as f:
    text = f.read()

text = text.replace("if (!isDryRun) {", "if (true) {")
text = text.replace("if (conf.dry_run !== undefined) isDryRun = conf.dry_run;", "")
text = text.replace("dry_run: isDryRun,", "dry_run: false,")

with open("server.ts", "w") as f:
    f.write(text)
