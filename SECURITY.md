# Security

Please use **Report a vulnerability** in the repository Security tab when private reporting is available. Include the affected version, the DeepSeek Harness version, and reproduction details.

The panel never stores Linear credentials. It reuses the `mcp-linear` MCP connection configured in the profile, so OAuth tokens stay in the host's credential store and in the `mcp-remote` cache (`~/.mcp-auth`).

Keep out of public issues and attachments:

- Linear OAuth tokens, refresh tokens, and `~/.mcp-auth` contents.
- The host's `dsh-auth-*` browser cookie and the signing secret in `.credentials.yaml`.
- Issue bodies from private teams and any customer data they contain.

To revoke access, sign out of the Linear MCP server in DeepSeek Harness, or remove `mcp-linear` from the profile.
