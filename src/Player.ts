import eases from 'eases';
import { IChamferableBodyDefinition } from 'matter-js';
import { Container, DisplayObject } from 'pixi.js';
import { resizer } from '.';
import { sfx } from './Audio';
import { Character } from './Character';
import {
	BODY_ENVIRONMENT,
	BODY_PLAYER,
	SENSOR_INTERACTION,
	SENSOR_PLAYER,
} from './collision';
import { size } from './config';
import { resources } from './Game';
import { GameScene } from './GameScene';
import { getActiveScene, getInput, mouse } from './main';
import { NPC } from './NPC';
import { Poof } from './Poof';
import { getFrameCount } from './Scripts/Animator';
import { Roam } from './Scripts/Roam';
import { TweenManager } from './Tweens';
import { removeFromArray, tex } from './utils';
import { multiply } from './VMath';

const playerSpeedX = 0.01;
const playerSpeedY = 0.009;
const framesFootstep = [0];

export class Player extends Character {
	roam: Roam;

	clickMove = false;

	camPoint: DisplayObject;

	canMove: boolean;

	followers: NPC[] = [];

	step: number;

	floor = 'Default';

	expressionOverride = '';

	constructor({
		bodyCollision,
		bodySensor,
	}: {
		bodyCollision?: Partial<IChamferableBodyDefinition>;
		bodySensor?: Partial<IChamferableBodyDefinition>;
	}) {
		super({
			body: 'guy',
			freq: 1 / 150,
			bodyCollision: {
				...bodyCollision,
				restitution: 0.8,
				frictionAir: 0.2,
				collisionFilter: {
					category: BODY_PLAYER,
					mask: BODY_ENVIRONMENT,
					...bodyCollision?.collisionFilter,
				},
			},
			bodySensor: {
				...bodySensor,
				radius: 40,
				collisionFilter: {
					category: SENSOR_PLAYER,
					mask: SENSOR_INTERACTION,
					...bodySensor?.collisionFilter,
				},
			},
		});
		this.scripts.push((this.roam = new Roam(this)));
		this.roam.active = false;
		this.roam.freq.value = 0;
		this.roam.freq.range = 0;
		this.roam.speed.x = playerSpeedX;
		this.roam.speed.y = playerSpeedY;
		this.camPoint = new Container();
		this.camPoint.visible = false;
		this.display.container.addChild(this.camPoint);
		this.canMove = false;
		this.step = 0;

		window.player = this;
	}

	update(): void {
		const step = this.animatorBody.frame;
		if (
			this.animation === 'Run' &&
			step !== this.step &&
			framesFootstep.includes(step)
		) {
			sfx(
				resources.get(`step${this.floor}`)
					? `step${this.floor}`
					: 'stepDefault',
				{ rate: Math.random() * 0.2 + 0.9 }
			);
			if (tex(`footprint${this.floor}`).textureCacheIds[1] !== 'error') {
				const p = new Poof({
					texture: `footprint${this.floor}`,
					x:
						this.transform.x +
						(step === 3 ? 10 : -10) *
							(Math.abs(this.bodyCollision.body.velocity.y) >
							Math.abs(this.bodyCollision.body.velocity.x)
								? 1
								: 0),
					y: this.transform.y + (step === 3 ? 5 : -5),
					freq: 1 / 200,
					flip: this.flipped,
					offset: -1000,
					time: 1500 * 2, // TODO: why is this *2 of the tween?
					alpha: 0.5,
				});
				TweenManager.tween(
					p.display.container,
					'alpha',
					0,
					1500,
					undefined,
					eases.cubicIn
				);
			}
		}
		this.step = step;
		this.updateCamPoint();

		const input = getInput();
		if (
			this.clickMove &&
			this.roam &&
			(!this.canMove || input.move.x || input.move.y)
		) {
			this.clickMove = false;
			this.roam.active = false;
		}
		if (this.roam?.active) {
			this.moving.x = this.bodyCollision.body.velocity.x;
			this.moving.y = this.bodyCollision.body.velocity.y;
			if (
				this.clickMove &&
				mouse.justDown &&
				mouse.button === mouse.LEFT &&
				this.canMove
			) {
				this.walkToMouse();
			}
		} else {
			if (
				!input.move.x &&
				!input.move.y &&
				mouse.button === mouse.LEFT &&
				mouse.justDown &&
				this.canMove
			) {
				this.walkToMouse();
			}
			input.move = multiply(input.move, this.canMove ? 1 : 0);
			// update player
			this.bodyCollision.body.force.x +=
				input.move.x * playerSpeedX * this.bodyCollision.body.mass * this.speed;
			this.bodyCollision.body.force.y +=
				input.move.y * playerSpeedY * this.bodyCollision.body.mass * this.speed;
			this.moving = {
				x: input.move.x,
				y: input.move.y,
			};
		}
		super.update();
	}

	updateCamPoint() {
		if (this.camPoint) {
			this.camPoint.x = this.bodyCollision.body.velocity.x * size.x * 0.01;
			this.camPoint.y =
				this.bodyCollision.body.velocity.y * size.y * 0.01 -
				this.spr.height / 2;
		}
	}

	setPosition(x: number, y: number) {
		this.cancelWalkToMouse();
		super.setPosition(x, y);
		this.followers.forEach((i) => {
			i.setPosition(x, y);
		});
		this.updateCamPoint();
	}

	async walkTo(...args: Parameters<Character['walkTo']>) {
		await super.walkTo(...args);
		this.roam.active = false;
	}

	walkBy(...args: Parameters<Character['walkBy']>) {
		this.cancelWalkToMouse();
		return super.walkBy(...args);
	}

	walkToMouse() {
		const relativeMousePos = {
			x:
				((mouse.x - resizer.childElement.offsetLeft) /
					resizer.childElement.clientWidth) *
				size.x,
			y:
				((mouse.y - resizer.childElement.offsetTop) /
					resizer.childElement.clientHeight) *
				size.y,
		};
		const targetPos = (
			getActiveScene() as GameScene
		).camera.display.container.toLocal(relativeMousePos);
		this.walkTo(targetPos.x, targetPos.y);
		this.clickMove = true;
		// eslint-disable-next-line no-new
		new Poof({
			texture: 'walk_cursor',
			freq: 1 / 100,
			x: targetPos.x,
			y: targetPos.y,
			offset: 1000000,
		});
	}

	cancelWalkToMouse() {
		if (this.clickMove) {
			this.clickMove = false;
			if (this.roam) {
				this.roam.active = false;
			}
		}
	}

	follow(npc: NPC) {
		npc.roam.target = this.transform;
		npc.roam.range[0] = 100;
		npc.roam.range[1] = 50;
		npc.bodyCollision.body.collisionFilter.mask = BODY_ENVIRONMENT;
		removeFromArray(this.followers, npc);
		this.followers.push(npc);
	}

	stopFollow(npc: NPC) {
		npc.roam.target = {
			x: npc.transform.x,
			y: npc.transform.y,
		};
		npc.bodyCollision.body.collisionFilter.mask =
			BODY_PLAYER | BODY_ENVIRONMENT;
		removeFromArray(this.followers, npc);
	}

	sequence(
		name: string,
		effects: Record<number | 'start' | 'end', () => void>
	) {
		this.expressionOverride = name;
		const frames = getFrameCount(`${this.body}_${name}`);
		Object.entries(effects).forEach(([key, effect]) => {
			const frame = Number(key);
			if (!Number.isNaN(frame)) {
				setTimeout(effect, (1 / this.freq) * Number(frame));
			}
		});
		effects.start?.();
		setTimeout(() => {
			this.expressionOverride = '';
			effects.end?.();
		}, (1 / this.freq) * (frames - 0.5));
	}
}
