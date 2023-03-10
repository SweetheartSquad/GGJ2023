import { Body, Events, Runner } from 'matter-js';
import { OutlineFilter } from 'pixi-filters';
import {
	BitmapText,
	Container,
	DisplayObject,
	Graphics,
	Sprite,
} from 'pixi.js';
import { Area } from './Area';
import { Border } from './Border';
import { Camera } from './Camera';
import { size } from './config';
import { DEBUG } from './debug';
import { game, resources } from './Game';
import { GameObject } from './GameObject';
import { getInput } from './main';
import { NPC } from './NPC';
import { engine } from './Physics';
import { PhysicsDebug } from './PhysicsDebug';
import { Player } from './Player';
import { ScreenFilter } from './ScreenFilter';
import { Animator } from './Scripts/Animator';
import { Updater } from './Scripts/Updater';
import { StrandE } from './StrandE';
import { TweenManager } from './Tweens';
import { UIDialogue } from './UIDialogue';
import { UIFeed } from './UIFeed';
import { delay, removeFromArray, tex } from './utils';
import { add, V } from './VMath';

let player: Player;

function depthCompare(a: DisplayObject, b: DisplayObject): number {
	return a.y - b.y;
}

export class GameScene {
	container = new Container();

	graphics = new Graphics();

	camera = new Camera();

	dialogue: UIDialogue;

	feed: UIFeed;

	timer: BitmapText;

	screenFilter: ScreenFilter;

	strand: StrandE;

	border: Border;

	interactionFocus?: V;

	areas: Partial<{ [key: string]: GameObject[] }> & { root: GameObject[] } = {
		root: [],
	};

	area?: string;

	get currentArea() {
		return this.areas[this.area || ''];
	}

	player: Player;

	onCollisionStart: (e: Matter.IEventCollision<Matter.Engine>) => void;

	onCollisionEnd: (e: Matter.IEventCollision<Matter.Engine>) => void;

	runner: Runner;

	physicsDebug?: PhysicsDebug;

	statsDebug?: BitmapText;

	focusAmt = 0.25;

	constructor() {
		this.player = player = new Player({});
		this.container.addChild(player.display.container);
		this.container.addChild(player.displayShadow.container);

		this.strand = new StrandE({
			source: resources.get<string>('main-en') || '',
			logger: {
				/* eslint-disable no-console */
				log: (...args) => this.strand.debug && console.log(...args),
				warn: (...args) => console.warn(...args),
				error: (...args) => console.error(...args),
				/* eslint-enable no-console */
			},
			renderer: {
				displayPassage: (passage) => {
					if (passage.title === 'close') {
						this.dialogue.close();
						// TODO: why is this two frames?
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								player.canMove = true;
							});
						});
						player.followers.forEach((i) => {
							i.roam.active = true;
						});
						return Promise.resolve();
					}
					player.canMove = false;
					player.followers.forEach((i) => {
						i.roam.active = false;
					});
					const program = this.strand.execute(passage.program);
					if (this.strand.voice) {
						this.dialogue.voice = this.strand.voice;
						delete this.strand.voice;
					}
					const text: string[] = [];
					const actions: (typeof program[number] & {
						name: 'action';
					})['value'][] = [];
					program.forEach((node) => {
						switch (node.name) {
							case 'text':
								text.push(node.value);
								break;
							case 'action':
								actions.push(node.value);
								break;
							default:
								throw new Error('unrecognized node type');
						}
					});
					this.dialogue.say(
						text.join('').trim(),
						actions.map((i) => ({
							text: i.text,
							action: () => this.strand.eval(i.action),
						}))
					);
					return Promise.resolve();
				},
			},
		});
		this.strand.scene = this;
		this.strand.debug = DEBUG;
		this.dialogue = new UIDialogue(this.strand);
		this.feed = new UIFeed();
		this.feed.display.container.alpha = 0;

		this.border = new Border();
		this.border.init();

		this.timer = new BitmapText('', { fontName: 'bmfont', align: 'center' });
		this.timer.anchor.x = 0.5;
		this.timer.anchor.y = 1;
		this.timer.x = size.x / 2;
		this.timer.y = size.y - 20;
		this.timer.filters = [new OutlineFilter(3, 0)];
		game.app.stage.addChild(this.timer);

		const interactions: Body[] = [];

		const updateInteractions = async () => {
			const interrupt = interactions.find((i) => i.plugin.interrupt);
			if (interrupt) {
				interactions.length = 0;
				this.strand.gameObject = interrupt.plugin.gameObject as GameObject;
				if (interrupt.plugin.focus) {
					this.interactionFocus = add(interrupt.position, {
						x: 0,
						y: 0,
						...interrupt.plugin.focus,
					});
				}
				if (interrupt.plugin.interrupt.passage) {
					this.strand.goto(interrupt.plugin.interrupt.passage);
				}
				return;
			}
			const goto = interactions.find((i) => i.plugin.goto);
			if (goto) {
				interactions.length = 0;
				const { transition = 1 } = goto.plugin.goto;
				const collidesWith = player.bodySensor.body.collisionFilter.mask;
				if (transition) {
					player.bodySensor.body.collisionFilter.mask = 0;
					this.dialogue.scrim(1, 300 * transition);
					await delay(300 * transition);
				}
				this.goto(goto.plugin.goto);
				this.camera.setTarget(player.camPoint, true);
				if (transition) {
					this.dialogue.scrim(0, 100 * transition);
					await delay(100 * transition);
					player.bodySensor.body.collisionFilter.mask = collidesWith;
				}
				return;
			}
			const top = interactions
				.slice()
				.reverse()
				.find((i) => i.plugin.passage);
			if (!top) {
				this.dialogue.prompt();
				this.interactionFocus = undefined;
			} else {
				if (this.dialogue.isOpen) return;
				const { passage, label = 'talk', focus, gameObject } = top.plugin;
				this.interactionFocus = focus
					? add(top.position, { x: 0, y: 0, ...focus })
					: top.position;
				this.dialogue.prompt(this.t(label).toUpperCase(), () => {
					this.strand.gameObject = gameObject;
					this.strand.goto(passage);
				});
			}
		};
		Events.on(
			engine,
			'collisionStart',
			(this.onCollisionStart = ({ pairs }) => {
				pairs.forEach(({ bodyA, bodyB }) => {
					if (bodyA === player.bodySensor.body) {
						interactions.push(bodyB);
						updateInteractions();
					} else if (bodyB === player.bodySensor.body) {
						interactions.push(bodyA);
						updateInteractions();
					}
				});
			})
		);
		Events.on(
			engine,
			'collisionEnd',
			(this.onCollisionEnd = ({ pairs }) => {
				pairs.forEach(({ bodyA, bodyB }) => {
					if (bodyA === player.bodySensor.body) {
						removeFromArray(interactions, bodyB);
						updateInteractions();
					} else if (bodyB === player.bodySensor.body) {
						removeFromArray(interactions, bodyA);
						updateInteractions();
					}
				});
			})
		);

		this.take(this.player);
		this.take(this.dialogue);
		this.take(this.feed);
		this.take(this.border);
		this.take(this.camera);

		this.screenFilter = new ScreenFilter();

		this.camera.display.container.addChild(this.container);
		this.camera.setTarget(player.camPoint);

		this.strand.history.push('close');

		this.border.display.container.alpha = 0;
		this.strand.goto('start');

		if (DEBUG) {
			this.statsDebug = new BitmapText('', {
				fontName: 'bmfont',
				fontSize: 16,
			});
			game.app.stage.addChild(this.statsDebug);
		}

		this.runner = Runner.create({
			isFixed: true,
		});
		Runner.start(this.runner, engine);
	}

	destroy(): void {
		this.physicsDebug?.destroy();
		if (this.currentArea) {
			Area.unmount(this.currentArea);
		}
		Events.off(engine, 'collisionStart', this.onCollisionStart);
		Events.off(engine, 'collisionEnd', this.onCollisionEnd);
		Object.values(this.areas).forEach((a) => a?.forEach((o) => o.destroy()));
		this.container.destroy({
			children: true,
		});
		this.dialogue.destroy();
		this.feed.destroy();
		this.timer.destroy();
		this.statsDebug?.destroy();
		Runner.stop(this.runner);
	}

	goto({
		area = this.area,
		x = 0,
		y = 0,
	}: {
		area?: string;
		x?: number;
		y?: number;
	}) {
		this.gotoArea(area);
		player.setPosition(x, y);
		this.camera.setTarget(player.camPoint, true);
	}

	gotoArea(area?: string) {
		let a = this.currentArea;
		if (a) Area.unmount(a);
		this.area = area;
		a = this.currentArea;
		if (!a) throw new Error(`Area "${area}" does not exist`);
		Area.mount(a, this.container);
	}

	update(): void {
		if (DEBUG) {
			if (
				this.dialogue.isOpen &&
				this.strand.currentPassage.title === 'debug menu' &&
				getInput().menu
			) {
				this.strand.goto('close');
			} else if (getInput().menu) {
				this.strand.goto('debug menu');
			}

			const { stats } = this.strand as unknown as {
				stats: Maybe<{ [key: string]: number }>;
			};
			if (this.statsDebug && stats) {
				this.statsDebug.text = '';
				this.statsDebug.text = (Object.entries(stats) as [string, number][])
					.map(
						([key, value]) =>
							`${key.padStart(8, ' ')}: ${value.toFixed(2).padStart(6, '0')}`
					)
					.join('\n');
				// @ts-ignore
				this.statsDebug.text += `\nguests: ${this.strand.guests?.length}`;
				// @ts-ignore
				this.statsDebug.text += `\nwaiting: ${this.strand.guestsWaiting?.length}`;
			}
		}

		const curTime = game.app.ticker.lastTime;
		this.screenFilter.uniforms.curTime = curTime;
		this.screenFilter.uniforms.camPos = [
			this.camera.display.container.pivot.x,
			-this.camera.display.container.pivot.y,
		];

		// depth sort
		this.container.children.sort(depthCompare);
		if (window.debugPhysics) {
			if (!this.physicsDebug) this.physicsDebug = new PhysicsDebug();
			this.container.addChild(this.physicsDebug.display.container);
		}
		this.container.addChild(this.graphics);

		// if (this.interactionFocus) {
		this.interactionFocus = { x: 0, y: -size.y / 2 };
		// if (this.dialogue.isOpen) focusAmt = 0.7;
		player.camPoint.y +=
			(this.interactionFocus.y - player.transform.y) * this.focusAmt;
		player.camPoint.x +=
			(this.interactionFocus.x - player.transform.x) * this.focusAmt;
		player.camPoint.x += this.feed.display.container.width / 2;
		// }

		this.screenFilter.update();

		GameObject.update();
		TweenManager.update();
	}

	take(gameObject: GameObject) {
		const a = this.currentArea;
		if (a) Area.remove(a, gameObject);
		Area.add(this.areas.root, gameObject);
	}

	drop(gameObject: GameObject) {
		Area.remove(this.areas.root, gameObject);
		const a = this.currentArea;
		if (a) Area.add(a, gameObject);
	}

	/**
	 * basic "localization" function (relying on strand passages as locale entries)
	 * @param key strand passage title
	 * @returns strand passage body for given key, or the key itself as a fallback
	 */
	t(key: string) {
		return this.strand.passages[key]?.body || key;
	}

	addGuestToPool(guest: string) {
		const n = new NPC({
			body: guest,
			shadow: false,
		});
		const h = n.spr.height;
		const g = new Graphics();
		const skirt = new Sprite(tex('waterSkirt'));
		g.beginFill(0xff0000);
		g.drawRect(0, 0, n.spr.width, h);
		g.drawEllipse(n.spr.width / 2, h, n.spr.width / 2, skirt.height / 2);
		g.endFill();
		g.y = -h * 1.5;
		g.x = -n.spr.width / 2;
		n.scripts.push(new Animator(n, { spr: skirt, freq: 1 / 400 }));
		n.spr.parent.addChild(g);
		n.spr.parent.addChild(skirt);
		skirt.anchor.x = 0.5;
		skirt.anchor.y = 0.5;
		skirt.y = -h / 2;
		skirt.width = n.spr.width * 1.25;
		skirt.scale.y = skirt.scale.x;
		skirt.visible = g.visible = false;
		n.scripts.push(
			new Updater(n, () => {
				// @ts-ignore
				const dry = this.strand.stats.dry / 100;
				g.y = -h * 1.5 + dry * (h / 2) * 0.95;
				skirt.y = -h / 2 + dry * (h / 2) * 0.95;
			})
		);
		// @ts-ignore
		n.skirt = skirt;
		// @ts-ignore
		n.mask = g;
		this.drop(n);
		Area.mount([n], this.container);
		return n;
	}
}
