# Canvas relay recovery

Canvas's 2026 CDN/security rollout began rejecting the dashboard's direct managed-host requests with HTTP 406. The production app now sends Canvas API traffic through a private, fail-closed Apache relay on `beauvizenor.com`.

The checked-in configuration is intentionally a template. It contains no relay key and no Canvas token.

## Restore

1. Copy `canvas-relay.conf.example` to:
   `/usr/local/apache/conf/userdata/ssl/2_4/beauvizenor/beauvizenor.com/canvas-relay.conf`
2. On the VPS only, replace `REPLACE_WITH_BE_AU_PROXY_ACCESS_KEY` with the same secret stored in Sites as `BEAU_PROXY_ACCESS_KEY`. Do not print or commit the value.
3. Set the file owner to `root:root` and mode to `0600`.
4. Preview and validate before activating:

   ```bash
   /scripts/rebuildhttpdconf --preview
   apachectl -t -f /etc/apache2/conf/httpd-preview.conf
   ```

5. Activate only after the preview reports `Syntax OK`:

   ```bash
   /scripts/rebuildhttpdconf
   apachectl -t
   /scripts/restartsrv_httpd
   ```

## Expected security checks

- No private headers: HTTP 403.
- Relay key without the private Canvas authorization header: HTTP 403.
- Both private headers with a valid Canvas token: HTTP 200 from Canvas.

The relay accepts only HTTPS GET/POST requests, requires both private headers, converts the private Canvas header into the upstream `Authorization` header, strips credentials and proxy-identifying headers before forwarding, and disables response caching.
