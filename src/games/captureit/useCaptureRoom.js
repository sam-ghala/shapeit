import { useCallback, useEffect, useRef, useState } from "react";
import { gamePath } from "../../platform/routing.js";
import { readJSON, writeJSON } from "../../shared/storage.js";

const ROOM_KEY = "captureit:room";
const validCode = (value) => typeof value === "string" && /^\d{4}$/.test(value);
const validAccess = (value, profileId, initialCode) =>
  value?.profileId === profileId &&
  validCode(value.code) &&
  typeof value.token === "string" &&
  value.token.length > 0 &&
  (!initialCode || value.code === initialCode);

async function api(path, token, body, signal) {
  const response = await fetch(`/api/captureit/rooms${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Online play is unavailable." }));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  if (!validCode(data.room?.code) || !Number.isInteger(data.room.revision))
    throw new Error("The room could not be loaded. Try again.");
  return data;
}

export function useCaptureRoom(profile, initialCode, active) {
  const [credentials, setCredentials] = useState(() => {
    const saved = readJSON(ROOM_KEY, null);
    return validAccess(saved, profile.id, initialCode) ? saved : null;
  });
  const [room, setRoom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = useRef(true);
  const generation = useRef(0);
  const flight = useRef(null);
  const currentRoom = useRef(room);
  const currentAccess = useRef(credentials);
  const context = useRef({ profileId: profile.id, active });
  context.current = { profileId: profile.id, active };

  const cancel = useCallback(() => {
    generation.current++;
    flight.current?.controller.abort();
    flight.current = null;
  }, []);

  // Refs change synchronously with accepted responses so two clicks in the
  // same React batch cannot send the same stale revision or restore a room
  // after the player has left it.
  const acceptRoom = useCallback((next) => {
    currentRoom.current = next;
    setRoom(next);
  }, []);

  const request = useCallback(
    async (path, token, body, entering = false) => {
      if (!live.current) return null;
      if (flight.current) {
        if (!body || flight.current.mutation) return null;
        cancel();
      }
      const controller = new AbortController();
      const current = { controller, mutation: !!body, token };
      const stamp = generation.current;
      const owner = context.current;
      const isCurrent = () =>
        live.current &&
        stamp === generation.current &&
        flight.current === current &&
        context.current.profileId === owner.profileId &&
        context.current.active === owner.active;
      flight.current = current;
      if (body) setBusy(true);
      let timeout;
      let timedOut = false;
      try {
        const data = await Promise.race([
          api(path, token, body, controller.signal),
          new Promise((_, reject) => {
            timeout = setTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(new Error("Connection timed out. Try again."));
            }, 12000);
          }),
        ]);
        if (!isCurrent()) return null;
        if (entering) {
          if (typeof data.token !== "string" || !data.token)
            throw new Error("The room could not be joined. Try again.");
          const access = {
            code: data.room.code,
            token: data.token,
            profileId: owner.profileId,
          };
          currentAccess.current = access;
          writeJSON(ROOM_KEY, access);
          setCredentials(access);
          window.history?.replaceState(
            null,
            "",
            `${gamePath("captureit")}?room=${access.code}`,
          );
        } else if (
          data.room.code !== currentAccess.current?.code ||
          token !== currentAccess.current?.token
        ) {
          return null;
        }
        const previous = currentRoom.current;
        if (
          !entering &&
          previous?.code === data.room.code &&
          previous.revision > data.room.revision
        )
          return null;
        acceptRoom(data.room);
        setError("");
        return data;
      } catch (problem) {
        if (isCurrent() && (timedOut || problem.name !== "AbortError"))
          setError(
            timedOut
              ? "Connection timed out. Try again."
              : problem.message || "Online play is unavailable.",
          );
        return null;
      } finally {
        clearTimeout(timeout);
        if (flight.current === current) {
          flight.current = null;
          if (live.current && body) setBusy(false);
        }
      }
    },
    [acceptRoom, cancel],
  );

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      cancel();
    };
  }, [cancel]);

  useEffect(() => {
    cancel();
    setBusy(false);
    if (
      currentAccess.current &&
      currentAccess.current.profileId !== profile.id
    ) {
      currentAccess.current = null;
      setCredentials(null);
      acceptRoom(null);
      writeJSON(ROOM_KEY, null);
      setError("");
    }
  }, [profile.id, active, acceptRoom, cancel]);

  useEffect(() => {
    if (!credentials || !active || credentials.profileId !== profile.id) return;
    const poll = () => request(`/${credentials.code}`, credentials.token);
    void poll();
    const timer = setInterval(poll, 1500);
    window.addEventListener("online", poll);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", poll);
      window.removeEventListener("focus", poll);
      if (
        flight.current &&
        !flight.current.mutation &&
        flight.current.token === credentials.token
      )
        cancel();
    };
  }, [credentials, active, profile.id, request, cancel]);

  const enter = async (code, nextProfile) => {
    if (nextProfile?.id !== context.current.profileId) return null;
    if (code && !validCode(code)) {
      setError("Enter a four-digit room code.");
      return null;
    }
    const data = await request(
      code ? `/${code}/join` : "",
      null,
      { profile: { id: nextProfile.id, name: nextProfile.name } },
      true,
    );
    return data?.room || null;
  };

  const send = (action) => {
    const access = currentAccess.current;
    const current = currentRoom.current;
    return access && current && access.profileId === context.current.profileId
      ? request(`/${access.code}/action`, access.token, {
          ...action,
          revision: current.revision,
          gameId: current.gameId,
        })
      : Promise.resolve(null);
  };

  const forget = (leave = false) => {
    const access = currentAccess.current;
    const clearAccess = () => {
      cancel();
      currentAccess.current = null;
      setCredentials(null);
      acceptRoom(null);
      setBusy(false);
      setError("");
      writeJSON(ROOM_KEY, null);
      window.history?.replaceState(null, "", gamePath("captureit"));
      return true;
    };
    if (leave && access) {
      // A deliberate departure supersedes an in-flight move, but retain the
      // seat until the server confirms it closed the room.
      cancel();
      return request(`/${access.code}/action`, access.token, {
        type: "leave",
      }).then((data) => {
        if (!data || currentAccess.current !== access) return false;
        return clearAccess();
      });
    }
    return clearAccess();
  };

  return { room, credentials, busy, error, setError, enter, send, forget };
}
