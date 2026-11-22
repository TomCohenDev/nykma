/**
 * nobodyknowsmyapp.com. Serves the built site from dist/, and answers POST /api/contact, the sales form on /pricing, by mailing
 * it to the sales inbox through Cloudflare Email Routing. There's no payment processor: a company asks, and gets a
 * reply by email.
 *
 *   From      form@nobodyknowsmyapp.com (the zone needs Email Routing on)
 *   To        env.SALES_TO, a verified Email Routing destination, kept as a secret so it isn't in this public repo
 *   Reply-To  the person who filled in the form, so answering the mail answers them
 *
 * A request that asks for JSON (the page's script) gets { ok } or { error, field }. Without the script, the form
 * posts normally and lands on /pricing/sent/ or /pricing/not-sent/.
 */
import { EmailMessage } from "cloudflare:email";

interface Env {
  ASSETS: Fetcher;
  SALES: SendEmail;
  SALES_TO: string;
}

const FROM = "form@nobodyknowsmyapp.com";
const SIZES = ["just me", "2–10", "11–50", "51–200", "more than 200"];
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.startsWith("www.")) return Response.redirect(`https://${url.hostname.slice(4)}${url.pathname}${url.search}`, 301);
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return new Response("Use POST.", { status: 405, headers: { allow: "POST" } });
      return contact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

type Fail = { error: string; field?: string };

async function contact(request: Request, env: Env): Promise<Response> {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const reply = (status: number, body: { ok: true } | Fail) => {
    if (wantsJson) return Response.json(body, { status });
    return Response.redirect(new URL("ok" in body ? "/pricing/sent/" : "/pricing/not-sent/", request.url).toString(), 303);
  };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { error: "The form didn't arrive. Reload the page and send it again." });
  }
  const field = (name: string, max: number) => String(form.get(name) ?? "").trim().slice(0, max);

  // A field people can't see. Bots fill it in; they're told it went through, and nothing is sent.
  if (field("website", 200)) return reply(200, { ok: true });

  const name = field("name", 100);
  const email = field("email", 200);
  const company = field("company", 150);
  const size = field("size", 40);
  const message = field("message", 4000);

  if (!name) return reply(400, { error: "Add your name.", field: "name" });
  if (!EMAIL.test(email)) return reply(400, { error: "Add an email address we can reply to, like you@company.com.", field: "email" });
  if (!company) return reply(400, { error: "Add the company's name.", field: "company" });
  if (!SIZES.includes(size)) return reply(400, { error: "Choose how many people will use nykma.", field: "size" });
  if (!env.SALES_TO) return reply(503, { error: "The form isn't connected yet. Email sales@nobodyknowsmyapp.com instead." });

  const body = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company}`,
    `People using nykma: ${size}`,
    "",
    message || "(no message)",
    "",
    "--",
    "Sent from the form on nobodyknowsmyapp.com/pricing. Reply to this email to answer them.",
  ].join("\n");

  const raw = [
    `From: ${word("nobodyknowsmyapp.com sales form")} <${FROM}>`,
    `To: <${env.SALES_TO}>`,
    `Reply-To: ${word(name)} <${email}>`,
    `Subject: ${word(`Commercial licence: ${company} (${size})`)}`,
    `Message-ID: <${crypto.randomUUID()}@nobodyknowsmyapp.com>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(body).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");

  try {
    await env.SALES.send(new EmailMessage(FROM, env.SALES_TO, raw));
  } catch (error) {
    console.error("sales form: send failed", error);
    return reply(502, { error: "It didn't send. Email sales@nobodyknowsmyapp.com instead, and we'll pick it up from there." });
  }
  return reply(200, { ok: true });
}

/** A header word: plain ASCII stays as it is (minus line breaks), anything else becomes an RFC 2047 encoded word. */
function word(text: string): string {
  const flat = text.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(flat) && !/[<>"=?]/.test(flat) ? flat : `=?UTF-8?B?${base64(flat)}?=`;
}

function base64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
