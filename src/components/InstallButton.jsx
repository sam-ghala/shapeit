import { useEffect, useState } from "react";
import { Dialog } from "./Dialog.jsx";
export function InstallButton() {
  const [prompt, setPrompt] = useState(null),
    [help, setHelp] = useState(false),
    [installed, setInstalled] = useState(
      () =>
        window.matchMedia("(display-mode: standalone)").matches ||
        navigator.standalone === true,
    );
  useEffect(() => {
    const before = (e) => {
        e.preventDefault();
        setPrompt(e);
      },
      done = () => {
        setInstalled(true);
        setPrompt(null);
      };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (installed) return null;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    <>
      <button
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          } else setHelp(true);
        }}
      >
        Install ShapeIt
      </button>
      {help && (
        <Dialog
          title="ShapeIt on your home screen"
          onClose={() => setHelp(false)}
        >
          <p>
            {ios
              ? "In Safari, open the Share menu, choose “Add to Home Screen”, enable “Open as Web App” if shown, then tap “Add”."
              : "Open your browser menu and choose “Install app” or “Add to Home Screen”. In Safari on Mac, use File → Add to Dock."}
          </p>
          <p>
            The installed app opens without the address bar. Daily puzzles and
            training work offline after your first visit; duels need an internet
            connection.
          </p>
        </Dialog>
      )}
    </>
  );
}
