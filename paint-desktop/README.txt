ASCRL PAINT STUDIO — DESKTOP 0.2

Open ASCRL Paint Studio from the desktop or Start menu. It runs locally with
native mouse/keyboard input and direct GPU rendering. There is no account,
website connection, WebRTC compression, 24 fps streaming cap or cloud relay.
All program files, models and templates are installed locally; no Node.js
installation or command prompt is needed to launch the installed application.

Camaro, Mustang and Camry use the verified original model files and UVs.
High detail is the desktop default. Rendering pauses when idle. Choose Balanced
or Economy in Layers & properties > Preview if needed. The displayed renderer
name identifies the GPU actually selected. Windows is configured to prefer
the high-performance GPU for this application only.

Use right drag to orbit, wheel to zoom, and the left tool rail to paint.
File > Save project as creates a portable editable .garage.json file.
File > Export TGA exports the existing original-layout 2048 x 2048 paint or
specular map. Use your actual iRacing customer ID and the matching car folder.
Native file dialogs select where to save. PNG proofs are also available.

Autosave and Recovery work locally. Closing waits for the current stroke and
autosave, then saves an additional content-addressed project copy to:
  %LOCALAPPDATA%\ASCRL Paint Studio\artwork
File > Open local recovery folder opens those portable copies.
Default manual export folder: Documents\ASCRL Paint Studio\Exports

The installer copies the old host's IndexedDB partition, including all three
workspaces and their recovery history, while that host is stopped. It retains
the original host profile and artwork unchanged, and adds a separate copy of
its portable artwork under imported-host-artwork. No existing work is deleted.
Do not run the old Paint Studio Host alongside the desktop editor; both use
the stable loopback origin 127.0.0.1:4197 for migrated project identity.

The local server binds only to loopback, requires the exact host and exposes
only packaged resources. There are no LAN pairing, cloud-signaling or upload
routes. Model resources are never deployed to the league website.

This local pilot uses the installed official Electron 45.1.0 runtime. The app
has not been code-signed or prepared for public distribution. Its materials
remain preview approximations; a desktop wrapper does not recreate iRacing's
entire rendering engine or repair source-model issues by itself.

Development: node --test tests/*.test.mjs
Installation: run Install-Desktop.ps1 with the old host stopped. The installer
refuses to overwrite an existing version or desktop workspace. Recovered
model SHA-256 hashes must match before and after packaging.
