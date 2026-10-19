# Provider settings overview

The overview uses one search toolbar and a list of configured connections,
ordered with enabled providers first. Configuration is available through the
provider name or the explicit Configure action; the switch only changes enablement.
Enablement is not presented as a verified connection test.

A separate catalog offers one-click setup with the existing prefilled form.
Search matches configured provider names and catalog names, badges and types.
Both groups show empty results explicitly. The duplicate provider navigation list
is hidden on the overview and retained while editing an existing connection.
Catalog rows collapse to one column in narrow windows. Existing API credential,
connection testing and model management flows remain in the detail view.

Validation: `npx tsc --noEmit`, `npm run build`, and
`xvfb-run -a node_modules/.bin/electron --no-sandbox --ozone-platform=x11 test/ui/test_provider_overview.cjs`.
The desktop regression checks catalog search, no results, setup, configuration
and narrow layout against an in-memory daemon.
