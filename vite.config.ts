import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const page = (f: string) => fileURLToPath(new URL(f, import.meta.url));

/** serves api/*.ts during `npm run dev`, the way Vercel does in production */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // clean URL for the location log, as vercel.json does in production
        if (req.url === '/location' || req.url?.startsWith('/location?')) req.url = req.url.replace('/location', '/location.html');
        const m = req.url?.match(/^\/api\/([a-z]+)(?:[?#]|$)/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          const handler = mod[req.method || 'GET'];
          if (typeof handler !== 'function') {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || '');
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const out: Response = await handler(
            new Request(`http://${req.headers.host}${req.url}`, {
              method: req.method,
              headers,
              body: hasBody ? Buffer.concat(chunks) : undefined,
            }),
          );
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(`[dev-api] ${e instanceof Error ? e.stack : e}`);
          res.statusCode = 500;
          res.end('dev api error');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // make .env / .env.local visible to the api handlers in dev
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react(), devApi()],
    server: { host: '127.0.0.1', port: 5190 },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: {
          main: page('./index.html'),
          admin: page('./admin.html'),
          location: page('./location.html'),
        },
      },
    },
  };
});
