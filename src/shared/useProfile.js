import { useCallback, useEffect, useState } from "react";
import { getProfile, saveProfile } from "./profile.js";
export function useProfile() {
  const [profile, setProfile] = useState(getProfile);
  useEffect(() => {
    const sync = () => {
      const next = getProfile();
      setProfile((old) =>
        old.id === next.id && old.name === next.name ? old : next,
      );
    };
    for (const event of ["focus", "storage", "playit:profile"])
      window.addEventListener(event, sync);
    return () => {
      for (const event of ["focus", "storage", "playit:profile"])
        window.removeEventListener(event, sync);
    };
  }, []);
  const update = useCallback((next) => setProfile(saveProfile(next)), []);
  return [profile, update];
}
