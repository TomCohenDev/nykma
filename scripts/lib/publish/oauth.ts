/**
 * Logging in to a platform from a desk on localhost (RFC 8252's loopback redirect). The desk's own port can change
 * when 5173 is busy, and a redirect URI must match what you registered exactly, so logins come back to a small server
 * of their own on a fixed port: http://127.0.0.1:8723/callback (or localhost, for Meta and LinkedIn). It runs only
 * while a login is waiting, answers only /callback with a state it handed out in the last 15 minutes, and does the
 * code exchange here, so the token never passes through the page. NYKMA_CALLBACK_PORT moves it.
 */
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { pkce } from "./http.ts";
import type { Connected, OAuthStart, ProviderId } from "./types.ts";

export const CALLBACK_PORT = Number(process.env.NYKMA_CALLBACK_PORT ?? 8723);
export const redirectUri = (host: "localhost" | "127.0.0.1" = "127.0.0.1") => `http://${host}:${CALLBACK_PORT}/callback`;

const waiting = new Map<string, OAuthStart>();
/** What happened to each login, for the page to show: connected accounts' names, or why not. */
const outcomes = new Map<string, { done: boolean; error?: string; names?: string[]; note?: string }>();
let servers: Server[] = [];
let stopTimer: NodeJS.Timeout | undefined;

type Finish = (start: OAuthStart, code: string) => Promise<Connected>;

const page = (title: string, text: string, ok: boolean) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1rem;color:#222}b{color:${ok ? "#167a3a" : "#b3261e"}}</style><p><b>${title}</b></p><p>${text}</p><p>You can close this tab and go back to the desk.</p>`;
const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function listen(finish: Finish) {
  if (servers.length) return Promise.resolve();
  const handler = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${CALLBACK_PORT}`);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    if (url.pathname !== "/callback") {
      res.statusCode = 404;
      return res.end(page("Not here", "This is the desk's login callback.", false));
    }
    const state = url.searchParams.get("state") ?? "";
    const start = waiting.get(state);
    if (!start || Date.now() - start.started > 15 * 60_000) {
      res.statusCode = 400;
      return res.end(page("That login has expired", "Press Connect on the desk again.", false));
    }
    waiting.delete(state);
    const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    const code = url.searchParams.get("code") ?? url.searchParams.get("auth_code");
    if (denied || !code) {
      outcomes.set(state, { done: true, error: denied ?? "The platform sent no code back." });
      res.statusCode = 400;
      return res.end(page("Not connected", escape(denied ?? "The platform sent no code back."), false));
    }
    finish(start, code).then(
      (accounts) => {
        const names = accounts.map((account) => account.name);
        outcomes.set(state, { done: true, names, note: accounts.note });
        res.end(page("Connected", `The desk can now post to ${escape(names.join(", ") || "this account")}. It posts only what's approved.${accounts.note ? `</p><p>${escape(accounts.note)}` : ""}`, true));
      },
      (error) => {
        outcomes.set(state, { done: true, error: String(error?.message ?? error) });
        res.statusCode = 500;
        res.end(page("Not connected", escape(String(error?.message ?? error)), false));
      },
    ).finally(scheduleStop);
  };
  // Both loopbacks: a browser may resolve "localhost" to ::1 first.
  const bind = (host: string) =>
    new Promise<Server | undefined>((done) => {
      const server = createServer(handler);
      server.once("error", () => done(undefined));
      server.listen(CALLBACK_PORT, host, () => done(server));
    });
  return Promise.all([bind("127.0.0.1"), bind("::1")]).then((bound) => {
    servers = bound.filter((server): server is Server => Boolean(server));
    if (!servers.length) throw new Error(`Port ${CALLBACK_PORT} is taken, so a login can't come back to the desk. Free it, or set NYKMA_CALLBACK_PORT and register that port instead.`);
  });
}

/** Stops listening once no login is waiting. */
function scheduleStop() {
  clearTimeout(stopTimer);
  stopTimer = setTimeout(() => {
    for (const [state, start] of waiting) if (Date.now() - start.started > 15 * 60_000) waiting.delete(state);
    if (waiting.size) return scheduleStop();
    for (const server of servers) server.close();
    servers = [];
  }, 15 * 60_000);
}

/** A login to open in the browser: the provider builds the URL from this. */
export async function begin(provider: ProviderId, host: "localhost" | "127.0.0.1", finish: Finish): Promise<OAuthStart> {
  await listen(finish);
  const { verifier, challenge, hex } = pkce();
  const start: OAuthStart = { provider, redirectUri: redirectUri(host), state: randomBytes(18).toString("base64url"), verifier, challenge, challengeHex: hex, started: Date.now() };
  waiting.set(start.state, start);
  outcomes.set(start.state, { done: false });
  scheduleStop();
  return start;
}

export const outcome = (state: string) => outcomes.get(state);
