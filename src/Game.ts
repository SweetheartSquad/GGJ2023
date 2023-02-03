import HowlerLoaderParser from 'howler-pixi-loader-middleware';
import {
	Application,
	Assets,
	Container,
	DisplayObject,
	extensions,
	loadTxt,
	NineSlicePlane,
	ProgressCallback,
	SCALE_MODES,
	settings,
	Sprite,
	utils,
} from 'pixi.js';
import { size } from './config';
import { assets, enableHotReload, mainen } from './GameHotReload';
import { getActiveScene, init } from './main';
import { Display } from './Scripts/Display';
import { tex } from './utils';

// PIXI configuration stuff
settings.SCALE_MODE = SCALE_MODES.NEAREST;
settings.ROUND_PIXELS = true;

function cacheBust(url: string) {
	const urlObj = new URL(url, window.location.href);
	urlObj.searchParams.set('t', process.env.HASH || '');
	return urlObj.toString();
}

export const resources = Assets.cache;
window.resources = resources;

export class Game {
	app: Application;

	startTime: number;

	constructor() {
		const canvas = document.createElement('canvas');
		this.app = new Application({
			view: canvas,
			width: size.x,
			height: size.y,
			antialias: false,
			backgroundAlpha: 1,
			resolution: 1,
			clearBeforeRender: true,
			backgroundColor: 0x000000,
		});
		this.startTime = Date.now();
	}

	async load(onLoad?: ProgressCallback) {
		Assets.init();

		// setup parsers
		Assets.loader.parsers.push({
			...loadTxt,
			test(url) {
				return utils.path.extname(url).includes('.strand');
			},
		});
		Assets.loader.parsers.push({
			...loadTxt,
			test(url) {
				return utils.path.extname(url).includes('.glsl');
			},
		});
		extensions.add(HowlerLoaderParser);

		// load assets list
		const assetsData = (await Assets.load<string>(cacheBust(assets))) as string;
		const assetResources = assetsData
			.trim()
			.split(/\r?\n/)
			.flatMap((i) => {
				if (i.match(/\.x\d+\./)) {
					const [base, count, ext] = i.split(/\.x(\d+)\./);
					return new Array(parseInt(count, 10))
						.fill('')
						.map((_, idx) => `${base}.${idx + 1}.${ext}`);
				}
				return i;
			})
			.filter((i) => i && !i.startsWith('//'))
			.reduce<Record<string, string>>((acc, i) => {
				const name = i.split('/').pop()?.split('.').slice(0, -1).join('.') || i;
				const url = cacheBust(i.startsWith('http') ? i : `assets/${i}`);
				acc[name] = url;
				return acc;
			}, {});

		// add fixed assets
		assetResources['main-en'] = cacheBust(mainen);

		// load assets
		Assets.addBundle('resources', assetResources);
		await Assets.loadBundle('resources', onLoad);

		// verify assets loaded
		const failedToLoad = Object.keys(assetResources)
			.filter((i) => !resources.get(i))
			.join(', ');
		if (failedToLoad) throw new Error(`Failed to load: ${failedToLoad}`);
	}

	private async reloadAssetsRaw() {
		this.app.ticker.stop();

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		// eslint-disable-next-line no-underscore-dangle
		(Array.from(resources._cache.keys()) as string[])
			.filter((i) => i.endsWith('-count') || !i.startsWith('http'))
			.forEach((i) => {
				resources.remove(i);
			});

		function recurseChildren(
			result: DisplayObject[],
			obj: DisplayObject
		): DisplayObject[] {
			result = result.concat(obj);
			if (!(obj instanceof Container)) return result;
			return result.concat(
				...(obj as Container).children.map((i) => recurseChildren([], i))
			);
		}
		const scene = getActiveScene();
		const objs = recurseChildren([], this.app.stage).concat(
			...Object.values(scene?.areas || [])
				.flat()
				.flatMap((i) => i?.getScripts(Display))
				.filter((i) => i)
				.map((i) => recurseChildren([], (i as Display).container))
		);
		type Textured = Sprite | NineSlicePlane;
		const textures = objs
			.map((i) => [i, (i as Textured)?.texture?.textureCacheIds[1]])
			.filter(([, id]) => id) as [Textured, string][];
		console.log(objs, textures);

		await Assets.unloadBundle('resources');
		await Assets.loadBundle('resources');
		textures.forEach(([textured, texId]) => {
			if ((textured as NineSlicePlane).shader) {
				(textured as NineSlicePlane).shader.uniforms.uSampler.baseTexture =
					tex(texId).baseTexture;
			}
			textured.texture = tex(texId);
		});
		scene?.screenFilter.reload();
		this.app.ticker.start();
	}

	private reloadingAssets = Promise.resolve();

	async reloadAssets() {
		this.reloadingAssets = this.reloadingAssets.then(() =>
			this.reloadAssetsRaw()
		);
		return this.reloadingAssets;
	}

	init = init;
}

export const game = new Game();
window.game = game;

enableHotReload();
