import { Sprite, Texture } from 'pixi.js';
import { size } from './config';
import { game, resources } from './Game';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';

export class Border extends GameObject {
	display: Display;

	constructor() {
		super();
		this.scripts.push((this.display = new Display(this)));
		const spr = new Sprite(resources.get<Texture>('border'));
		spr.name = 'border';
		this.display.container.addChild(spr);
		this.display.container.width = size.x;
		this.display.container.height = size.y;
	}

	init(): void {
		super.init();
		game.app.stage.addChild(this.display.container);
	}

	destroy(): void {
		game.app.stage.removeChild(this.display.container);
		super.destroy();
	}
}
