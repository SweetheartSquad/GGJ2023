import eases from 'eases';
import { BitmapText, NineSlicePlane } from 'pixi.js';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import { Transform } from './Scripts/Transform';
import { Tween, TweenManager } from './Tweens';
import { tex } from './utils';

export class UIPost extends GameObject {
	padding = {
		top: 5,
		bottom: 15,
		left: 50,
		right: 5,
	};

	sprBg: NineSlicePlane;

	transform: Transform;

	display: Display;

	tweens: Tween[] = [];

	constructor(text: string, width: number) {
		super();

		this.scripts.push((this.transform = new Transform(this)));
		this.scripts.push((this.display = new Display(this)));
		this.sprBg = new NineSlicePlane(tex('postBg'), 10, 10, 10, 10);
		this.sprBg.name = 'postBg';

		const t = new BitmapText(text, {
			fontName: 'bmfont',
			maxWidth: width - (this.padding.left + this.padding.right),
		});
		t.anchor.x = 0;
		t.anchor.y = 0;
		this.sprBg.width = width;
		this.sprBg.height = t.height + this.padding.top + this.padding.bottom;

		this.display.container.accessible = true;
		this.display.container.accessibleHint = text;
		this.display.container.addChild(this.sprBg);
		this.sprBg.addChild(t);
		t.x = this.padding.left;
		t.y = this.padding.top;
		this.display.container.pivot.y = this.display.container.height;
		this.display.container.cacheAsBitmap = true;

		this.tweens.push(
			TweenManager.tween(
				this.display.container,
				'alpha',
				1,
				200,
				0,
				eases.quadOut
			)
		);

		this.init();
	}

	destroy() {
		this.tweens.forEach((i) => {
			TweenManager.abort(i);
		});
		super.destroy();
	}
}
