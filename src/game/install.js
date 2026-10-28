export function createInstallStore(win, nav) {
  const display = win.matchMedia("(display-mode: standalone)");
  let snapshot = {
    prompt: null,
    installed: display.matches || nav.standalone === true,
  };
  const listeners = new Set();
  const update = (value) => {
    snapshot = { ...snapshot, ...value };
    listeners.forEach((fn) => fn());
  };
  const before = (e) => {
    e.preventDefault();
    if (!snapshot.installed) update({ prompt: e });
  };
  const installed = () => update({ prompt: null, installed: true });
  const changed = (e) => {
    if (e.matches) installed();
  };
  win.addEventListener("beforeinstallprompt", before);
  win.addEventListener("appinstalled", installed);
  display.addEventListener?.("change", changed);
  return {
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => snapshot,
    async prompt() {
      const event = snapshot.prompt;
      if (!event) return;
      update({ prompt: null });
      try {
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === "accepted") installed();
        return choice;
      } finally {
        update({ prompt: null });
      }
    },
    destroy() {
      win.removeEventListener("beforeinstallprompt", before);
      win.removeEventListener("appinstalled", installed);
      display.removeEventListener?.("change", changed);
    },
  };
}
export const installStore =
  typeof window === "undefined" ? null : createInstallStore(window, navigator);
