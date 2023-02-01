import eases from 'eases';
import { BitmapText, Container, Sprite } from 'pixi.js';
import { size } from './config';
import { game } from './Game';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import { Transform } from './Scripts/Transform';
import { Tween, TweenManager } from './Tweens';
import { tex } from './utils';

export class UIFeed extends GameObject {
	padding = {
		bottom: 20,
		left: 20,
		right: 20,
	};

	margin = {
		bottom: 20,
		right: 20,
	};

	gap = 10;

	tweens: Tween[] = [];

	sprBg: Sprite;

	transform: Transform;

	display: Display;

	voice = 'Default' as string | undefined;

	lastText?: BitmapText;

	containerPosts = new Container();

	posts: BitmapText[] = [];

	constructor() {
		super();

		this.scripts.push((this.transform = new Transform(this)));
		this.scripts.push((this.display = new Display(this)));
		this.sprBg = new Sprite(tex('feedBg'));
		this.sprBg.name = 'feedBg';
		this.sprBg.anchor.y = 0;
		this.sprBg.anchor.x = 0;
		this.transform.x = size.x - this.margin.right - this.sprBg.width;
		this.transform.y = size.y - this.margin.bottom - this.sprBg.height;

		this.display.container.accessible = true;
		this.display.container.addChild(this.sprBg);
		this.display.container.addChild(this.containerPosts);
		this.containerPosts.x = this.padding.left;
		this.containerPosts.y = this.sprBg.height - this.padding.bottom;

		game.app.stage.addChild(this.display.container);

		this.init();
	}

	destroy() {
		this.tweens.forEach((t) => TweenManager.abort(t));
		game.app.stage.removeChild(this.display.container);
		super.destroy();
	}

	update(): void {
		super.update();
	}

	say(text: string) {
		this.display.container.accessibleHint = text;
		const t = new BitmapText(text, {
			fontName: 'bmfont',
			maxWidth:
				this.sprBg.texture.width - (this.padding.right + this.padding.left),
		});
		this.containerPosts.addChild(t);
		t.anchor.x = 0;
		t.anchor.y = 1;
		this.tweens.forEach((i) => {
			TweenManager.abort(i);
		});
		if (this.lastText) this.lastText.alpha = 1;
		this.tweens.length = 0;
		this.posts.forEach((i) => {
			this.tweens.push(
				TweenManager.tween(
					i,
					'y',
					i.y - t.height - this.gap,
					200,
					undefined,
					eases.backOut
				)
			);
		});
		this.posts.push(t);
		this.tweens.push(TweenManager.tween(t, 'alpha', 1, 200, 0, eases.quadOut));
		this.tweens.push(
			TweenManager.tween(t, 'y', 0, 200, this.padding.bottom, eases.backOut)
		);
		this.lastText = t;
	}
}
