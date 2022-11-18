import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { Plugin, normalizePath } from 'vite';
import { resolveHost } from './resolveHost'

export interface ManifestPluginConfig {
	omitInputs?: string[];
    manifestName?: string;
}

export interface PluginManifest {
    url: string;
	[key: string]: string | { [key: string]: string };
    inputs: {
        [key: string]: any;
    }
}

const MANIFEST_NAME = 'manifest.dev';

const createSimplifyPath = (root: string, base: string) => (path: string) => {
	path = normalizePath(path);

	if (root !== '/' && path.startsWith(root)) {
		path = path.slice(root.length);
	}

	if (path.startsWith(base)) {
		path = path.slice(base.length);
	}

	if (path[0] === '/') {
		path = path.slice(1);
	}

	return path;
};

const plugin = ({ omitInputs = [], manifestName = MANIFEST_NAME }: ManifestPluginConfig = {}): Plugin => ({
	name: 'dev-manifest',

	configureServer(server) {
		const { config, httpServer } = server;

		if (!config.env.DEV || !config.build.manifest) {
			return;
		}

		httpServer?.once('listening', () => {
			const { root: _root, base } = config;
			const root = normalizePath(_root);
			const protocol = config.server.https ? 'https' : 'http';
			const host = resolveHost(config.server.host);
			const port = config.server.port;
			const url = `${protocol}://${host}:${port}${base}`;
			const manifest: PluginManifest = {
				url,
				inputs: {},
			};
			const inputOptions = config.build.rollupOptions?.input ?? {};
			const simplifyPath = createSimplifyPath(root, base);

			config.server.origin = `${protocol}://${host}:${port}`;

			if (typeof inputOptions === 'string') {
				manifest.inputs['main'] = simplifyPath(inputOptions);
			} else if (Array.isArray(inputOptions)) {
				for (const name of inputOptions) {
					if (omitInputs.includes(name)) continue;

					manifest.inputs[name] = { src: simplifyPath(name) };
				}
			} else {
				for (const [name, path] of Object.entries(inputOptions)) {
					if (omitInputs.includes(name)) continue;

					const srcKey = simplifyPath(path).replace('src/', '');
					manifest[srcKey] = { src: simplifyPath(srcKey) }

				}
			}

			const outputDir = path.isAbsolute(config.build.outDir)
				? config.build.outDir
				: path.resolve(config.root, config.build.outDir);

			mkdirSync(outputDir, { recursive: true });
			writeFileSync(path.resolve(outputDir, `${manifestName}.json`), JSON.stringify(manifest, null, '\t'));
		});
	},
});

export default plugin;
