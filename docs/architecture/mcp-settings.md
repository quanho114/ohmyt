# MCP settings

The Connections settings page manages MCP servers used by ohmyt itself. It supports
local direct executables over stdio and remote Streamable HTTP endpoints. Servers
remain scoped to chats outside projects or to one existing project. Saving a
configuration does not connect or execute it; Test performs a temporary connection
and closes it, while Connect activates tools through the existing authorization
pipeline. Disconnect before editing. Connections are not automatically activated
on restart.

The list supports name search, transport filters, refresh, connection status and
an expandable tool catalog for active connections. Tests report the discovered
tool count without activating the tools.

JSON import accepts one server object or a `mcpServers` block containing exactly
one entry. Import fills the editable form; users review the scope and save it.
Supported fields are name, type/transport, command, args, url and token. Unsupported
fields (including env and custom headers), legacy SSE, multiple entries and
arguments containing newlines are rejected explicitly rather than discarded.
Tokens use the existing credential vault. This page does not read or modify
Claude Code, Codex or OpenCode configuration files and does not implement OAuth.
