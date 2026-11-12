# Install SAGE

SAGE 0.1.3 is a Functional Alpha. You need a Chromium browser that allows unpacked Manifest V3 extensions and an AI provider. The extension runs from its own files. End users need no build tools or development server.

1. Obtain `sage-extension-0.1.3.zip` and `SHA256SUMS.txt` from the same trusted distribution. Compare the archive checksum with the published value if verifying the download. On Windows use `Get-FileHash .\sage-extension-0.1.3.zip -Algorithm SHA256`. On macOS use `shasum -a 256 sage-extension-0.1.3.zip`. On Linux use `sha256sum sage-extension-0.1.3.zip`.
2. Extract the ZIP to a permanent folder. If you received the full `SAGE-0.1.3` directory, you can use its `sage-extension` folder directly. Select the folder that contains `manifest.json` at its root.
3. In Helium or Chrome open `chrome://extensions`. In Edge open `edge://extensions`. In Brave open `brave://extensions`. Enable **Developer mode**, choose **Load unpacked**, and select the folder. This is a developer-mode installation, with no store installer or automatic updates. A managed browser can prevent unpacked installs.
4. Open SAGE from the Extensions menu and optionally pin it. In Settings choose **Get Started**, then **Set up Local AI** or **Set up Cloud AI**. Follow [Quick Start](QUICK_START.md).

## Update an existing installation

1. Finish or cancel active work. Export any important conversations and retain a backup of the previous runtime files outside the loaded directory.
2. In the browser extension manager, note the existing extension ID and loaded path. Keep the same extension entry and absolute folder. For the developer build, keep the existing `.output/chrome-mv3` path.
3. Unpack the new release into a staging folder first. Check that its root contains `manifest.json`. Replace the old runtime files in the existing loaded folder with the contents of the staging folder. Click **Reload** on the existing extension entry.
4. Verify the extension ID, version, settings, skills and saved history before discarding the backup. If reload fails, restore the previous runtime files to the same path and reload again. Do not remove the extension to update it.

Moving the folder, changing the manifest key, uninstalling or using a different profile can produce a different extension identity or lose access to saved data. SAGE does not export provider API keys. On a new device, set up the provider again. Store-managed identity and updates apply only to a future signed store distribution. [Chromium unpacked installation](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) · [Manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)
