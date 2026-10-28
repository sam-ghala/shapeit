import { useState, useSyncExternalStore } from "react";
import { installStore } from "../game/install.js";
import { Dialog } from "./Dialog.jsx";
export function InstallButton() {
  const { prompt, installed } = useSyncExternalStore(
    installStore.subscribe,
    installStore.getSnapshot,
  );
  const [help, setHelp] = useState(false),
    [error, setError] = useState("");
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (installed) return null;
  return (
    <>
      {prompt && (
        <button
          onClick={async () => {
            try {
              setError("");
              await installStore.prompt();
            } catch {
              setError("Installation was not available. Try the browser menu.");
            }
          }}
        >
          Install app ↓
        </button>
      )}
      {!prompt && ios && (
        <button className="install-help" onClick={() => setHelp(true)}>
          Add to iPhone Home Screen
        </button>
      )}
      {error && <p role="status">{error}</p>}
      {help && (
        <Dialog
          title="Add ShapeIt to your iPhone"
          onClose={() => setHelp(false)}
        >
          <ol className="install-steps">
            <li>
              Open the browser's <strong>Share</strong> menu.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Enable <strong>Open as Web App</strong> if shown, then tap{" "}
              <strong>Add</strong>.
            </li>
          </ol>
          <p>
            The app will open without the address bar. iOS requires these steps;
            a website cannot install itself.
          </p>
        </Dialog>
      )}
    </>
  );
}
