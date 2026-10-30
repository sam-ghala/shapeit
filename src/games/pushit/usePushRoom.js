import { gamePath } from "../../platform/routing.js";
import { useEffect, useRef, useState } from "react";
import { readJSON, writeJSON } from "../../shared/storage.js";

async function api(path, token, body, signal) {
  const response = await fetch(`/api/pushit/rooms${path}`, {
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
  return data;
}
export function usePushRoom(profile, initialCode, active) {
  const [credentials, setCredentials] = useState(() => {
    const saved = readJSON("pushit:room", null);
    return saved?.profileId === profile.id &&
      /^\d{4}$/.test(saved.code) &&
      typeof saved.token === "string" &&
      (!initialCode || saved.code === initialCode)
      ? saved
      : null;
  });
  const [room, setRoom] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const flight = useRef(null),
    sequence = useRef(0),
    currentRoom = useRef(null);
  currentRoom.current = room;
  const request = async (path, token, body) => {
    if (flight.current) {
      if (!body || flight.current.mutation) return null;
      flight.current.controller.abort();
    }
    const controller = new AbortController(),
      current = { controller, mutation: !!body };
    const seq = ++sequence.current;
    flight.current = current;
    if (body) setBusy(true);
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException("Connection timed out.", "TimeoutError"),
        ),
      12000,
    );
    try {
      const data = await api(path, token, body, controller.signal);
      if (seq !== sequence.current) return null;
      setRoom(data.room);
      setError("");
      return data;
    } catch (e) {
      if (seq === sequence.current && e.name !== "AbortError")
        setError(e.message);
      return null;
    } finally {
      clearTimeout(timer);
      if (flight.current === current) {
        flight.current = null;
        if (body) setBusy(false);
      }
    }
  };
  useEffect(() => {
    if (!credentials || !active) return;
    const poll = () => request(`/${credentials.code}`, credentials.token);
    void poll();
    const timer = setInterval(poll, 1500);
    window.addEventListener("online", poll);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", poll);
      window.removeEventListener("focus", poll);
      sequence.current++;
      if (!flight.current?.mutation) flight.current?.controller.abort();
    };
  }, [credentials, active]);
  const enter = async (code, nextProfile) => {
    const data = await request(code ? `/${code}/join` : "", null, {
      profile: nextProfile,
    });
    if (!data) return null;
    const access = {
      code: data.room.code,
      token: data.token,
      profileId: nextProfile.id,
    };
    writeJSON("pushit:room", access);
    setCredentials(access);
    window.history.replaceState(
      null,
      "",
      `${gamePath("pushit")}?room=${access.code}`,
    );
    return data.room;
  };
  const send = (body) =>
    credentials && currentRoom.current
      ? request(`/${credentials.code}/action`, credentials.token, {
          ...body,
          revision: currentRoom.current.revision,
        })
      : Promise.resolve(null);
  const forget = (leave = false) => {
    const access = credentials;
    sequence.current++;
    flight.current?.controller.abort();
    flight.current = null;
    setBusy(false);
    setCredentials(null);
    setRoom(null);
    setError("");
    writeJSON("pushit:room", null);
    window.history.replaceState(null, "", gamePath("pushit"));
    if (leave && access)
      void api(`/${access.code}/action`, access.token, { type: "leave" }).catch(
        () => {},
      );
  };
  return { room, credentials, busy, error, setError, enter, send, forget };
}
