import { isIP } from "node:net";

/** Expand an IPv6 address to eight groups; returns undefined if it is not valid IPv6. */
function groupsV6(ip: string): string[] | undefined {
  if (isIP(ip) !== 6) return undefined;
  let s = ip.toLowerCase().split("%")[0]!;
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const o = tail[1]!.split(".").map(Number);
    s = s.slice(0, -tail[1]!.length) + ((o[0]! << 8) | o[1]!).toString(16) + ":" + ((o[2]! << 8) | o[3]!).toString(16);
  }
  const [head = "", rest] = s.split("::");
  const a = head ? head.split(":") : [];
  const b = rest === undefined ? [] : rest ? rest.split(":") : [];
  const fill = rest === undefined ? [] : Array<string>(8 - a.length - b.length).fill("0");
  return [...a, ...fill, ...b].map((g) => g.padStart(4, "0"));
}

/**
 * The rate-limiting identity for an address. IPv4 stays as is. IPv4-mapped IPv6 collapses to its IPv4 form, and any other
 * IPv6 address collapses to its /64 so one household cannot mint unlimited keys from a single delegated prefix.
 */
export function normaliseIp(ip: string): string {
  if (isIP(ip) === 4) return ip;
  const g = groupsV6(ip);
  if (!g) return "unknown";
  if (g.slice(0, 5).every((x) => x === "0000") && g[5] === "ffff") {
    return [parseInt(g[6]!.slice(0, 2), 16), parseInt(g[6]!.slice(2), 16), parseInt(g[7]!.slice(0, 2), 16), parseInt(g[7]!.slice(2), 16)].join(".");
  }
  return `${g.slice(0, 4).join(":")}::/64`;
}

/**
 * Who is calling, for rate limiting. `remoteAddress` is the TCP peer, which a client cannot choose.
 *
 * `x-forwarded-for` is attacker-controlled unless a proxy we operate rewrites it, so it is ignored unless
 * `trustedProxyHops` (the number of reverse proxies in front of this process) is set. Each trusted proxy appends the
 * address it received the request from, so the real client is the entry `hops` from the RIGHT; anything a client
 * prepended sits to the left of it and is never consulted. If the chain is shorter than expected, or the entry is not a
 * valid address, fall back to the TCP peer rather than to client-supplied text.
 */
export function clientKey(headers: Headers, remoteAddress: string | undefined, trustedProxyHops = 0): string {
  const peer = remoteAddress ? normaliseIp(remoteAddress) : "unknown";
  if (trustedProxyHops <= 0) return peer;
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const entry = chain.length >= trustedProxyHops ? chain[chain.length - trustedProxyHops] : undefined;
  return entry && isIP(entry) ? normaliseIp(entry) : peer;
}
