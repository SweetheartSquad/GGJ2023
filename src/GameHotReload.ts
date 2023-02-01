import { Assets } from 'pixi.js';
import assets from './assets.txt';
import mainen from './assets/main-en.strand';
import { DEBUG } from './debug';
import { game, resources } from './Game';
import { log } from './logger';

export { mainen, assets };

export async function enableHotReload() {
	async function onHotReloadStrand() {
		Assets.unload('main-en');
		const data = await Assets.load(mainen);
		resources.set('main-en', data);
		if (!window.scene) throw new Error('Could not find scene');
		window.scene.strand.setSource(
			resources.get(`main-${window.scene.strand.language || 'en'}`)
		);
		if (window.scene.strand.currentPassage?.title) {
			window.scene.strand.history.push(
				window.scene.strand.currentPassage.title
			);
			window.scene.strand.back();
		}
	}
	// allow hot-reloading main.strand
	// and assets
	if (DEBUG) {
		if (import.meta.webpackHot) {
			import.meta.webpackHot.accept(
				'./assets/main-en.strand',
				onHotReloadStrand
			);

			const { client } = await import('webpack-dev-server/client/socket');
			client.client.addEventListener('message', (e) => {
				if ((JSON.parse(e.data) as { type: string }).type === 'still-ok') {
					log('[HACKY HMR] Reloading assets');
					game.reloadAssets();
				}
			});
		}
	}
}
