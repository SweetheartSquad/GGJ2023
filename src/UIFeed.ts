import eases from 'eases';
import { BitmapText, Container, Sprite } from 'pixi.js';
import { sfx } from './Audio';
import { size } from './config';
import { game } from './Game';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import { Transform } from './Scripts/Transform';
import { Tween, TweenManager } from './Tweens';
import { UIPost } from './UIPost';
import { randRange, removeFromArray, tex } from './utils';

export class UIFeed extends GameObject {
	padding = {
		bottom: 14,
		left: 60,
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

	lastText?: UIPost;

	containerPosts = new Container();

	posts: UIPost[] = [];

	constructor() {
		super();

		this.scripts.push((this.transform = new Transform(this)));
		this.scripts.push((this.display = new Display(this)));
		this.sprBg = new Sprite(tex('feedBg'));
		const maskBg = (this.containerPosts.mask = new Sprite(tex('feedMask')));
		this.sprBg.name = 'feedBg';
		maskBg.anchor.y = this.sprBg.anchor.y = 0;
		maskBg.anchor.x = this.sprBg.anchor.x = 0;
		this.transform.x = size.x - this.margin.right - this.sprBg.width;
		this.transform.y = size.y - this.margin.bottom - this.sprBg.height;

		this.display.container.addChild(this.sprBg);
		this.display.container.addChild(maskBg);
		this.display.container.addChild(this.containerPosts);
		this.containerPosts.x = this.padding.left;
		this.containerPosts.y = this.sprBg.height - this.padding.bottom;
		const t = new BitmapText('InstaYam', { fontName: 'bmfont', fontSize: 16 });
		this.display.container.addChild(t);
		t.x += 110;
		t.y += 20;

		game.app.stage.addChild(this.display.container);

		this.init();
	}

	destroy() {
		this.tweens.forEach((t) => TweenManager.abort(t));
		game.app.stage.removeChild(this.display.container);
		super.destroy();
		this.posts.forEach((i) => i.destroy());
	}

	update(): void {
		super.update();
	}

	say(text: string, avatar: string) {
		sfx('post', { rate: randRange(0.9, 1.1) });
		const t = new UIPost(
			text,
			avatar,
			this.sprBg.texture.width - (this.padding.right + this.padding.left)
		);
		this.containerPosts.addChild(t.display.container);
		// remove old off-screen posts
		this.posts.forEach((i) => {
			if (i.transform.y < -size.y) {
				i.destroy();
				removeFromArray(this.posts, i);
			}
		});
		// shift old posts up
		this.tweens.forEach((i) => {
			TweenManager.finish(i);
		});
		this.tweens.length = 0;
		this.posts.forEach((i, idx) => {
			this.tweens.push(
				TweenManager.tween(
					i.transform,
					'y',
					i.transform.y - t.display.container.height - this.gap,
					200,
					undefined,
					eases.backOut
				)
			);
			this.tweens.push(
				TweenManager.tween(
					i.display.container,
					'alpha',
					1 - (this.posts.length - idx) / 10,
					200,
					undefined,
					eases.cubicOut
				)
			);
		});
		this.posts.push(t);
		this.tweens.push(
			TweenManager.tween(
				t.transform,
				'y',
				0,
				200,
				this.padding.bottom,
				eases.backOut
			)
		);
		this.lastText = t;
	}
}
