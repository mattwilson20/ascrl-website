ASCRL PRIVATE PAINT STUDIO HOST

This component renders the existing local Livery Studio and streams only its
display through encrypted WebRTC. It does not publish or upload GLB models.
The public Next.js deployment contains no editor assets or model files.

The pilot is restricted to the verified account ID stored in paint-policy.ts
and rc_paint_access. A league or platform-admin role does not grant access.
Changing the navigation alone cannot grant access. The website API and database
policies independently restrict the account. The PC receives only a session
created by that account. A single active session replaces a previous one.

Run Start Paint Studio Host.cmd, leave the PC awake, and open:
https://racecontrol.ascrl.online/paint-studio
Sign in through the site's existing Discord login if necessary.
The host runs in the background; use its notification-area menu to quit.

Setup on this PC:
  pnpm install --frozen-lockfile
  node node_modules/electron/install.js
  Initialize-Host.ps1 -StudioDirectory <existing livery-studio directory>
    -EnvironmentFile <file with the public Supabase URL and publishable key>

Initialization generates a random 256-bit renderer credential protected with
Windows DPAPI under LOCALAPPDATA/ASCRL Paint Host. Registration SQL contains
only its SHA-256 hash. Apply that SQL through an administrator connection.
The credential expires after 90 days and can be revoked by deleting its row
or disabling rc_paint_access. No service-role key is used or exposed.
host-config.json and node_modules are ignored by Git. Keep the original models
and local livery-studio directory in place. There is no automatic startup task.

Storage:
- The host has a separate persistent browser profile at LOCALAPPDATA/ASCRL Paint
  Host/browser-profile, with a fixed loopback origin on port 4197.
- Existing PC project copies seed the three workspaces once. Original browser
  projects, model files and source artwork are not modified.
- Each saved revision is also copied to a content-addressed local artwork file.
- Cloud copies contain editable artwork, not models, and are stored privately in
  rc_paint_backups. The UI lists metadata; only the scoped host can restore content.
- Automatic cloud copies run while connected at up to five-minute intervals.
- Cloud snapshots are limited to 50 MB each and 500 MB total during the pilot.
  Quota failure preserves local saves and is reported. Snapshots are not deleted.
- TGA downloads are restricted to 2048 x 2048, 24-bit standard/custom/spec paint
  filenames. SHA-256 verifies the transfer. Server export copies remain local.

Networking and operating limits:
- No router port forwarding, public HTTP tunnel, model-serving endpoint, or
  inbound firewall exception is installed.
- Signaling uses the existing Supabase project; the stream uses WebRTC and STUN.
- Restrictive networks may require a TURN relay. No paid relay/GPU service has
  been purchased or configured. A failed stream reports this limitation.
- Website sessions expire after two hours and stop when its heartbeat ceases.
  The host also disconnects after 30 minutes with no editor input.
- This is a private pilot, not public model licensing or an anti-piracy guarantee.
  Public access remains disabled pending separate authorization and validation.

Development:
  node --test tests/*.test.mjs
The host uses the existing validated brush, projection, layers, vector tools,
masking, undo/redo, autosave, recovery and TGA encoders. Its small bridge forwards
named controls, pointer gestures and artwork uploads; it has no remote code,
filesystem, shell, URL-fetch or model-export command.
