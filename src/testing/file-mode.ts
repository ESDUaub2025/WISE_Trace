// Whether this build talks to the shared testing file instead of the WISE server.
// Kept apart from file-backend.ts so low-level modules (connectivity, the device database) can ask
// without importing the whole testing client.
export const fileBackendUrl = import.meta.env?.VITE_FILE_BACKEND_URL as string | undefined;
export const fileTesting = Boolean(fileBackendUrl);
