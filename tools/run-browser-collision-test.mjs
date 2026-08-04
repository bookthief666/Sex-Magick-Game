const nativeFetch = globalThis.fetch;

if (typeof nativeFetch !== 'function') {
  throw new Error('Node.js fetch is required for the collision browser QA runner');
}

globalThis.fetch = async function bufferedCollisionQaFetch(input, init) {
  const response = await nativeFetch(input, init);
  const url = typeof input === 'string' ? input : input.url;

  if (url.endsWith('/index.html') || url.endsWith('/json/version')) {
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status
    };
  }

  if (url.endsWith('/json/list')) {
    const data = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      json: async () => data
    };
  }

  return response;
};

await import('./browser-collision-test.mjs');
