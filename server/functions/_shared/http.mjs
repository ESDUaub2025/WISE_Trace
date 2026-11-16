import { requestContext } from '../../context.mjs';
export const cors = {};
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export function clients() {
  const context = requestContext.getStore();
  if (!context?.identity) throw new Error('Authentication required');
  return context;
}
export async function authenticate() {
  return clients();
}
export function serverClient() {
  const context = requestContext.getStore();
  if (!context?.admin) throw new Error('Server context required');
  return context.admin;
}
