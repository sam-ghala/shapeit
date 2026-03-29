export async function onRequestPost(context) {
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyGgPXi8Ga6l4yI3kKvycbkDVU2B1YpvsB5KKKTBLmP2uFp7cPddOEZDtrN75fsQluA/exec";

  try {
    const body = await context.request.text();
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
    });
  } catch (e) {}

  return new Response("ok", {
    headers: { "Content-Type": "text/plain" },
  });
}