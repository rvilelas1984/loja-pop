import crypto from "node:crypto";

const WORKER = "https://club-pop-api.renato-vilelas-personal.workers.dev";
const SCOPE = "club-pop-evo-proxy-v1";
export function serviceSignature(body, timestamp, key) {
  return crypto.createHmac("sha256", key).update(SCOPE + "\n" + timestamp + "\n" + body).digest("hex");
}
export function verifyServiceRequest(body, timestamp, signature, key) {
  if (!key || !/^\d+$/.test(timestamp || "") || Math.abs(Date.now() - Number(timestamp)) > 30000) return false;
  if (!/^[a-f0-9]{64}$/.test(signature || "")) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(serviceSignature(body, timestamp, key)));
}

// EVO credentials for supported units never leave the Worker and are resolved from D1.
export function getEvoTransport(unit = "bike") {
  const key = String(unit || "bike").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!["bike","gym"].includes(key)) return {key,prefix:"ADM_D1",configured:false,headers:{Accept:"application/json"},fetch};
  return {key, prefix: "ADM_D1", configured: true, headers: {Accept:"application/json"}, fetch: async (url, options = {}) => {
    if (!process.env.ADMIN_KEY) throw Object.assign(new Error("EVO_TRANSPORTE_NAO_CONFIGURADO"), {status: 503, code: "EVO_TRANSPORTE_NAO_CONFIGURADO"});
    const body = JSON.stringify({unit:key,url:String(url),method:options.method||"GET"});
    const timestamp = String(Date.now());
    const response = await fetch(WORKER + "/internal/evo-unit", {
      method:"POST",cache:"no-store",body,
      headers:{"Content-Type":"application/json","x-evo-timestamp":timestamp,"x-evo-signature":serviceSignature(body,timestamp,process.env.ADMIN_KEY)}
    });
    if (response.headers.get("x-evo-config-error") === "1") {
      const data=await response.json();
      throw Object.assign(new Error(data.error||"EVO_CONFIG_INDISPONIVEL"),{status:response.status,code:data.error,unit:key});
    }
    return response;
  }};
}
