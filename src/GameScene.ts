import { Body, Events, Runner } from 'matter-js';
import { Container, DisplayObject, Graphics, Sprite } from 'pixi.js';
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
import { StrandE } from './StrandE';
import { TweenManager } from './Tweens';
import { UIDialogue } from './UIDialogue';
import { UIFeed } from './UIFeed';
import {
	delay,
	randCirc,
	randItem,
	randRange,
	removeFromArray,
	tex,
} from './utils';
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

	constructor() {
		this.player = player = new Player({});
		player.updateCamPoint = () => {
			Player.prototype.updateCamPoint.call(player);
			const p = this.dialogue.progress();
			player.camPoint.y +=
				(this.dialogue.height() / 2 / this.camera.display.container.scale.y) *
				p;
		};
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

		this.border = new Border();
		this.border.init();

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
				this.dialogue.prompt(`( ${this.t(label).toUpperCase()} )`, () => {
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

		// fake some npcs/feed posts
		setInterval(() => {
			const npc = randItem(['test', 'test2', 'test3']);
			this.addGuestToPool(npc);
			setTimeout(() => {
				setInterval(() => {
					this.feed.say(
						'lorem ipsum dolor sit amet'.repeat(Math.round(randRange(1, 3))),
						`${npc}Idle`
					);
				}, 3143);
			}, randRange(0, 5000));
		}, 5234);

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

		// adjust camera based on dialogue state
		const p = this.dialogue.progress();
		this.camera.display.container.scale.x =
			this.camera.display.container.scale.y = 1 + p * 2;

		// if (this.interactionFocus) {
		this.interactionFocus = { x: 0, y: -size.y / 2 };
		const focusAmt = 0.9;
		// if (this.dialogue.isOpen) focusAmt = 0.7;
		player.camPoint.y +=
			(this.interactionFocus.y - player.transform.y) * focusAmt;
		player.camPoint.x +=
			(this.interactionFocus.x - player.transform.x) * focusAmt;
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
			x: 115,
			y: -716,
			roam: 400,
		});
		const g = new Graphics();
		const skirt = new Sprite(tex('waterSkirt'));
		g.beginFill(0xff0000);
		g.drawRect(0, 0, n.spr.width, n.spr.height);
		g.drawEllipse(
			n.spr.width / 2,
			n.spr.height,
			n.spr.width / 2,
			skirt.height / 2
		);
		g.endFill();
		g.y = -n.spr.height * 1.5;
		g.x = -n.spr.width / 2;
		n.scripts.push(new Animator(n, { spr: skirt, freq: 1 / 400 }));
		n.spr.parent.addChild(g);
		n.spr.parent.addChild(skirt);
		skirt.anchor.x = 0.5;
		skirt.anchor.y = 0;
		skirt.y = -n.spr.height / 2;
		skirt.width = n.spr.width * 1.25;
		skirt.scale.y = skirt.scale.x;
		n.spr.mask = g;
		const pos = randCirc(100);
		pos.x += 115;
		pos.y -= 716;
		n.setPosition(pos.x, pos.y);
		this.take(n);
		Area.mount([n], this.container);
	}
}
