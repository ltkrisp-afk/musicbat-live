// Read-only Render inventory for the already-authorized workspace. Never mutates
// service selection, suspension, deployments, disks, environment or billing.
import { pathToFileURL } from 'node:url';
export const workspaceId = 'tea-da1njsjl550s739b50m0';
const api = 'https://api.render.com/v1/';

function publicUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}
function serviceSummary(service) {
  const details = service.serviceDetails ?? {};
  const commands = details.envSpecificDetails ?? {};
  return {
    id: service.id, name: service.name, type: service.type,
    suspended: service.suspended ?? null, ownerId: service.ownerId,
    branch: service.branch ?? null, repository: publicUrl(service.repo),
    autoDeploy: service.autoDeployTrigger ?? service.autoDeploy ?? null,
    runtime: details.runtime ?? details.env ?? null, plan: details.plan ?? null,
    region: details.region ?? null, instances: details.numInstances ?? null,
    url: publicUrl(details.url),
    disk: details.disk ? { id: details.disk.id, mountPath: details.disk.mountPath, sizeGB: details.disk.sizeGB } : null,
    buildCommandPresent: Boolean(commands.buildCommand),
    startCommandPresent: Boolean(commands.startCommand ?? commands.dockerCommand),
    startsRadio: /radio:start|radio-start\.mjs/.test(commands.startCommand ?? ''),
    startsRecovery: /checkout:recover|checkout-recovery-worker/.test(commands.startCommand ?? ''),
    schedule: /^[\d\s*,/\-]+$/.test(details.schedule ?? '') ? details.schedule : null,
  };
}
export async function inspectRender({ key = process.env.RENDER_API_KEY, serviceId, fetcher = fetch } = {}) {
  if (!key) throw new Error('No injected Render API authentication; no request made. Continue through the already-connected Render tools. No new API key or workspace authorization is requested.');
  if (serviceId && !/^srv-[a-z0-9]+$/.test(serviceId)) throw new Error('Invalid service ID.');
  async function get(path, query = {}) {
    // All paths are constructed locally; no redirects or caller-provided hosts.
    const url = new URL(path, api);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    let response;
    try { response = await fetcher(url, { method: 'GET', headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error('Render GET failed at network/TLS/proxy; no service state changed.'); }
    if (!response.ok) throw new Error(`Render GET returned HTTP ${response.status}; no response body or credential logged.`);
    try { return await response.json(); }
    catch { throw new Error('Render returned invalid JSON; response body not logged.'); }
  }
  async function list(path, field, query = {}) {
    const values = [], seen = new Set(); let cursor;
    for (let page = 0; page < 100; page++) {
      const rows = await get(path, { ...query, limit: '100', ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(rows) || rows.some(row => !row || !row[field])) throw new Error('Incomplete Render inventory: unexpected response shape.');
      values.push(...rows.map(row => row[field]));
      if (rows.length < 100) return values;
      const next = rows.at(-1).cursor;
      if (!next || seen.has(next)) throw new Error('Incomplete Render inventory: pagination did not advance.');
      seen.add(next); cursor = next;
    }
    throw new Error('Incomplete Render inventory: pagination limit reached.');
  }
  const owner = await get(`owners/${workspaceId}`);
  if (owner.id !== workspaceId || owner.name !== "Kris's workspace") throw new Error('Authorized workspace identity mismatch; stopped.');
  const services = await list('services', 'service', { ownerId: workspaceId, includePreviews: 'false' });
  if (services.some(service => service.ownerId !== workspaceId)) throw new Error('Service outside the authorized workspace; stopped.');
  const disks = await list('disks', 'disk', { ownerId: workspaceId });
  const result = {
    observedAt: new Date().toISOString(), readOnly: true, complete: true,
    workspace: { id: owner.id, name: owner.name },
    services: services.map(serviceSummary),
    disks: disks.map(disk => ({ id: disk.id, serviceId: disk.serviceId ?? null, mountPath: disk.mountPath, sizeGB: disk.sizeGB })),
    priceQuote: null,
    priceNote: 'Plan names and disk size are inventory, not a current billing quote. Confirm exact incremental cost before resuming or changing anything.',
  };
  if (serviceId) {
    if (!services.some(service => service.id === serviceId)) throw new Error('Requested service is not in the authorized inventory.');
    // Render returns values here. Only names/presence leave this process; no
    // credential value, raw service response or executable command is persisted.
    const variables = await list(`services/${serviceId}/env-vars`, 'envVar');
    result.selectedService = { id: serviceId, environment: variables.map(variable => ({ name: variable.key, present: Boolean(variable.value) })) };
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--service')) {
    console.error('Use no arguments, or --service srv-ID after identifying the existing sandbox.'); process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await inspectRender({ serviceId: args[1] }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 2; }
  }
}
