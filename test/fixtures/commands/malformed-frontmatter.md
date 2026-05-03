---
command: malformed
version: 1.0.0
description: Frontmatter is missing the closing fence — parse-frontmatter.js MUST reject this file.
capabilities: [shell]

# TestAtlas Command: malformed

This file is intentionally broken. The opening `---` fence on line 1 is never closed,
so any frontmatter parser must throw a clear "missing closing fence" error rather than
silently accept the body as YAML.
