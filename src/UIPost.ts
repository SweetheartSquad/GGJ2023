import eases from 'eases';
import { BitmapText, Graphics, NineSlicePlane, Sprite } from 'pixi.js';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import { Transform } from './Scripts/Transform';
import { Tween, TweenManager } from './Tweens';
import { tex } from './utils';

const padding = {
	top: 5,
	bottom: 15,
	left: 5,
	right: 5,
};
const avatarSize = 50;
const gap = 5;

export class UIPost extends GameObject {
	transform: Transform;

	display: Display;

	tweens: Tween[] = [];

	constructor(text: string, avatar: string, width: number) {
		super();

		this.scripts.push((this.transform = new Transform(this)));
		this.scripts.push((this.display = new Display(this)));
		const sprBg = new NineSlicePlane(tex('postBg'), 10, 10, 10, 10);
		sprBg.name = 'postBg';
		const sprAvatar = new Sprite(tex(avatar));
		sprAvatar.width = avatarSize;
		sprAvatar.scale.y = sprAvatar.scale.x;
		const mask = (sprAvatar.mask = new Graphics());
		mask.beginFill(0xffffff);
		mask.drawCircle(0, 0, avatarSize / 2);
		mask.endFill();
		const avatarBg = new Graphics();
		avatarBg.beginFill(0xffffff);
		avatarBg.drawCircle(0, 0, avatarSize / 2);
		avatarBg.endFill();

		const t = new BitmapText(text, {
			fontName: 'bmfont',
			maxWidth: width - (padding.left + padding.right + gap + avatarSize),
		});
		t.anchor.x = 0;
		t.anchor.y = 0;
		sprBg.width = width;
		sprBg.height =
			Math.max(t.height, mask.height) + padding.top + padding.bottom;

		this.display.container.accessible = true;
		this.display.container.accessibleHint = text;
		this.display.container.addChild(sprBg);
		sprBg.addChild(t);
		sprBg.addChild(mask);
		sprBg.addChild(avatarBg);
		sprBg.addChild(sprAvatar);
		sprAvatar.x = padding.left;
		sprAvatar.y = padding.top;
		avatarBg.x = mask.x = padding.left + avatarSize / 2;
		avatarBg.y = mask.y = padding.top + avatarSize / 2;
		t.x = sprAvatar.x + sprAvatar.width + gap;
		t.y = padding.top;
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