export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/log" && request.method === "POST") {
      try {
        const body = await request.text();
        await fetch(
          "https://script.google.com/macros/s/AKfycbyGgPXi8Ga6l4yI3kKvycbkDVU2B1YpvsB5KKKTBLmP2uFp7cPddOEZDtrN75fsQluA/exec",
          { method: "POST", headers: { "Content-Type": "application/json" }, body }
        );
      } catch (e) {}
      return new Response("ok");
    }

    return env.ASSETS.fetch(request);
  },
};